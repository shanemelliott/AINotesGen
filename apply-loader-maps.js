// Apply or preview loader map fixes from patches/loader-maps.json via RPC CDSP UTIL MAP SET (DEV ONLY).
// Usage: node apply-loader-maps.js [--apply] [--show] [--file path]
//   default is a dry run (reports old and new values, writes nothing)
//   --show   print the current value of every key first (RPC CDSP UTIL MAP GET)
//   --apply  write the changes; results are saved to logs/loader-maps-<timestamp>.json (old values for a revert)
const fs = require('fs');
const path = require('path');
require('./src/config'); // loads .env
const { callRpc } = require('./src/vistaApiClient');
const { parseRpcResult } = require('./src/fhirBundleTransport');

const CONTEXT = 'CDSP RPC UTILS';

async function call(name, params) {
  const result = parseRpcResult(await callRpc(name, params, CONTEXT, { timeout: 120000 }));
  if (result.ERROR) throw new Error(`${name}: ${result.ERROR}`);
  return result;
}

const asList = (v) => (Array.isArray(v) ? v : Object.values(v || {}));

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const fileIdx = args.indexOf('--file');
  const file = fileIdx >= 0 ? args[fileIdx + 1] : path.join(__dirname, 'patches', 'loader-maps.json');
  const patches = JSON.parse(fs.readFileSync(file, 'utf8'));

  if (args.includes('--show')) {
    console.log('Current values:');
    for (const p of patches) {
      const r = await call('CDSP UTIL MAP GET', [{ string: p.map }, { string: p.key }]);
      const e = asList(r.entries)[0];
      console.log(`  ${p.key.padEnd(8)} ${e ? e.name : '(not in map)'}`);
    }
  }

  const lines = {};
  patches.forEach((p, i) => { lines[String(i + 1)] = `${p.map}^${p.key}^${p.value}`; });
  const result = await call('CDSP UTIL MAP SET', [{ namedArray: lines }, { string: apply ? '0' : '1' }]);

  console.log(`\n${apply ? 'APPLIED' : 'DRY RUN (nothing written)'}:`);
  for (const r of asList(result.results)) {
    console.log(`  ${r.key.padEnd(8)} ${String(r.status).padEnd(10)} ${r.old || '-'} -> ${r.new}`);
  }

  if (apply) {
    fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });
    const out = path.join(__dirname, 'logs', `loader-maps-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(out, JSON.stringify(result, null, 2));
    console.log(`\nSaved ${out}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
