'use strict';
// Smoke test: can the VA Azure OpenAI endpoint write a synthetic progress note
// from one encounter in the patient VPR JSON? See openspec/changes/ai-note-smoke-test.

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const dotenv = require('dotenv');
const { indexVpr, extractEncounters, filterProblemsForEncounter } = require('./src/encounters.js');

const ENDPOINT_BASE = 'https://spd-prod-openai-va-apim.azure-api.us/api/openai/deployments';
const DEFAULT_CANDIDATES = [
  { model: 'o3-mini', apiVersion: '2025-04-28' },
  { model: 'gpt-4o', apiVersion: '2024-02-15-preview' },
];
const MARKER = '*** SYNTHETIC TEST NOTE - FICTIONAL PATIENT - NOT FOR CLINICAL USE ***';
const HEADINGS = ['VISIT DATE:', 'CHIEF COMPLAINT:', 'SUBJECTIVE:', 'OBJECTIVE:', 'ASSESSMENT:', 'PLAN:'];
const MAX_LINE = 80;
const HISTORY_DAYS = 90;
const OUTPUT_DIR = path.join(__dirname, 'output');

const USAGE = `Usage: node test-ai.js [options]

  --date YYYY-MM-DD      Encounter date (default 2025-10-21)
  --dfn <dfn>            Patient DFN; reads <dfn>.json (default 100965)
  --model <name>         Try only this deployment (requires --api-version)
  --api-version <ver>    API version for --model
  --dump-context         Print domain counts and encounter context, then exit
  --dump-prompt          Print the messages for each candidate, then exit
  --help                 Show this help

Env: AZURE_OPENAI_API_KEY is read from ../VAOSAI/.env
     (override the file with DOTENV_CONFIG_PATH).`;

function parseArgs(argv) {
  const args = { date: '2025-10-21', dfn: '100965' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--help': case '-h': args.help = true; break;
      case '--dump-context': args.dumpContext = true; break;
      case '--dump-prompt': args.dumpPrompt = true; break;
      case '--date': args.date = argv[++i]; break;
      case '--dfn': args.dfn = argv[++i]; break;
      case '--model': args.model = argv[++i]; break;
      case '--api-version': args.apiVersion = argv[++i]; break;
      default: fail(`Unknown argument: ${a}\n\n${USAGE}`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date || '')) fail('--date must be YYYY-MM-DD');
  if (!/^\d+$/.test(args.dfn || '')) fail('--dfn must be numeric');
  if (args.model && !args.apiVersion) fail('--model requires --api-version');
  return args;
}

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

// ---------- dates (VPR dates are YYYYMMDD[HHmm[ss]] numbers) ----------

const day = (v) => (v === undefined || v === null ? '' : String(v).slice(0, 8));
const fmtDay = (d8) => (d8 ? `${d8.slice(4, 6)}/${d8.slice(6, 8)}/${d8.slice(0, 4)}` : '');
const toDate = (d8) => new Date(Date.UTC(+d8.slice(0, 4), +d8.slice(4, 6) - 1, +d8.slice(6, 8)));
const toD8 = (dt) => dt.toISOString().slice(0, 10).replace(/-/g, '');

function ageOn(dob8, d8) {
  let age = +d8.slice(0, 4) - +dob8.slice(0, 4);
  if (d8.slice(4) < dob8.slice(4)) age--;
  return age;
}

// ---------- patient data ----------

function loadPatient(dfn) {
  const file = path.join(__dirname, `${dfn}.json`);
  if (!fs.existsSync(file)) fail(`Patient file not found: ${dfn}.json`);
  const vpr = JSON.parse(fs.readFileSync(file, 'utf8'));
  const items = vpr?.payload?.data?.items;
  if (!Array.isArray(items)) fail(`${dfn}.json has no payload.data.items array`);
  return items;
}

