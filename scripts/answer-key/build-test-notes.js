// Long synthetic specialty notes for the AI summary test patient made by build-test-patient.js (DEV ONLY).
// The notes reproduce problems seen when reviewing summaries of real charts: wordy copy-forward notes that
// retell the same story, lab grids pasted into the narrative, template-only notes with no clinical facts,
// eGFR values from different methods that are never reconciled, abnormal labs nobody comments on, medication
// fill and stop events scattered across notes, checkbox findings with no clear answer, and screening
// questionnaires copied word for word. Lab, vital, problem and medication blocks come from the VPR (<dfn>.json).
// Usage: node patient.js build-test-notes --dfn <dfn> [--date YYYY-MM-DD] [--book]
//   writes output/ready/<dfn>-<date>-<key>.txt + .json; --book books an appointment for each note
// Then: node patient.js sign-notes <ids> --sign, then node patient.js link-note-visits --dfn <dfn> --commit
const { ROOT, VPR_DIR } = require('../../src/paths');
const fs = require('fs');
const path = require('path');
const config = require('../../src/config');
const { writeNote } = require('../../src/noteStore');
const { filemanDateTime, buildVisitString } = require('../../src/notesClient');

const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : undefined);
const DFN = arg('--dfn');
const DATE = arg('--date') || '2026-10-19';
if (!DFN) { console.error('Usage: node patient.js build-test-notes --dfn <dfn> [--date YYYY-MM-DD] [--book]'); process.exit(1); }
const vpr = JSON.parse(fs.readFileSync(path.join(VPR_DIR, `${DFN}.json`), 'utf8'));
const items = (vpr.payload ? vpr.payload.data : vpr.data).items;
const of = (domain) => items.filter((i) => String(i.uid || '').startsWith(`urn:va:${domain}:`));

// ---------- text helpers ----------
const W = 78;
function wrap(text, indent = '', first = indent) {
  const out = [];
  let line = first;
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    if (line.trim() && (line + w).length > W) { out.push(line.trimEnd()); line = indent; }
    line += `${w} `;
  }
  if (line.trim()) out.push(line.trimEnd());
  return out;
}
const para = (...texts) => texts.flatMap((t) => [...wrap(t), '']);
const bullets = (list, mark = '-') => list.flatMap((t) => wrap(t, '    ', `  ${mark} `));
const numbered = (list) => list.flatMap((t, i) => wrap(t, '     ', `  ${String(i + 1).padStart(2)}. `));
const header = (t) => ['', t.toUpperCase(), '-'.repeat(Math.min(W, t.length))];
const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
const d8 = (v) => String(v).slice(0, 8);
const mdyy = (s) => `${s.slice(4, 6)}/${s.slice(6, 8)}/${s.slice(2, 4)}`;
const mdyyyy = (s) => `${s.slice(4, 6)}/${s.slice(6, 8)}/${s.slice(0, 4)}`;
const hhmm = (v) => String(v).slice(8, 12).padEnd(4, '0');

// ---------- chart blocks built from the VPR ----------
const labs = of('lab');
const flag = (l) => { const c = String(l.interpretationCode || '').split(':').pop(); return c && c !== 'N' ? c : ''; };

function labGrid(title, cols) {
  const byDay = new Map();
  for (const l of labs) {
    const c = cols.find(([name]) => name === l.typeName);
    if (!c) continue;
    const day = d8(l.observed);
    if (!byDay.has(day)) byDay.set(day, { time: hhmm(l.observed), spec: l.specimen || '', v: {} });
    byDay.get(day).v[c[1]] = `${l.result}${flag(l)}`;
  }
  const units = cols.map(([name]) => String((labs.find((l) => l.typeName === name) || {}).units || '').trim());
  const rows = [...byDay.keys()].sort().reverse();
  return [
    '', `${title}  (cumulative, most recent first; H/L = abnormal, HH = critical)`,
    `${pad('Collection DT', 14)}${pad('Spec', 7)}${cols.map(([, a]) => pad(a, 6)).join('')}`,
    `${pad('', 21)}${units.map((u) => pad(u.replace(/\s/g, ''), 6)).join('')}`,
    ...rows.map((day) => {
      const r = byDay.get(day);
      return `${pad(`${mdyy(day)} ${r.time}`, 14)}${pad(r.spec, 7)}${cols.map(([, a]) => pad(r.v[a] || '', 6)).join('')}`.trimEnd();
    }),
  ];
}

const CHEM = [['SODIUM', 'NA'], ['POTASSIUM', 'K'], ['CHLORIDE', 'CL'], ['CO2', 'CO2'], ['UREA NITROGEN', 'BUN'],
  ['CREATININE', 'CREAT'], ['GLUCOSE', 'GLU'], ['CALCIUM', 'CA'], ['eGFR (CKD-EPI)', 'EGFR']];
const HEP = [['SGOT', 'AST'], ['SGPT', 'ALT'], ['ALKALINE PHOSPHATASE', 'ALKP'], ['TOT. BILIRUBIN', 'TBILI'],
  ['PROTEIN,TOTAL', 'TP'], ['ALBUMIN', 'ALB']];
const CBC = [['WBC', 'WBC'], ['RBC', 'RBC'], ['HGB', 'HGB'], ['HCT', 'HCT'], ['MCV', 'MCV'], ['MCH', 'MCH'],
  ['MCHC', 'MCHC'], ['RDW', 'RDW'], ['PLATELET COUNT', 'PLT']];
const DIFF = [['SEGS', 'SEGS'], ['MONOS', 'MONO'], ['BASO', 'BASO'], ['EOSINO, ABSOLUTE', 'EOS#']];
const OTHER = [['PROTIME', 'PT'], ['TSH', 'TSH'], ['OCCULT BLOOD', 'FOBT']];

function uaGrid() {
  const tests = [...new Set(labs.filter((l) => /URINE|UROBIL|SPECIFIC GRAV|NITRITE|APPEARANCE/.test(l.typeName)).map((l) => l.typeName))];
  const days = [...new Set(labs.filter((l) => tests.includes(l.typeName)).map((l) => d8(l.observed)))].sort().reverse();
  return [
    '', 'URINALYSIS  (cumulative)',
    `${pad('Test', 22)}${days.map((d) => pad(mdyy(d), 11)).join('')}`,
    ...tests.map((t) => `${pad(t, 22)}${days.map((d) => {
      const l = labs.find((x) => x.typeName === t && d8(x.observed) === d);
      return pad(l ? `${l.result}${flag(l)}` : '', 11);
    }).join('')}`.trimEnd()),
  ];
}

const allLabGrids = () => [
  ...header('Laboratory data (auto-imported, last 24 months)'),
  ...labGrid('CHEMISTRY', CHEM), ...labGrid('HEPATIC', HEP), ...labGrid('HEMATOLOGY', CBC),
  ...labGrid('DIFFERENTIAL', DIFF), ...labGrid('OTHER', OTHER), ...uaGrid(),
];

