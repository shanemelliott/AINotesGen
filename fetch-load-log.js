// Fetch the Synthea load log for a patient via RPC CDSP UTIL LOAD LOG (DEV ONLY).
// Usage: node fetch-load-log.js <dfn> [--category procedure] [--show N]
const fs = require('fs');
const path = require('path');
require('./src/config'); // loads .env
const { callRpc } = require('./src/vistaApiClient');
const { parseRpcResult } = require('./src/fhirBundleTransport');

const RPC_NAME = 'CDSP UTIL LOAD LOG';
const RPC_CONTEXT = 'CDSP RPC UTILS';

function valueAfter(args, flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

// The log is a list of lines (or a numeric-keyed object); normalize to an array.
function logLines(log) {
  if (!log) return [];
  if (Array.isArray(log)) return log.map(String);
  return Object.keys(log).sort((a, b) => Number(a) - Number(b)).map((k) => String(log[k]));
}

async function main() {
  const args = process.argv.slice(2);
  const dfn = args.find((a) => /^\d+$/.test(a));
  const category = valueAfter(args, '--category') || '';
  const show = Number(valueAfter(args, '--show') || 3);
  if (!dfn) {
    console.error('Usage: node fetch-load-log.js <dfn> [--category procedure] [--show N]');
    process.exit(1);
  }

  const payload = await callRpc(
    RPC_NAME,
    [{ string: dfn }, { string: category }],
    RPC_CONTEXT,
    { timeout: 120000 }
  );
  const result = parseRpcResult(payload);
  if (result.ERROR) throw new Error(`${RPC_NAME}: ${result.ERROR}`);

  const entries = Array.isArray(result.entries) ? result.entries : Object.values(result.entries || {});
  const outDir = path.join(__dirname, 'logs');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `loadlog-${dfn}${category ? `-${category}` : ''}.json`);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

  console.log(`DFN ${result.dfn}, graph IEN ${result.graphIen}, ${entries.length} entries -> ${outPath}`);

  const byCategory = {};
  for (const e of entries) {
    const c = (byCategory[e.category] = byCategory[e.category] || { total: 0, statuses: {} });
    c.total += 1;
    c.statuses[e.loadstatus] = (c.statuses[e.loadstatus] || 0) + 1;
  }
  for (const [c, s] of Object.entries(byCategory)) {
    console.log(`${c.padEnd(16)} ${String(s.total).padStart(5)}  loadstatus: ${JSON.stringify(s.statuses)}`);
  }

  if (category && show > 0) {
    for (const e of entries.slice(0, show)) {
      console.log(`\n[${e.category} rien=${e.rien} loadstatus=${e.loadstatus}]`);
      console.log(logLines(e.log).map((l, i) => `  ${i + 1} ${l}`).join('\n'));
    }
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
