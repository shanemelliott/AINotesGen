// Add a new released outpatient Rx (used to renew an expired one) via RPC CDSP UTIL ADD RX (DEV ONLY).
// The RPC has no dry run, so this script only prints the request unless --commit is given.
// Usage: node add-rx.js --dfn <dfn> --rxncui <RxNorm SCD> [--sig "<text>"] [--qty N] [--days N] [--refills N]
//                       [--date YYYY-MM-DD] [--prov <DUZ>] [--clinic <hospital location IEN>] [--commit]
require('./src/config'); // loads .env
const { callRpc } = require('./src/vistaApiClient');
const { parseRpcResult } = require('./src/fhirBundleTransport');
const { toFileMan } = require('./src/rxFill');

const args = process.argv.slice(2);
const arg = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const dfn = arg('--dfn');
const rxncui = arg('--rxncui');
if (!/^\d+$/.test(dfn || '') || !/^\d+$/.test(rxncui || '')) {
  console.error('Usage: node add-rx.js --dfn <dfn> --rxncui <RxNorm SCD> [--sig "<text>"] [--qty N] [--days N] [--refills N] [--date YYYY-MM-DD] [--prov <DUZ>] [--clinic <IEN>] [--commit]');
  process.exit(1);
}

const params = { DFN: dfn, RXNCUI: rxncui };
if (arg('--sig')) params.SIG = arg('--sig');
for (const [flag, key] of [['--qty', 'QTY'], ['--days', 'DAYS'], ['--refills', 'REFILLS'], ['--prov', 'PROV'], ['--clinic', 'CLINIC'], ['--copy-from', 'COPYFROM']]) {
  if (arg(flag) !== undefined) params[key] = String(arg(flag));
}
if (arg('--date')) {
  params.RXDATE = toFileMan(arg('--date'));
  if (!params.RXDATE) { console.error('--date must be YYYY-MM-DD'); process.exit(1); }
}

(async () => {
  if (!args.includes('--commit')) {
    console.log(`DRY RUN: would add ${JSON.stringify(params)}`);
    console.log('Nothing was written. Add --commit to create the prescription.');
    return;
  }
  const payload = await callRpc('CDSP UTIL ADD RX', [{ namedArray: params }], 'CDSP RPC UTILS', { timeout: 120000 });
  const result = parseRpcResult(payload);
  if (result.ERROR) throw new Error(result.ERROR);
  console.log(`ADDED Rx ${result.rxNumber} (IEN ${result.rxIen}, drug IEN ${result.drugIen})`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
