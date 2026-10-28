#!/usr/bin/env node
// One entry point for the test patient pipeline.
// Usage: node patient.js list
//        node patient.js [--patient <dfn>] <step> [step arguments]
//        node patient.js status --dfn <dfn>
// A step runs exactly as its own script does (arguments, output and exit code are passed through).
// After a step exits, the patient's progress is recorded in plans/dfn<dfn>-status.json (git-ignored).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const SCRIPTS = path.join(ROOT, 'scripts');
const steps = JSON.parse(fs.readFileSync(path.join(SCRIPTS, 'steps.json'), 'utf8'));
const byName = Object.fromEntries(steps.map((s) => [s.name, s]));
const argv = process.argv.slice(2);

const statusFile = (dfn) => path.join(ROOT, 'plans', `dfn${dfn}-status.json`);
const readStatus = (dfn) => { try { return JSON.parse(fs.readFileSync(statusFile(dfn), 'utf8')); } catch (e) { return { dfn: String(dfn), steps: {} }; } };
const scriptPath = (s) => path.join(SCRIPTS, s.group, `${s.name}.js`);
const pipelineSteps = () => steps.filter((s) => s.pipeline).sort((a, b) => a.pipeline - b.pipeline);

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

function unregistered() {
  const found = [];
  for (const g of fs.readdirSync(SCRIPTS, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    for (const f of fs.readdirSync(path.join(SCRIPTS, g.name)).filter((x) => x.endsWith('.js'))) {
      const name = f.replace(/\.js$/, '');
      if (!byName[name] || byName[name].group !== g.name) found.push(`${g.name}/${name}`);
    }
  }
  return found;
}

function list() {
  const line = (s) => `  ${s.name.padEnd(30)} ${s.group.padEnd(13)} ${s.description}`;
  console.log('Pipeline steps, in order:');
  for (const s of pipelineSteps()) console.log(line(s));
  console.log('\nOther steps:');
  for (const s of steps.filter((x) => !x.pipeline).sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name))) console.log(line(s));
  const missing = steps.filter((s) => !fs.existsSync(scriptPath(s))).map((s) => s.name);
  const extra = unregistered();
  if (extra.length) console.log(`\nUnregistered scripts (add them to scripts/steps.json): ${extra.join(', ')}`);
  if (missing.length) console.log(`\nRegistered but missing on disk: ${missing.join(', ')}`);
}

function isPreview(step, args) {
  if (args.includes('--dry-run')) return true;
  const p = step.preview;
  if (!p) return false;
  if (p.if && p.if.some((f) => args.includes(f))) return true;
  if (p.unless && !p.unless.some((f) => args.includes(f))) return true;
  return false;
}

function patientOf(step, args, entryPatient) {
  if (entryPatient) return entryPatient;
  const i = args.indexOf('--dfn');
  if (i >= 0 && /^\d+$/.test(args[i + 1] || '')) return args[i + 1];
  if (step.dfnPositional) { const p = args.find((a) => /^\d+$/.test(a)); if (p) return p; }
  return null;
}

function record(dfn, step, preview, code) {
  const st = readStatus(dfn);
  const e = st.steps[step.name] || {};
  const now = new Date().toISOString();
  if (code !== 0) { e.lastFailure = now; e.exitCode = code; } else if (preview) { e.lastPreview = now; } else { e.done = true; e.lastRun = now; e.exitCode = 0; }
  st.steps[step.name] = e;
  fs.mkdirSync(path.join(ROOT, 'plans'), { recursive: true });
  fs.writeFileSync(statusFile(dfn), JSON.stringify(st, null, 2) + '\n');
}

function status(dfn) {
  const st = readStatus(dfn);
  let next = null;
  console.log(`Patient ${dfn}`);
  for (const s of pipelineSteps()) {
    if (s.perPatient === false) { console.log(`  [-] ${s.name.padEnd(24)} runs before a DFN exists (not tracked)`); continue; }
    const e = st.steps[s.name] || {};
    let mark = '[ ]'; let note = 'not run';
    if (e.done) { mark = '[x]'; note = `done ${e.lastRun}`; } else if (e.lastPreview) { mark = '[~]'; note = `preview only ${e.lastPreview}`; } else if (e.lastFailure) { note = `failed ${e.lastFailure} (exit ${e.exitCode})`; }
    if (!e.done && !next) next = s.name;
    console.log(`  ${mark} ${s.name.padEnd(24)} ${note}`);
  }
  console.log(next ? `Next: ${next}` : 'All pipeline steps are done.');
}

function run(step, args, entryPatient) {
  const res = spawnSync(process.execPath, [scriptPath(step), ...args], { stdio: 'inherit' });
  const code = res.status === null ? 1 : res.status;
  const dfn = patientOf(step, args, entryPatient);
  if (dfn) record(dfn, step, isPreview(step, args), code);
  process.exit(code);
}

function main() {
  let args = argv.slice();
  let entryPatient = null;
  if (args[0] === '--patient') {
    entryPatient = args[1];
    if (!/^\d+$/.test(entryPatient || '')) { console.error('--patient needs a DFN'); process.exit(2); }
    args = args.slice(2);
  }
  const cmd = args[0];
  if (!cmd || cmd === 'help' || cmd === '--help') {
    console.log('Usage: node patient.js list | status --dfn <dfn> | [--patient <dfn>] <step> [args]\nRun `node patient.js list` to see the steps.');
    process.exit(cmd ? 0 : 2);
  }
  if (cmd === 'list') return list();
  if (cmd === 'status') {
    const i = args.indexOf('--dfn');
    const dfn = i >= 0 ? args[i + 1] : entryPatient;
    if (!/^\d+$/.test(dfn || '')) { console.error('status needs --dfn <dfn>'); process.exit(2); }
    return status(dfn);
  }
  const step = byName[cmd];
  if (!step) {
    const near = steps.map((s) => ({ n: s.name, d: s.name.includes(cmd) || cmd.includes(s.name) ? 0 : distance(cmd, s.name) })).sort((a, b) => a.d - b.d).slice(0, 5).map((x) => x.n);
    console.error(`Unknown step "${cmd}". Closest: ${near.join(', ')}`);
    process.exit(2);
  }
  run(step, args.slice(1), entryPatient);
}

main();
