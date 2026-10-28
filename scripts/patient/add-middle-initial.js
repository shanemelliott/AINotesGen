// Set the middle initial of the Patient name in Synthea FHIR bundles (answer-key patients use A).
// Usage: node patient.js add-middle-initial <bundle.json|folder> --names First1,First2 [--out folder] [--initial A] [--dry-run]
//   Sets given[1] to the initial on every name entry (official and maiden), replacing a Synthea middle name.
//   Only bundles whose first given name is listed in --names are changed; any other bundle is skipped.
//   Run it on the trimmed bundles. Writes <out>/<same file name>; default out is synthea/output/trimmed.
const fs = require('fs');
const path = require('path');

const namesIdx = process.argv.indexOf('--names');
const NEW_PATIENTS = namesIdx >= 0 ? String(process.argv[namesIdx + 1] || '').split(',').filter(Boolean) : [];

function setInitial(bundle, initial) {
  const patient = bundle.entry.map((e) => e.resource).find((r) => r.resourceType === 'Patient');
  if (!patient) return null;
  const first = ((patient.name || []).find((n) => n.use === 'official') || (patient.name || [])[0] || {}).given;
  if (!first || !NEW_PATIENTS.includes(first[0])) return { skipped: (first || ['?'])[0] };
  const before = [];
  for (const n of patient.name || []) {
    before.push(`${n.use || '?'}: ${(n.given || []).join(' ')} ${n.family}`);
    n.given = [(n.given || [])[0], initial];
  }
  return { patient, before, after: (patient.name || []).map((n) => `${n.use || '?'}: ${n.given.join(' ')} ${n.family}`) };
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const outIdx = args.indexOf('--out');
  const inIdx = args.indexOf('--initial');
  const outDir = outIdx >= 0 ? args[outIdx + 1] : path.join('synthea', 'output', 'trimmed');
  const initial = inIdx >= 0 ? args[inIdx + 1] : 'A';
  const flagValues = new Set([outIdx, inIdx].filter((i) => i >= 0).map((i) => i + 1));
  const input = args.find((a, i) => !a.startsWith('--') && !flagValues.has(i));
  if (!input || !/^[A-Z]$/.test(initial)) {
    console.error('Usage: node patient.js add-middle-initial <bundle.json|folder> [--out folder] [--initial A] [--dry-run]');
    process.exit(1);
  }
  const files = fs.statSync(input).isDirectory()
    ? fs.readdirSync(input).filter((f) => f.endsWith('.json')).map((f) => path.join(input, f))
    : [input];
  if (!dryRun) fs.mkdirSync(outDir, { recursive: true });

  for (const file of files) {
    const bundle = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!bundle.entry) continue;
    const r = setInitial(bundle, initial);
    if (!r) continue;
    if (r.skipped) { console.log(`${path.basename(file)}: skipped (${r.skipped} is not one of the four new patients)`); continue; }
    console.log(path.basename(file));
    r.before.forEach((b, i) => console.log(`  ${b}  ->  ${r.after[i]}`));
    if (!dryRun) fs.writeFileSync(path.join(outDir, path.basename(file)), JSON.stringify(bundle));
  }
  if (dryRun) console.log('Dry run: nothing written.');
}

main();