// Every visit with that day's vitals and abnormal results, as copy-forward "interval history" templates paste it.
function encounterLog() {
  const visits = of('visit').sort((a, b) => String(b.dateTime).localeCompare(String(a.dateTime)));
  const vit = of('vital');
  return [
    ...header(`Encounter history (${visits.length} VA encounters, auto-populated, most recent first)`),
    ...visits.flatMap((v) => {
      const day = d8(v.dateTime);
      const vs = vit.filter((x) => d8(x.observed) === day).map((x) => `${x.typeName} ${x.result}`);
      const ab = labs.filter((l) => d8(l.observed) === day && flag(l)).map((l) => `${l.typeName} ${l.result}${flag(l)}`);
      const n = labs.filter((l) => d8(l.observed) === day).length;
      return [
        `  ${mdyyyy(day)} ${hhmm(v.dateTime)}  ${v.locationName || ''} - ${v.typeName || 'OUTPATIENT VISIT'}`,
        ...(v.reasonName ? wrap(`Reason: ${v.reasonName}`, '      ', '      ') : []),
        ...wrap(`Vitals: ${vs.length ? vs.join('; ') : 'none recorded'}`, '      ', '      '),
        ...wrap(`Labs: ${n} results${ab.length ? `; abnormal: ${ab.join('; ')}` : ''}`, '      ', '      '),
        ...wrap('Provider: PROVIDER,UNKNOWN SYNTHEA. Status: CHECKED OUT. Note: see progress notes for this date.', '      ', '      '),
      ];
    }),
  ];
}

function vitalsGrid(n = 12) {
  const cols = [['BLOOD PRESSURE', 'BP', 9], ['PULSE', 'P', 5], ['RESPIRATION', 'R', 4], ['TEMPERATURE', 'T', 7],
    ['PULSE OXIMETRY', 'POX', 5], ['WEIGHT', 'WT', 8], ['PAIN', 'PN', 4]];
  const byTime = new Map();
  for (const v of of('vital')) {
    const c = cols.find(([name]) => name === v.typeName);
    if (!c) continue;
    const k = String(v.observed).slice(0, 12);
    if (!byTime.has(k)) byTime.set(k, {});
    byTime.get(k)[c[1]] = v.result;
  }
  const keys = [...byTime.keys()].sort().reverse().slice(0, n);
  return [
    ...header('Vital signs (last 12 sets)'),
    `${pad('Date/Time', 15)}${cols.map(([, a, w]) => pad(a, w)).join('')}`,
    ...keys.map((k) => `${pad(`${mdyy(k)} ${k.slice(8, 12)}`, 15)}${cols.map(([, a, w]) => pad(byTime.get(k)[a], w)).join('')}`.trimEnd()),
    '  (BP mm[Hg]; P /min; R /min; T F; POX %; WT lb; PN 0-10)',
  ];
}

function problemBlock() {
  const probs = of('problem').filter((p) => p.statusName === 'ACTIVE');
  return [
    ...header(`Active problem list (${probs.length} problems, from CPRS)`),
    ...probs.flatMap((p) => wrap(`${p.problemText}  Onset: ${p.onset ? mdyyyy(String(p.onset)) : 'unknown'}  Status: ACTIVE`, '       ', `  ${pad('', 3)}`)),
  ];
}

function medBlock() {
  const meds = of('med').sort((a, b) => String(a.overallStart).localeCompare(String(b.overallStart)));
  return [
    ...header(`Outpatient medications (${meds.length} VA prescriptions, active and recently expired)`),
    ...meds.flatMap((m, i) => {
      const o = (m.orders || [])[0] || {};
      const f = (m.fills || [])[0] || {};
      return [
        `  ${String(i + 1).padStart(2)}) ${pad(m.name, 36)} Status: ${m.vaStatus}`,
        ...wrap(`Sig: ${m.sig || 'see instructions'}`, '        ', '        '),
        `        Qty: ${o.quantityOrdered || ''} for ${o.daysSupply || ''} days  Refills remaining: ${o.fillsRemaining ?? ''}  Issued: ${mdyy(d8(m.overallStart))}`,
        `        Last filled: ${m.lastFilled ? mdyy(d8(m.lastFilled)) : 'none'} (${f.quantityDispensed || ''} by ${f.routing === 'W' ? 'window' : 'mail'})  Expires: ${m.overallStop ? mdyy(d8(m.overallStop)) : ''}`,
        `        Provider: ${o.providerName || ''}`,
      ];
    }),
    '',
    '  Non-VA / outside medications documented by patient report:',
    ...bullets([
      'Apixaban 5 mg tab, 1 tab by mouth twice a day (patient reports community care pharmacy supply after the VA prescription expired)',
      'Amiodarone 200 mg tab, loading course started 08/04/2026, reported completed (outside fill)',
      'Empagliflozin 10 mg tab, 1 tab by mouth daily, started 04/30/2026 (outside fill per patient)',
      'Dupilumab 300 mg/2 mL auto-injector, stopped 03/20/2026',
      'Bisacodyl 5 mg EC tab and simethicone 80 mg chew tab for colonoscopy preparation, dispensed 09/23/2026 (outside fill)',
    ]),
  ];
}

function allergyBlock() {
  const a = of('allergy');
  return [
    ...header('Allergies / adverse reactions (verified)'),
    ...a.map((x) => `  ${pad(x.products?.[0]?.name || x.summary, 24)} ${(x.reactions || []).map((r) => r.name).join(', ') || 'reaction not recorded'}`),
    '  No known food allergies documented. Latex: not assessed.',
  ];
}

// ---------- shared narrative that is copied forward into every note ----------
const COPY_FORWARD = [
  'Veteran is a 76 year old male Navy Vietnam-era veteran, service connected 10 percent for hypertension, followed in VA primary care since 12/10/2024 when he established care after relocating. Past medical history includes essential hypertension since 2009, gastroesophageal reflux disease since 2013, coronary artery disease status post drug eluting stent to the mid LAD (remote, outside records), malignant melanoma of the left shoulder status post wide local excision with no recurrence, atopic dermatitis, insomnia attributed to pruritus, and prediabetes.',
  'On 01/16/2025 he was found to be in atrial fibrillation with rate in the 110s at a cardiology visit. CHA2DS2-VASc was calculated as 4 (age, hypertension, vascular disease). He was started on apixaban 5 mg twice a day, carvedilol 12.5 mg twice a day and losartan 50 mg daily. Prothrombin time that day was 21.9 seconds.',
  'In 04/2025 he was noted to have peripheral eosinophilia felt to be related to atopic dermatitis; hemoglobin was 11.2 and platelets 126 at that time. Dermatology started dupilumab, which was later stopped on 03/20/2026. An ALT of 70 was recorded on 06/10/2025. Renal ultrasound on 10/29/2025 showed kidneys of 9.8 and 10.1 cm with mildly increased cortical echogenicity and no hydronephrosis.',
  'Empagliflozin 10 mg daily was started 04/30/2026. Spironolactone 25 mg daily was stopped on 06/03/2026 when potassium was 5.2, then restarted on 08/05/2026 for heart failure. Gabapentin 300 mg daily was started 06/04/2026 for pruritus and neuropathic symptoms.',
  'On 07/21/2026 a fecal immunochemical test was positive. Chronic kidney disease and hyperlipidemia were added to the problem list on 07/25/2026. On 08/04/2026 he was seen for dyspnea on exertion and found to have heart failure with mildly reduced ejection fraction (LVEF 40 to 45 percent by echocardiogram) and pulmonary hypertension (estimated RVSP 48 mmHg). Amiodarone loading was started for rhythm control and amlodipine 5 mg daily was added for blood pressure.',
  'Blood pressure was 147/76 at the 08/26/2026 visit. He underwent successful synchronized electrical cardioversion on 09/03/2026 with a single 200 J biphasic shock, converting to sinus rhythm, with uninterrupted apixaban for more than three weeks before the procedure. Gastroenterology saw him on 09/22/2026 for the positive FIT and colonoscopy was scheduled for 11/10/2026. Bowel preparation (PEG 3350 with electrolytes, bisacodyl, simethicone) was dispensed on 09/23/2026.',
];

