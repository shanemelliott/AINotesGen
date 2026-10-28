// Finish a pending outpatient order via RPC CDSP UTIL FINISH RX (CDSPRX FINORD, DEV ONLY), like Outpatient Pharmacy's Finish.
// Dry run unless --commit. Usage: node patient.js finish-rx --dfn <dfn> --ord <pending order IEN in #52.41> [--fill-date YYYY-MM-DD] [--commit]
require('../../src/config');
const { callRpc } = require('../../src/vistaApiClient');
const { parseRpcResult } = require('../../src/fhirBundleTransport');
const { toFileMan } = require('../../src/rxFill');

const args = process.argv.slice(2);
const arg = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const dfn = arg('--dfn');
const ord = arg('--ord');
if (!/^\d+$/.test(dfn || '') || !/^\d+$/.test(ord || '')) {
  console.error('Usage: node patient.js finish-rx --dfn <dfn> --ord <pending order IEN> [--fill-date YYYY-MM-DD] [--commit]');
  process.exit(1);
}
const params = { DFN: dfn, ORD: ord, COMMIT: args.includes('--commit') ? '1' : '0' };
if (arg('--fill-date')) {
  params.FILLDATE = toFileMan(arg('--fill-date'));
  if (!params.FILLDATE) { console.error('--fill-date must be YYYY-MM-DD'); process.exit(1); }
}

(async () => {
  const payload = await callRpc('CDSP UTIL FINISH RX', [{ namedArray: params }], 'CDSP RPC UTILS', { timeout: 180000 });
  const result = parseRpcResult(payload);
  if (result.ERROR) throw new Error(result.ERROR);
  console.log(JSON.stringify(result, null, 2));
  if (result.dryRun) console.log('DRY RUN: nothing was filed. Add --commit to finish the order.');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
