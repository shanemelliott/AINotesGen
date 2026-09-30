'use strict';
// Extract historical encounters from patient VPR JSON into output/encounters-<dfn>.json.

const fs = require('fs');
const path = require('path');
const { indexVpr, extractEncounters, findIdentifierLeaks } = require('./src/encounters');

const ROOT = __dirname;
const OUTPUT_DIR = path.join(ROOT, 'output');
const RULES_FILE = path.join(ROOT, 'src', 'problem-rules.json');

const USAGE = `Usage: node extract-encounters.js [--dfn <dfn>] [--summary]

  --dfn <dfn>   Process only <dfn>.json (default: every [0-9]*.json in the repo root)
  --summary     Print one line per encounter
  --help        Show this help`;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--summary') args.summary = true;
    else if (a === '--dfn') args.dfn = argv[++i];
    else throw new Error(`Unknown argument: ${a}\n\n${USAGE}`);
  }
  if (args.dfn !== undefined && !/^\d+$/.test(args.dfn || '')) throw new Error('--dfn must be numeric');
  return args;
}

function summaryLine(e) {
  return [
    String(e.seq).padStart(3),
    e.date,
    e.clinic.padEnd(18).slice(0, 18),
    `orders ${String(e.ordersToday.length).padStart(2)}`,
    `labs ${String(e.labsToday.length).padStart(2)}`,
    `newMeds ${e.newMeds.length}`,
    `problems ${String(e.problems.length).padStart(2)}`,
    `dx ${e.visitDiagnoses.length}`,
    e.hasAppointment ? 'appt' : 'NO APPT',
  ].join('  ');
}

function processDfn(dfn, rules, { summary }) {
  const file = path.join(ROOT, `${dfn}.json`);
  if (!fs.existsSync(file)) throw new Error(`Patient file not found: ${dfn}.json`);
  const items = JSON.parse(fs.readFileSync(file, 'utf8'))?.payload?.data?.items;
  if (!Array.isArray(items)) throw new Error(`${dfn}.json has no payload.data.items array`);

  const index = indexVpr(items);
  const encounters = extractEncounters(index, { rules });
  const doc = { dfn, extractedAt: new Date().toISOString(), encounterCount: encounters.length, encounters };
  const text = JSON.stringify(doc, null, 2);

  const leaks = findIdentifierLeaks(text, index);
  if (leaks.length) throw new Error(`DFN ${dfn}: ${leaks.length} patient identifier value(s) found in output; nothing written.`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const out = path.join(OUTPUT_DIR, `encounters-${dfn}.json`);
  fs.writeFileSync(out, text + '\n');

  if (summary) encounters.forEach((e) => console.log(summaryLine(e)));
  console.log(`DFN ${dfn}: ${encounters.length} encounters -> ${path.relative(ROOT, out)}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return console.log(USAGE);

  const rules = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
  const dfns = args.dfn
    ? [args.dfn]
    : fs.readdirSync(ROOT).filter((f) => /^\d+\.json$/.test(f)).map((f) => f.replace('.json', '')).sort();
  if (dfns.length === 0) throw new Error('No [0-9]*.json patient files found in the repo root.');

  for (const dfn of dfns) processDfn(dfn, rules, args);
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
