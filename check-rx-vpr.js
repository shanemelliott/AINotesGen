// Show what the saved VPR JSON (<dfn>.json from fetch-vpr.js) holds for one Rx.
// Usage: node check-rx-vpr.js <dfn> <rx ien>
const fs = require('fs');
const path = require('path');

const [dfn, rx] = process.argv.slice(2);
if (!/^\d+$/.test(dfn || '') || !/^\d+$/.test(rx || '')) {
  console.error('Usage: node check-rx-vpr.js <dfn> <rx ien>');
  process.exit(1);
}

const body = JSON.parse(fs.readFileSync(path.join(__dirname, `${dfn}.json`), 'utf8'));
const items = body?.payload?.data?.items ?? [];
const meds = items.filter((i) => String(i.localId || '').startsWith(`${rx};`));
if (!meds.length) {
  console.log(`No VPR item with localId ${rx};O in ${dfn}.json (${items.length} items). Run fetch-vpr.js ${dfn} first.`);
  process.exit(1);
}
for (const m of meds) {
  console.log(JSON.stringify({ localId: m.localId, name: m.name, sig: m.sig, dosages: m.dosages }, null, 2));
}
