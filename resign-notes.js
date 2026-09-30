// Re-sign notes that were created but failed to sign (e.g. bad cipher index).
// Usage: node resign-notes.js <tiuIen> <id> [<tiuIen> <id> ...]
const fs = require('fs');
const path = require('path');
const config = require('./src/config');
const { signNote } = require('./src/notesClient');

const NOTES_LOG_PATH = path.join(__dirname, 'src', 'notes.json');

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.length % 2 !== 0) {
    console.error('Usage: node resign-notes.js <tiuIen> <id> [<tiuIen> <id> ...]');
    process.exit(1);
  }

  const pairs = [];
  for (let i = 0; i < argv.length; i += 2) pairs.push({ tiuIen: argv[i], id: argv[i + 1] });

  const log = JSON.parse(fs.readFileSync(NOTES_LOG_PATH, 'utf8'));
  const esigCode = config.esigCode();

  for (const { tiuIen, id } of pairs) {
    console.log(`START ${id} (tiuIen=${tiuIen})...`);
    const result = await signNote({ tiuIen, esigCode });
    if (result.success) {
      const rec = log.find((r) => String(r.tiuIen) === String(tiuIen));
      if (rec) rec.signed = true;
      console.log(`OK    ${id}: signed`);
    } else {
      console.error(`FAIL  ${id}: ${result.payload}`);
    }
  }

  const tmpPath = `${NOTES_LOG_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(log, null, 2));
  fs.renameSync(tmpPath, NOTES_LOG_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
