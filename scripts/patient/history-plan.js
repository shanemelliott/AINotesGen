// Build a 3-year visit plan for a patient (DEV ONLY, read only): PCP about every 6 months with none in the last 6
// months, random ED visits, specialty visits that follow the problem list. Output is a custom-visits.js plan.
// Usage: node patient.js history-plan --dfn <dfn> [--today YYYY-MM-DD] [--out plans/dfn<dfn>-visits.json]
// Then review the plan and run: node patient.js custom-visits --dfn <dfn> --plan <plan> [--book] [--generate]
// Dates and picks are deterministic per DFN. Days that already have a visit or appointment are skipped.
const { ROOT } = require('../../src/paths');
const fs = require('fs');
const path = require('path');
require('../../src/config');
const { callRpc } = require('../../src/vistaApiClient');
const { rng, seedFor } = require('../../src/vetProfile');
const lookup = require('../../src/clinic-lookup.json');

const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : undefined);
const dfn = arg('--dfn');
if (!/^\d+$/.test(dfn || '')) { console.error('Usage: node patient.js history-plan --dfn <dfn> [--today YYYY-MM-DD] [--out file]'); process.exit(1); }
const today = arg('--today') || new Date().toISOString().slice(0, 10);
const out = arg('--out') || path.join(ROOT, 'plans', `dfn${dfn}-visits.json`);

const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekday = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const toWeekday = (iso) => (weekday(iso) === 6 ? addDays(iso, -1) : weekday(iso) === 0 ? addDays(iso, 1) : iso);
const day8 = (v) => { const s = String(v || '').replace(/\D/g, ''); return s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : ''; };
const hhmm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

