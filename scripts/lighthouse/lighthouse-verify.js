// Review roster patients against Lighthouse (read-only) and save each result for the final report.
// Usage: node patient.js lighthouse-verify <dfn> [<dfn> ...] [--token <access_token>]
//        node patient.js lighthouse-verify --all [--vista-only]
// Tokens come from --token (one patient only), LIGHTHOUSE_TOKEN, or .lighthouse-token.json keyed by ICN.
// Output: docs/lighthouse-review/dfn-<primary dfn>.json per patient. A patient with no token still gets its VistA part.
const { ROOT } = require('../../src/paths');
const fs = require('fs');
const path = require('path');
require('../../src/config');
const roster = require('../../src/lighthouse-patients.json');
const { review } = require('../../src/lighthouseReview');

const OUT_DIR = path.join(ROOT, 'docs', 'lighthouse-review');

function parseArgs(argv) {
  const a = { dfns: [], all: false, vistaOnly: false, token: process.env.LIGHTHOUSE_TOKEN || null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--all') a.all = true;
    else if (argv[i] === '--vista-only') a.vistaOnly = true;
    else if (argv[i] === '--token') a.token = argv[++i];
    else if (/^\d+$/.test(argv[i])) a.dfns.push(argv[i]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!a.all && !a.dfns.length) throw new Error('Usage: node patient.js lighthouse-verify <dfn> [<dfn> ...] | --all  [--token <t>] [--vista-only]');
  return a;
}

function print(r) {
  const e = r.roster;
  console.log(`\n=== ${e.name}  ICN ${e.icn}`);
  for (const v of r.vista) {
    if (!v.found) { console.log(`  VistA DFN ${v.dfn}: NOT FOUND (${v.error})`); continue; }
    const c = v.counts;
    console.log(`  VistA DFN ${v.dfn}: ${v.name}, ${v.gender}, born ${v.dateOfBirth}; problems ${v.problems.length}, meds ${v.meds.length}, ` +
      `visits ${c.visit || 0}, appts ${c.appointment || 0}, notes ${c.document || 0}; veteran ${v.veteran && v.veteran.isVet ? 'yes' : 'no'}`);
  }
  const l = r.lighthouse;
  if (!l) return;
  if (l.error) { console.log(`  Lighthouse: ${l.error}`); return; }
  for (const d of l.demographics) if (d.status !== 'match') console.log(`  ${d.status.padEnd(5)} ${d.field.padEnd(10)} ${d.vista} | ${d.lighthouse}`);
  if (l.problems) {
    console.log(`  problems: ${l.problems.both.length} both, ${l.problems.vistaOnly.length} VistA only, ${l.problems.lighthouseOnly.length} Lighthouse only`);
    for (const x of l.problems.vistaOnly) console.log(`    VistA only  ${x}`);
    for (const x of l.problems.lighthouseOnly) console.log(`    LH only     ${x}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const entries = args.all ? roster : roster.filter((e) => e.dfns.some((d) => args.dfns.includes(d)));
  if (!entries.length) throw new Error(`No roster patient with DFN ${args.dfns.join(', ')}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const entry of entries) {
    const r = await review(entry, { token: args.token, skipLighthouse: args.vistaOnly });
    const file = path.join(OUT_DIR, `dfn-${entry.dfns[0]}.json`);
    // Never replace saved Lighthouse data with a failed or skipped call.
    if (fs.existsSync(file) && (!r.lighthouse || r.lighthouse.error)) {
      const old = JSON.parse(fs.readFileSync(file, 'utf8')).lighthouse;
      if (old && !old.error) r.lighthouse = { ...old, stale: r.lighthouse ? r.lighthouse.error : 'not fetched this run' };
    }
    fs.writeFileSync(file, JSON.stringify(r, null, 2));
    print(r);
  }
  console.log(`\nSaved to docs/lighthouse-review/`);
}

main().catch((e) => { console.error(`FAIL ${e.message}`); process.exit(1); });
