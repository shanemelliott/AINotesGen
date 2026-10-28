// Build the labs and vitals import plan that matches a visit plan (DEV ONLY, read only).
// Usage: node patient.js history-labs-plan --dfn <dfn> [--visits plans/dfn<dfn>-visits.json] [--out plans/dfn<dfn>-labs-vitals.json]
// PCP visits get vitals and, for the patient's conditions, A1C, a basic metabolic panel (every PCP visit) and a lipid
// panel (every second one). ED and specialty visits get vitals, and the "objective" values of a sentinel visit
// (history-plan.js --sentinels). Values are controlled-range random numbers, deterministic per DFN.
// Then: node patient.js import-labs-vitals --plan <out> [--apply]
const { ROOT } = require('../../src/paths');
const fs = require('fs');
const path = require('path');
require('../../src/config');
const { callRpc } = require('../../src/vistaApiClient');
const { rng, seedFor } = require('../../src/vetProfile');

const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : undefined);
const dfn = arg('--dfn');
if (!/^\d+$/.test(dfn || '')) { console.error('Usage: node patient.js history-labs-plan --dfn <dfn>'); process.exit(1); }
const visitsPath = arg('--visits') || path.join(ROOT, 'plans', `dfn${dfn}-visits.json`);
const out = arg('--out') || path.join(ROOT, 'plans', `dfn${dfn}-labs-vitals.json`);
const plan = JSON.parse(fs.readFileSync(visitsPath, 'utf8'));

const at = (date, time) => `${date}T${time}`;
const minus = (time, mins) => { const [h, m] = time.split(':').map(Number); const t = Math.max(7 * 60, h * 60 + m - mins); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

async function conditions() {
  const body = await callRpc('VPR GET PATIENT DATA JSON', [{ namedArray: { patientId: dfn } }], 'CDSP RPC CONTEXT', { jsonResult: true, timeout: 120000, raw: true });
  const text = ((body.payload && body.payload.data && body.payload.data.items) || []).filter((i) => i.uid.split(':')[2] === 'problem' && !i.removed).map((p) => p.problemText).join(' | ');
  return { diabetes: /diabetes/i.test(text), htn: /hypertension|high blood pressure/i.test(text), lipids: /lipid|cholesterol/i.test(text), male: true };
}

(async () => {
  const c = await conditions();
  const r = rng(seedFor(`labs-vitals:${dfn}`));
  const between = (lo, hi, d = 0) => Number((lo + r() * (hi - lo)).toFixed(d));
  let weight = between(176, 196);
  const vitals = [], labs = [], panels = [];
  let pcpIndex = 0;
  const addVitals = (v, date, time, location, withWeight) => {
    const sys = c.htn ? between(122, 136) : between(110, 128), dia = c.htn ? between(76, 86) : between(70, 80);
    vitals.push({ at: at(date, time), location, type: 'BLOOD PRESSURE', value: `${sys}/${dia}` }, { at: at(date, time), location, type: 'PULSE', value: String(between(66, 82)) }, { at: at(date, time), location, type: 'RESPIRATION', value: String(between(14, 18)) });
    if (withWeight) { weight = Math.max(150, weight + between(-2, 2)); vitals.push({ at: at(date, time), location, type: 'WEIGHT', value: String(Math.round(weight)) }); }
  };
  for (const v of plan.visits) {
    const sent = v.objective;
    if (sent && sent.vitals) for (const x of sent.vitals) vitals.push({ at: at(v.date, v.time), location: v.clinic, type: x.type, value: x.value });
    else if (v.clinic === 'EMERGENCY DEPARTMENT') { addVitals(v, v.date, v.time, v.clinic, false); vitals.push({ at: at(v.date, v.time), location: v.clinic, type: 'TEMPERATURE', value: String(between(97.8, 99.1, 1)) }); }
    else addVitals(v, v.date, v.time, v.clinic, v.clinic === 'DEV PACT MD 4');
    if (sent) { for (const x of sent.labs || []) labs.push({ at: at(v.date, minus(v.time, 0)), location: v.clinic, ...x }); for (const x of sent.panels || []) panels.push({ at: at(v.date, minus(v.time, 0)), location: v.clinic, ...x }); }
    if (v.clinic === 'DEV PACT MD 4' && !sent) {
      const t = at(v.date, minus(v.time, 90));
      if (c.diabetes) labs.push({ at: t, location: v.clinic, test: 'HEMOGLOBIN A1C', sample: 'BLOOD', value: String(between(6.5, 7.0, 1)) });
      if (c.diabetes || c.htn) panels.push({ at: t, location: v.clinic, panel: 'BASIC METABOLIC PANEL', sample: 'BLOOD', values: { GLUCOSE: between(96, 128), 'UREA NITROGEN': between(12, 20), SODIUM: between(137, 143), POTASSIUM: between(3.9, 4.8, 1), CHLORIDE: between(100, 106), CO2: between(24, 29), CREATININE: between(0.9, 1.2, 1), CALCIUM: between(9.0, 10.0, 1) } });
      if ((c.diabetes || c.htn || c.lipids) && pcpIndex % 2 === 0) panels.push({ at: t, location: v.clinic, panel: 'LIPID PROFILE', sample: 'BLOOD', values: { CHOLESTEROL: between(150, 195), TRIGLYCERIDE: between(90, 170), HDL: between(40, 55), 'LDL CHOLESTEROL': between(80, 115) } });
      pcpIndex++;
    }
  }
  if (plan.extraLabs) {
    const e = plan.extraLabs;
    for (const x of e.labs || []) labs.push({ at: at(e.date, e.time), location: 'LABORATORY', ...x });
    for (const x of e.panels || []) panels.push({ at: at(e.date, e.time), location: 'LABORATORY', ...x });
  }
  const key = (x) => x.at;
  [vitals, labs, panels].forEach((a) => a.sort((x, y) => key(x).localeCompare(key(y))));
  fs.writeFileSync(out, JSON.stringify({ dfn, enteredBy: 'PROVIDER,ONE', note: `from ${path.basename(visitsPath)}`, vitals, labs, panels }, null, 2));
  console.log(`DFN ${dfn}: ${vitals.length} vitals, ${labs.length} labs, ${panels.length} panels -> ${path.relative(ROOT, out)} (diabetes ${c.diabetes}, hypertension ${c.htn})`);
  for (const x of [...labs.map((l) => `${l.at} ${l.location.padEnd(14)} ${l.test} ${l.value}`), ...panels.map((p) => `${p.at} ${p.location.padEnd(14)} ${p.panel} ${JSON.stringify(p.values).slice(0, 70)}`)].sort()) console.log('  ' + x);
})().catch((e) => { console.error(`FAIL ${e.message}`); process.exit(1); });