const ROS_TEMPLATE = [
  ...header('Review of systems (template)'),
  '  Constitutional:  Fever [ ] Yes [ ] No   Chills [ ] Yes [ ] No   Fatigue: +/-',
  '                   Weight change: ? (pt unsure, "maybe a few pounds")',
  '  Eyes:            Vision change [ ] Yes [ ] No',
  '  ENT:             Epistaxis: denies/endorses (pt answered both ways)',
  '  Cardiovascular:  Chest pain: "not really"   Palpitations: +/-',
  '                   Orthopnea: ?2 pillows, unclear if new   PND [ ] Yes [ ] No',
  '                   Lower extremity edema: trace vs none',
  '  Respiratory:     Dyspnea on exertion: ? improved   Cough [ ] Yes [ ] No',
  '  GI:              Melena: pt unsure (dark stools on iron? not on iron)',
  '                   Hematochezia [ ] Yes [ ] No   Abdominal pain: denies?',
  '                   Reflux symptoms: +/-   Nausea [ ] Yes [ ] No',
  '  GU:              Dysuria [ ] Yes [ ] No   Nocturia: ?x2-3',
  '  Musculoskeletal: Joint pain: +   Myalgias: ?',
  '  Skin:            Pruritus: improved vs unchanged   Rash [ ] Yes [ ] No',
  '  Neurologic:      Dizziness: endorses/denies   Syncope [ ] Yes [ ] No',
  '                   Numbness/tingling feet: +/-',
  '  Psychiatric:     Mood: "ok"   Sleep: poor? fair?',
  '  Heme/Lymph:      Easy bruising: +/-   Bleeding gums [ ] Yes [ ] No',
  '  Endocrine:       Polyuria [ ] Yes [ ] No   Heat/cold intolerance: ?',
  '  All other systems reviewed and negative except as noted above and in HPI.',
];

const EXAM_TEMPLATE = [
  ...header('Physical examination (template)'),
  '  General:     Alert, NAD [ ]   Appears stated age [ ]   Well nourished [ ]',
  '  HEENT:       NCAT. PERRLA [ ]. Oropharynx clear [ ]. Mucous membranes moist?',
  '  Neck:        Supple. JVP: ? not well visualized. Carotid bruit [ ] R [ ] L',
  '  Cardiac:     Rhythm: regular? irregular?  S1 S2 [ ]  Murmur: ?soft systolic',
  '  Lungs:       Clear [ ]  Crackles: bibasilar? none?  Wheeze [ ]',
  '  Abdomen:     Soft, NT/ND [ ]  BS present [ ]  Hepatomegaly [ ]',
  '  Extremities: Edema: trace? 1+?  Pulses 2+ [ ]  Cap refill < 2 sec [ ]',
  '  Skin:        Excoriations: +/-  Lichenified plaques [ ]  Scar L shoulder [ ]',
  '  Neuro:       A&O x3 [ ]  CN II-XII grossly intact [ ]  Gait: steady?',
  '  Psych:       Affect appropriate [ ]  Judgment/insight intact [ ]',
];

const REMINDERS = [
  ...header('Clinical reminders (status at time of note)'),
  ...bullets([
    'Depression screening (PHQ-2/I-9): DUE NOW - see screening note',
    'Suicide risk screening (C-SSRS screener): DUE NOW - see screening note',
    'Alcohol use screening (AUDIT-C): DUE NOW',
    'Influenza immunization: DONE this season per immunization record',
    'Pneumococcal immunization: DONE',
    'Colorectal cancer screening: positive FIT 07/21/2026, colonoscopy scheduled 11/10/2026 - reminder resolved by scheduled diagnostic colonoscopy',
    'Diabetic/prediabetes A1c monitoring: NOT DONE in the last 12 months',
    'Lipid panel: NOT DONE in the last 12 months',
    'Advance directive discussion: offered, deferred by patient',
    'MOVE! weight management screening: DUE',
    'Fall risk screening: DONE',
    'Homeless screening: DONE, stably housed',
    'Military sexual trauma screening: DONE, negative',
    'Tobacco use screening: former smoker, quit 1994',
  ]),
];

const ATTEST = [
  '',
  ...wrap('Portions of this note were copied forward from prior documentation and reviewed for accuracy at this visit. Historical information is provided for continuity of care and may not reflect changes made by other services. The patient was given the opportunity to ask questions and all questions were answered to the patient\'s satisfaction. The patient verbalized understanding of and agreement with the plan as outlined above.'),
  '',
  ...wrap('Total time spent on the date of the encounter, including review of records, review of outside records, review of laboratory and imaging results, discussion with the patient, documentation, and care coordination, was greater than 40 minutes, of which greater than 50 percent was spent in counseling and coordination of care.'),
];

const educate = (topics) => [
  ...header('Patient education'),
  ...topics.flatMap(([t, body]) => [`  ${t}:`, ...body.flatMap((b) => wrap(b, '    ', '    ')), '']),
  ...wrap('Learning needs assessment: Patient prefers verbal and written instruction. No barriers to learning identified. Readiness to learn: acceptance. Education provided via verbal discussion and written handout. Patient verbalized understanding using teach-back method.'),
];

