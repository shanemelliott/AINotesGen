// Batch create (+ optionally sign) every note in output/ready/, archive to
// output/signed/, and log to src/notes.json.
// Usage: node sign-notes.js --all [--sign] [--dry-run]
//        node sign-notes.js 100965-2025-10-04 [--sign]
const fs = require('fs');
const path = require('path');
const config = require('./src/config');
const { createNote, signNote } = require('./src/notesClient');
const { listIds, readNote, moveNote } = require('./src/noteStore');

const READY_DIR = path.join(__dirname, 'output', 'ready');
const SIGNED_DIR = path.join(__dirname, 'output', 'signed');
const NOTES_LOG_PATH = path.join(__dirname, 'src', 'notes.json');

function parseArgs(argv) {
  const args = { all: false, sign: false, dryRun: false, ids: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--all') args.all = true;
    else if (arg === '--sign') args.sign = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else args.ids.push(arg);
  }
  return args;
}

function loadNotesLog() {
  if (!fs.existsSync(NOTES_LOG_PATH)) return [];
  return JSON.parse(fs.readFileSync(NOTES_LOG_PATH, 'utf8'));
}

function saveNotesLog(records) {
  const tmpPath = `${NOTES_LOG_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(records, null, 2));
  fs.renameSync(tmpPath, NOTES_LOG_PATH);
}

function resolveReadyIds(args) {
  fs.mkdirSync(READY_DIR, { recursive: true });
  if (args.all) return listIds(READY_DIR);
  return args.ids.map((id) => path.basename(id).replace(/\.(json|txt)$/, ''));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.all && args.ids.length === 0) {
    console.error('Usage: node sign-notes.js --all [--sign] [--dry-run]  |  node sign-notes.js <id> [--sign]');
    process.exit(1);
  }

  const ids = resolveReadyIds(args);
  if (ids.length === 0) {
    console.log('output/ready/ is empty; nothing to sign.');
    process.exit(0);
  }

  const log = loadNotesLog();
  let created = 0;
  let signed = 0;
  let failed = 0;
  const newRecords = [];

  for (const id of ids) {
    const record = readNote(READY_DIR, id);
    if (!record) {
      console.error(`NOT FOUND: ${id}`);
      failed++;
      continue;
    }

    if (args.dryRun) {
      console.log(`DRY   ${id}: would create${args.sign ? ' + sign' : ''} (visit ${record.visitString})`);
      continue;
    }

    console.log(`START ${id}...`);
    try {
      const textLines = record.noteText.replace(/\r\n/g, '\n').split('\n');
      const { tiuIen } = await createNote({
        dfn: record.dfn,
        noteTitleIen: record.noteTitleIen,
        locationIen: record.locationIen,
        textLines,
        visitString: record.visitString,
        duz: record.duz,
        fmDateTime: record.fmDateTime
      });
      created++;

      let isSigned = false;
      if (args.sign) {
        const esigCode = config.esigCode();
        const signResult = await signNote({ tiuIen, esigCode });
        isSigned = signResult.success;
        if (isSigned) signed++;
        else console.error(`  Sign failed for ${id}: ${signResult.payload}`);
      }

      newRecords.push({
        dfn: record.dfn,
        date: record.date,
        tiuIen,
        appointmentIen: record.appointmentIen || null,
        signed: isSigned,
        createdAt: new Date().toISOString()
      });

      moveNote(READY_DIR, SIGNED_DIR, id);
      console.log(`OK    ${id}: tiuIen=${tiuIen}${isSigned ? ' signed' : ''}`);
    } catch (err) {
      console.error(`FAIL  ${id}: ${err.message}`);
      failed++;
    }
  }

  if (newRecords.length > 0) {
    saveNotesLog(log.concat(newRecords));
  }

  console.log('\nSummary:');
  console.log(`  Created: ${created}`);
  console.log(`  Signed: ${signed}`);
  console.log(`  Failed: ${failed}`);

  if (args.dryRun) process.exit(0);
  process.exit(failed > 0 && created === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
