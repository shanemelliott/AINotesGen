'use strict';
// Smoke test: can the VA Azure OpenAI endpoint write a synthetic progress note
// from one encounter in the patient VPR JSON? See openspec/changes/ai-note-smoke-test.

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const dotenv = require('dotenv');

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
  const items = JSON.parse(fs.readFileSync(file, 'utf8'))?.payload?.data?.items;
  if (!Array.isArray(items)) fail(`${dfn}.json has no payload.data.items array`);

  const byDomain = {};
  const byUid = new Map();
  for (const it of items) {
    const domain = String(it.uid || '').split(':')[2] || 'unknown';
    (byDomain[domain] ||= []).push(it);
    byUid.set(it.uid, it);
  }
  return { byDomain, byUid };
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

function buildContext({ byDomain, byUid }, date8) {
  const orders = byDomain.order || [];
  const todays = orders.filter((o) => day(o.start) === date8);
  if (todays.length === 0) fail(`No orders found for ${fmtDay(date8)}; nothing to build an encounter from.`);

  const patient = (byDomain.patient || [])[0] || {};
  const linkedUids = new Set(todays.flatMap((o) => (o.results || []).map((r) => r.uid)));
  const linkedLabs = [...linkedUids].map((u) => byUid.get(u)).filter((x) => x && x.uid.includes(':lab:'));

  const from8 = toD8(new Date(toDate(date8).getTime() - HISTORY_DAYS * 86400000));
  const inWindow = (d8) => d8 >= from8 && d8 < date8;
  const historyUids = new Set(
    orders.filter((o) => inWindow(day(o.start))).flatMap((o) => (o.results || []).map((r) => r.uid)),
  );
  const recentLabs = (byDomain.lab || [])
    .filter((l) => !linkedUids.has(l.uid) && (historyUids.has(l.uid) || inWindow(day(l.observed))))
    .sort((a, b) => day(a.observed).localeCompare(day(b.observed)));

  const meds = (byDomain.med || []).filter((m) => {
    const start = day(m.overallStart);
    const stop = day(m.overallStop || m.stopped);
    return start && start <= date8 && (!stop || stop >= date8);
  });

  const seen = new Set();
  const problems = (byDomain.problem || [])
    .filter((p) => day(p.onset) && day(p.onset) <= date8)
    .sort((a, b) => day(b.onset).localeCompare(day(a.onset)))
    .filter((p) => !seen.has(p.problemText) && seen.add(p.problemText));

  const vitalsUpTo = (byDomain.vital || []).filter((v) => day(v.observed) && day(v.observed) <= date8);
  const lastVitalDay = vitalsUpTo.map((v) => day(v.observed)).sort().pop();
  const vitals = vitalsUpTo.filter((v) => day(v.observed) === lastVitalDay);

  return {
    encounter: {
      date: fmtDay(date8),
      clinic: todays[0].locationName || 'UNKNOWN CLINIC',
      setting: 'VA outpatient clinic',
    },
    patient: {
      age: patient.dateOfBirth ? ageOn(day(patient.dateOfBirth), date8) : null,
      gender: patient.genderName || null,
      veteran: patient.veteran ? true : undefined,
    },
    ordersToday: todays.map((o) => ({ name: o.name.trim(), service: o.service, status: o.statusName })),
    labsToday: linkedLabs.map(shapeLab),
    activeMeds: meds.map((m) => ({
      name: m.name.trim(),
      strength: m.products?.[0]?.strength,
      sig: m.sig,
      started: fmtDay(day(m.overallStart)),
    })),
    problems: problems.map((p) => ({ text: p.problemText, onset: fmtDay(day(p.onset)), status: p.statusName })),
    latestVitals: vitals.map((v) => ({ type: v.typeName, result: v.result, units: v.units, observed: fmtDay(day(v.observed)) })),
    recentLabHistory: recentLabs.map(shapeLab),
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
  const skeleton = [
    MARKER,
    `VISIT DATE: ${ctx.encounter.date}   CLINIC: ${ctx.encounter.clinic}   TYPE: <visit type>`,
    'CHIEF COMPLAINT:',
    'SUBJECTIVE:',
    'OBJECTIVE:',
    'ASSESSMENT:',
    '1. ...',
    'PLAN:',
    '1. ...',
  ].join('\n');

  return [
    'You are generating SYNTHETIC clinical documentation for a VA software test system.',
    'The patient is fictional (generated by Synthea). The note will never be used for',
    'real patient care. Write a realistic outpatient progress note for the encounter',
    'described in the JSON the user provides.',
    '',
    'Rules:',
    `- The first line MUST be exactly: ${MARKER}`,
    `- Use these section headings, each on its own line, in this order: ${HEADINGS.join(' ')}`,
    '- The VISIT DATE line includes the encounter date (MM/DD/YYYY) and the clinic.',
    '- OBJECTIVE lists the vitals and pertinent labs with values and abnormal flags.',
    '- ASSESSMENT is a numbered problem list. PLAN addresses each numbered problem',
    '  (medications started or changed, labs ordered, follow-up).',
    '- Base the note only on the provided data. Do NOT invent lab values, vitals, or',
    '  medications that are not in the JSON. You may write plausible subjective',
    '  history consistent with the data.',
    '- Use the orders placed today to infer the reason for the visit.',
    `- Plain text only. No markdown (no #, no **, no code fences). Max ${MAX_LINE} characters per line.`,
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

  const date8 = args.date.replace(/-/g, '');
  const data = loadPatient(args.dfn);
  const ctx = buildContext(data, date8);
  const payloadText = JSON.stringify(ctx);
  assertNoIdentifiers(payloadText, data);

  const candidates = args.model ? [{ model: args.model, apiVersion: args.apiVersion }] : DEFAULT_CANDIDATES;

  if (args.dumpContext) {
    console.log('Domain counts:', Object.fromEntries(Object.entries(data.byDomain).map(([k, v]) => [k, v.length])));
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
      console.log(`\n${r.content}\n`);
      console.log(`saved: ${path.relative(__dirname, file)}`);
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
