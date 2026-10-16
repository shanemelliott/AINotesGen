// Insert labs and vitals into VistA with the Data Loader import RPCs (ISI IMPORT VITALS, ISI IMPORT LAB,
// ISI IMPORT LAB PANEL), the same calls TPMS makes. DEV ONLY. Dry run unless --apply.
// Usage: node import-labs-vitals.js --plan plans/<file>.json [--apply] [--only vitals|labs|panels]
// Plan: { "dfn": "100973", "location": "PRIMARY CARE", "enteredBy": "PROVIDER,ONE",
//   "vitals": [{ "at": "2026-10-16T07:00", "type": "BLOOD PRESSURE", "value": "128/82" }],
//   "labs":   [{ "at": "...", "test": "HEMOGLOBIN A1C", "sample": "BLOOD", "value": "6.8" }],
//   "panels": [{ "at": "...", "panel": "BASIC METABOLIC PANEL", "sample": "BLOOD", "values": { "SODIUM": 140 } }] }
// "at" is VistA local time (Eastern). Weight values get the suffix L; temperature is sent as a plain number (98.8F is rejected).
const fs = require('fs');
const path = require('path');
require('./src/config');
const { callRpc } = require('./src/vistaApiClient');

const CONTEXT = process.env.VISTA_IMPORT_CONTEXT || 'ISI DATA IMPORT';
const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : undefined);
const apply = process.argv.includes('--apply');
const only = arg('--only');
const planPath = arg('--plan');
if (!planPath) { console.error('Usage: node import-labs-vitals.js --plan <plan.json> [--apply] [--only vitals|labs|panels]'); process.exit(1); }
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const location = plan.location || process.env.VISTA_IMPORT_LOCATION || 'PRIMARY CARE';
const enteredBy = plan.enteredBy || process.env.VISTA_IMPORT_ENTERED_BY || 'PROVIDER,ONE';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n) => String(n).padStart(2, '0');
const parts = (at) => { const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(at); if (!m) throw new Error(`bad time ${at}`); return m.slice(1).map(Number); };
const vitalsTime = (at) => { const [y, mo, d, h, mi] = parts(at); return `${MON[mo - 1]} ${p2(d)}, ${y}@${p2(h)}:${p2(mi)}`; };
const fileman = (at) => { const [y, mo, d, h, mi] = parts(at); return `${(y - 1700) * 10000 + mo * 100 + d}.${p2(h)}${p2(mi)}`.replace(/0+$/, '').replace(/\.$/, ''); };

function vitalValue(type, v, raw) {
  const s = String(v).trim();
  if (raw) return s;
  if (/^WEIGHT$/i.test(type) && /^\d+(\.\d+)?$/.test(s)) return `${s}L`;
  if (/^(PULSE|RESPIRATION)$/i.test(type) && /^\d+(\.\d+)?$/.test(s)) return String(Math.ceil(Number(s)));
  return s;
}

async function ssnOf(dfn) {
  const body = await callRpc('VPR GET PATIENT DATA JSON', [{ namedArray: { patientId: dfn } }], 'CDSP RPC CONTEXT', { jsonResult: true, timeout: 120000, raw: true });
  const p = ((body.payload && body.payload.data && body.payload.data.items) || []).find((i) => i.uid && i.uid.split(':')[2] === 'patient');
  if (!p || !p.ssn) throw new Error(`no SSN for DFN ${dfn}`);
  return String(p.ssn).replace(/\D/g, '');
}

function build(kind, ssn, item) {
  const loc = item.location || location;
  const a = [`PAT_SSN^${ssn}`];
  if (kind === 'vitals') a.push(`LOCATION^${loc}`, `ENTERED_BY^${enteredBy}`, `VITAL_TYPE^${item.type}`, `RATE^${vitalValue(item.type, item.value, item.raw)}`, `DT_TAKEN^${vitalsTime(item.at)}`);
  if (kind === 'labs') a.push(`COLLECTION_SAMPLE^${String(item.sample || 'SERUM').toUpperCase()}`, `LAB_TEST^${item.test}`, `RESULT_VAL^${item.value}`, `RESULT_DT^${fileman(item.at)}`, `LOCATION^${loc}`);
  if (kind === 'panels') {
    a.push(`COLLECTION_SAMPLE^${String(item.sample || 'BLOOD').toUpperCase()}`, `LAB_PANEL^${item.panel}`);
    for (const [t, v] of Object.entries(item.values)) a.push(`LAB_TEST^${t}^${v}`);
    a.push(`RESULT_DT^${fileman(item.at)}`, `LOCATION^${loc}`);
  }
  return a;
}

(async () => {
  const ssn = await ssnOf(plan.dfn);
  const rpcOf = { vitals: 'ISI IMPORT VITALS', labs: 'ISI IMPORT LAB', panels: 'ISI IMPORT LAB PANEL' };
  const results = [];
  for (const kind of ['vitals', 'labs', 'panels']) {
    if (only && only !== kind) continue;
    for (const item of plan[kind] || []) {
      const params = build(kind, ssn, item);
      const shown = params.map((x) => x.replace(/^PAT_SSN\^.*/, 'PAT_SSN^<ssn>'));
      let reply = null;
      if (apply) {
        try { reply = String(await callRpc(rpcOf[kind], [{ array: params }], CONTEXT, { timeout: 60000 })).trim(); } catch (e) { reply = `ERROR ${e.message.slice(0, 300)}`; }
      }
      console.log(`${apply ? 'APPLY' : 'dry  '} ${rpcOf[kind]} ${shown.slice(1).join(' | ')}${apply ? `  => ${reply}` : ''}`);
      results.push({ kind, at: item.at, params: shown, reply });
    }
  }
  if (apply) {
    const file = path.join(__dirname, 'logs', `import-${plan.dfn}.json`);
    const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
    fs.writeFileSync(file, JSON.stringify([...prev, ...results], null, 2));
  }
})().catch((e) => { console.error(`FAIL ${e.message}`); process.exit(1); });
