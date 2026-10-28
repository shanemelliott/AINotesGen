// Builds a fully synthetic Synthea-style FHIR transaction bundle for a 76-year-old male with persistent
// atrial fibrillation (cardioversion), CKD with anemia, hypertension, hyperlipidemia, prediabetes,
// atopic dermatitis and a positive FIT under GI work-up. Used to test AI summarization.
// Usage: node patient.js build-test-patient [template-bundle.json] [out.json]
// The template bundle only supplies the Patient shape and the (synthetic) clinic/practitioner references.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// A load is one-time per patient (the SSN must be new), so a reload needs a new identity here.
const GIVEN = 'Calder518';
const FAMILY = 'Rourke77';
const PID = 'b84e2a61-7c3d-4f90-a2e5-6d1c09f3b7a4';
const SSN = '999-00-5283';

const TEMPLATE = process.argv[2] || 'SynthiaFiles/Andre610_Corina534_Carter549_7a3ac8b5-2b1c-ca7e-c003-d26f13438cd2.json';
const OUT = process.argv[3] || `SynthiaFiles/${GIVEN}_${FAMILY}_${PID}.json`;

const tpl = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'));
const uuid = () => crypto.randomUUID();
const PREF = `urn:uuid:${PID}`;
const entries = [];
const add = (resource, type) => {
  resource.id = resource.id || uuid();
  entries.push({ fullUrl: `urn:uuid:${resource.id}`, resource, request: { method: 'POST', url: type || resource.resourceType } });
  return resource;
};

// Patient: reuse the template's structure, replace every personal field.
const patient = JSON.parse(JSON.stringify(tpl.entry.find((e) => e.resource.resourceType === 'Patient').resource));
patient.id = PID;
patient.text.div = '<div xmlns="http://www.w3.org/1999/xhtml">Fictional test patient. Generated for AI summary testing.</div>';
patient.gender = 'male';
patient.birthDate = '1950-04-12';
delete patient.deceasedDateTime;
delete patient.multipleBirthBoolean;
patient.name = [{ use: 'official', family: FAMILY, given: [GIVEN], prefix: ['Mr.'] }];
patient.maritalStatus = { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-MaritalStatus', code: 'M', display: 'Married' }], text: 'Married' };
patient.extension = patient.extension.filter((x) => !/mothersMaidenName|synthea\/(disability|quality)/.test(x.url));
patient.extension.find((x) => /birthsex/.test(x.url)).valueCode = 'M';
patient.identifier = [
  { system: 'https://github.com/synthetichealth/synthea', value: PID },
  {
    type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR', display: 'Medical Record Number' }], text: 'Medical Record Number' },
    system: 'http://hospital.smarthealthit.org', value: PID,
  },
  {
    type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'SS', display: 'Social Security Number' }], text: 'Social Security Number' },
    system: 'http://hl7.org/fhir/sid/us-ssn', value: SSN,
  },
];
patient.telecom = [{ system: 'phone', value: '555-010-0176', use: 'home' }];
patient.address = [{ line: ['100 Example Lane'], city: 'Franklin', state: 'MA', postalCode: '02038', country: 'US' }];
add(patient);

// Clinic and practitioner references come from the template's ambulatory encounters (all synthetic).
const tplEnc = tpl.entry.map((e) => e.resource).filter((r) => r.resourceType === 'Encounter' && r.class.code === 'AMB');
const clinic = tplEnc.find((e) => e.location[0].location.display === 'Fitchburg Outpatient Clinic') || tplEnc[0];
const loc = clinic.location[0].location;
const org = clinic.serviceProvider;
const practitioners = [...new Map(tplEnc.map((e) => [e.participant[0].individual.reference, e.participant[0].individual])).values()].slice(0, 6);
const prac = (i) => practitioners[i % practitioners.length];

