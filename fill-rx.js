// File a (backdated) refill on an existing Rx via RPC CDSP UTIL RX FILL (DEV ONLY). Dry run unless --commit.
// Usage: node fill-rx.js --dfn <dfn> --rx <rx ien> --date YYYY-MM-DD [--released "YYYY-MM-DD[ HH:MM]"] [--commit]
//   --rx        prescription IEN in file #52 (the number before ";O" in a VPR med localId, not the Rx number)
//   --released  release date/time; defaults to the fill date
require('./src/config'); // loads .env
const { toFileMan, fileRefill, RPC_NAME } = require('./src/rxFill');

function arg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const dfn = arg(args, '--dfn');
  const rx = arg(args, '--rx');
  const date = arg(args, '--date');
  const released = arg(args, '--released');
  const commit = args.includes('--commit');
  if (!/^\d+$/.test(dfn || '') || !/^\d+$/.test(rx || '') || !toFileMan(date) || (released && !toFileMan(released))) {
    console.error('Usage: node fill-rx.js --dfn <dfn> --rx <rx ien> --date YYYY-MM-DD [--released "YYYY-MM-DD[ HH:MM]"] [--commit]');
    process.exit(1);
  }

  let result;
  try {
    result = await fileRefill({ dfn, rxIen: rx, fillDate: date, released, commit });
  } catch (err) {
    throw new Error(`${RPC_NAME}: ${err.message}`);
  }

  console.log(`${result.dryRun ? 'DRY RUN' : 'FILED'}: Rx ${result.rxNumber} (IEN ${result.rxIen}), refill #${result.refillNumber}`);
  console.log(`  fill date (FileMan)    ${result.fillDate}`);
  console.log(`  released (FileMan)     ${result.released}`);
  console.log(`  refills remaining      ${result.refillsRemaining}`);
  if (result.early) console.log('  note: earlier than the next possible refill date');
  if (result.dryRun) console.log('Nothing was written. Add --commit to file it.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