// Condition templates, matched on the problem text. specialty is a clinic name from src/clinic-lookup.json.
const COND = [
  { re: /diabetes/i, key: 'diabetes', specialty: 'DIABETIC', pcp: ['He reports checking his blood sugar at home and taking diabetes medicine as prescribed', 'Foot exam done; no sores or numbness reported', 'Diabetic eye exam and urine albumin test were reviewed and are up to date or ordered', 'A1C and kidney function labs were ordered before the next visit'], spec: ['Seen for diabetes education and review of home glucose readings', 'Diet, activity and medicine timing were reviewed', 'No low blood sugar episodes reported', 'Plan: continue current medicine, repeat A1C in three months'], ed: [{ c: 'High blood sugar and thirst', n: 'Hyperglycemia, unspecified', i: 'R73.9', s: ['He came in with a day of excess thirst and frequent urination, fingerstick glucose was high at home', 'Blood glucose was checked in the department and fluids were given', 'Discharged home with instructions to take medicine as prescribed and see primary care in one week'] }] },
  { re: /hypertension|high blood pressure/i, key: 'hypertension', specialty: 'CARDIOLOGY', pcp: ['Blood pressure was reviewed and is at or near goal on the current medicine', 'He reports no headache, chest pain or vision change', 'Low sodium diet and exercise were encouraged'], spec: ['Seen for blood pressure review; home readings were discussed', 'No chest pain, palpitations or swelling reported', 'Plan: continue current medicine, repeat basic labs, return in six months'], ed: [{ c: 'Headache and high blood pressure', n: 'Elevated blood pressure reading', i: 'R03.0', s: ['He came in with a headache and a high home blood pressure reading', 'Blood pressure was rechecked and was elevated without other symptoms', 'He was given his usual medicine and discharged with primary care follow-up in one week'] }] },
  { re: /coronary|ischemic|myocardial|atheroscler/i, key: 'cad', specialty: 'CARDIOLOGY', pcp: ['He reports no chest pain, shortness of breath or palpitations since the last visit', 'Cholesterol medicine and aspirin were reviewed'], spec: ['Seen for coronary artery disease follow-up with no new chest pain', 'Medicine list was reviewed and continued', 'Plan: lipid panel, return in six months'], ed: [{ c: 'Chest pressure', n: 'Chest pain, unspecified', i: 'R07.9', s: ['He came in with chest pressure that eased with rest', 'ECG showed no acute changes and two cardiac enzyme tests were negative', 'Discharged home with cardiology follow-up within one week and return precautions'] }] },
  { re: /heart failure/i, key: 'hf', specialty: 'CARDIOLOGY', pcp: ['He reports stable breathing and no new leg swelling', 'Weight was reviewed; he is following a low salt diet'], spec: ['Seen for heart failure follow-up; no orthopnea or new swelling', 'Diuretic and other medicines were reviewed', 'Plan: basic labs and return in three months'], ed: [{ c: 'Shortness of breath and leg swelling', n: 'Dyspnea, unspecified', i: 'R06.00', s: ['He came in with a few days of worsening breathlessness and leg swelling', 'He received a dose of IV diuretic with improvement', 'Discharged home with cardiology follow-up in one week'] }] },
  { re: /atrial fib/i, key: 'afib', specialty: 'CARDIOLOGY', pcp: ['He reports no palpitations or dizziness', 'Blood thinner use and bleeding precautions were reviewed'], spec: ['Seen for atrial fibrillation follow-up; rate is controlled', 'No bleeding or dizziness reported', 'Plan: continue current medicine, return in six months'], ed: [{ c: 'Palpitations', n: 'Palpitations', i: 'R00.2', s: ['He came in with a racing heartbeat that began that evening', 'ECG showed his known rhythm with a controlled rate', 'Discharged home after observation with cardiology follow-up'] }] },
  { re: /copd|chronic lung|asthma|obstructive pulmonary|bronchitis/i, key: 'copd', specialty: 'PULMONARY', pcp: ['He reports stable cough with no new sputum and uses his inhaler as needed', 'Vaccines and smoking status were reviewed'], spec: ['Seen for chronic lung disease follow-up; inhaler technique reviewed', 'No recent flare or steroid use', 'Plan: continue inhalers, breathing test in six months'], ed: [{ c: 'Cough and wheezing', n: 'Chronic obstructive pulmonary disease with acute exacerbation', i: 'J44.1', s: ['He came in with three days of worse cough and wheezing', 'He was treated with nebulized albuterol and felt better', 'A short course of oral prednisone was prescribed and primary care follow-up arranged'] }] },
  { re: /kidney/i, key: 'ckd', specialty: null, pcp: ['Kidney function and blood pressure were reviewed', 'He was advised to avoid anti-inflammatory pain medicine and to stay hydrated'], spec: [], ed: [] },
  { re: /liver|hepat|cirrhosis/i, key: 'liver', specialty: null, pcp: ['He reports no abdominal pain or yellowing of the skin', 'Alcohol avoidance was reinforced and liver tests were ordered'], spec: [], ed: [] },
  { re: /cerebrovascular|stroke|cva/i, key: 'cva', specialty: null, pcp: ['He reports no new weakness, speech or vision change', 'Blood pressure and cholesterol medicines were reviewed'], spec: [], ed: [{ c: 'Dizziness and numbness', n: 'Dizziness and giddiness', i: 'R42', s: ['He came in with brief dizziness and left hand numbness that resolved', 'Neurologic exam was normal and head CT showed no acute change', 'Discharged home with primary care follow-up and stroke warning signs reviewed'] }] },
  { re: /tobacco|smok|nicotine/i, key: 'tobacco', specialty: null, pcp: ['Tobacco use was discussed and cessation was offered'], spec: [], ed: [] },
  { re: /hyperlipid|cholesterol|dyslipid/i, key: 'lipids', specialty: null, pcp: ['Cholesterol medicine was reviewed; a lipid panel was ordered'], spec: [], ed: [] },
  { re: /depress/i, key: 'depression', specialty: 'MENTAL HYGIENE', pcp: ['Mood was screened; no thoughts of self harm were reported'], spec: ['Seen for depression follow-up; mood is improved on the current plan', 'No thoughts of self harm', 'Plan: continue treatment, return in three months'], ed: [] },
  { re: /obes|overweight/i, key: 'weight', specialty: null, pcp: ['Weight, diet and activity were reviewed'], spec: [], ed: [] },
];
const ED_GENERIC = [
  { c: 'Abdominal pain', n: 'Abdominal pain, unspecified', i: 'R10.9', s: ['He came in with a day of crampy abdominal pain and nausea', 'The abdomen was soft with mild tenderness and basic labs were normal', 'Treated for symptoms and discharged home with primary care follow-up'] },
  { c: 'Low back pain after lifting', n: 'Low back pain', i: 'M54.50', s: ['He came in with low back pain after lifting a heavy box, no leg weakness or bowel or bladder change', 'Exam showed muscle tenderness without nerve findings', 'Given an anti-inflammatory and told to stay active, with primary care follow-up'] },
  { c: 'Cough and fever', n: 'Acute upper respiratory infection', i: 'J06.9', s: ['He came in with four days of cough, sore throat and fever', 'Chest X-ray was clear and a rapid flu test was negative', 'Discharged home with supportive care'] },
  { c: 'Ankle injury', n: 'Sprain of ankle', i: 'S93.409A', s: ['He twisted his ankle stepping off a curb and had pain with walking', 'X-ray showed no fracture; ankle was wrapped and crutches were given', 'Discharged home with rest, ice and primary care follow-up'] },
];
const ED_TIMES = [19 * 60, 21 * 60 + 30, 2 * 60 + 15, 14 * 60, 9 * 60 + 30, 17 * 60 + 45];

