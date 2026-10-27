// Set a patient's name as given (digits kept) via RPC CDSP UTIL VET SET NAME (DEV ONLY). Dry run unless --apply.
// Usage: node set-name.js --dfn <dfn> --name "LAST790,FIRST742 A" [--apply]
require('./src/config'); // loads .env
const { callRpc } = require('./src/vistaApiClient');
const { parseRpcResult } = require('./src/fhirBundleTransport');

async function main() {
  const args = process.argv.slice(2);
  const get = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const dfn = get('--dfn');
  const name = get('--name');
  const apply = args.includes('--apply');
  if (!/^\d+$/.test(dfn || '') || !name) {
    console.error('Usage: node set-name.js --dfn <dfn> --name "LAST,FIRST M" [--apply]');
    process.exit(1);
  }
  const payload = await callRpc('CDSP UTIL VET SET NAME', [{ string: dfn }, { string: name }, { string: apply ? '1' : '0' }], 'CDSP RPC UTILS', { timeout: 60000 });
  const r = parseRpcResult(payload);
  if (r.ERROR) throw new Error(`CDSP UTIL VET SET NAME: ${r.ERROR}`);
  console.log(`DFN ${r.dfn}: ${r.old} -> ${r.new}${r.applied === 'true' || r.applied === true ? ' (applied)' : ' (dry run)'}; stored name is now ${r.stored}`);
  if (apply && r.stored !== r.new) console.error(`WARNING: stored name differs from the requested name (${r.stored})`);
}

main().catch((e) => { console.error(`FAIL ${e.message}`); process.exit(1); });