function getEncounter(items, dateStr) {
  const date8 = dateStr.replace(/-/g, '');
  const problemRules = JSON.parse(fs.readFileSync(path.join(__dirname, 'src', 'problem-rules.json'), 'utf8'));
  const indexed = indexVpr(items);
  const encounters = extractEncounters(indexed, { rules: problemRules });
  const enc = encounters.find((e) => e.date === `${date8.slice(0, 4)}-${date8.slice(4, 6)}-${date8.slice(6, 8)}`);
  if (!enc) fail(`No encounter found for ${dateStr}; no orders on that date.`);
  return enc;
}

function labFlag(lab) {
  if (lab.interpretationName) return lab.interpretationName;
  const v = parseFloat(lab.result);
  if (Number.isNaN(v)) return '';
  if (lab.low !== undefined && v < parseFloat(lab.low)) return 'L';
  if (lab.high !== undefined && v > parseFloat(lab.high)) return 'H';
  return '';
}

const shapeLab = (l) => ({
  name: l.typeName || l.displayName,
  result: l.result,
  units: l.units,
  low: l.low,
  high: l.high,
  flag: labFlag(l),
  observed: fmtDay(day(l.observed)),
});

function buildContext(enc, problemRules) {
  // Build prompt context from encounter extracted by extractEncounters
  const filtered = filterProblemsForEncounter(enc, problemRules);
  const relevantProblems = filtered.map((p) => p.text);
  
  return {
    encounter: {
      date: fmtDay(enc.date.replace(/-/g, '')),
      clinic: enc.clinic,
      visitType: enc.suggestedVisitType,
      setting: 'VA outpatient clinic',
    },
    patient: {
      age: enc.patient.age,
      gender: enc.patient.gender,
      veteran: true,
    },
    ordersToday: enc.ordersToday,
    labsToday: enc.labsToday.map(shapeLab),
    newMeds: enc.newMeds,
    activeMeds: enc.activeMeds.map((m) => ({ ...m, started: fmtDay(m.started.replace(/-/g, '')) })),
    latestVitals: enc.latestVitals,
    recentLabHistory: enc.recentLabHistory.map(shapeLab),
    visitDiagnoses: enc.visitDiagnoses,
    carePlanActivities: enc.carePlanActivities,
    relevantProblems,
    socialHistory: enc.socialHistory,
  };
}

// Fails hard if any direct identifier from the patient record made it into the payload.
function assertNoIdentifiers(payloadText, { byDomain }) {
  const p = (byDomain.patient || [])[0] || {};
  const values = [p.ssn, p.icn, p.fullName, p.familyName, p.briefId];
  for (const a of p.addresses || []) values.push(a.streetLine1, a.streetLine2, a.zip);
  for (const t of p.telecoms || []) values.push(t.telecom, t.value);
  const leaked = values.filter((v) => typeof v === 'string' && v.length >= 4 && payloadText.includes(v));
  if (leaked.length) fail(`Refusing to continue: patient identifiers found in LLM payload (${leaked.length} value(s)).`);
}

// ---------- prompt ----------