const EDU = {
  afib: ['Atrial fibrillation', [
    'Atrial fibrillation is an irregular heart rhythm that can cause a fast heartbeat, shortness of breath, tiredness, and in some people no symptoms at all. It increases the risk of stroke because blood can pool and form clots in the upper chambers of the heart.',
    'You were taught to check your pulse daily, to keep a log of your heart rate and blood pressure, and to call the clinic or the nurse advice line for a heart rate persistently above 110 or below 50, for new chest pain, fainting, or severe shortness of breath, and to call 911 for signs of stroke (face drooping, arm weakness, speech difficulty).',
    'After cardioversion the heart may go back into atrial fibrillation. Continue all medications as prescribed, including your blood thinner, unless told otherwise by your cardiology team.',
  ]],
  anticoag: ['Anticoagulation (apixaban)', [
    'Apixaban is a blood thinner that lowers the risk of stroke. Take it twice a day about 12 hours apart, with or without food. Do not skip doses and do not double a missed dose; if you miss a dose take it as soon as you remember the same day and resume your usual schedule.',
    'Bleeding precautions reviewed: use a soft toothbrush and electric razor, avoid aspirin, ibuprofen, naproxen and other NSAIDs unless approved, report black or bloody stools, blood in the urine, coughing or vomiting blood, nosebleeds that do not stop within 10 minutes, unusual bruising, or severe headache.',
    'Before any procedure, including colonoscopy and dental work, tell the team that you take apixaban. Do not stop apixaban on your own; the procedure team and cardiology will give you specific instructions about when to hold and when to restart it.',
  ]],
  hf: ['Heart failure self-care', [
    'Weigh yourself every morning after urinating and before breakfast, on the same scale, wearing similar clothing. Call the clinic for a weight gain of 3 pounds in one day or 5 pounds in one week, increased swelling in the legs or abdomen, needing more pillows to sleep, or waking up short of breath.',
    'Limit sodium to less than 2,000 mg per day. Read food labels, avoid canned soups, deli meats, frozen dinners and salty snacks. Fluid guidance was discussed; follow the amount your provider recommends.',
    'Stay active as tolerated with daily walking, pacing activities and resting when short of breath.',
  ]],
  ckd: ['Chronic kidney disease', [
    'Your kidneys filter waste and extra fluid from your blood. Kidney function is estimated from blood tests (creatinine and sometimes cystatin C) and urine tests. Different labs and methods can report somewhat different numbers.',
    'Protect your kidneys: avoid NSAIDs such as ibuprofen and naproxen, keep blood pressure at goal, stay hydrated unless told to limit fluids, and ask before starting any new supplement or over-the-counter medicine. Contrast dye for imaging should be discussed with your team first.',
    'Potassium: some of your medicines can raise potassium. Limit high potassium foods such as bananas, oranges, potatoes, tomatoes and salt substitutes containing potassium chloride, unless your provider tells you otherwise.',
  ]],
  colon: ['Colonoscopy preparation', [
    'Your colonoscopy is scheduled for 11/10/2026. You will need a driver to take you home; the procedure will be cancelled if you do not have a driver.',
    'Five days before: stop iron pills, fiber supplements and seeds, nuts, corn and popcorn. The day before: clear liquids only all day (water, clear broth, apple juice, white grape juice, plain gelatin, popsicles without red or purple color, black coffee or tea without milk). Nothing red or purple.',
    'At 5 PM the day before take bisacodyl 2 tablets. At 6 PM start drinking the PEG 3350 electrolyte solution, 8 ounces every 10 to 15 minutes until half the container is finished. Take simethicone as directed for bloating. Six hours before the procedure drink the remaining half. Nothing by mouth for 2 hours before arrival.',
    'Blood thinner: follow the hold instructions you receive from the GI and cardiology teams. Diabetes medicines: empagliflozin should be held for 3 days before the procedure.',
  ]],
  diet: ['Diet and lifestyle', [
    'A heart healthy, low sodium diet was discussed, including the DASH eating pattern with fruits, vegetables, whole grains and low fat dairy, with attention to potassium limits as noted for kidney disease. Limit alcohol. Maintain physical activity as tolerated, goal 150 minutes per week of moderate activity.',
    'Prediabetes: reduce sugar sweetened beverages and refined carbohydrates. Weight loss of 5 to 7 percent of body weight lowers the risk of progression to diabetes. MOVE! program offered.',
  ]],
};

