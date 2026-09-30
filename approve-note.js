// Move reviewed note file(s) from output/review/ to output/ready/.
// Usage: node approve-note.js --all
//        node approve-note.js 100965-2025-10-04
//        node approve-note.js output/review/100965-2025-10-04.json
const path = require('path');
const { listIds, existsInDir, moveNote } = require('./src/noteStore');

const REVIEW_DIR = path.join(__dirname, 'output', 'review');
const READY_DIR = path.join(__dirname, 'output', 'ready');

function idFromArg(arg) {
  // Accept a bare id, or a path to either the .json or .txt file.
  const base = path.basename(arg);
  return base.replace(/\.(json|txt)$/, '');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error('Usage: node approve-note.js --all | <id-or-path> [<id-or-path> ...]');
    process.exit(1);
  }

  if (argv.includes('--all')) {
    const ids = listIds(REVIEW_DIR);
    if (ids.length === 0) {
      console.log('output/review/ is empty; nothing to approve.');
      process.exit(0);
    }
    for (const id of ids) {
      moveNote(REVIEW_DIR, READY_DIR, id);
      console.log(`APPROVED ${id}`);
    }
    console.log(`\n${ids.length} note(s) approved.`);
    process.exit(0);
  }

  let approved = 0;
  for (const arg of argv) {
    const id = idFromArg(arg);
    if (!existsInDir(REVIEW_DIR, id)) {
      console.error(`NOT FOUND: ${id} (not in output/review/)`);
      continue;
    }
    moveNote(REVIEW_DIR, READY_DIR, id);
    console.log(`APPROVED ${id}`);
    approved++;
  }
  console.log(`\n${approved} note(s) approved.`);
  process.exit(approved > 0 ? 0 : 1);
}

main();
