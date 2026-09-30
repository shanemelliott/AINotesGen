// Smoke test: generate a note via Task 3's AI pipeline and write it to VistA
// via TIU CREATE RECORD. Unsigned by default.
// Usage: node test-write-note.js [--dfn 100965] [--date 2025-10-21] [--dry-run]
const config = require('./src/config');
const { stripMarkerLine, validateNote } = require('./test-ai');
const { filemanDateTime, buildVisitString, resolveAppointment, createNote, signNote } = require('./src/notesClient');
const { generateNoteText } = require('./src/noteGenerator');

function parseArgs(argv) {
  const args = { dfn: '100965', date: '2025-10-21', dryRun: false, sign: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dfn') args.dfn = argv[++i];
    else if (arg === '--date') args.date = argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--sign') args.sign = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const noteTitleIen = config.noteTitleIen();
  const duz = config.duz();

  console.log(`Generating note for dfn=${args.dfn} date=${args.date}...`);
  const { noteText, encounter } = await generateNoteText(args.dfn, args.date);

  const validation = validateNote(noteText);
  if (!validation.pass) {
    console.error('ERROR: Generated note failed validation:', validation.problems.join('; '));
    process.exit(1);
  }
  console.log('Note validation: PASS');

  const cleanText = stripMarkerLine(noteText);
  const textLines = cleanText.replace(/\r\n/g, '\n').split('\n');

  const appointment = resolveAppointment(encounter, args.dfn, args.date);
  const clinicIen = appointment ? appointment.clinicIen : config.clinicIen();
  const fmDateTime = appointment ? appointment.fmDateTime : filemanDateTime(args.date, encounter.time || '10:00');
  const visitType = appointment ? 'A' : 'E';
  const visitString = buildVisitString({ clinicIen, filemanDateTime: fmDateTime, type: visitType });

  if (!appointment) {
    console.warn(`WARNING: No appointment found for ${args.date}; falling back to visit type E`);
  } else {
    console.log(`Appointment source: ${appointment.source}`);
  }

  console.log(`Visit string: ${visitString}`);
  console.log(`Note title IEN: ${noteTitleIen}, Location IEN: ${clinicIen}, Lines: ${textLines.length}`);

  if (args.dryRun) {
    console.log('\n[DRY RUN] Note text:\n' + cleanText);
    console.log('\n[DRY RUN] No RPC calls made.');
    process.exit(0);
  }

  const start = Date.now();
  const { tiuIen } = await createNote({
    dfn: args.dfn, noteTitleIen, locationIen: clinicIen, textLines, visitString, duz, fmDateTime
  });
  const latencyMs = Date.now() - start;

  console.log('\nSUCCESS');
  console.log('  TIU IEN:', tiuIen);
  console.log('  Visit string:', visitString);
  console.log('  Latency:', `${latencyMs}ms`);

  if (args.sign) {
    const esigCode = config.esigCode();
    console.log('\nSigning note...');
    const signStart = Date.now();
    try {
      const signResult = await signNote({ tiuIen, esigCode });
      const signLatencyMs = Date.now() - signStart;
      if (signResult.success) {
        console.log('  Sign result: SUCCESS');
      } else {
        console.log('  Sign result: FAILED');
        console.log('  Raw payload:', signResult.payload);
      }
      console.log('  Sign latency:', `${signLatencyMs}ms`);
    } catch (err) {
      console.log('  Sign result: ERROR');
      console.log('  Error:', err.message);
      if (err.payload) console.log('  Raw payload:', err.payload);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  if (err.payload) console.error('  Raw payload:', err.payload);
  process.exit(1);
});