// ---------- the notes ----------
const scr = (q, a) => [...wrap(q, '       ', '    '), `       Answer: ${a}`];
const NOTES = [
  {
    key: 'screening', time: '08:30', clinic: 'DEV PACT MD 4', clinicIen: '532', resourceIen: '185', title: 22,
    body: () => [
      'PRIMARY CARE GENERAL NOTE - PACT RN INTAKE AND ANNUAL SCREENING',
      `Visit date: ${DATE.slice(5, 7)}/${DATE.slice(8, 10)}/${DATE.slice(0, 4)}   Setting: PACT clinic, in person   Accompanied by: spouse`,
      ...header('Reason for visit'),
      ...para('Scheduled PACT RN intake prior to same-day cardiology, nephrology, gastroenterology and anticoagulation pharmacy visits. Annual clinical reminders due. Patient states he is here "for all my heart and kidney appointments."'),
      ...header('History (copied forward from prior PACT note)'),
      ...COPY_FORWARD.flatMap((t) => para(t)), ...encounterLog(),
      ...vitalsGrid(),
      ...header('Pain screening'),
      '  Pain present: yes?  Location: knees, "back sometimes"  Score today: 0/10',
      '  (patient reports 0 now, 4/10 at worst this week)  Acceptable level: 3/10',
      ...header('Depression screening - PHQ-2'),
      ...scr('1. Over the last 2 weeks, how often have you been bothered by little interest or pleasure in doing things?', 'Not at all (0)'),
      ...scr('2. Over the last 2 weeks, how often have you been bothered by feeling down, depressed, or hopeless?', 'Several days (1)'),
      '    PHQ-2 total score: 1. Screen negative. PHQ-9 not required.',
      ...header('Suicide risk screening - C-SSRS screener (past month)'),
      ...scr('1. Have you wished you were dead or wished you could go to sleep and not wake up?', 'No'),
      ...scr('2. Have you had any actual thoughts of killing yourself?', 'No'),
      ...scr('3. Have you been thinking about how you might do this?', 'Not asked (question 2 answered no)'),
      ...scr('4. Have you had these thoughts and had some intention of acting on them?', 'Not asked (question 2 answered no)'),
      ...scr('5. Have you started to work out or worked out the details of how to kill yourself? Do you intend to carry out this plan?', 'Not asked (question 2 answered no)'),
      ...scr('6. Have you ever done anything, started to do anything, or prepared to do anything to end your life? If yes, was this within the past 3 months?', 'No'),
      '    C-SSRS screener result: negative. Risk level: no identified risk.',
      '    Access to firearms: [ ] Yes [ ] No  (patient declined to answer)',
      '    Veterans Crisis Line information provided: Dial 988 then press 1.',
      ...header('Alcohol use screening - AUDIT-C'),
      ...scr('1. How often did you have a drink containing alcohol in the past year?', 'Monthly or less (1)'),
      ...scr('2. How many drinks containing alcohol did you have on a typical day when you were drinking?', '1 or 2 (0)'),
      ...scr('3. How often did you have six or more drinks on one occasion in the past year?', 'Never (0)'),
      '    AUDIT-C score: 1. Negative.',
      ...header('Fall risk screening'),
      ...scr('Have you fallen in the past 12 months?', '"Maybe once, I tripped" (unclear whether a fall)'),
      ...scr('Do you feel unsteady when standing or walking?', 'Sometimes after standing up quickly?'),
      ...scr('Do you worry about falling?', 'No'),
      '    Morse fall scale: 35 (moderate risk) - fall precautions education given.',
      ...header('Other screenings'),
      ...bullets([
        'Tobacco: former smoker, 30 pack-years, quit 1994. No current use of tobacco or nicotine products.',
        'Homelessness: lives in own home with spouse. Not at risk.',
        'Military sexual trauma: screened previously 10/01/1998, negative. Not repeated.',
        'Intimate partner violence: denies.',
        'Advance directive: none on file. Information offered, patient will "think about it."',
        'Nutrition: appetite fair? Reports eating "less salt now."',
      ]),
      ...ROS_TEMPLATE,
      ...problemBlock(),
      ...medBlock(),
      ...allergyBlock(),
      ...allLabGrids(),
      ...REMINDERS,
      ...educate([EDU.afib, EDU.anticoag, EDU.hf, EDU.ckd, EDU.diet]),
      ...header('Disposition'),
      ...para('Patient roomed and sent to cardiology clinic. Screening results routed to PACT provider. No urgent needs identified at intake.'),
      ...ATTEST,
    ],
  },
  {
    key: 'cardiology', time: '10:00', clinic: 'CARDIOLOGY', clinicIen: '195', resourceIen: '46', title: 1633,
    body: () => [
      'CARDIOLOGY NOTE - ATRIAL FIBRILLATION / POST CARDIOVERSION FOLLOW-UP',
      ...header('Chief complaint'),
      ...para('Follow-up after electrical cardioversion on 09/03/2026 for persistent atrial fibrillation; heart failure with mildly reduced ejection fraction; pulmonary hypertension; anticoagulation planning for colonoscopy 11/10/2026.'),
      ...header('History of present illness'),
      ...COPY_FORWARD.flatMap((t) => para(t)), ...encounterLog(),
      ...para(
        'INTERVAL HISTORY: As noted above, the patient underwent successful synchronized electrical cardioversion on 09/03/2026 with a single 200 J biphasic shock, converting to sinus rhythm. Amiodarone loading had been started 08/04/2026 for rhythm control. Apixaban was continued without interruption for more than three weeks before cardioversion and he was instructed to continue it for at least four weeks afterward and then indefinitely given CHA2DS2-VASc of 4.',
        'Today he reports that his breathing is "maybe a little better" since the cardioversion. He reports palpitations "once in a while," unclear whether these represent recurrent atrial fibrillation. He has not had syncope. He sleeps on two pillows, which may or may not be new. He notices swelling of the ankles at the end of the day "sometimes." He continues to take apixaban twice a day and states he has not missed doses, although his VA prescription expired in January and he has been using an outside pharmacy.',
        'He was seen by gastroenterology on 09/22/2026 for a positive FIT and is scheduled for colonoscopy on 11/10/2026. GI has requested cardiology input regarding holding apixaban for the procedure. Bowel preparation was dispensed 09/23/2026.',
        'Of note, he was previously in atrial fibrillation diagnosed 01/16/2025 at a cardiology visit with rate in the 110s, CHA2DS2-VASc 4, and was started on apixaban 5 mg twice a day, carvedilol 12.5 mg twice a day and losartan 50 mg daily. Prothrombin time at that time was 21.9 seconds. In 08/2026 he developed dyspnea on exertion and echocardiogram showed LVEF 40 to 45 percent with estimated RVSP 48 mmHg. Spironolactone was restarted 08/05/2026 for heart failure after having been stopped 06/03/2026 for potassium of 5.2.',
      ),
      ...header('Cardiac history (copied forward)'),
      ...bullets([
        'Atrial fibrillation, persistent, first documented 01/16/2025. CHA2DS2-VASc 4 (age 75 or older = 2, hypertension = 1, vascular disease = 1). HAS-BLED 2 (age, renal function?).',
        'Cardioversion 09/03/2026: TEE not performed (anticoagulated more than 3 weeks). Sedation by anesthesia. 200 J biphasic synchronized x1 with conversion to sinus rhythm at 62 bpm. No complications.',
        'Echocardiogram 08/2026: LVEF 40 to 45 percent, mild global hypokinesis, moderate left atrial enlargement (LA volume index 44 mL/m2), mild mitral regurgitation, estimated RVSP 48 mmHg, IVC 2.1 cm with less than 50 percent collapse.',
        'ECG 08/26/2026: atrial fibrillation with ventricular rate 88, QTc 452 ms, nonspecific ST-T changes.',
        'Coronary artery disease status post drug eluting stent to the mid LAD (remote, outside records not available). No angina.',
        'Hypertension since 2009. BP 147/76 on 08/26/2026 and 144/74 on video visit 10/19/2026.',
        'Hyperlipidemia: atorvastatin 40 mg expired 12/2025, not renewed?',
      ]),
      ...ROS_TEMPLATE,
      ...vitalsGrid(),
      ...EXAM_TEMPLATE,
      ...para('Exam addendum: rhythm sounds regular today? Trace bilateral ankle edema versus none. Lungs with few bibasilar crackles that may clear with cough.'),
      ...header('ECG today'),
      ...para('12 lead ECG obtained in clinic and reviewed: sinus rhythm with first degree AV block? PR 214 ms, rate 61, QRS 98 ms, QTc 468 ms. Compared with 08/26/2026, atrial fibrillation is no longer present.'),
      ...allLabGrids(),
      ...problemBlock(),
      ...medBlock(),
      ...allergyBlock(),
      ...header('Assessment'),
      ...numbered([
        'Persistent atrial fibrillation, status post successful DC cardioversion 09/03/2026, currently in sinus rhythm by ECG today. Amiodarone loading completed. Continue rhythm control strategy.',
        'Heart failure with mildly reduced ejection fraction (LVEF 40 to 45 percent), NYHA class II, possibly improved after restoration of sinus rhythm. Volume status: euvolemic versus mildly overloaded.',
        'Pulmonary hypertension, estimated RVSP 48 mmHg, likely group 2 related to left heart disease.',
        'Anticoagulation: CHA2DS2-VASc 4. Continue apixaban 5 mg twice a day. Dose reduction criteria reviewed: age less than 80, weight greater than 60 kg, creatinine 1.4 to 1.8 recently - meets at most one criterion, so 5 mg twice a day remains appropriate.',
        'Periprocedural anticoagulation for colonoscopy 11/10/2026: it has been more than 4 weeks since cardioversion. From a cardiac standpoint, apixaban may be held for 2 days before the procedure (last dose the morning of 11/07/2026?) and resumed 24 to 48 hours afterward if hemostasis is adequate, per GI. No bridging needed.',
        'Hypertension, above goal today.',
        'Coronary artery disease, stable, no angina.',
        'Chronic kidney disease, followed by nephrology.',
      ]),
      ...header('Plan'),
      ...numbered([
        'Continue apixaban 5 mg twice a day. Renew VA prescription today (expired 01/2026).',
        'Continue carvedilol 12.5 mg twice a day? Prescription expired 01/2026; patient unsure if still taking. Pharmacy to reconcile.',
        'Continue spironolactone 25 mg daily. Continue amlodipine 5 mg daily.',
        'Losartan: prescription expired 01/2026. Defer restart to nephrology given potassium.',
        'Repeat ECG and BMP in 4 weeks. Holter monitor for 48 hours to assess atrial fibrillation burden.',
        'Repeat echocardiogram in 3 months to reassess LVEF in sinus rhythm.',
        'Apixaban hold instructions for colonoscopy communicated to GI (see above).',
        'Daily weights, 2 g sodium diet, heart failure education provided.',
        'Return to cardiology clinic in 3 months, sooner as needed.',
      ]),
      ...educate([EDU.afib, EDU.anticoag, EDU.hf, EDU.diet]),
      ...ATTEST,
    ],
  },
  {
    key: 'cardiology-device', time: '11:30', clinic: 'CARDIOLOGY', clinicIen: '195', resourceIen: '46', title: 1633,
    body: () => [
      'CARDIOLOGY NOTE - RHYTHM CLINIC / AMBULATORY MONITOR ENCOUNTER',
      '',
      'Encounter type: [ ] New  [ ] Follow-up  [ ] Device check  [ ] Monitor placement',
      'Referring provider: ________________   Reason for referral: ________________',
      ...header('Monitor information'),
      '  Monitor type:       [ ] Holter 24h  [ ] Holter 48h  [ ] Event  [ ] Patch',
      '  Serial number:      ________________',
      '  Date placed:        ___/___/______    Expected return: ___/___/______',
      '  Lead placement:     [ ] Standard 3-channel  [ ] 12-lead',
      '  Skin prep:          [ ] Done  [ ] Not done',
      '  Diary given:        [ ] Yes  [ ] No',
      '  Patient instructed: [ ] Yes  [ ] No',
      ...header('Device information (if applicable)'),
      '  Device type:        [ ] PPM  [ ] ICD  [ ] CRT-P  [ ] CRT-D  [ ] ILR  [ ] None',
      '  Manufacturer:       ________________   Model: ________________',
      '  Implant date:       ___/___/______     Implanting MD: ________________',
      '  Battery status:     ________________   Longevity: ______ years',
      '  Underlying rhythm:  ________________   Pacing dependent: [ ] Yes [ ] No',
      '  Atrial lead:        Sensing ____ mV   Impedance ____ ohms  Threshold ____ V',
      '  RV lead:            Sensing ____ mV   Impedance ____ ohms  Threshold ____ V',
      '  LV lead:            Sensing ____ mV   Impedance ____ ohms  Threshold ____ V',
      '  Episodes since last check: ________________',
      '  Therapies delivered:       ________________',
      '  Programming changes:       ________________',
      ...header('Findings'),
      '  ***',
      ...header('Impression'),
      '  ***',
      ...header('Recommendations'),
      '  ***',
      '',
      ...para(
        'This encounter was opened for scheduling of ambulatory rhythm monitoring. Monitor placement will be documented in a separate note when completed. Please refer to the cardiology clinic note of the same date for clinical assessment and plan.',
        'RHYTHM CLINIC STANDARD INFORMATION: The rhythm clinic provides ambulatory cardiac monitoring, device interrogation and remote monitoring services for veterans followed by VA cardiology. Holter monitors record continuous ECG data for 24 to 48 hours. Event monitors and patch monitors may be worn for up to 30 days. Patients are instructed to keep a diary of symptoms and activities, to avoid getting the monitor wet unless it is a waterproof patch, to avoid magnets, metal detectors and electric blankets, and to return the monitor by mail or in person on the scheduled date. Results are typically available 7 to 14 days after the monitor is returned and are reviewed by a cardiologist.',
        'Remote monitoring: Veterans with implanted devices are enrolled in remote monitoring when eligible. Transmissions are reviewed by the rhythm clinic during business hours. Remote monitoring is not an emergency service. Patients with symptoms of chest pain, fainting, a shock from an ICD, or severe shortness of breath should call 911 or go to the nearest emergency department.',
        'Magnet and electromagnetic interference precautions: keep cell phones and headphones at least 6 inches from an implanted device, do not linger in store security gates, inform security staff at airports, and inform all providers before MRI, surgery with electrocautery, radiation therapy or lithotripsy.',
        'Contact information: rhythm clinic nurse line during business hours; after hours contact the VA nurse advice line. For emergencies call 911.',
      ),
      ...header('Documentation checklist'),
      '  [ ] Consent obtained       [ ] Monitor activated      [ ] Data transmitted',
      '  [ ] Results reviewed       [ ] Results communicated   [ ] Follow-up scheduled',
      '  [ ] Patient education      [ ] Diary returned         [ ] Monitor returned',
      '',
      'Electronically filed as a template. No clinical findings documented at this encounter.',
    ],
  },
  {
    key: 'nephrology', time: '13:00', clinic: 'HEMODIALYSIS - MIKEB', clinicIen: '257', resourceIen: '85', title: 7226,
    body: () => [
      'NEPHROLOGY CLINIC NOTE - CHRONIC KIDNEY DISEASE FOLLOW-UP (NOT ON DIALYSIS)',
      ...para('Note: filed under the renal service title. The patient is NOT on dialysis and has no dialysis access.'),
      ...header('Reason for visit'),
      ...para('Follow-up of chronic kidney disease, hyperkalemia risk on spironolactone, and fluctuating creatinine in the setting of new heart failure, empagliflozin and recent cardioversion.'),
      ...header('History of present illness'),
      ...COPY_FORWARD.flatMap((t) => para(t)), ...encounterLog(),
      ...para(
        'RENAL HISTORY: Creatinine has ranged from 1.2 to 1.8 mg/dL over the past two years. Chronic kidney disease was added to the problem list 07/25/2026. Renal ultrasound 10/29/2025 showed kidneys of 9.8 and 10.1 cm with mildly increased echogenicity, no hydronephrosis, no stones. Urinalysis has shown trace to 1+ protein in 2025, negative since, and glucosuria 3+ since starting empagliflozin. No hematuria.',
        'ESTIMATED GFR, by source and method, as available in the record and outside records:',
      ),
      ...bullets([
        'VA lab, creatinine-based CKD-EPI: 53 mL/min/1.73m2 on 08/26/2026; 50 on 07/21/2026; 47 on 06/03/2026; 39 on 04/30/2026; 49 on 02/12/2026; 66 on 12/09/2025.',
        'Outside hospital (cardioversion admission 09/03/2026), creatinine 1.6, eGFR reported as 41 mL/min/1.73m2 (method not stated).',
        'Send-out reference laboratory 09/30/2026: eGFR 24 mL/min/1.73m2 (MDRD?).',
        'CKD-EPI creatinine-cystatin C 10/02/2026: cystatin C 1.92 mg/L, eGFR 31 mL/min/1.73m2.',
        'Cockcroft-Gault creatinine clearance estimated 49 mL/min using actual body weight.',
        'Urine albumin to creatinine ratio: 38 mg/g on 10/02/2026 (outside).',
      ]),
      '',
      ...para(
        'Today he reports nocturia two to three times nightly, unclear whether this is new or related to empagliflozin. He denies? dysuria. He reports ankle swelling "sometimes." He avoids NSAIDs but took ibuprofen "a few times" for knee pain last month. He uses a salt substitute "now and then."',
        'Potassium was 5.2 on 06/03/2026 when spironolactone was stopped, 4.7 on 07/21/2026, and 5.1 on 08/26/2026 after spironolactone was restarted 08/05/2026. Losartan prescription expired in 01/2026.',
      ),
      ...ROS_TEMPLATE,
      ...vitalsGrid(),
      ...EXAM_TEMPLATE,
      ...header('Laboratory data (pasted from CPRS cumulative report)'),
      ...labGrid('CHEMISTRY', CHEM),
      ...uaGrid(),
      ...labGrid('HEMATOLOGY', CBC),
      ...labGrid('HEPATIC', HEP),
      ...labGrid('OTHER', OTHER),
      '',
      '  Outside / send-out results (not in VA lab package):',
      `  ${pad('Date', 12)}${pad('Test', 30)}${pad('Result', 12)}Lab`,
      `  ${pad('09/03/2026', 12)}${pad('Creatinine', 30)}${pad('1.6 mg/dL', 12)}Outside hospital`,
      `  ${pad('09/03/2026', 12)}${pad('eGFR', 30)}${pad('41', 12)}Outside hospital`,
      `  ${pad('09/03/2026', 12)}${pad('Potassium', 30)}${pad('4.9 meq/L', 12)}Outside hospital`,
      `  ${pad('09/30/2026', 12)}${pad('eGFR', 30)}${pad('24', 12)}Reference lab`,
      `  ${pad('10/02/2026', 12)}${pad('Cystatin C', 30)}${pad('1.92 mg/L', 12)}Reference lab`,
      `  ${pad('10/02/2026', 12)}${pad('eGFR (CKD-EPI Cr-Cys)', 30)}${pad('31', 12)}Reference lab`,
      `  ${pad('10/02/2026', 12)}${pad('Urine albumin/creatinine', 30)}${pad('38 mg/g', 12)}Reference lab`,
      `  ${pad('10/02/2026', 12)}${pad('PTH, intact', 30)}${pad('88 pg/mL H', 12)}Reference lab`,
      `  ${pad('10/02/2026', 12)}${pad('25-OH vitamin D', 30)}${pad('21 ng/mL L', 12)}Reference lab`,
      `  ${pad('10/02/2026', 12)}${pad('Phosphorus', 30)}${pad('4.1 mg/dL', 12)}Reference lab`,
      ...problemBlock(),
      ...medBlock(),
      ...allergyBlock(),
      ...allLabGrids(),
      ...header('Assessment'),
      ...numbered([
        'Chronic kidney disease stage G3a versus G3b, A2. Creatinine 1.4 mg/dL, eGFR 53 on 08/26/2026. Etiology likely hypertensive and cardiorenal.',
        'Hyperkalemia risk: potassium 5.1 on spironolactone. Salt substitute use and intermittent NSAID use reported.',
        'Glucosuria, expected with empagliflozin.',
        'Secondary hyperparathyroidism? PTH 88 with low vitamin D.',
        'Anemia, hemoglobin 12.7, followed by GI for positive FIT.',
        'Heart failure with mildly reduced ejection fraction, followed by cardiology.',
      ]),
      ...header('Plan'),
      ...numbered([
        'Continue empagliflozin 10 mg daily for kidney and heart protection. Hold 3 days before colonoscopy.',
        'Continue spironolactone 25 mg daily for now. Stop salt substitute. Low potassium diet education provided.',
        'Do not restart losartan at this time.',
        'Avoid NSAIDs. Acetaminophen up to 3 g per day for knee pain.',
        'Start cholecalciferol 2,000 units daily.',
        'Repeat BMP, magnesium, phosphorus and urine albumin to creatinine ratio in 4 weeks, and before colonoscopy.',
        'Return to nephrology clinic in 3 months.',
      ]),
      ...educate([EDU.ckd, EDU.hf, EDU.diet]),
      ...ATTEST,
    ],
  },
  {
    key: 'gi', time: '14:00', clinic: 'DEV PACT MD 4', clinicIen: '532', resourceIen: '185', title: 6,
    body: () => [
      'GI CLINIC NOTE - POSITIVE FIT, PRE-COLONOSCOPY FOLLOW-UP',
      ...header('Reason for visit'),
      ...para('Pre-procedure follow-up for diagnostic colonoscopy scheduled 11/10/2026 for positive fecal immunochemical test (07/21/2026) and mild normocytic anemia, on chronic anticoagulation with apixaban.'),
      ...header('History of present illness'),
      ...COPY_FORWARD.flatMap((t) => para(t)), ...encounterLog(),
      ...para(
        'GI HISTORY: FIT was positive on 07/21/2026 (ordered as part of routine colorectal cancer screening). He was first seen in GI clinic on 09/22/2026 where the indication and risks of colonoscopy were discussed, and colonoscopy was scheduled for 11/10/2026. Bowel preparation with PEG 3350 and electrolytes, bisacodyl and simethicone was dispensed 09/23/2026. He has never had a colonoscopy. No family history of colorectal cancer known (adopted?).',
        'Today he denies abdominal pain? He reports intermittent reflux, controlled. He has noticed "dark stools a couple of times," unclear whether melena; he is not taking iron or bismuth. No bright red blood per rectum. Appetite fair. Weight has been stable to slightly down (206 lb in 12/2024, 199 lb now).',
        'Hemoglobin has drifted from 13.8 in 12/2024 to a low of 11.2 in 04/2025 and was 12.7 on 08/26/2026. RDW has risen steadily from 45 to 57.8. MCV remains normal to slightly high. Iron studies have not been checked.',
        'ANTICOAGULATION: on apixaban 5 mg twice a day for atrial fibrillation (CHA2DS2-VASc 4), status post cardioversion 09/03/2026. Cardiology note of the same date addresses holding apixaban for the procedure. Spironolactone and empagliflozin per cardiology and nephrology.',
      ),
      ...ROS_TEMPLATE,
      ...vitalsGrid(),
      ...EXAM_TEMPLATE,
      ...header('Laboratory data (copied from CPRS)'),
      ...labGrid('HEMATOLOGY', CBC),
      ...labGrid('DIFFERENTIAL', DIFF),
      ...labGrid('CHEMISTRY', CHEM),
      ...labGrid('HEPATIC', HEP),
      ...labGrid('OTHER', OTHER),
      ...problemBlock(),
      ...medBlock(),
      ...allergyBlock(),
      ...allLabGrids(),
      ...header('Assessment'),
      ...numbered([
        'Positive fecal immunochemical test 07/21/2026. Diagnostic colonoscopy indicated and scheduled 11/10/2026.',
        'Mild anemia with rising RDW. Possible iron deficiency from occult GI blood loss versus anemia of chronic kidney disease.',
        'Possible melena, unclear history. Hemodynamically stable.',
        'Chronic anticoagulation with apixaban for atrial fibrillation; periprocedural plan coordinated with cardiology.',
        'GERD, controlled.',
        'Elevated ALT 70 on 06/10/2025, subsequently normal.',
      ]),
      ...header('Plan'),
      ...numbered([
        'Colonoscopy 11/10/2026 with moderate sedation, confirmed. Driver arranged (spouse).',
        'Hold apixaban 2 days before the procedure per cardiology; last dose 11/07/2026 evening? Resume 24 to 48 hours after the procedure if no high-risk polypectomy, per endoscopist.',
        'Hold empagliflozin 3 days before the procedure per nephrology.',
        'Iron studies, ferritin, B12, folate and repeat CBC before the procedure.',
        'Split-dose PEG 3350 bowel preparation as dispensed 09/23/2026, with bisacodyl and simethicone; written instructions given again today.',
        'If black stools continue, dizziness, or bleeding occurs, go to the emergency department.',
        'Return to GI clinic after the colonoscopy to review pathology.',
      ]),
      ...educate([EDU.colon, EDU.anticoag, EDU.diet]),
      ...ATTEST,
    ],
  },
  {
    key: 'anticoag', time: '15:30', clinic: 'DEV PACT MD 4', clinicIen: '532', resourceIen: '185', title: 1990,
    body: () => [
      'ANTICOAGULATION INTERIM NOTE - CLINICAL PHARMACIST PRACTITIONER',
      ...header('Reason for visit'),
      ...para('DOAC monitoring visit, medication reconciliation after cardioversion, and periprocedural anticoagulation planning for colonoscopy 11/10/2026.'),
      ...header('Background (copied forward)'),
      ...COPY_FORWARD.flatMap((t) => para(t)), ...encounterLog(),
      ...header('Medication fill and change history (from pharmacy package and patient report)'),
      ...bullets([
        '12/11/2024  ATORVASTATIN 40MG TAB  #90  issued, filled window.',
        '01/16/2025  APIXABAN 5MG TAB  1 tab BID  issued, filled window.',
        '01/16/2025  CARVEDILOL 12.5MG TAB  1 tab BID  issued, filled window.',
        '01/16/2025  LOSARTAN 50MG TAB  1 tab daily  issued, filled window.',
        '12/12/2025  ATORVASTATIN 40MG TAB  expired, not renewed.',
        '01/17/2026  APIXABAN 5MG TAB  expired. No renewal on file.',
        '01/17/2026  CARVEDILOL 12.5MG TAB  expired. No renewal on file.',
        '01/17/2026  LOSARTAN 50MG TAB  expired. No renewal on file.',
        '02/2026     APIXABAN  patient reports filling at community pharmacy (receipt not seen).',
        '03/20/2026  DUPILUMAB 300MG/2ML  discontinued by dermatology.',
        '04/14/2026  FEXOFENADINE TAB  issued.',
        '04/30/2026  EMPAGLIFLOZIN 10MG TAB  started (outside fill).',
        '05/14/2026  CLOBETASOL 0.05% SOLN  issued; later marked stopped.',
        '06/03/2026  SPIRONOLACTONE 25MG TAB  issued and stopped same visit? (K 5.2).',
        '06/04/2026  GABAPENTIN 300MG CAP  issued.',
        '08/04/2026  AMLODIPINE 5MG TAB  issued.',
        '08/04/2026  AMIODARONE 200MG TAB  loading started (outside fill).',
        '08/05/2026  SPIRONOLACTONE 25MG TAB  issued again.',
        '08/28/2026  CLOBETASOL 0.05% SOLN  issued again.',
        '09/01/2026  AMIODARONE  course completed per patient.',
        '09/03/2026  APIXABAN  "did not stop" for cardioversion per patient.',
        '09/23/2026  PEG 3350/ELECTROLYTES  issued for colonoscopy prep.',
        '09/23/2026  BISACODYL 5MG EC TAB, SIMETHICONE 80MG  dispensed (outside).',
        '10/2026     CARVEDILOL  patient "thinks" he still takes it, has pills at home.',
        '10/2026     LOSARTAN  patient unsure, may have stopped in spring.',
      ]),
      ...medBlock(),
      ...allergyBlock(),
      ...header('DOAC assessment'),
      '  Indication:              Atrial fibrillation (nonvalvular)',
      '  CHA2DS2-VASc:            4      HAS-BLED: 2',
      '  Current regimen:         Apixaban 5 mg PO BID',
      '  Dose-reduction criteria (2 of 3 needed for 2.5 mg BID):',
      '    Age 80 or older:            [ ] Yes [X] No  (76)',
      '    Weight 60 kg or less:       [ ] Yes [X] No  (90.4 kg)',
      '    Serum creatinine 1.5+:      [X] Yes? [ ] No  (1.4 on 08/26, 1.5 on 07/21)',
      '  Interacting drugs:       Amiodarone (P-gp inhibitor, course completed?)',
      '                           Spironolactone + potassium (hyperkalemia, not DOAC)',
      '                           NSAIDs: occasional ibuprofen reported - counseled',
      '  Adherence:               Reports no missed doses. Pill count not done.',
      '  Bleeding:                "Dark stools a couple of times" - unclear',
      '  Falls:                   ?1 trip in past year',
      '  CBC:                     Hgb 12.7 (08/26/2026), Plt 177',
      '  Renal:                   CrCl approx 49 mL/min (Cockcroft-Gault)',
      '  Hepatic:                 ALT 13, AST 27 (08/26/2026); ALT 70 on 06/10/2025',
      ...labGrid('CHEMISTRY', CHEM),
      ...labGrid('HEMATOLOGY', CBC),
      ...header('Periprocedural plan for colonoscopy 11/10/2026'),
      ...para('Procedure bleeding risk: low to moderate (possible polypectomy). CrCl greater than 30 mL/min. Per cardiology note of today: hold apixaban 2 days before (last dose 11/07/2026?), no bridging, resume 24 to 48 hours after if hemostasis adequate per endoscopist.'),
      `  ${pad('Date', 14)}${pad('Morning dose', 18)}Evening dose`,
      `  ${pad('11/07/2026', 14)}${pad('Take', 18)}Take? / Hold?`,
      `  ${pad('11/08/2026', 14)}${pad('Hold', 18)}Hold`,
      `  ${pad('11/09/2026', 14)}${pad('Hold', 18)}Hold`,
      `  ${pad('11/10/2026', 14)}${pad('Hold (procedure)', 18)}Hold`,
      `  ${pad('11/11/2026', 14)}${pad('Resume? per GI', 18)}Resume per GI`,
      ...allLabGrids(),
      ...header('Assessment and plan'),
      ...numbered([
        'Apixaban 5 mg BID appropriate. VA prescription renewed today, 90 day supply by mail.',
        'Carvedilol and losartan: expired 01/2026, adherence unclear. Message sent to cardiology and nephrology to clarify.',
        'Atorvastatin expired 12/2025: message sent to PACT provider.',
        'Spironolactone: active; potassium 5.1. Nephrology following.',
        'Amiodarone: completed per patient; not on VA profile. Interaction with apixaban no longer applicable if completed.',
        'Periprocedural apixaban calendar given to patient and spouse (above).',
        'Follow-up anticoagulation phone call in 4 weeks and after colonoscopy.',
      ]),
      ...educate([EDU.anticoag, EDU.afib, EDU.colon]),
      ...ATTEST,
    ],
  },
];

