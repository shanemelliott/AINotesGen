// Generate AI notes for all encounters of a patient, flag questionable ones,
// and write to output/review/ (needs human review) or output/ready/ (clean).
// Usage: node generate-notes.js --dfn 100965 [--dry-run]
const fs = require('fs');
const path = require('path');
const config = require('./src/config');
const { stripMarkerLine } = require('./test-ai');
const { generateNoteText } = require('./src/noteGenerator');
const { reflowText } = require('./src/reflow');
const { resolveAppointment, buildVisitString, filemanDateTime } = require('./src/notesClient');
const { flagNote } = require('./src/noteFlags');
const { noteId, writeNote, existsInDir } = require('./src/noteStore');

const REVIEW_DIR = path.join(__dirname, 'output', 'review');
const READY_DIR = path.join(__dirname, 'output', 'ready');
const SIGNED_DIR = path.join(__dirname, 'output', 'signed');

function parseArgs(argv) {
  const args = { dfn: '100965', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dfn') args.dfn = argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
  }
  return args;
}

function existsInAnyStage(id) {
  return [REVIEW_DIR, READY_DIR, SIGNED_DIR].some((dir) => existsInDir(dir, id));
}

function loadEncounters(dfn) {
  const encountersPath = path.join(__dirname, 'output', `encounters-${dfn}.json`);
  if (!fs.existsSync(encountersPath)) {
    throw new Error(`Encounters file not found: ${encountersPath}. Run extract-encounters.js first.`);
  }
  return JSON.parse(fs.readFileSync(encountersPath, 'utf8')).encounters || [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const noteTitleIen = config.noteTitleIen();
  const duz = config.duz();

  const encounters = loadEncounters(args.dfn);
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
  fs.mkdirSync(READY_DIR, { recursive: true });
  fs.mkdirSync(SIGNED_DIR, { recursive: true });

  let generated = 0;
  let flagged = 0;
  let ready = 0;
  let skipped = 0;
  const failures = [];
  const total = encounters.length;

  for (let i = 0; i < total; i++) {
    const encounter = encounters[i];
    const id = noteId(args.dfn, encounter.date);
    const progress = `[${i + 1}/${total}]`;

    if (existsInAnyStage(id)) {
      console.log(`${progress} SKIP  ${id}: already generated`);
      skipped++;
      continue;
    }

    console.log(`${progress} START ${id}...`);
    const start = Date.now();
    try {
      const { noteText, ctx } = await generateNoteText(args.dfn, encounter.date);
      const cleanText = reflowText(stripMarkerLine(noteText));

      const appointment = resolveAppointment(encounter, args.dfn, encounter.date);
      const clinicIen = appointment ? appointment.clinicIen : config.clinicIen();
      const fmDateTime = appointment ? appointment.fmDateTime : filemanDateTime(encounter.date, encounter.time || '10:00');
      const visitType = appointment ? 'A' : 'E';
      const visitString = buildVisitString({ clinicIen, filemanDateTime: fmDateTime, type: visitType });

      const { flagged: isFlagged, reasons } = flagNote(cleanText, ctx);

      const record = {
        noteText: cleanText,
        dfn: args.dfn,
        date: encounter.date,
        visitString,
        noteTitleIen,
        locationIen: clinicIen,
        duz,
        fmDateTime,
        flagged: isFlagged,
        flagReasons: reasons,
        generatedAt: new Date().toISOString()
      };

      generated++;
      const latencyMs = Date.now() - start;
      if (args.dryRun) {
        if (isFlagged) flagged++;
        else ready++;
        console.log(`${progress} DRY   ${id} (${latencyMs}ms): ${isFlagged ? `FLAGGED (${reasons.join('; ')})` : 'clean'}`);
        continue;
      }

      const targetDir = isFlagged ? REVIEW_DIR : READY_DIR;
      writeNote(targetDir, id, record);
      if (isFlagged) {
        flagged++;
        console.log(`${progress} FLAG  ${id} (${latencyMs}ms): ${reasons.join('; ')}`);
      } else {
        ready++;
        console.log(`${progress} OK    ${id} (${latencyMs}ms): ready`);
      }
    } catch (err) {
      console.error(`${progress} FAIL  ${id}: ${err.message}`);
      failures.push({ id, reason: err.message });
    }
  }

  console.log('\nSummary:');
  console.log(`  Generated: ${generated}`);
  console.log(`  Flagged (needs review): ${flagged}`);
  console.log(`  Ready: ${ready}`);
  console.log(`  Skipped (already exists): ${skipped}`);
  console.log(`  Failed: ${failures.length}`);
  if (failures.length > 0) {
    console.log('  Failed ids:', failures.map((f) => f.id).join(', '));
  }

  process.exit(failures.length > 0 && generated === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
