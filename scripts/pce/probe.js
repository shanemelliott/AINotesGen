// Read-only probe for the pce-checkout-rpc-tests change: DDR GETS ENTRY DATA / DDR LISTER under CDS RPC CONTEXT.
// Usage: node scripts/pce/probe.js [--dfn 100969]
require('../../src/config');
const { callRpc } = require('../../src/vistaApiClient');
const { assertDevSite, ddrGets, ddrLister, CTX_DDR } = require('./lib/ddr');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main() {
  assertDevSite();
  const dfn = arg('--dfn', '100969');
  console.log(`context ${CTX_DDR}`);
  const list = await ddrLister({ file: '9000010', fields: '.01;.05;.07;.22;.18', xref: 'C', from: String(dfn), part: String(dfn), max: 3 });
  console.log('LISTER 9000010 by patient:', JSON.stringify(list, null, 2));
  const first = list.find((r) => r.ien);
  if (first) {
    const rec = await ddrGets({ file: '9000010', iens: `${first.ien},`, fields: '.01;.05;.07;.18;.22;15003' });
    console.log('GETS visit', first.ien, JSON.stringify(rec, null, 2));
  }
  if (process.argv.includes('--raw')) {
    const raw = await callRpc('DDR LISTER', [{ namedArray: { FILE: '9000010', FIELDS: '.01', XREF: 'C', FROM: String(dfn), PART: String(dfn), MAX: '1' } }], CTX_DDR, { raw: true });
    console.log('RAW', JSON.stringify(raw).slice(0, 800));
  }
}

main().catch((err) => {
  console.error(err.message);
  if (err.details) console.error(JSON.stringify(err.details));
  process.exit(1);
});