async function main() {
  const book = process.argv.includes('--book');
  const createAppointment = book ? require('../../src/appointmentCreator').createAppointment : null;
  const dir = path.join(ROOT, 'output', 'ready');
  for (const n of NOTES) {
    const id = `${DFN}-${DATE}-${n.key}`;
    const fm = filemanDateTime(DATE, n.time);
    const text = n.body().map((l) => l.replace(/[^\x20-\x7E]/g, '')).join('\n');
    const visitString = buildVisitString({ clinicIen: n.clinicIen, filemanDateTime: fm, type: 'A' });
    writeNote(dir, id, {
      noteText: text, dfn: DFN, date: DATE, visitString, noteTitleIen: n.title, locationIen: n.clinicIen,
      duz: config.duz(), fmDateTime: fm, flagged: false, flagReasons: [], generatedAt: new Date().toISOString(),
    });
    console.log(`${id.padEnd(36)} title ${String(n.title).padEnd(5)} ${n.clinic.padEnd(22)} ${n.time}  ${text.split('\n').length} lines, ${text.length} chars`);
    if (book) {
      const r = await createAppointment({ dfn: DFN, date: DATE, time: n.time, clinicIen: n.clinicIen, resourceIen: n.resourceIen, clinicName: n.clinic });
      console.log(`  BOOKED requestIen=${r.requestIen} appointmentIen=${r.appointmentIen}`);
    }
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