const ENC_TYPES = {
  pcp: ['185349003', 'Encounter for check up (procedure)', 'AMB'],
  follow: ['390906007', 'Follow-up encounter (procedure)', 'AMB'],
  consult: ['11429006', 'Consultation (procedure)', 'AMB'],
  tele: ['185317003', 'Telephone encounter (procedure)', 'AMB'],
  video: ['448337001', 'Telemedicine consultation with patient (procedure)', 'AMB'],
  proc: ['33879002', 'Administration of vaccine to produce active immunity (procedure)', 'AMB'],
  surg: ['410620009', 'Cardioversion encounter (procedure)', 'AMB'],
};
const encByDate = {};
const iso = (d, h = 9) => `${d}T${String(h).padStart(2, '0')}:00:00+00:00`;
function enc(date, kind = 'pcp', pi = 0, hour = 9) {
  const key = `${date}|${kind}`;
  if (encByDate[key]) return encByDate[key];
  const [code, display, cls] = ENC_TYPES[kind];
  const r = add({
    resourceType: 'Encounter',
    meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-encounter'] },
    status: 'finished',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: cls },
    type: [{ coding: [{ system: 'http://snomed.info/sct', code, display }], text: display }],
    subject: { reference: PREF, display: `Mr. ${GIVEN} ${FAMILY}` },
    participant: [{
      type: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'PPRF', display: 'primary performer' }], text: 'primary performer' }],
      period: { start: iso(date, hour), end: iso(date, hour + 1) },
      individual: prac(pi),
    }],
    period: { start: iso(date, hour), end: iso(date, hour + 1) },
    location: [{ location: loc }],
    serviceProvider: org,
  });
  encByDate[key] = r;
  return r;
}
const eref = (e) => ({ reference: `urn:uuid:${e.id}` });
const nearest = (date) => {
  const t = Date.parse(date);
  return Object.values(encByDate).sort((a, b) => Math.abs(Date.parse(a.period.start) - t) - Math.abs(Date.parse(b.period.start) - t))[0];
};

// Encounter timeline (primary care, cardiology, EP, nephrology, GI, dermatology, pharmacy, eye screening).
const TIMELINE = [
  ['2024-12-10', 'pcp', 0], ['2024-12-11', 'follow', 0], ['2025-01-16', 'consult', 1], ['2025-02-12', 'follow', 0],
  ['2025-03-14', 'pcp', 0], ['2025-04-08', 'consult', 2], ['2025-06-10', 'pcp', 0], ['2025-09-09', 'pcp', 0],
  ['2025-10-29', 'proc', 0], ['2025-11-04', 'pcp', 0], ['2025-12-09', 'pcp', 0], ['2026-02-12', 'pcp', 0],
  ['2026-03-20', 'consult', 3], ['2026-04-14', 'consult', 4], ['2026-04-30', 'consult', 1], ['2026-06-03', 'pcp', 0],
  ['2026-06-04', 'follow', 0], ['2026-07-21', 'tele', 3], ['2026-07-22', 'tele', 5], ['2026-07-25', 'pcp', 0],
  ['2026-08-04', 'consult', 1], ['2026-08-05', 'follow', 0], ['2026-08-17', 'tele', 2], ['2026-08-21', 'tele', 1],
  ['2026-08-26', 'consult', 2], ['2026-09-03', 'surg', 1], ['2026-09-22', 'consult', 5], ['2026-10-19', 'video', 4],
];
TIMELINE.forEach(([d, k, p]) => enc(d, k, p));

// Conditions (problem list).
const sct = (code, display) => ({ coding: [{ system: 'http://snomed.info/sct', code, display }], text: display });
const PROBLEMS = [
  ['2024-12-11', '714628002', 'Prediabetes (finding)'],
  ['2024-12-11', '234347009', 'Anemia of chronic disease (disorder)'],
  ['2024-12-11', '24079001', 'Atopic dermatitis (disorder)'],
  ['2024-12-11', '59621000', 'Essential hypertension (disorder)', '2009-06-15'],
  ['2024-12-11', '49436004', 'Atrial fibrillation (disorder)'],
  ['2024-12-11', '235595009', 'Gastroesophageal reflux disease (disorder)', '2013-02-20'],
  ['2024-12-11', '372244006', 'Malignant melanoma (disorder)'],
  ['2024-12-11', '193462001', 'Insomnia (disorder)'],
  ['2024-12-11', '233970002', 'Coronary artery stent present (finding)'],
  ['2025-04-08', '735442002', 'Acquired eosinophilia (disorder)'],
  ['2026-07-25', '55822004', 'Hyperlipidemia (disorder)'],
  ['2026-07-25', '709044004', 'Chronic kidney disease (disorder)'],
  ['2026-08-04', '84114007', 'Heart failure (disorder)'],
  ['2026-08-04', '70995007', 'Pulmonary hypertension (disorder)'],
  ['2026-09-22', '389076003', 'Positive fecal immunochemical test (finding)'],
];
// An optional 4th field is the onset date. The loader picks the ICD-9 map for onsets before 2015-10-01;
// hypertension (ICD-10 I10) and GERD (K21.0) only file through their ICD-9 codes on dev.
PROBLEMS.forEach(([d, code, display, onset]) => {
  add({
    resourceType: 'Condition',
    meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns'] },
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
    verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }] },
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'problem-list-item', display: 'Problem List Item' }] }],
    code: sct(code, display),
    subject: { reference: PREF },
    encounter: eref(nearest(d)),
    onsetDateTime: iso(onset || d),
    recordedDate: iso(d),
  });
});