function buildInstructions(ctx) {
  const visitType = ctx.encounter.visitType === 'New patient' ? 'New patient visit' : 'Follow-up visit';
  const skeleton = [
    MARKER,
    `VISIT DATE: ${ctx.encounter.date}   CLINIC: ${ctx.encounter.clinic}   TYPE: ${visitType}`,
    'CHIEF COMPLAINT:',
    'SUBJECTIVE:',
    'OBJECTIVE:',
    'ASSESSMENT:',
    '1. ...',
    'PLAN:',
    '1. ...',
  ].join('\n');

  const diagnosisSection = ctx.visitDiagnoses.length
    ? `Primary diagnosis: ${ctx.visitDiagnoses.map((d) => `${d.name} (${d.icd})`).join('; ')}`
    : 'No primary diagnosis available';

  const careplanSection = ctx.carePlanActivities.length
    ? `Care plan activities to address in the PLAN section:\n${ctx.carePlanActivities.map((a) => `  - ${a}`).join('\n')}`
    : 'No care plan activities';

  const problemsSection = `Focus your ASSESSMENT on these problems only:\n${ctx.relevantProblems.map((p) => `  - ${p}`).join('\n')}`;

  return [
    'You are generating SYNTHETIC clinical documentation for a VA software test system.',
    'The patient is fictional (generated by Synthea). The note will never be used for',
    'real patient care. Write a realistic outpatient progress note for the encounter',
    'described in the JSON the user provides.',
    '',
    'Rules:',
    `- The first line MUST be exactly: ${MARKER}`,
    `- Use these section headings, each on its own line, in this order: ${HEADINGS.join(' ')}`,
    '- The VISIT DATE line includes the encounter date (MM/DD/YYYY), clinic, and visit type (New patient or Follow-up).',
    `- ${diagnosisSection}`,
    '- SUBJECTIVE: Include relevant history, symptoms, and medications. Include social history as context.',
    '- OBJECTIVE lists the vitals and pertinent labs with values and abnormal flags.',
    `- ASSESSMENT: Base ONLY on the provided problem list below. Do NOT include problems not in the list.`,
    `  Each assessment item should be clinically grounded in today's orders, labs, or meds.`,
    '- PLAN addresses each numbered assessment problem. Link each medication to its clinical indication.',
    `  (e.g., "furosemide for diuresis in heart failure")`,
    `- Include care plan activities in the PLAN if relevant to the primary diagnosis.`,
    '- Base the note only on the provided data. Do NOT invent lab values, vitals, or medications.',
    '- Use the orders placed today to infer the reason for the visit.',
    `- Plain text only. No markdown (no #, no **, no code fences). Max ${MAX_LINE} characters per line.`,
    '',
    'Clinical context:',
    diagnosisSection,
    careplanSection,
    problemsSection,
    '',
    'Required layout:',
    skeleton,
  ].join('\n');
}

const isOSeries = (model) => /^o\d/i.test(model);

function buildBody(model, ctx) {
  const instructions = buildInstructions(ctx);
  const user = `Encounter data (JSON):\n${JSON.stringify(ctx)}`;
  if (isOSeries(model)) {
    return {
      messages: [{ role: 'developer', content: instructions }, { role: 'user', content: user }],
      max_completion_tokens: 4000,
    };
  }
  return {
    messages: [{ role: 'system', content: instructions }, { role: 'user', content: user }],
    max_tokens: 1500,
    temperature: 0.4,
  };
}

// ---------- LLM call ----------

