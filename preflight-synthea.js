// Offline inventory of the codes a Synthea bundle will send to the SYN loader (Task 1.7, layer 1).
// Usage: node preflight-synthea.js <bundle.json> [--keep-all] [--top N]
const fs = require('fs');
const path = require('path');

// Same default as load-synthea.js: these types are never sent to VistA.
const SKIP_TYPES = ['Claim', 'ExplanationOfBenefit', 'DocumentReference'];

function firstCoding(cc) {
  const c = cc && Array.isArray(cc.coding) && cc.coding[0];
  return c ? { system: c.system || '', code: c.code || '', display: c.display || (cc && cc.text) || '' } : null;
}

function obsKind(r) {
  const cat = (r.category || []).flatMap((c) => (c.coding || []).map((x) => x.code));
  if (cat.includes('vital-signs')) return 'vitals';
  if (cat.includes('laboratory')) return 'labs';
  if (cat.includes('social-history')) return 'social-history';
  return `observation-${cat[0] || 'other'}`;
}

function add(bucket, domain, coding, extra) {
  if (!coding || !coding.code) return;
  const key = `${coding.system}|${coding.code}`;
  const d = (bucket[domain] = bucket[domain] || {});
  const e = (d[key] = d[key] || { system: coding.system, code: coding.code, display: coding.display, count: 0, ...extra });
  e.count += 1;
}

function inventory(bundle, keepAll) {
  const entries = (bundle.entry || []).filter((e) => keepAll || !SKIP_TYPES.includes(e.resource && e.resource.resourceType));
  const byUrl = {};
  for (const e of entries) if (e.fullUrl) byUrl[e.fullUrl] = e.resource;

  const out = {};
  const counts = {};
  for (const { resource: r } of entries) {
    if (!r) continue;
    counts[r.resourceType] = (counts[r.resourceType] || 0) + 1;
    switch (r.resourceType) {
      case 'Procedure': add(out, 'procedures', firstCoding(r.code)); break;
      case 'Condition': add(out, 'conditions', firstCoding(r.code)); break;
      case 'Observation': {
        const kind = obsKind(r);
        add(out, kind, firstCoding(r.code), { units: (r.valueQuantity && r.valueQuantity.unit) || '' });
        break;
      }
      case 'DiagnosticReport': add(out, 'panels', firstCoding(r.code)); break;
      case 'MedicationRequest': {
        const med = r.medicationCodeableConcept
          || (r.medicationReference && byUrl[r.medicationReference.reference] && byUrl[r.medicationReference.reference].code);
        add(out, 'meds', firstCoding(med));
        break;
      }
      case 'Immunization': add(out, 'immunizations', firstCoding(r.vaccineCode)); break;
      case 'AllergyIntolerance': add(out, 'allergies', firstCoding(r.code)); break;
      case 'CarePlan': for (const c of r.category || []) add(out, 'careplans', firstCoding(c)); break;
      case 'Encounter': {
        add(out, 'encounterClass', r.class ? { system: r.class.system || '', code: r.class.code || '', display: r.class.display || '' } : null);
        for (const t of r.type || []) add(out, 'encounterType', firstCoding(t));
        break;
      }
      default: break;
    }
  }
  return { counts, domains: out };
}

function main() {
  const args = process.argv.slice(2);
  const topIdx = args.indexOf('--top');
  const top = topIdx >= 0 ? Number(args[topIdx + 1]) : 8;
  const file = args.find((a, i) => !a.startsWith('--') && i !== topIdx + 1);
  if (!file) {
    console.error('Usage: node preflight-synthea.js <bundle.json> [--keep-all] [--top N]');
    process.exit(1);
  }

  const bundle = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const { counts, domains } = inventory(bundle, args.includes('--keep-all'));

  const result = { file: path.basename(file), resourceCounts: counts, domains: {} };
  console.log(`${path.basename(file)}\n`);
  for (const [domain, map] of Object.entries(domains)) {
    const list = Object.values(map).sort((a, b) => b.count - a.count);
    result.domains[domain] = list;
    const total = list.reduce((n, e) => n + e.count, 0);
    console.log(`${domain}: ${list.length} distinct codes, ${total} resources`);
    for (const e of list.slice(0, top)) {
      console.log(`  ${String(e.count).padStart(4)}  ${e.code.padEnd(12)} ${e.display.slice(0, 60)}  [${e.system.split('/').pop()}]`);
    }
    if (list.length > top) console.log(`        ... ${list.length - top} more`);
  }

  const outDir = path.join(__dirname, 'logs');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `preflight-${path.basename(file, '.json')}.json`);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\nFull inventory: ${outPath}`);
}

main();