// Allergies (rash to cephalosporin and penicillin classes).
[['2231', 'cephalexin'], ['723', 'amoxicillin']].forEach(([code, name]) => add({
  resourceType: 'AllergyIntolerance',
  meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-allergyintolerance'] },
  clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }] },
  verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification', code: 'confirmed' }] },
  type: 'allergy',
  category: ['medication'],
  criticality: 'low',
  code: { coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code, display: name }], text: name },
  patient: { reference: PREF },
  recordedDate: iso('2024-12-10'),
  reaction: [{ manifestation: [sct('271807003', 'Skin rash (finding)')], severity: 'mild' }],
}));

// Observations.
const LOINC = (code, display) => ({ coding: [{ system: 'http://loinc.org', code, display }], text: display });
const q = (value, unit) => ({ value, unit, system: 'http://unitsofmeasure.org', code: unit });
function obs(date, cat, code, display, value, extra = {}) {
  const e = nearest(date);
  const o = {
    resourceType: 'Observation',
    meta: { profile: [`http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-${cat === 'vital-signs' ? 'vital-signs' : 'lab'}`] },
    status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: cat, display: cat === 'vital-signs' ? 'Vital signs' : 'Laboratory' }] }],
    code: LOINC(code, display),
    subject: { reference: PREF },
    encounter: eref(e),
    effectiveDateTime: iso(date),
    issued: iso(date).replace('+00:00', '.168+00:00'),
    ...extra,
  };
  if (Array.isArray(value)) o.valueCodeableConcept = sct(value[0], value[1]);
  else if (typeof value === 'string') o.valueString = value;
  else if (value) o.valueQuantity = value;
  return add(o);
}

// Vitals at every encounter that is not a phone contact.
let seed = 4172;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const vitalDates = TIMELINE.filter(([, k]) => k !== 'tele').map(([d]) => d);
const FORCED_BP = { '2024-12-10': [145, 86], '2026-08-26': [147, 76], '2026-10-19': [144, 74] };
vitalDates.forEach((d, i) => {
  const f = vitalDates.length > 1 ? i / (vitalDates.length - 1) : 0;
  const [sys, dia] = FORCED_BP[d] || [Math.round(122 + rnd() * 26), Math.round(68 + rnd() * 16)];
  obs(d, 'vital-signs', '85354-9', 'Blood pressure panel with all children optional', null, {
    component: [
      { code: LOINC('8480-6', 'Systolic Blood Pressure'), valueQuantity: q(sys, 'mm[Hg]') },
      { code: LOINC('8462-4', 'Diastolic Blood Pressure'), valueQuantity: q(dia, 'mm[Hg]') },
    ],
  });
  obs(d, 'vital-signs', '8867-4', 'Heart rate', q(Math.round(64 - 6 * f + rnd() * 6), '/min'));
  obs(d, 'vital-signs', '9279-1', 'Respiratory rate', q(15 + Math.round(rnd()), '/min'));
  obs(d, 'vital-signs', '8331-1', 'Oral temperature', q(+(36.4 + rnd() * 0.3).toFixed(1), 'Cel'));
  obs(d, 'vital-signs', '59408-5', 'Oxygen saturation in Arterial blood by Pulse oximetry', q(99 + Math.round(rnd()), '%'));
  obs(d, 'vital-signs', '72514-3', 'Pain severity - 0-10 verbal numeric rating [Score] - Reported', q(0, '{score}'));
  obs(d, 'vital-signs', '29463-7', 'Body Weight', q(+(93.3 - 3.3 * f + rnd() * 0.6).toFixed(1), 'kg'));
  if (i % 5 === 0) obs(d, 'vital-signs', '8302-2', 'Body Height', q(182.9, 'cm'));
});

