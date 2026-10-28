// File the refills listed in a plan file (DEV ONLY). Dry run unless --commit.
// Usage: node patient.js fill-plan --plan <plan.json> [--commit]
// Plan: { "dfn": "237", "fills": [ { "rx": <rx ien>, "date": "YYYY-MM-DD", "released": "YYYY-MM-DD[ HH:MM]" }, ... ] }
// Fills for one Rx are filed oldest first; after a failure the later fills for that Rx are skipped.
// A dry run checks each fill against the record as it is now, so later fills for the same Rx always show refill #1.
const fs = require('fs');
require('../../src/config'); // loads .env
const { toFileMan, fileRefill } = require('../../src/rxFill');

function arg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const planPath = arg(args, '--plan');
  const commit = args.includes('--commit');
  if (!planPath || !fs.existsSync(planPath)) {
    console.error('Usage: node patient.js fill-plan --plan <plan.json> [--commit]');
    process.exit(1);
  }
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const dfn = String(plan.dfn || '');
  const fills = plan.fills || [];
  const bad = fills.find((f) => !/^\d+$/.test(String(f.rx)) || !toFileMan(f.date) || (f.released && !toFileMan(f.released)));
  if (!/^\d+$/.test(dfn) || bad) {
    console.error(`Invalid plan${bad ? `: ${JSON.stringify(bad)}` : ' (dfn)'}`);
    process.exit(1);
  }

  fills.sort((a, b) => Number(a.rx) - Number(b.rx) || a.date.localeCompare(b.date));
  console.log(`${commit ? 'COMMIT' : 'DRY RUN'}: DFN ${dfn}, ${fills.length} fills from ${planPath}\n`);
  const failedRx = new Set();
  let ok = 0;
  let failed = 0;
  let skipped = 0;
  for (const f of fills) {
    const label = `Rx IEN ${f.rx} on ${f.date}`;
    if (failedRx.has(f.rx)) {
      console.log(`SKIP  ${label}: an earlier fill for this Rx failed`);
      skipped += 1;
      continue;
    }
    try {
      const r = await fileRefill({ dfn, rxIen: f.rx, fillDate: f.date, released: f.released, commit });
      console.log(`${r.dryRun ? 'WOULD' : 'FILED'} ${label} (Rx ${r.rxNumber}): refill #${r.refillNumber}, ${r.refillsRemaining} left${r.early ? ', EARLY' : ''}`);
      ok += 1;
    } catch (err) {
      console.log(`FAIL  ${label}: ${err.message}`);
      failedRx.add(f.rx);
      failed += 1;
    }
  }
  console.log(`\n${commit ? 'Filed' : 'Would file'} ${ok}, failed ${failed}, skipped ${skipped}`);
  if (!commit) console.log('Nothing was written. Add --commit to file them.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
