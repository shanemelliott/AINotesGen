// Read a patient's veteran service data via RPC CDSP UTIL VET GET (read only, DEV ONLY).
// Usage: node vet-get.js --dfn <dfn> [--summary] [--tables]
//   --summary  print a readable summary (like Patient Inquiry) instead of every field
const fs = require('fs');
const path = require('path');
require('./src/config'); // loads .env
const { callRpc } = require('./src/vistaApiClient');
const { parseRpcResult } = require('./src/fhirBundleTransport');
const { summarize } = require('./src/vetSummary');

const RPC_NAME = 'CDSP UTIL VET GET';
const RPC_CONTEXT = 'CDSP RPC UTILS';
const list = (v) => (Array.isArray(v) ? v : Object.values(v || {}));

async function main() {
  const args = process.argv.slice(2);
  const dfn = args.includes('--dfn') ? args[args.indexOf('--dfn') + 1] : undefined;
  const tables = args.includes('--tables');
  if (!/^\d+$/.test(dfn || '')) {
    console.error('Usage: node vet-get.js --dfn <dfn> [--summary] [--tables]');
    process.exit(1);
  }

  const payload = await callRpc(RPC_NAME, [{ string: dfn }, { string: tables ? '1' : '0' }], RPC_CONTEXT, { timeout: 60000 });
  const result = parseRpcResult(payload);
  if (result.ERROR) throw new Error(`${RPC_NAME}: ${result.ERROR}`);

  const outPath = path.join(__dirname, 'logs', `vet-get-${dfn}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

  if (args.includes('--summary')) {
    console.log(summarize(result));
    return;
  }

  console.log(`${result.name} (DFN ${result.dfn}), born ${result.dob}\n`);
  console.log('Fields (node;piece  field  label = external [internal]):');
  for (const f of list(result.fields)) {
    const val = f.external === '' && f.internal === '' ? '' : `${f.external} [${f.internal}]`;
    console.log(`  ${`${f.node};${f.piece}`.padEnd(8)} ${String(f.field).padEnd(9)} ${String(f.label).padEnd(34)} ${val}`);
  }
  console.log(`\nRated disabilities: ${list(result.ratedDisabilities).map((r) => `${r.name} (${r.dxCode}) ${r.percent}%`).join('; ') || 'none'}`);
  console.log(`Eligibilities: ${list(result.eligibilities).map((e) => e.name).join('; ') || 'none'}`);
  console.log(`Service episodes (node ${result.serviceEpisodesNode ?? 'n/a'}): ${list(result.serviceEpisodes).length}`);
  console.log(`MST: ${result.mst ?? 'n/a'}`);
  console.log(`Enrollment: ${result.enrollment?.ien ? JSON.stringify(result.enrollment.record) : 'none'}`);
  if (result.tables) {
    for (const [name, rows] of Object.entries(result.tables)) console.log(`Table ${name}: ${list(rows).length} entries`);
  }
  console.log(`\nFull result: ${outPath}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