// Lab panels: one DiagnosticReport per panel with its Observations as results.
function panel(date, loincPanel, panelName, rows) {
  const e = nearest(date);
  const results = rows.filter((r) => r[3] !== undefined && r[3] !== null).map(([code, display, unit, val, flag]) => {
    const o = obs(date, 'laboratory', code, display, typeof val === 'string' || Array.isArray(val) ? val : q(val, unit), flag ? { interpretation: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: flag }] }] } : {});
    return { reference: `urn:uuid:${o.id}`, display };
  });
  add({
    resourceType: 'DiagnosticReport',
    meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-diagnosticreport-lab'] },
    status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB', display: 'Laboratory' }] }],
    code: LOINC(loincPanel, panelName),
    subject: { reference: PREF },
    encounter: eref(e),
    effectiveDateTime: iso(date),
    issued: iso(date).replace('+00:00', '.168+00:00'),
    performer: [org],
    result: results,
  });
}

const CBC_DATES = ['2024-12-10', '2025-01-16', '2025-02-12', '2025-03-14', '2025-04-08', '2025-06-10', '2025-09-09', '2025-11-04', '2025-12-09', '2026-02-12', '2026-07-21', '2026-08-26'];
const CBC = {
  wbc: [15.52, 9.1, 8.2, 7.6, 10.4, 6.8, 6.1, 7.2, 8.9, 5.91, 7.0, 7.41],
  rbc: [4.4, 4.5, 4.35, 4.2, 3.9, 4.1, 4.0, 3.55, 4.0, 4.2, 4.3, 4.22],
  hgb: [13.8, 13.2, 12.9, 12.6, 11.2, 12.4, 12.0, 11.6, 12.2, 12.5, 12.9, 12.7],
  mcv: [95, 94, 96, 99.2, 93, 94, 95, 96, 94, 95, 94.5, 94.8],
  rdw: [45.1, 46, 47, 48, 50, 51, 52, 54, 55, 56, 57, 57.8],
  plt: [253, 210, 190, 180, 126, 150, 160, 165, 170, 175, 180, 177],
  mpv: [10.4, 10.6, 10.8, 11.9, 10.5, 10.7, 10.9, 11.2, 11.0, 10.8, 10.9, 10.8],
  neut: [11.84, 5.4, 4.9, 4.5, 6.3, 3.8, 3.4, 4.0, 5.0, 2.97, 4.0, 4.25],
  lymph: [1.23, 1.1, 1.0, 0.9, 0.64, 0.8, 0.8, 0.7, 0.9, 0.85, 0.9, 0.86],
  mono: [1.45, 1.0, 0.9, 0.85, 1.2, 0.8, 0.7, 0.65, 1.0, 0.9, 1.1, 1.04],
  eos: [1.89, 1.5, 1.3, 1.2, 1.6, 1.0, 0.9, 0.61, 1.1, 0.95, 1.2, 1.02],
  baso: [0.28, 0.2, 0.18, 0.15, 0.25, 0.1, 0.07, 0.12, 0.2, 0.18, 0.2, 0.22],
};
const hl = (v, lo, hi) => (v < lo ? 'L' : v > hi ? 'H' : undefined);
// The differential is sent as percentages: file #60 has no absolute neutrophil, lymphocyte, monocyte or
// basophil test. The absolute eosinophil count maps (EOSINO, ABSOLUTE) and is kept.
CBC_DATES.forEach((d, i) => {
  const hgb = CBC.hgb[i];
  const hct = +(hgb * 3.15).toFixed(1);
  const pct = (v) => +((v / CBC.wbc[i]) * 100).toFixed(1);
  const neutPct = pct(CBC.neut[i]);
  const lymphPct = pct(CBC.lymph[i]);
  const monoPct = pct(CBC.mono[i]);
  const basoPct = pct(CBC.baso[i]);
  panel(d, '58410-2', 'CBC panel - Blood by Automated count', [
    ['6690-2', 'Leukocytes [#/volume] in Blood by Automated count', '10*3/uL', CBC.wbc[i], hl(CBC.wbc[i], 4, 10)],
    ['789-8', 'Erythrocytes [#/volume] in Blood by Automated count', '10*6/uL', CBC.rbc[i], hl(CBC.rbc[i], 4.4, 5.7)],
    ['718-7', 'Hemoglobin [Mass/volume] in Blood', 'g/dL', hgb, hl(hgb, 13.5, 17.5)],
    ['4544-3', 'Hematocrit [Volume Fraction] of Blood by Automated count', '%', hct, hl(hct, 40, 53)],
    ['787-2', 'MCV [Entitic mean volume] in Red Blood Cells by Automated count', 'fL', CBC.mcv[i]],
    ['785-6', 'MCH [Entitic mass] by Automated count', 'pg', +((hgb / CBC.rbc[i]) * 10).toFixed(1)],
    ['786-4', 'MCHC [Entitic Mass/volume] in Red Blood Cells by Automated count', 'g/dL', +((hgb / hct) * 100).toFixed(1)],
    ['21000-5', 'Erythrocyte distribution width [Entitic volume] by Automated count', 'fL', CBC.rdw[i], 'H'],
    ['777-3', 'Platelets [#/volume] in Blood by Automated count', '10*3/uL', CBC.plt[i], hl(CBC.plt[i], 150, 450)],
    ['32623-1', 'Platelet mean volume [Entitic volume] in Blood by Automated count', 'fL', CBC.mpv[i]],
    ['770-8', 'Neutrophils/100 leukocytes in Blood by Automated count', '%', neutPct, hl(neutPct, 40, 75)],
    ['736-9', 'Lymphocytes/100 leukocytes in Blood by Automated count', '%', lymphPct, hl(lymphPct, 20, 45)],
    ['5905-5', 'Monocytes/100 leukocytes in Blood by Automated count', '%', monoPct, hl(monoPct, 2, 10)],
    ['711-2', 'Eosinophils [#/volume] in Blood by Automated count', '10*3/uL', CBC.eos[i], 'H'],
    ['706-2', 'Basophils/100 leukocytes in Blood by Automated count', '%', basoPct, hl(basoPct, 0, 2)],
  ]);
});

