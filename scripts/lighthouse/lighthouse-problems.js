// Print the problem list comparison per patient from docs/lighthouse-review/dfn-*.json (read-only).
// Usage: node patient.js lighthouse-problems [--md]
const { ROOT } = require('../../src/paths');
const fs = require('fs');
const path = require('path');
const DIR = path.join(ROOT, 'docs', 'lighthouse-review');
const date = (s) => String(s || '').replace(/^(\d{4})(\d{2})(\d{2}).*/, '$1-$2-$3').slice(0, 10);

for (const f of fs.readdirSync(DIR).filter((x) => /^dfn-\d+\.json$/.test(x))) {
  const r = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const l = r.lighthouse;
  if (!l || !l.problems) continue;
  const v = r.vista.find((x) => x.found);
  console.log(`\n## ${r.roster.name} (DFN ${v.dfn}): VistA ${v.problems.length}, Lighthouse ${l.conditions.length}, in both ${l.problems.both.length}`);
  const rows = [];
  for (const b of l.problems.both) rows.push(['both', b.vista, b.lighthouse]);
  for (const x of l.problems.vistaOnly) rows.push(['VistA only', x, '']);
  for (const x of l.problems.lighthouseOnly) rows.push(['LH only', '', x]);
  for (const [k, a, b] of rows) console.log(`- ${k.padEnd(10)} ${a}${b ? `${a ? '  <->  ' : ''}${b}` : ''}`);
}