// Critical events placed after the last PCP visit, to test that a pre-visit summary picks them up (--sentinels).
// objective holds the vitals and labs that history-labs-plan.js files on the visit day; the scenario quotes the same numbers.
const SENTINELS = {
  hypertension: {
    ed: { offset: 105, time: '21:10', clinic: 'EMERGENCY DEPARTMENT', visitType: 'Emergency', setting: 'VA emergency department', presenting: ['Severe headache and blurred vision'], dx: { name: 'Hypertensive urgency', icd: 'I16.0' },
      scenario: ['He came in with a severe headache and blurred vision for one day; he had missed several doses of his blood pressure medicine', 'Blood pressure on arrival was 192/114 and pulse 98, with no chest pain or weakness', 'Blood sugar was 342, potassium 5.9 and creatinine 1.9, all higher than his usual', 'Blood pressure came down to 160/96 after oral medicine and he was discharged', 'He was told to see primary care within one week for repeat labs and a medicine review'],
      objective: { vitals: [{ type: 'BLOOD PRESSURE', value: '192/114' }, { type: 'PULSE', value: '98' }, { type: 'RESPIRATION', value: '18' }, { type: 'WEIGHT', value: '196' }], panels: [{ panel: 'BASIC METABOLIC PANEL', sample: 'BLOOD', values: { GLUCOSE: 342, 'UREA NITROGEN': 28, SODIUM: 138, POTASSIUM: 5.9, CHLORIDE: 101, CO2: 22, CREATININE: 1.9, CALCIUM: 9.4 } }] } },
    spec: { offset: 160, time: '10:30', clinic: 'CARDIOLOGY', visitType: 'Consult', setting: 'VA outpatient clinic', presenting: ['Reduced heart function found on echocardiogram'], dx: { name: 'Heart failure with reduced ejection fraction', icd: 'I50.2' },
      scenario: ['Seen after the emergency visit for very high blood pressure', 'Echocardiogram showed a new reduced ejection fraction of 35 percent, a critical result', 'Blood pressure in clinic was 168/100', 'A heart failure medicine and a daily weight log were started, and a low salt diet was reviewed', 'The cardiologist asked for primary care follow-up and repeat kidney labs in two weeks, which have not been scheduled'],
      objective: { vitals: [{ type: 'BLOOD PRESSURE', value: '168/100' }, { type: 'PULSE', value: '88' }, { type: 'WEIGHT', value: '199' }] } },
    lab: { offset: 174, time: '08:00', labs: [{ test: 'HEMOGLOBIN A1C', sample: 'BLOOD', value: '9.4' }], panels: [{ panel: 'BASIC METABOLIC PANEL', sample: 'BLOOD', values: { GLUCOSE: 276, 'UREA NITROGEN': 34, SODIUM: 137, POTASSIUM: 5.6, CHLORIDE: 100, CO2: 21, CREATININE: 2.1, CALCIUM: 9.2 } }] },
  },
};

