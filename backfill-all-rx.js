// Run the dosing backfill over many patients and print one summary line each (DEV ONLY). Dry run unless --commit.
// Usage: node backfill-all-rx.js [--dfns 100973,100975] [--commit] [--verbose]
//   --dfns     comma list of DFNs; default is every <dfn>.json in this folder except 237 and 99935791
//   --verbose  also print each Rx that would change
require('./src/config'); // loads .env
const fs = require('fs');
const path = require('path');
const { backfill } = require('./src/rxBackfill');

const EXCLUDE = new Set(['237', '99935791']);

function arg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function defaultDfns() {
  return fs.readdirSync(__dirname)
    .map((f) => /^(\d+)\.json$/.exec(f))
    .filter(Boolean)
    .map((m) => m[1])
    .filter((d) => !EXCLUDE.has(d))
    .sort((a, b) => Number(a) - Number(b));
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const verbose = args.includes('--verbose');
  const list = arg(args, '--dfns');
  const dfns = list ? list.split(',').map((s) => s.trim()).filter(Boolean) : defaultDfns();
  if (!dfns.length || dfns.some((d) => !/^\d+$/.test(d))) {
    console.error('Usage: node backfill-all-rx.js [--dfns 100973,100975] [--commit] [--verbose]');
    process.exit(1);
  }

  let totalChange = 0;
  for (const dfn of dfns) {
    try {
      const result = await backfill({ dfn, commit });
      const rows = result.rx || [];
      const changed = rows.filter((r) => !r.action.startsWith('skipped'));
      const sigOnly = changed.filter((r) => r.dosingNote).length;
      const noOrder = rows.filter((r) => r.action === 'skipped: no CPRS order').length;
      totalChange += changed.length;
      console.log(`${dfn}: ${rows.length} Rx, ${changed.length} ${commit ? 'changed' : 'would change'} (${sigOnly} sig only), ${noOrder} without CPRS order`);
      if (verbose) {
        for (const r of changed) console.log(`    ${r.rxIen} ${r.drug}: ${r.action}${r.sigNew && r.sigNew !== r.sigOld ? ` | ${r.sigNew}` : ''}${r.dosingNote ? ` | ${r.dosingNote}` : ''}`);
      }
    } catch (err) {
      console.log(`${dfn}: FAILED ${err.message}`);
    }
  }
  console.log(`${commit ? 'DONE' : 'DRY RUN'}: ${dfns.length} patients, ${totalChange} Rx ${commit ? 'changed' : 'would change'}.`);
  if (!commit) console.log('Nothing was written. Add --commit to write.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