const CMP_DATES = ['2024-12-10', '2025-03-14', '2025-06-10', '2025-09-09', '2025-11-04', '2025-12-09', '2026-02-12', '2026-04-30', '2026-06-03', '2026-07-21', '2026-08-26'];
const CMP = {
  na: [141, 138, 136, 139, 141, 140, 138, 136, 143, 139, 138],
  k: [3.7, 4.0, 4.2, 3.9, 3.7, 3.2, 4.3, 4.5, 5.2, 4.7, 5.1],
  cl: [103, 102, 101, 104, 103, 104, 100, 102, 107, 105, 104],
  co2: [26, 24, 27, 25, 26, 33, 24, 23, 25, 26, 25],
  bun: [29, 31, 38, 33, 33, 32, 35, 40, 36, 34, 34],
  cr: [1.29, 1.45, 1.69, 1.35, 1.31, 1.15, 1.4, 1.78, 1.5, 1.45, 1.37],
  gfr: [58, 52, 42, 56, 57, 66, 49, 39, 47, 50, 53],
  glu: [85, 95, 108, 100, 108, 90, 86, 108, 100, 95, 95],
  ca: [9.2, 9.5, 9.8, 9.6, 9.4, 9.7, 10.3, 9.9, 10.0, 9.8, 9.9],
  alb: [3.4, 3.6, 3.5, 3.6, 3.6, 3.3, 3.5, 3.5, 3.4, 3.5, 3.5],
  prot: [6.0, 6.2, 6.4, 6.4, 6.4, 6.3, 6.4, 6.5, 6.4, 6.4, 6.5],
  bili: [1.3, 0.9, 0.8, 0.7, 0.6, 0.7, 0.6, 0.6, 0.7, 0.6, 0.6],
  alp: [66, 80, 93, 90, 93, 129, 100, 95, 90, 85, 81],
  alt: [22, 36, 70, 24, 24, 23, 20, 15, 14, 15, 13],
  ast: [26, 30, 34, 35, 35, 34, 30, 28, 27, 28, 27],
};
CMP_DATES.forEach((d, i) => {
  panel(d, '24323-8', 'Comprehensive metabolic 2000 panel - Serum or Plasma', [
    ['2951-2', 'Sodium [Moles/volume] in Serum or Plasma', 'mmol/L', CMP.na[i]],
    ['2823-3', 'Potassium [Moles/volume] in Serum or Plasma', 'mmol/L', CMP.k[i], hl(CMP.k[i], 3.5, 5.1)],
    ['2075-0', 'Chloride [Moles/volume] in Serum or Plasma', 'mmol/L', CMP.cl[i]],
    ['2028-9', 'Carbon dioxide, total [Moles/volume] in Serum or Plasma', 'mmol/L', CMP.co2[i], hl(CMP.co2[i], 22, 29)],
    ['3094-0', 'Urea nitrogen [Mass/volume] in Serum or Plasma', 'mg/dL', CMP.bun[i], 'H'],
    ['2160-0', 'Creatinine [Mass/volume] in Serum or Plasma', 'mg/dL', CMP.cr[i], hl(CMP.cr[i], 0.7, 1.2)],
    ['62238-1', 'Glomerular filtration rate/1.73 sq M.predicted [Volume Rate/Area] in Serum, Plasma or Blood by Creatinine-based formula (CKD-EPI)', 'mL/min/{1.73_m2}', CMP.gfr[i]],
    ['2345-7', 'Glucose [Mass/volume] in Serum or Plasma', 'mg/dL', CMP.glu[i]],
    ['17861-6', 'Calcium [Mass/volume] in Serum or Plasma', 'mg/dL', CMP.ca[i]],
    ['1751-7', 'Albumin [Mass/volume] in Serum or Plasma', 'g/dL', CMP.alb[i], hl(CMP.alb[i], 3.5, 5.2)],
    ['2885-2', 'Protein [Mass/volume] in Serum or Plasma', 'g/dL', CMP.prot[i]],
    ['1975-2', 'Bilirubin.total [Mass/volume] in Serum or Plasma', 'mg/dL', CMP.bili[i], hl(CMP.bili[i], 0.2, 1.2)],
    ['6768-6', 'Alkaline phosphatase [Enzymatic activity/volume] in Serum or Plasma', 'U/L', CMP.alp[i]],
    ['1742-6', 'Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma', 'U/L', CMP.alt[i], hl(CMP.alt[i], 10, 50)],
    ['1920-8', 'Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma', 'U/L', CMP.ast[i]],
  ]);
});

