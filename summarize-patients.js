// Writes docs/loaded-patients.md (gitignored): one entry per Synthea patient loaded into dev VistA,
// with counts of meds, labs, notes and visits and a one-line clinical summary.
// Usage: node summarize-patients.js [<dfn> ...]   (default: every DFN with a logs/load-*.result.json or note)
const fs = require('fs');
const path = require('path');
require('./src/config'); // loads .env
const { callRpc } = require('./src/vistaApiClient');
const { categorizeProblem, day, isoDate, ageOn } = require('./src/encounters');
const { parseRpcResult } = require('./src/fhirBundleTransport');
const vetSummary = require('./src/vetSummary');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'docs', 'loaded-patients.md');
const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'problem-rules.json'), 'utf8'));
const readJson = (f, fallback) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fallback);
// Findings that are clinical by the problem rules but add nothing to a one-line history.
const NOT_HISTORY = /stress|dental|tooth|caries|gingiv|filling|military service|unemploy|body mass index|medication review|prediabetes|misuses drugs|abnormal findings/i;

function findSyntheaFile(p) {
  const prefix = `${p.givenNames}_${p.familyName}`.toLowerCase();
  const dirs = [path.join(ROOT, 'SynthiaFiles')];
  const synOut = path.join(ROOT, 'synthea', 'output');
  if (fs.existsSync(synOut)) for (const b of fs.readdirSync(synOut)) dirs.push(path.join(synOut, b, 'trimmed'));
  for (const d of dirs.filter((x) => fs.existsSync(x))) {
    const f = fs.readdirSync(d).find((x) => x.toLowerCase().startsWith(prefix));
    if (f) return f.replace(/\.json$/, '');
  }
  return '';
}

function defaultDfns() {
  const dfns = new Map();
  for (const f of fs.readdirSync(path.join(ROOT, 'logs')).filter((x) => /^load-.*\.result\.json$/.test(x))) {
    const r = readJson(path.join(ROOT, 'logs', f), {});
    if (r.dfn) dfns.set(String(r.dfn), f.replace(/^load-|\.result\.json$/g, ''));
  }
  for (const n of readJson(path.join(ROOT, 'src', 'notes.json'), [])) if (!dfns.has(String(n.dfn))) dfns.set(String(n.dfn), '');
  return dfns;
}

async function vpr(dfn) {
  const body = await callRpc('VPR GET PATIENT DATA JSON', [{ namedArray: { patientId: dfn } }], 'CDSP RPC CONTEXT',
    { jsonResult: true, timeout: 120000, raw: true });
  if (body?.payload?.error) throw new Error(body.payload.error.message);
  return body?.payload?.data?.items || [];
}

// Readable veteran service block (CDSP UTIL VET GET), without its name line.
async function vetBlock(dfn) {
  const result = parseRpcResult(await callRpc('CDSP UTIL VET GET', [{ string: dfn }, { string: '0' }], 'CDSP RPC UTILS', { timeout: 60000 }));
  if (result.ERROR) return `Veteran service data not available: ${result.ERROR}`;
  return vetSummary.summarize(result).split('\n').slice(2).join('\n');
}

function summarize(dfn, items, notes, appts, sourceFile, vet) {
  const by = {};
  for (const it of items) (by[String(it.uid || '').split(':')[2]] ||= []).push(it);
  const p = (by.patient || [])[0] || {};
  const dob8 = day(p.dateOfBirth);
  const today8 = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const age = dob8 ? ageOn(dob8, today8) : '?';
  const sex = /^f/i.test(p.genderName || '') ? 'female' : 'male';
  const visits = (by.visit || []).map((v) => day(v.dateTime)).filter(Boolean).sort();

  // Chronic clinical problems, newest onset first, without social, administrative or acute entries.
  const seen = new Set();
  const conditions = (by.problem || [])
    .filter((x) => String(x.statusName || '').toUpperCase() !== 'INACTIVE')
    .filter((x) => categorizeProblem(x.problemText, rules) === 'clinical')
    .sort((a, b) => day(b.onset).localeCompare(day(a.onset)))
    .map((x) => String(x.problemText).replace(/\s*\((SCT|ICD)[^)]*\)/g, '').trim())
    .filter((t) => !NOT_HISTORY.test(t))
    .filter((t) => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
  const shown = conditions.slice(0, 8);
  const more = conditions.length > shown.length ? ` and ${conditions.length - shown.length} more` : '';

  return [
    `## ${p.fullName || '?'} (DFN ${dfn})`,
    '',
    `${age}-year-old ${sex} veteran (veteran flag ${p.veteran?.isVet ? 'set' : 'not set'}) with a history of ${shown.join(', ') || 'no chronic conditions on file'}${more}.`,
    '',
    `- Search in CPRS: ${String(p.familyName || p.fullName || '').split(',')[0]}`,
    `- Born ${isoDate(dob8)}; Synthea file: ${sourceFile || findSyntheaFile(p) || 'n/a'}`,
    `- Meds: ${(by.med || []).length}; labs: ${(by.lab || []).length}; vitals: ${(by.vital || []).length}; problems: ${(by.problem || []).length}`,
    `- Visits: ${visits.length} (${isoDate(visits[0])} to ${isoDate(visits[visits.length - 1])}); most recent visit ${isoDate(visits[visits.length - 1])}`,
    `- Appointments created: ${appts}; notes signed: ${notes.filter((n) => n.signed).length} of ${notes.length}`,
    '',
    'Veteran service data:',
    '',
    '```text',
    vet,
    '```',
    '',
  ].join('\n');
}

async function main() {
  const all = defaultDfns();
  const dfns = process.argv.slice(2).length ? process.argv.slice(2) : [...all.keys()].sort();
  const notes = readJson(path.join(ROOT, 'src', 'notes.json'), []);
  const appts = readJson(path.join(ROOT, 'src', 'appointments.json'), []);

  const sections = [];
  for (const dfn of dfns) {
    process.stdout.write(`${dfn} ... `);
    try {
      const items = await vpr(dfn);
      const n = notes.filter((r) => String(r.dfn) === dfn);
      const a = appts.filter((r) => String(r.dfn) === dfn).length;
      sections.push(summarize(dfn, items, n, a, all.get(dfn), await vetBlock(dfn)));
      console.log('ok');
    } catch (err) {
      console.log(`FAIL ${err.message}`);
    }
  }

  const header = [
    '# Loaded patients (dev VistA, station 500)',
    '',
    `Synthea patients loaded with the SYN loader. Generated ${new Date().toISOString().slice(0, 10)} by`,
    '`node summarize-patients.js` from live VPR data, `src/notes.json` and `src/appointments.json`.',
    'This file holds synthetic patient details and is gitignored.',
    '',
  ].join('\n');
  fs.writeFileSync(OUT, `${header}\n${sections.join('\n')}`);
  console.log(`Wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
