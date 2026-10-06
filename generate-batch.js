// Generate the veteran test batch with Synthea, then trim every bundle to start at age 18.
// Usage: node generate-batch.js [--batch synthea/batches/batch-1.json] [--only runId,runId] [--skip-trim]
// Reads the run table from the batch file, writes raw bundles to synthea/output/<batch>/raw/<run>/,
// trimmed bundles to synthea/output/<batch>/trimmed/, and records java version, jar hash and the exact
// command lines back into the batch file under "generated" so the batch can be regenerated.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const val = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const batchFile = val('--batch', path.join('synthea', 'batches', 'batch-1.json'));
const only = val('--only', '') ? val('--only', '').split(',') : null;
const batch = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
const jar = path.join('synthea', 'bin', 'synthea-with-dependencies.jar');
const outRoot = path.join('synthea', 'output', batch.name);

const sha = crypto.createHash('sha256').update(fs.readFileSync(jar)).digest('hex').toUpperCase();
const javaVersion = (spawnSync('java', ['-version'], { encoding: 'utf8' }).stderr || '').split('\n')[0];
const commands = {};

for (const run of batch.runs) {
  if (only && !only.includes(run.id)) continue;
  const rawDir = path.join(outRoot, 'raw', run.id);
  fs.rmSync(rawDir, { recursive: true, force: true });
  const a = [
    '-jar', path.join('bin', 'synthea-with-dependencies.jar'),
    '-c', 'veteran.properties',
    `--exporter.baseDirectory=./${path.relative('synthea', rawDir).replace(/\\/g, '/')}/`,
    '-s', String(run.seed), '-r', batch.referenceDate, '-p', String(run.population),
    '-g', run.gender, '-a', run.age
  ];
  if (run.modulesDir) a.push('-d', run.modulesDir);
  if (run.keep) a.push('-k', run.keep);
  a.push('Massachusetts');
  commands[run.id] = `java ${a.join(' ')}`;
  process.stdout.write(`${run.id.padEnd(18)} ${run.gender} ${run.age.padEnd(6)} x${run.population} ... `);
  const r = spawnSync('java', a, { cwd: 'synthea', encoding: 'utf8', maxBuffer: 1 << 28 });
  const files = fs.existsSync(path.join(rawDir, 'fhir')) ? fs.readdirSync(path.join(rawDir, 'fhir')) : [];
  console.log(r.status === 0 ? `${files.length} file(s)` : `FAILED (exit ${r.status})`);
  if (r.status !== 0) console.log((r.stdout || '').split('\n').slice(-8).join('\n'), r.stderr);
}

batch.generated = { at: new Date().toISOString(), java: javaVersion, jarSha256: sha, commands: { ...(batch.generated && batch.generated.commands), ...commands } };
fs.writeFileSync(batchFile, JSON.stringify(batch, null, 2) + '\n');

if (!args.includes('--skip-trim')) {
  const trimmed = path.join(outRoot, 'trimmed');
  fs.rmSync(trimmed, { recursive: true, force: true });
  for (const run of batch.runs) {
    const dir = path.join(outRoot, 'raw', run.id, 'fhir');
    if (!fs.existsSync(dir)) continue;
    const t = spawnSync('node', ['trim-synthea.js', dir, '--out', trimmed], { encoding: 'utf8' });
    process.stdout.write(t.stdout);
  }
}