async function main() {
  const body = await callRpc('VPR GET PATIENT DATA JSON', [{ namedArray: { patientId: dfn } }], 'CDSP RPC CONTEXT', { jsonResult: true, timeout: 120000, raw: true });
  const items = (body.payload && body.payload.data && body.payload.data.items) || [];
  if (!items.length) throw new Error(`no VPR data for DFN ${dfn}`);
  const dom = (i) => i.uid.split(':')[2];
  const busy = new Set([...items.filter((i) => dom(i) === 'visit' || dom(i) === 'appointment').map((i) => day8(i.dateTime))]);
  const problems = items.filter((i) => dom(i) === 'problem' && !i.removed && i.statusName === 'ACTIVE')
    .map((p) => ({ text: String(p.problemText || '').replace(/\s*\((SCT|ICD)[^)]*\)\s*$/, ''), raw: p.problemText, icd: String(p.icdCode || '').replace(/^urn:10d:/, '').replace(/\.$/, '') }));
  const conds = [];
  for (const p of problems) { const c = COND.find((x) => x.re.test(p.raw)); if (c && !conds.some((x) => x.c === c)) conds.push({ c, p }); }
  if (!conds.length) conds.push({ c: { key: 'general', pcp: ['Routine primary care follow-up with no new complaints'], spec: [], ed: [], specialty: null }, p: problems[0] || { text: 'Routine follow-up', icd: 'Z00.00' } });

  const r = rng(seedFor(`history:${dfn}`));
  const pick = (a) => a[Math.floor(r() * a.length)];
  const from = `${+today.slice(0, 4) - 3}${today.slice(4)}`;
  const pcpClinic = lookup.clinics[lookup.default];
  const probs = problems.map((p) => p.raw);
  const dx = conds.slice(0, 3).map((x, i) => ({ name: x.p.text, icd: x.p.icd, primary: i === 0 }));
  const visits = [];
  const free = (d) => { let x = toWeekday(d); while (busy.has(x)) x = toWeekday(addDays(x, 1)); busy.add(x); return x; };
  const time = (lo, hi) => hhmm(lo + 30 * Math.floor(r() * ((hi - lo) / 30 + 1)));

  let d = addDays(today, -183 - Math.floor(10 + r() * 30));
  while (d >= from) {
    const date = free(d);
    const pool = conds.flatMap((x) => x.c.pcp);
    const lines = [`Routine primary care follow-up of ${conds.slice(0, 3).map((x) => x.p.text).join(', ')}`, ...[...new Set([pick(pool), pick(pool), pick(pool)])], 'No medication changes were needed', 'Return in about six months, sooner for new or worsening symptoms'];
    visits.push({ date, time: time(8 * 60, 15 * 60 + 30), clinic: lookup.default, clinicIen: String(pcpClinic.clinicIen), resourceIen: String(pcpClinic.resourceIen), visitType: 'Follow-up', setting: 'VA outpatient clinic', presenting: [`Routine follow-up of ${conds[0].p.text}`], relevantProblems: probs, visitDiagnoses: dx, scenario: lines });
    d = addDays(d, -(170 + Math.floor(r() * 25)));
  }

  const edPool = [...conds.flatMap((x) => x.c.ed), ...ED_GENERIC];
  const nEd = 1 + Math.floor(r() * 3);
  for (let k = 0; k < nEd && edPool.length; k++) {
    const e = edPool.splice(Math.floor(r() * edPool.length), 1)[0];
    const date = free(addDays(from, 20 + Math.floor(r() * (1095 - 40))));
    const ed = lookup.clinics['EMERGENCY DEPARTMENT'];
    const mins = pick(ED_TIMES);
    visits.push({ date, time: hhmm(mins), clinic: 'EMERGENCY DEPARTMENT', clinicIen: String(ed.clinicIen), resourceIen: String(ed.resourceIen), visitType: 'Emergency', setting: 'VA emergency department', presenting: [e.c], relevantProblems: [e.c, ...probs.slice(0, 3)], visitDiagnoses: [{ name: e.n, icd: e.i, primary: true }], scenario: e.s });
  }

  const specs = [...new Set(conds.filter((x) => x.c.specialty && x.c.spec.length && lookup.clinics[x.c.specialty]).map((x) => x.c.specialty))].slice(0, 3);
  for (const clinic of specs) {
    const x = conds.find((y) => y.c.specialty === clinic);
    const cl = lookup.clinics[clinic];
    visits.push({ date: free(addDays(from, 60 + Math.floor(r() * 900))), time: time(9 * 60, 15 * 60), clinic, clinicIen: String(cl.clinicIen), resourceIen: String(cl.resourceIen), visitType: 'Consult', setting: 'VA outpatient clinic', presenting: [`Follow-up of ${x.p.text}`], relevantProblems: probs, visitDiagnoses: [{ name: x.p.text, icd: x.p.icd, primary: true }], scenario: x.c.spec });
  }

  let extraLabs = null;
  if (process.argv.includes('--sentinels')) {
    const key = ['hypertension'].find((k) => conds.some((x) => x.c.key === k));
    const s = key && SENTINELS[key];
    if (!s) console.log('No sentinel events defined for this patient\'s conditions; skipped');
    else {
      const lastPcp = visits.filter((v) => v.clinic === lookup.default).map((v) => v.date).sort().slice(-1)[0];
      // Random ED visits after the last PCP visit are replaced by the sentinel one.
      for (let i = visits.length - 1; i >= 0; i--) if (visits[i].clinic === 'EMERGENCY DEPARTMENT' && visits[i].date > lastPcp) visits.splice(i, 1);
      const seen = (v, extra) => ({ ...v, ...extra, sentinel: true });
      for (const [kind, e] of [['ed', s.ed], ['spec', s.spec]]) {
        const cl = lookup.clinics[e.clinic];
        visits.push(seen({ date: free(addDays(lastPcp, e.offset)), time: e.time, clinic: e.clinic, clinicIen: String(cl.clinicIen), resourceIen: String(cl.resourceIen), visitType: e.visitType, setting: e.setting, presenting: e.presenting, relevantProblems: [...e.presenting, ...probs.slice(0, 3)], visitDiagnoses: [{ name: e.dx.name, icd: e.dx.icd, primary: true }], scenario: e.scenario, objective: e.objective }, {}));
      }
      extraLabs = { date: free(addDays(lastPcp, s.lab.offset)), time: s.lab.time, labs: s.lab.labs, panels: s.lab.panels, sentinel: true };
      console.log(`Sentinel events after the last PCP visit (${lastPcp}): ED, cardiology, outpatient labs ${extraLabs.date}`);
    }
  }
  visits.sort((a, b) => a.date.localeCompare(b.date));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ dfn, generated: `history-plan.js ${today}`, visits, ...(extraLabs ? { extraLabs } : {}) }, null, 2));
  const counts = visits.reduce((m, v) => ({ ...m, [v.clinic]: (m[v.clinic] || 0) + 1 }), {});
  console.log(`Plan for DFN ${dfn}: ${visits.length} visits ${JSON.stringify(counts)} -> ${path.relative(ROOT, out)}`);
  for (const v of visits) console.log(`  ${v.date} ${v.time} ${v.clinic.padEnd(22)} ${v.visitDiagnoses[0].icd.padEnd(9)} ${v.presenting[0]}`);
}

main().catch((e) => { console.error(`FAIL ${e.message}`); process.exit(1); });
