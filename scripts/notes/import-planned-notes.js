// Turn hand-written note bodies into note files in output/ready/ for the visits in a plan.
// Usage: node patient.js import-planned-notes --dfn <dfn> [--plan <file>] [--notes <dir>] [--date YYYY-MM-DD] [--dry-run]
// Bodies live in <notes dir>/<date>.txt (default plans/dfn<dfn>-notes); a visit's `author` DUZ wins, else the clinic map.
const fs = require('fs');
const path = require('path');
const { ROOT } = require('../../src/paths');
const { noteId, writeNote, existsInDir } = require('../../src/noteStore');
const { filemanDateTime, buildVisitString } = require('../../src/notesClient');
const { noteTitleFor } = require('../../src/noteTitles');
const { authorFor } = require('../../src/noteAuthors');
const { toAscii } = require('../../src/reflow');
const { findHits } = require('./check-no-claim');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const dfn = arg('--dfn');
if (!dfn || !/^\d+$/.test(dfn)) {
  console.error('Usage: node patient.js import-planned-notes --dfn <dfn> [--plan <file>] [--notes <dir>] [--date YYYY-MM-DD] [--dry-run]');
  process.exit(1);
}
const dryRun = process.argv.includes('--dry-run');
const plan = JSON.parse(fs.readFileSync(path.join(ROOT, arg('--plan') || `plans/dfn${dfn}-visits.json`), 'utf8'));
const notesDir = path.join(ROOT, arg('--notes') || `plans/dfn${dfn}-notes`);
const readyDir = path.join(ROOT, 'output', 'ready');
const only = arg('--date');

let written = 0;
let problems = 0;
for (const v of plan.visits.filter((x) => !only || x.date === only)) {
  const bodyPath = path.join(notesDir, `${v.date}.txt`);
  if (!fs.existsSync(bodyPath)) continue;
  const id = noteId(dfn, v.date);
  if (existsInDir(readyDir, id) || existsInDir(path.join(ROOT, 'output', 'review'), id) || existsInDir(path.join(ROOT, 'output', 'signed'), id)) {
    console.log(`SKIP ${id}: note file already exists`);
    continue;
  }
  const noteText = toAscii(fs.readFileSync(bodyPath, 'utf8')).replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n';
  const hits = findHits(noteText);
  const long = noteText.split('\n').filter((l) => l.length > 80).length;
  if (hits.length || /\{\{|\?\?/.test(noteText)) {
    problems++;
    console.log(`FAIL ${id}: ${hits.length} claim hit(s)${/\{\{|\?\?/.test(noteText) ? ', unfilled placeholder' : ''}`);
    continue;
  }
  const fm = filemanDateTime(v.date, v.time);
  const meta = {
    noteText, dfn, date: v.date,
    visitString: buildVisitString({ clinicIen: v.clinicIen, filemanDateTime: fm, type: 'A' }),
    noteTitleIen: noteTitleFor(v.clinic), locationIen: v.clinicIen,
    duz: v.author ? String(v.author) : authorFor(v.clinic, v.clinicIen), fmDateTime: fm, flagged: false, flagReasons: [], generatedAt: new Date().toISOString(),
  };
  console.log(`${dryRun ? 'DRY  ' : 'OK   '} ${id}  ${v.clinic}  title ${meta.noteTitleIen}  author ${meta.duz}  ${noteText.split('\n').length} lines${long ? `, ${long} line(s) over 80` : ''}`);
  if (!dryRun) writeNote(readyDir, id, meta);
  written++;
}
console.log(`${dryRun ? 'Would write' : 'Wrote'} ${written} note(s); ${problems} failed.`);
process.exit(problems ? 1 : 0);
