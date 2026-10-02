// Load a Synthea FHIR bundle into VistA via RPC CDSP UTIL LOAD FHIR (DEV ONLY).
// Usage: node load-synthea.js <bundle.json> [--dry-run] [--chunk-size N] [--skip-types A,B | --keep-all] [--per-type N]
const fs = require('fs');
const path = require('path');
require('./src/config'); // loads .env
const { chunkBundleJson, loadBundle, DEFAULT_CHUNK_SIZE } = require('./src/fhirBundleTransport');

// No SYN loader exists for these; they only add size (billing, base64 C-CDA notes).
const DEFAULT_SKIP_TYPES = ['Claim', 'ExplanationOfBenefit', 'DocumentReference'];
const MAX_POST_BYTES = 10 * 1024 * 1024;

function valueAfter(args, flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const sizeIdx = args.indexOf('--chunk-size');
  const skipIdx = args.indexOf('--skip-types');
  const perTypeIdx = args.indexOf('--per-type');
  const flagValueIdx = new Set([sizeIdx, skipIdx, perTypeIdx].filter((i) => i >= 0).map((i) => i + 1));
  const file = args.find((a, i) => !a.startsWith('--') && !flagValueIdx.has(i));
  const chunkSize = sizeIdx >= 0 ? Number(valueAfter(args, '--chunk-size')) : DEFAULT_CHUNK_SIZE;
  let skipTypes = DEFAULT_SKIP_TYPES;
  if (args.includes('--keep-all')) skipTypes = [];
  else if (skipIdx >= 0) skipTypes = (valueAfter(args, '--skip-types') || '').split(',').filter(Boolean);

  if (!file || !Number.isInteger(chunkSize) || chunkSize < 1) {
    console.error('Usage: node load-synthea.js <bundle.json> [--dry-run] [--chunk-size N] [--skip-types A,B | --keep-all] [--per-type N]');
    process.exit(1);
  }

  const bundle = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const original = bundle.entry || [];

  const stats = {};
  for (const e of original) {
    const t = (e.resource && e.resource.resourceType) || 'unknown';
    stats[t] = stats[t] || { count: 0, chars: 0 };
    stats[t].count += 1;
    stats[t].chars += JSON.stringify(e).length;
  }
  console.log('Resource type'.padEnd(26) + 'count'.padStart(7) + 'chars'.padStart(12) + '  action');
  for (const [t, s] of Object.entries(stats).sort((a, b) => b[1].chars - a[1].chars)) {
    console.log(t.padEnd(26) + String(s.count).padStart(7) + String(s.chars).padStart(12) + (skipTypes.includes(t) ? '  skip' : '  send'));
  }

  bundle.entry = original.filter((e) => !skipTypes.includes(e.resource && e.resource.resourceType));
  if (perTypeIdx >= 0) {
    const perType = Number(valueAfter(args, '--per-type'));
    if (!Number.isInteger(perType) || perType < 1) {
      console.error('--per-type needs a positive integer');
      process.exit(1);
    }
    const seen = {};
    bundle.entry = bundle.entry.filter((e) => {
      const t = (e.resource && e.resource.resourceType) || 'unknown';
      seen[t] = (seen[t] || 0) + 1;
      return seen[t] <= perType;
    });
  }
  const text = JSON.stringify(bundle);
  const chunkCount = Object.keys(chunkBundleJson(text, chunkSize)).length;

  console.log(`\n${path.basename(file)}: ${original.length} -> ${bundle.entry.length} entries, ${text.length} chars, ${chunkCount} chunks of ${chunkSize}`);
  if (Buffer.byteLength(text) > MAX_POST_BYTES) {
    console.warn('WARNING: payload exceeds the 10MB vista-api-x post limit.');
  }

  if (dryRun) {
    console.log('Dry run: nothing sent.');
    return;
  }

  const result = await loadBundle(text, { chunkSize });
  const outDir = path.join(__dirname, 'logs');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `load-${path.basename(file, '.json')}.result.json`);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`Load complete. Summary written to ${outPath}`);
}

main().catch((err) => {
  console.error(`FAIL: ${err.message}`);
  if (err.raw) console.error(`Raw result: ${err.raw}`);
  if (err.details) console.error(JSON.stringify(err.details));
  process.exit(1);
});
