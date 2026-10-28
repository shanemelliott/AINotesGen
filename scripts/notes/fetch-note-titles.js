// List selectable TIU note titles via RPC CDSP GET NOTE TITLES and show those matching a pattern.
// Usage: node patient.js fetch-note-titles [pattern]   (default pattern: emergency|dental|primary care|progress note)
// Writes logs/note-titles.json with every title returned.
const { ROOT } = require('../../src/paths');
const fs = require('fs');
const path = require('path');
require('../../src/config'); // loads .env
const { callRpc } = require('../../src/vistaApiClient');
const { parseRpcResult } = require('../../src/fhirBundleTransport');

const pattern = new RegExp(process.argv[2] || 'emergency|dental|primary care|progress note', 'i');
const list = (v) => (Array.isArray(v) ? v : Object.values(v || {}));

async function main() {
  let payload;
  for (const context of ['CDSP RPC CONTEXT', 'CDSP RPC UTILS']) {
    try {
      payload = await callRpc('CDSP GET NOTE TITLES', [{ string: '' }], context, { timeout: 120000 });
      console.log(`context ${context} worked`);
      break;
    } catch (err) {
      console.log(`context ${context}: ${err.message.slice(0, 160)}`);
    }
  }
  if (payload === undefined) throw new Error('RPC failed in every context');
  const result = parseRpcResult(payload);
  fs.writeFileSync(path.join(ROOT, 'logs', 'note-titles.json'), JSON.stringify(result, null, 2));
  const rows = list(result.titles || result.items || result);
  console.log(`${rows.length} entries; first entry keys: ${Object.keys(rows[0] || {}).join(', ')}`);
  for (const r of rows) {
    const text = JSON.stringify(r);
    if (pattern.test(text)) console.log(text.slice(0, 260));
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