// PT is sent as the blood-specimen code so the loader picks sample BLOOD (PROTIME's only collection sample).
// INR (#60 5110) has no collection sample on dev, so its results still fail; kept for the bundle's realism.
[['2025-01-16', 21.9, 1.87], ['2025-04-08', 15.2, 1.19], ['2026-02-12', 16.0, 1.26], ['2026-07-21', 16.8, 1.35], ['2026-08-26', 16.5, 1.3]].forEach(([d, pt, inr]) =>
  panel(d, '34714-6', 'INR in Blood by Coagulation assay', [
    ['5964-2', 'Prothrombin time (PT) in Blood by Coagulation assay', 's', pt, 'H'],
    ['6301-6', 'INR in Platelet poor plasma by Coagulation assay', '{INR}', inr, hl(inr, 0.8, 1.2)],
  ]));
[['2025-11-04', 2.73], ['2026-02-12', 2.1], ['2026-08-26', 1.72]].forEach(([d, v]) =>
  panel(d, '3016-3', 'Thyrotropin [Units/volume] in Serum or Plasma', [['3016-3', 'Thyrotropin [Units/volume] in Serum or Plasma', 'u[IU]/mL', v]]));
[['2025-02-12', 1.011, 6, 0, 30], ['2026-02-12', 1.026, 7, 1000, 0], ['2026-07-21', 1.017, 7, 1000, 0]].forEach(([d, sg, ph, glu, prot]) =>
  panel(d, '24357-6', 'Urinalysis macro (dipstick) panel - Urine', [
    ['5811-5', 'Specific gravity of Urine by Test strip', '{ratio}', sg],
    ['5803-2', 'pH of Urine by Test strip', '[pH]', ph],
    ['5792-7', 'Glucose [Mass/volume] in Urine by Test strip', 'mg/dL', glu, glu ? 'A' : undefined],
    ['5804-0', 'Protein [Mass/volume] in Urine by Test strip', 'mg/dL', prot, prot ? 'A' : undefined],
    // Coded presence results: the loader's ADJUST^SYNFPAN turns these displays into NEG.
    ['5794-3', 'Hemoglobin [Presence] in Urine by Test strip', null, ['167300001', 'Blood not detected in urine (finding)']],
    ['5797-6', 'Ketones [Presence] in Urine by Test strip', null, ['167287002', 'Urine ketones not detected (finding)']],
    ['5802-4', 'Nitrite [Presence] in Urine by Test strip', null, ['314138001', 'Nitrite not detected in urine (finding)']],
    ['5770-3', 'Bilirubin.total [Presence] in Urine by Test strip', null, ['167339005', 'Bilirubin not detected in urine (finding)']],
  ]));
// ADJUST^SYNFPAN only passes a positive qualitative result through as "1+" (display containing "+").
panel('2026-07-21', '29771-3', 'Hemoglobin.gastrointestinal [Presence] in Stool by Immunologic method', [
  ['29771-3', 'Hemoglobin.gastrointestinal [Presence] in Stool by Immunologic method', null, ['10828004', 'Positive (+)'], 'A'],
]);

