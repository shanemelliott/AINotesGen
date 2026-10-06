// Check a generated veteran batch against the population profile (openspec/changes/veteran-test-population).
// Usage: node check-batch.js [--batch synthea/batches/batch-1.json] [--dir synthea/output/batch-1/trimmed]
// Prints one line per patient, then pass or fail for each profile requirement.
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const val = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const batchFile = val('--batch', path.join('synthea', 'batches', 'batch-1.json'));
const batch = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
const dir = val('--dir', path.join('synthea', 'output', batch.name, 'trimmed'));
const ref = new Date(`${batch.referenceDate.slice(0, 4)}-${batch.referenceDate.slice(4, 6)}-${batch.referenceDate.slice(6, 8)}T00:00:00Z`);

const GROUPS = [
  ['PTSD', /posttraumatic stress/i, 3],
  ['Depression or anxiety', /depress|anxiety/i, 4],
  ['Substance use', /alcohol|opioid (abuse|addict|depend)|misuses drugs|substance/i, 2],
  ['Traumatic brain injury', /traumatic (or nontraumatic )?brain injury|concussion injury of brain|concussion with loss/i, 2],
  ['Limb loss', /amputation/i, 1],
  ['Burn injury', /burn/i, 1],
  ['Spine, orthopedic, chronic pain', /spinal|vertebr|back pain|neck pain|chronic pain|osteoarthritis|rheumatoid|fracture|sprain|rotator|knee|whiplash/i, 5],
  ['Sleep apnea', /sleep apnea/i, 3],
  ['Hypertension', /hypertension/i, 6],
  ['Diabetes', /(?<!pre)diabetes/i, 4],
  ['Hearing loss or tinnitus', /hearing|tinnitus|deaf/i, 4],
  ['Lung or prostate cancer', /(lung|bronch|prostate).*(neoplasm|carcinoma|cancer|malignant)|(neoplasm|carcinoma|cancer|malignant).*(lung|bronch|prostate)|small cell/i, 1],
  ['Kidney disease', /kidney|renal|dialysis/i, 1],
  ['Migraine (optional)', /migraine/i, 1, true],
  ['Dermatitis (optional)', /dermatitis/i, 1, true],
  ['Hernia (optional)', /hernia/i, 1, true]
];

function era(entryYear, entryDate) {
  if (entryYear > 2001) return 'after 2001';
  if (entryYear > 1990) return 'Gulf 1990s';
  if (entryYear > 1975) return 'between Vietnam and Gulf';
  if (entryYear > 1961) return 'Vietnam';
  if (entryYear > 1955) return 'between Korea and Vietnam';
  return 'Korea or earlier';
}

const rows = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const b = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const patient = b.entry.find((e) => e.resource.resourceType === 'Patient').resource;
  const birth = new Date(patient.birthDate + 'T00:00:00Z');
  const age = Math.floor((ref - birth) / (365.2425 * 864e5));
  const entryYear = birth.getUTCFullYear() + 18;
  const conditions = b.entry.filter((e) => e.resource.resourceType === 'Condition').map((e) => e.resource.code.coding[0].display || '');
  const dates = b.entry.map((e) => e.resource.period && e.resource.period.start || e.resource.effectiveDateTime || e.resource.onsetDateTime || e.resource.authoredOn).filter(Boolean).sort();
  const earliestAge = dates.length ? (new Date(dates[0]) - birth) / (365.2425 * 864e5) : null;
  const groups = GROUPS.filter(([, re]) => conditions.some((c) => re.test(c))).map(([n]) => n);
  rows.push({ file: f, gender: patient.gender, age, era: era(entryYear), earliestAge, groups, resources: b.entry.length });
}
rows.sort((a, b) => b.age - a.age);

console.log(`Batch ${batch.name}: ${rows.length} patients (ages as of ${batch.referenceDate})\n`);
for (const r of rows) {
  console.log(`${r.file.slice(0, 22).padEnd(23)} ${r.gender[0].toUpperCase()} age ${String(r.age).padStart(2)}  ${r.era.padEnd(26)} first record age ${r.earliestAge.toFixed(1)}  ${r.resources} res`);
  console.log(`    ${r.groups.join(', ')}`);
}

const checks = [];
const n = rows.length;
const women = rows.filter((r) => r.gender === 'female').length;
const expectedWomen = Math.round(n * 0.2);
checks.push(['Women within one of 20%', Math.abs(women - expectedWomen) <= 1, `${women} of ${n} (target ${expectedWomen})`]);
checks.push(['At least 10 patients 60 or older (batch of 16)', n < 16 || rows.filter((r) => r.age >= 60).length >= 10, `${rows.filter((r) => r.age >= 60).length}`]);
checks.push(['At least 2 patients under 45', rows.filter((r) => r.age < 45).length >= 2, `${rows.filter((r) => r.age < 45).length}`]);
checks.push(['Nobody older than 92', rows.every((r) => r.age <= 92), `oldest ${rows[0].age}`]);
checks.push(['Earliest record at age 18 to 20', rows.every((r) => r.earliestAge >= 17.99 && r.earliestAge <= 20), `range ${Math.min(...rows.map((r) => r.earliestAge)).toFixed(1)} to ${Math.max(...rows.map((r) => r.earliestAge)).toFixed(1)}`]);
const young = rows.filter((r) => r.gender === 'female' && r.age < 45 && r.groups.includes('PTSD'));
checks.push(['A woman under 45 with PTSD', young.length >= 1, `${young.length}`]);
for (const [name, , min, optional] of GROUPS) {
  const count = rows.filter((r) => r.groups.includes(name)).length;
  const scaled = n >= 16 ? min : Math.max(1, Math.round((min * n) / 16));
  checks.push([`${name} (at least ${scaled})`, count >= scaled, `${count}`, optional]);
}
console.log('');
for (const [label, ok, detail, optional] of checks) console.log(`${ok ? 'PASS' : optional ? 'INFO' : 'FAIL'}  ${label.padEnd(52)} ${detail}`);
