// Render docs/lighthouse-review/lighthouse-request-items.json as a data request to the Lighthouse sandbox team.
// Usage: node patient.js lighthouse-request   (writes docs/LIGHTHOUSE-DATA-REQUEST.md)
const { ROOT } = require('../../src/paths');
const fs = require('fs');
const path = require('path');

const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'lighthouse-review', 'lighthouse-request-items.json'), 'utf8'));
const LABEL = { address: 'Address', birthDate: 'Birth date', gender: 'Gender', phone: 'Phone', maritalStatus: 'Marital status' };

const out = [
  '# Lighthouse sandbox data request',
  '',
  `Generated ${new Date().toISOString().slice(0, 10)} from \`docs/lighthouse-review/\`. Requested by the CDS team.`,
  '',
  'These test patients are used with the Lighthouse clinical FHIR sandbox (`/services/clinical-fhir/v1/r4`) and VistA station 500.',
  'Lighthouse is the source of truth for demographics, so VistA was changed to match it wherever Lighthouse had a value.',
  'The items below are values Lighthouse does not have or cannot represent. Please add them to the sandbox data; the',
  'suggested values are what VistA now holds, so the two systems agree afterwards.',
  '',
  '| Patient | ICN | VistA DFN (500) | Field | Problem | Suggested value |',
  '|---|---|---|---|---|---|',
];
for (const p of items) {
  for (const r of p.requests) out.push(`| ${p.name} | ${p.icn} | ${p.dfn} | ${LABEL[r.field] || r.field} | ${r.problem} | ${r.suggested} |`);
}
const problemFile = path.join(ROOT, 'docs', 'lighthouse-review', 'lighthouse-problem-request-items.json');
const problems = fs.existsSync(problemFile) ? JSON.parse(fs.readFileSync(problemFile, 'utf8')) : [];
if (problems.length) {
  out.push('', '## Problem list (Condition, problem-list-item)', '',
    'Active problems in VistA that are not in the Lighthouse problem list. Onset is from the VistA problem list (month-only dates are given as year-month).', '',
    '| Patient | ICN | VistA DFN (500) | Problem | ICD | SNOMED CT | Onset |', '|---|---|---|---|---|---|---|');
  for (const p of problems) for (const x of p.problems) out.push(`| ${p.name} | ${p.icn} | ${p.dfn} | ${x.text} | ${x.icd} | ${x.snomed} | ${x.onset} |`);
}
fs.writeFileSync(path.join(ROOT, 'docs', 'LIGHTHOUSE-DATA-REQUEST.md'), out.join('\n'));
console.log(`Wrote docs/LIGHTHOUSE-DATA-REQUEST.md (${items.reduce((n, p) => n + p.requests.length, 0)} demographic items, ${problems.reduce((n, p) => n + p.problems.length, 0)} problems)`);