// Immunizations (CVX). Only CVX codes active in dev's IMMUNIZATION file (#9999999.14) load, so newer
// products are sent as their closest active code (adjuvanted/HD quad flu -> 135, PCV20 -> 133, Shingrix -> 121).
const IMMS = [
  ['2025-10-29', '135', 'Influenza, high dose seasonal, preservative-free'],
  ['2024-12-11', '135', 'Influenza, high dose seasonal, preservative-free'],
  ['2023-12-21', '135', 'Influenza, high dose seasonal, preservative-free'],
  ['2023-12-21', '133', 'Pneumococcal conjugate PCV 13'],
  ['2023-04-04', '133', 'Pneumococcal conjugate PCV 13'],
  ['2022-10-07', '153', 'Influenza, injectable, MDCK, preservative free'],
  ['2020-10-06', '149', 'Influenza, live, quadrivalent, intranasal'],
  ['2019-11-04', '121', 'Zoster vaccine, live'],
  ['2019-09-23', '141', 'Influenza, seasonal, injectable'],
  ['2019-09-23', '115', 'Tdap'],
  ['2019-08-12', '121', 'Zoster vaccine, live'],
  ['2016-12-08', '33', 'Pneumococcal polysaccharide PPV23'],
  ['2016-10-27', '140', 'Influenza, split virus, trivalent, PF'],
  ['2015-10-23', '100', 'Pneumococcal conjugate PCV7'],
  ['2014-10-28', '141', 'Influenza, seasonal, injectable'],
];
IMMS.forEach(([d, code, display]) => {
  const e = enc(d, 'proc', 0);
  add({
    resourceType: 'Immunization',
    meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-immunization'] },
    status: 'completed',
    vaccineCode: { coding: [{ system: 'http://hl7.org/fhir/sid/cvx', code, display }], text: display },
    patient: { reference: PREF },
    encounter: eref(e),
    occurrenceDateTime: iso(d),
    primarySource: true,
    location: loc,
  });
});

// Procedures.
[
  ['2025-04-08', '40701008', 'Echocardiography (procedure)'],
  ['2026-08-04', '29303009', 'Electrocardiographic procedure (procedure)'],
  ['2026-08-05', '241615005', 'Ultrasonography of kidney (procedure)'],
  ['2026-09-03', '180325003', 'Electrical cardioversion (procedure)'],
  ['2026-10-19', '314971001', 'Retinal imaging screening (procedure)'],
].forEach(([d, code, display]) => {
  const e = nearest(d);
  add({
    resourceType: 'Procedure',
    meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-procedure'] },
    status: 'completed',
    code: sct(code, display),
    subject: { reference: PREF },
    encounter: eref(e),
    performedPeriod: { start: iso(d), end: iso(d, 10) },
    location: loc,
  });
});

