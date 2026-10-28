// Build the problem-list part of the Lighthouse data request: active VistA problems Lighthouse does not hold.
// Usage: node patient.js lighthouse-problem-request   (writes docs/lighthouse-review/lighthouse-problem-request-items.json)
// Onset comes from ORQQPL PROBLEM LIST (FileMan date, may be month-only); the VPR onset misreads "4/15" as a day.
const { ROOT } = require('../../src/paths');
const fs = require('fs');
const path = require('path');
require('../../src/config');
const { callRpc } = require('../../src/vistaApiClient');

const DIR = path.join(ROOT, 'docs', 'lighthouse-review');
// VistA problems that are the same condition as a Lighthouse one (code or date differs), by DFN and SNOMED code.
const SAME_CONDITION = { 99935794: ['111552007'], 99935792: ['413839001'], 99935796: ['328383001'], 99935798: ['709044004'] };
const NOT_CLINICAL = /education|depth of general/i;

const fmToIso = (fm) => {
  const s = String(fm || '');
  if (!/^\d{7}$/.test(s)) return '';
  const y = +s.slice(0, 3) + 1700, m = s.slice(3, 5), d = s.slice(5, 7);
  return m === '00' ? String(y) : d === '00' ? `${y}-${m}` : `${y}-${m}-${d}`;
};

async function onsets(dfn) {
  const raw = String(await callRpc('ORQQPL PROBLEM LIST', [{ string: dfn }, { string: 'A' }], 'OR CPRS GUI CHART', { timeout: 60000 }));
  const map = {};
  for (const line of raw.split(/\r?\n/).slice(1)) {
    const p = line.split('^');
    if (p[0]) map[p[0]] = fmToIso(p[4]);
  }
  return map;
}

async function main() {
  const out = [];
  for (const f of fs.readdirSync(DIR).filter((x) => /^dfn-\d+\.json$/.test(x))) {
    const r = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    const v = r.vista.find((x) => x.found);
    if (!v || !r.lighthouse || !r.lighthouse.problems) continue;
    const vistaOnly = new Set(r.lighthouse.problems.vistaOnly);
    const on = await onsets(v.dfn);
    const seen = new Set();
    const items = [];
    for (const p of v.problems) {
      const key = `${p.icd.replace(/\.$/, '')} ${p.text} onset ${p.onset} (${p.status})`;
      const sct = ((p.text || '').match(/SCT (\d+)/) || [])[1];
      if (!vistaOnly.has(key) || p.status !== 'ACTIVE') continue;
      if (NOT_CLINICAL.test(p.text) || (SAME_CONDITION[v.dfn] || []).includes(sct) || seen.has(sct || p.text)) continue;
      seen.add(sct || p.text);
      items.push({ text: p.text.replace(/\s*\((SCT|ICD-\d+-CM)[^)]*\)\s*$/, ''), icd: p.icd.replace(/^urn:icd:/, 'ICD-9 '), snomed: sct || '', onset: on[p.id] || '' });
    }
    if (items.length) out.push({ name: r.roster.name, icn: r.roster.icn, dfn: v.dfn, problems: items });
  }
  fs.writeFileSync(path.join(DIR, 'lighthouse-problem-request-items.json'), JSON.stringify(out, null, 2));
  console.log(`${out.length} patients, ${out.reduce((n, p) => n + p.problems.length, 0)} problems`);
}

main().catch((e) => { console.error(`FAIL ${e.message}`); process.exit(1); });