const REFUSAL = /^(i['’]?m sorry|sorry,|i can(?:no|['’])t|i am (?:unable|not able)|i['’]?m (?:unable|not able))/i;

function filterCategories(results) {
  if (!results || typeof results !== 'object') return '';
  return Object.entries(results).filter(([, v]) => v && v.filtered).map(([k, v]) => `${k}${v.severity ? `(${v.severity})` : ''}`).join(',');
}

async function callCandidate({ model, apiVersion }, ctx, apiKey) {
  const url = `${ENDPOINT_BASE}/${encodeURIComponent(model)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
  const started = Date.now();
  let res;
  try {
    res = await axios.post(url, buildBody(model, ctx), {
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      timeout: 180000,
      validateStatus: () => true,
    });
  } catch (err) {
    // Only code/message: the axios error object carries request headers.
    return { outcome: 'network-error', detail: `${err.code || ''} ${err.message}`.trim(), latencyMs: Date.now() - started };
  }

  const latencyMs = Date.now() - started;
  const data = res.data || {};
  const result = { status: res.status, latencyMs, usage: data.usage };

  if (res.status !== 200) {
    const err = data.error || {};
    if (err.code === 'content_filter') {
      return { ...result, outcome: 'content-filtered', detail: filterCategories(err.innererror?.content_filter_result) || err.message };
    }
    return { ...result, outcome: `http-${res.status}`, detail: err.message || data.message || JSON.stringify(data).slice(0, 300) };
  }

  const choice = data.choices?.[0] || {};
  const content = (choice.message?.content || '').trim();
  result.finishReason = choice.finish_reason;
  if (choice.finish_reason === 'content_filter') {
    return { ...result, outcome: 'content-filtered', detail: filterCategories(choice.content_filter_results), content };
  }
  if (!content) return { ...result, outcome: 'empty', detail: `finish_reason=${choice.finish_reason}` };
  if (REFUSAL.test(content.slice(0, 200))) return { ...result, outcome: 'refused', detail: content.slice(0, 120), content };
  return { ...result, outcome: 'ok', content };
}

// ---------- format check ----------

function stripMarkerLine(note) {
  const lines = note.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] === MARKER) {
    return lines.slice(1).join('\n');
  }
  return note;
}

function validateNote(note) {
  const lines = note.replace(/\r\n/g, '\n').split('\n');
  const problems = [];

  // Check headings
  let lastIdx = -1;
  for (const h of HEADINGS) {
    const idx = lines.findIndex((l) => l.trimStart().startsWith(h));
    if (idx === -1) problems.push(`missing ${h}`);
    else if (idx < lastIdx) problems.push(`misordered ${h}`);
    else lastIdx = idx;
  }

  // Check line length
  const longLines = lines.filter((l) => l.length > MAX_LINE);
  if (longLines.length > 0) problems.push(`${longLines.length} line(s) exceed ${MAX_LINE} chars`);

  // Check for markdown
  const markdown = /(^|\n)\s*#{1,6}\s|\*\*[^*\n]+\*\*|```/.test(note);
  if (markdown) problems.push('contains markdown formatting');

  // Check for identifiers (SSN, ICN, name pattern)
  const ssnPattern = /\d{3}-\d{2}-\d{4}/;
  if (ssnPattern.test(note)) problems.push('contains potential SSN');
  
  // Check assessment focus (count numbered items)
  const assessmentMatch = note.match(/ASSESSMENT:([\s\S]*?)(PLAN:|$)/);
  if (assessmentMatch) {
    const assessmentText = assessmentMatch[1];
    const numberedItems = (assessmentText.match(/^\s*\d+\./gm) || []).length;
    if (numberedItems > 5) problems.push(`assessment has ${numberedItems} items (>5 is unfocused)`);
  }

  const pass = problems.length === 0;
  return { pass, problems };
}

function checkFormat(note) {
  const lines = note.replace(/\r\n/g, '\n').split('\n');
  const markerOk = lines[0] === MARKER;

  const problems = [];
  let lastIdx = -1;
  for (const h of HEADINGS) {
    const idx = lines.findIndex((l) => l.trimStart().startsWith(h));
    if (idx === -1) problems.push(`missing ${h}`);
    else if (idx < lastIdx) problems.push(`misordered ${h}`);
    else lastIdx = idx;
  }

  const maxLen = Math.max(...lines.map((l) => l.length));
  // The required *** marker line would otherwise read as bold.
  const body = (markerOk ? lines.slice(1) : lines).join('\n');
  const markdown = /(^|\n)\s*#{1,6}\s|\*\*[^*\n]+\*\*|```/.test(body);
  const pass = markerOk && problems.length === 0 && maxLen <= MAX_LINE && !markdown;
  return { markerOk, headingProblems: problems, maxLen, markdown, pass };
}

// ---------- main ----------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return console.log(USAGE);

  const items = loadPatient(args.dfn);
  const encounter = getEncounter(items, args.date);
  const problemRules = JSON.parse(fs.readFileSync(path.join(__dirname, 'src', 'problem-rules.json'), 'utf8'));
  const ctx = buildContext(encounter, problemRules);
  const payloadText = JSON.stringify(ctx);
  
  // Verify no identifiers in the context before sending to LLM
  const indexed = indexVpr(items);
  assertNoIdentifiers(payloadText, indexed);

  const candidates = args.model ? [{ model: args.model, apiVersion: args.apiVersion }] : DEFAULT_CANDIDATES;

  if (args.dumpContext) {
    console.log('Encounter for', args.date, ':', encounter.date);
    console.log(JSON.stringify(ctx, null, 2));
    return;
  }
  if (args.dumpPrompt) {
    for (const c of candidates) {
      const body = buildBody(c.model, ctx);
      console.log(`===== ${c.model} @ ${c.apiVersion}`);
      for (const m of body.messages) console.log(`--- [${m.role}]\n${m.content}\n`);
      const { messages, ...params } = body;
      console.log('--- params', params);
    }
    return;
  }

  const envVars = {};
  dotenv.config({
    path: process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '..', 'VAOSAI', '.env'),
    processEnv: envVars, // keep the other secrets in that file out of process.env
    quiet: true,
  });
  const apiKey = envVars.AZURE_OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY;
  if (!apiKey) fail('AZURE_OPENAI_API_KEY is not set (expected in ../VAOSAI/.env). No request was made.');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`Encounter ${ctx.encounter.date} (${ctx.encounter.clinic}), DFN ${args.dfn}; payload ${payloadText.length} chars\n`);

  const summary = [];
  for (const c of candidates) {
    console.log(`===== ${c.model} @ ${c.apiVersion}`);
    const r = await callCandidate(c, ctx, apiKey);
    const fmt = r.content ? checkFormat(r.content) : null;
    const pass = r.outcome === 'ok' && !!fmt?.pass;

    console.log(`outcome: ${r.outcome}  status: ${r.status ?? '-'}  latency: ${r.latencyMs} ms  finish: ${r.finishReason ?? '-'}`);
    if (r.usage) console.log(`usage: prompt ${r.usage.prompt_tokens}, completion ${r.usage.completion_tokens}, total ${r.usage.total_tokens}`);
    if (r.detail) console.log(`detail: ${r.detail}`);
    if (r.content) {
      const file = path.join(OUTPUT_DIR, `smoke-note-${c.model.replace(/[^\w.-]/g, '_')}.txt`);
      fs.writeFileSync(file, r.content + '\n');
      
      // Also write the marker-stripped version for VistA upload
      const cleanNote = stripMarkerLine(r.content);
      const cleanFile = path.join(OUTPUT_DIR, `smoke-note-${c.model.replace(/[^\w.-]/g, '_')}-clean.txt`);
      fs.writeFileSync(cleanFile, cleanNote + '\n');
      
      console.log(`\n${r.content}\n`);
      console.log(`saved: ${path.relative(__dirname, file)}`);
      console.log(`clean: ${path.relative(__dirname, cleanFile)}`);
    }
    if (fmt) {
      console.log(
        `format: marker ${fmt.markerOk ? 'ok' : 'MISSING'} | headings ${fmt.headingProblems.length ? fmt.headingProblems.join(', ') : 'ok'}` +
          ` | max line ${fmt.maxLen} | markdown ${fmt.markdown ? 'FOUND' : 'none'} => ${fmt.pass ? 'PASS' : 'FAIL'}`,
      );
    }
    console.log('');
    summary.push({
      model: c.model,
      apiVersion: c.apiVersion,
      outcome: r.outcome,
      status: r.status ?? '-',
      latencyMs: r.latencyMs,
      tokens: r.usage?.total_tokens ?? '-',
      format: fmt ? (fmt.pass ? 'PASS' : 'FAIL') : '-',
      result: pass ? 'PASS' : 'FAIL',
    });
  }

  console.table(summary);
  process.exitCode = summary.some((s) => s.result === 'PASS') ? 0 : 1;
}

main().catch((err) => fail(`Unexpected error: ${err.message}`));