// Medications (RxNorm).
const RX = (code, display) => ({ coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code, display }], text: display });
const MEDS = [
  ['2024-12-11', 'active', '617311', 'atorvastatin 40 MG Oral Tablet', 'Take one tablet by mouth daily to prevent a heart attack', 1, 1],
  ['2025-01-16', 'active', '1364445', 'apixaban 5 MG Oral Tablet', 'Take one tablet by mouth twice a day for prevention of blood clots', 2, 1],
  ['2025-01-16', 'active', '200031', 'carvedilol 12.5 MG Oral Tablet', 'Take one tablet by mouth twice a day for blood pressure and heart rate control', 2, 1],
  ['2025-01-16', 'active', '979492', 'losartan potassium 50 MG Oral Tablet', 'Take one tablet by mouth daily for blood pressure and heart protection', 1, 1],
  ['2026-03-20', 'stopped', '2375327', 'dupilumab 300 MG per 2 ML Auto-Injector', 'Inject 300 mg under the skin every 2 weeks for atopic dermatitis', 1, 1],
  ['2026-04-14', 'active', '997488', 'fexofenadine hydrochloride 180 MG Oral Tablet', 'Take one tablet by mouth once daily for allergy', 1, 1],
  ['2026-04-30', 'active', '1545658', 'empagliflozin 10 MG Oral Tablet', 'Take one tablet by mouth daily for chronic heart failure', 1, 1],
  ['2026-05-14', 'stopped', '861487', 'clobetasol propionate 0.5 MG/ML Topical Solution', 'Apply a small amount to the scalp twice a day for itching, up to 2 weeks, then stop for at least a week', 2, 1],
  ['2026-06-03', 'stopped', '313096', 'spironolactone 25 MG Oral Tablet', 'Take one tablet by mouth daily for heart failure', 1, 1],
  ['2026-06-04', 'active', '310431', 'gabapentin 300 MG Oral Capsule', 'Take one capsule by mouth at bedtime for itching and sleep', 1, 1],
  ['2026-08-04', 'completed', '197361', 'amiodarone hydrochloride 200 MG Oral Tablet', 'Take one tablet by mouth daily for arrhythmia', 1, 1],
  ['2026-08-05', 'active', '313096', 'spironolactone 25 MG Oral Tablet', 'Take one tablet by mouth daily for heart failure', 1, 1],
  ['2026-08-28', 'active', '861487', 'clobetasol propionate 0.5 MG/ML Topical Solution', 'Apply a small amount to the scalp twice a day for itching, up to 2 weeks, then stop for at least a week', 2, 1],
  ['2026-09-23', 'active', '966914', 'polyethylene glycol 3350 240000 MG / potassium chloride 2980 MG / sodium bicarbonate 6720 MG / sodium chloride 5840 MG / sodium sulfate 22720 MG Powder for Oral Solution', 'Take 1 container by mouth as directed for bowel preparation before colonoscopy', 1, 1],
  ['2026-09-23', 'active', '308753', 'bisacodyl 5 MG Delayed Release Oral Tablet', 'Take three tablets by mouth as directed for bowel preparation', 1, 1],
  ['2026-09-23', 'active', '314216', 'simethicone 80 MG Chewable Tablet', 'Chew two tablets by mouth as directed for bowel preparation', 1, 1],
];
MEDS.forEach(([d, status, code, display, text, freq, dose], i) => {
  const e = nearest(d);
  add({
    resourceType: 'MedicationRequest',
    meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-medicationrequest'] },
    status,
    intent: 'order',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/medicationrequest-category', code: 'community', display: 'Community' }], text: 'Community' }],
    medicationCodeableConcept: RX(code, display),
    subject: { reference: PREF },
    encounter: eref(e),
    authoredOn: iso(d),
    requester: prac(i % 3),
    dosageInstruction: [{
      sequence: 1,
      text,
      timing: { repeat: { frequency: freq, period: 1, periodUnit: 'd' } },
      asNeededBoolean: false,
      doseAndRate: [{ type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/dose-rate-type', code: 'ordered', display: 'Ordered' }] }, doseQuantity: { value: dose } }],
    }],
  });
});

const bundle = { resourceType: 'Bundle', type: 'transaction', entry: entries };
fs.writeFileSync(OUT, JSON.stringify(bundle, null, 2));
const counts = {};
entries.forEach((e) => (counts[e.resource.resourceType] = (counts[e.resource.resourceType] || 0) + 1));
console.log(OUT, JSON.stringify(counts));

// Supplement plan for import-labs-vitals.js: results the SYN loader cannot file on dev, sent by VistA name.
// eGFR: the loader leaves a hidden entry at the CMP time ("Duplicate Lab Test"), so it is filed 1 minute later.
// FIT: #95.3 gives sample "STOOL = FECAL", OCCULT BLOOD only accepts STOOL. SpO2: SYNFVIT has no 59408-5 entry.
// Set "dfn" after the load, then: node patient.js import-labs-vitals --plan <file> [--apply]
const SUPPLEMENT = {
  '62238-1': (o) => ({ kind: 'labs', shift: 1, test: 'EGFR (CKD-EPI)', sample: 'SERUM', value: String(o.valueQuantity.value) }),
  '29771-3': () => ({ kind: 'labs', test: 'OCCULT BLOOD', sample: 'STOOL', value: 'POSITIVE' }),
  '59408-5': (o) => ({ kind: 'vitals', type: 'PULSE OXIMETRY', value: String(o.valueQuantity.value) }),
};
const plan = { dfn: '', note: `Supplement for ${path.basename(OUT)}; set dfn to the loaded patient.`, location: 'GENERAL MEDICINE', enteredBy: 'PROVIDER,ONE', vitals: [], labs: [] };
entries.map((e) => e.resource).filter((r) => r.resourceType === 'Observation' && SUPPLEMENT[r.code.coding[0].code]).forEach((o) => {
  const { kind, shift = 0, ...item } = SUPPLEMENT[o.code.coding[0].code](o);
  const at = new Date(Date.parse(o.effectiveDateTime.slice(0, 16) + 'Z') + shift * 60000).toISOString().slice(0, 16);
  plan[kind].push({ at, ...item });
});
const planOut = path.join('plans', `${GIVEN}_${FAMILY}-supplement.json`);
fs.writeFileSync(planOut, JSON.stringify(plan, null, 2));
console.log(planOut, `vitals ${plan.vitals.length}, labs ${plan.labs.length}`);
