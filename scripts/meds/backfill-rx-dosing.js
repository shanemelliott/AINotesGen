// Fill structured dosing and the sig on Rxs loaded without them via RPC CDSP UTIL RX DOSING BACKFILL (DEV ONLY). Dry run unless --commit.
// Usage: node patient.js backfill-rx-dosing --dfn <dfn> [--rx <rx ien>] [--resig] [--commit]
//   --rx     one prescription IEN in file #52; default is every Rx of the patient
//   --resig  replace the sig with the MEDDEF table sig even when it is already set (use with --rx)
require('../../src/config'); // loads .env
const { backfill } = require('../../src/rxBackfill');

function arg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const dfn = arg(args, '--dfn');
  const rx = arg(args, '--rx');
  const commit = args.includes('--commit');
  if (!/^\d+$/.test(dfn || '') || (rx !== undefined && !/^\d+$/.test(rx))) {
    console.error('Usage: node patient.js backfill-rx-dosing --dfn <dfn> [--rx <rx ien>] [--resig] [--commit]');
    process.exit(1);
  }

  const result = await backfill({ dfn, rx, commit, resig: args.includes('--resig') });

  const rows = result.rx || [];
  for (const r of rows) {
    console.log(`Rx ${r.rxNumber} (IEN ${r.rxIen}) ${r.drug}: ${r.action}`);
    if (r.action.startsWith('skipped')) continue;
    if (r.sigOld !== r.sigNew) console.log(`  sig       "${r.sigOld}" -> "${r.sigNew}"`);
    if (r.dose) console.log(`  dose      ${r.dose}  route ${r.route || '-'}  schedule ${r.schedule || '-'}`);
    else if (r.route || r.schedule) console.log(`  no dose   route ${r.route || '-'}  schedule ${r.schedule || '-'}`);
    if (r.dosingNote) console.log(`  dosing not filled: ${r.dosingNote} (sig only)`);
  }
  const changed = rows.filter((r) => !r.action.startsWith('skipped')).length;
  console.log(`${result.dryRun ? 'DRY RUN' : 'DONE'}: ${rows.length} Rx checked, ${changed} ${result.dryRun ? 'would change' : 'changed'}.`);
  if (result.dryRun) console.log('Nothing was written. Add --commit to write.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
