const fs = require('fs');
const { extractEncounters, indexVpr, filterProblemsForEncounter } = require('./src/encounters.js');
const problems = JSON.parse(fs.readFileSync('./src/problem-rules.json', 'utf8'));
const vpr = JSON.parse(fs.readFileSync('./100965.json', 'utf8'));
const items = vpr.payload.data.items;
const indexed = indexVpr(items);
const encounters = extractEncounters(indexed, { rules: problems });
const oct21 = encounters.find(e => e.date === '2025-10-21');

if (!oct21) {
  console.log('ERROR: No 2025-10-21 encounter found');
  process.exit(1);
}

console.log('\n=== Filtering Problems for 2025-10-21 Encounter ===\n');
const filtered = filterProblemsForEncounter(oct21, problems);

console.log('Filtered problems count:', filtered.length);
console.log('Social history count:', oct21.socialHistory.length);
console.log('');

console.log('Filtered problems:');
filtered.forEach((p, i) => {
  const icdStr = p.icd ? ` (${p.icd})` : '';
  console.log(`  ${i+1}. ${p.text}${icdStr} [${p.category}]`);
});

console.log('\nVisit diagnoses:');
oct21.visitDiagnoses.forEach((d, i) => {
  console.log(`  ${i+1}. ${d.name} (${d.icd}) ${d.primary ? '[PRIMARY]' : ''}`);
});

console.log('\nCare plan activities:');
oct21.carePlanActivities.forEach((a, i) => {
  console.log(`  ${i+1}. ${a}`);
});

console.log('\nNew meds:');
oct21.newMeds.forEach((m, i) => {
  console.log(`  ${i+1}. ${m.name}`);
});

console.log('\n✓ Task 1.1 verification passed');
