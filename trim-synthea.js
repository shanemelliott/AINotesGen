// Trim Synthea FHIR bundles so the record starts at military entry (18th birthday).
// Usage: node trim-synthea.js <bundle.json|folder> [--out folder] [--childhood redate|drop]
//   Drops every resource dated before the patient's 18th birthday. Conditions and medications still
//   active at 18 are re-dated to the 18th birthday (default) or dropped (--childhood drop).
//   References to dropped resources are removed. Writes <out>/<same file name>; default out is synthea/output/trimmed.
const fs = require('fs');
const path = require('path');

const DATE_FIELDS = {
  Encounter: ['period.start'],
  Condition: ['onsetDateTime', 'recordedDate'],
  Observation: ['effectiveDateTime', 'issued'],
  DiagnosticReport: ['effectiveDateTime', 'issued'],
  Procedure: ['performedPeriod.start', 'performedDateTime'],
  MedicationRequest: ['authoredOn'],
  MedicationAdministration: ['effectiveDateTime', 'effectivePeriod.start'],
  Immunization: ['occurrenceDateTime'],
  CarePlan: ['period.start'],
  CareTeam: ['period.start'],
  AllergyIntolerance: ['recordedDate', 'onsetDateTime'],
  SupplyDelivery: ['occurrenceDateTime'],
  Device: ['manufactureDate'],
  ImagingStudy: ['started'],
  DocumentReference: ['date'],
  Claim: ['created'],
  ExplanationOfBenefit: ['created']
};

const get = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
function set(obj, dotted, value) {
  const keys = dotted.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] = o[k] || {}), obj);
  target[last] = value;
}

function firstDate(resource) {
  for (const f of DATE_FIELDS[resource.resourceType] || []) {
    const v = get(resource, f);
    if (v) return { field: f, value: v };
  }
  return null;
}

const isActive = (r) => {
  if (r.resourceType === 'Condition') return !r.abatementDateTime;
  if (r.resourceType === 'MedicationRequest') return r.status === 'active';
  return false;
};

// Remove reference objects pointing at dropped resources; returns false if `node` itself should be removed.
function prune(node, dropped) {
  if (Array.isArray(node)) {
    for (let i = node.length - 1; i >= 0; i--) if (!prune(node[i], dropped)) node.splice(i, 1);
    return true;
  }
  if (node && typeof node === 'object') {
    if (typeof node.reference === 'string' && dropped.has(node.reference)) return false;
    for (const k of Object.keys(node)) if (!prune(node[k], dropped)) delete node[k];
  }
  return true;
}

function trimBundle(bundle, childhood) {
  const patient = bundle.entry.find((e) => e.resource.resourceType === 'Patient').resource;
  const birth = new Date(patient.birthDate + 'T00:00:00Z');
  const entry = new Date(Date.UTC(birth.getUTCFullYear() + 18, birth.getUTCMonth(), birth.getUTCDate()));
  const entryIso = entry.toISOString().slice(0, 10);
  const dropped = new Set();
  const counts = { kept: 0, dropped: 0, redated: 0 };
  const kept = [];

  for (const e of bundle.entry) {
    const r = e.resource;
    const d = firstDate(r);
    if (!d || new Date(d.value) >= entry) { kept.push(e); continue; }
    if (childhood === 'redate' && isActive(r)) {
      for (const f of DATE_FIELDS[r.resourceType]) if (get(r, f)) set(r, f, entryIso + 'T00:00:00Z');
      delete r.encounter;
      counts.redated++;
      kept.push(e);
      continue;
    }
    dropped.add(e.fullUrl);
    if (r.id) dropped.add(`${r.resourceType}/${r.id}`);
    counts.dropped++;
  }
  for (const e of kept) prune(e.resource, dropped);
  counts.kept = kept.length;
  bundle.entry = kept;

  const dates = kept.map((e) => firstDate(e.resource)).filter(Boolean).map((d) => d.value).sort();
  const earliestAge = dates.length ? ((new Date(dates[0]) - birth) / (365.25 * 864e5)).toFixed(1) : null;
  return { entryDate: entryIso, earliest: dates[0] ? dates[0].slice(0, 10) : null, earliestAge, ...counts };
}

function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const chIdx = args.indexOf('--childhood');
  const outDir = outIdx >= 0 ? args[outIdx + 1] : path.join('synthea', 'output', 'trimmed');
  const childhood = chIdx >= 0 ? args[chIdx + 1] : 'redate';
  const flagValues = new Set([outIdx, chIdx].filter((i) => i >= 0).map((i) => i + 1));
  const input = args.find((a, i) => !a.startsWith('--') && !flagValues.has(i));
  if (!input || !['redate', 'drop'].includes(childhood)) {
    console.error('Usage: node trim-synthea.js <bundle.json|folder> [--out folder] [--childhood redate|drop]');
    process.exit(1);
  }
  const files = fs.statSync(input).isDirectory()
    ? fs.readdirSync(input).filter((f) => f.endsWith('.json')).map((f) => path.join(input, f))
    : [input];
  fs.mkdirSync(outDir, { recursive: true });

  for (const file of files) {
    const bundle = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!bundle.entry || !bundle.entry.some((e) => e.resource.resourceType === 'Patient')) continue;
    const s = trimBundle(bundle, childhood);
    const out = path.join(outDir, path.basename(file));
    fs.writeFileSync(out, JSON.stringify(bundle));
    console.log(`${path.basename(file).slice(0, 40).padEnd(40)} entry ${s.entryDate} earliest ${s.earliest} (age ${s.earliestAge})  kept ${s.kept} dropped ${s.dropped} redated ${s.redated}  ${(fs.statSync(out).size / 1e6).toFixed(1)}MB`);
  }
}

main();
