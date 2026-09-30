'use strict';
// Builds historical encounters (one per order date) from a patient's VPR items.

const CATEGORY_ORDER = ['social', 'administrative', 'acute'];
const HISTORY_DAYS = 90;
const DAY_MS = 86400000;

// ---------- VPR date helpers (dates are YYYYMMDD[HHmm[ss]] numbers) ----------

const day = (v) => (v === undefined || v === null ? '' : String(v).slice(0, 8));
const isoDate = (d8) => (d8 ? `${d8.slice(0, 4)}-${d8.slice(4, 6)}-${d8.slice(6, 8)}` : '');
const hhmm = (v) => {
  const t = String(v || '').slice(8, 12).padEnd(4, '0');
  return `${t.slice(0, 2)}:${t.slice(2, 4)}`;
};
// FileMan date/time: YYYMMDD.HHMM where YYY = year - 1700.
const fm = (v) => {
  const s = String(v || '');
  const d8 = s.slice(0, 8);
  const time = s.slice(8, 12).padEnd(4, '0');
  return `${Number(d8.slice(0, 4)) - 1700}${d8.slice(4, 8)}.${time}`;
};
const toDate = (d8) => new Date(Date.UTC(+d8.slice(0, 4), +d8.slice(4, 6) - 1, +d8.slice(6, 8)));
const toD8 = (dt) => dt.toISOString().slice(0, 10).replace(/-/g, '');
const addDays = (d8, n) => toD8(new Date(toDate(d8).getTime() + n * DAY_MS));

function ageOn(dob8, d8) {
  let age = +d8.slice(0, 4) - +dob8.slice(0, 4);
  if (d8.slice(4) < dob8.slice(4)) age--;
  return age;
}

// ---------- indexing ----------

function indexVpr(items) {
  const byDomain = {};
  const byUid = new Map();
  const byEncounter = new Map();
  for (const it of items) {
    const domain = String(it.uid || '').split(':')[2] || 'unknown';
    (byDomain[domain] ||= []).push(it);
    byUid.set(it.uid, it);
    if (it.encounterUid) {
      if (!byEncounter.has(it.encounterUid)) byEncounter.set(it.encounterUid, []);
      byEncounter.get(it.encounterUid).push(it);
    }
  }
  return { byDomain, byUid, byEncounter };
}

// ---------- problems ----------

function categorizeProblem(text, rules) {
  const t = String(text || '').toLowerCase();
  for (const cat of CATEGORY_ORDER) {
    if ((rules.categories[cat] || []).some((p) => t.includes(p.toLowerCase()))) return cat;
  }
  return 'clinical';
}

function problemsFor(problems, date8, rules) {
  const latest = new Map();
  for (const p of problems) {
    const onset = day(p.onset);
    if (!onset || onset > date8) continue;
    // Exclude resolved/inactive problems - they shouldn't inform an active assessment.
    if (String(p.statusName || '').toUpperCase() === 'INACTIVE') continue;
    const prev = latest.get(p.problemText);
    if (!prev || onset > day(prev.onset)) latest.set(p.problemText, p);
  }
  const acuteFrom = addDays(date8, -(rules.acuteWindowDays ?? 365));
  const sorted = [...latest.values()].sort((a, b) => day(b.onset).localeCompare(day(a.onset)));
  const out = { problems: [], socialHistory: [] };
  for (const p of sorted) {
    const category = categorizeProblem(p.problemText, rules);
    const onset = isoDate(day(p.onset));
    if (category === 'social') out.socialHistory.push({ text: p.problemText, onset });
    else if (category === 'clinical') out.problems.push({ text: p.problemText, onset, category });
    else if (category === 'acute' && day(p.onset) >= acuteFrom) out.problems.push({ text: p.problemText, onset, category });
  }
  return out;
}

// ---------- problem filtering for note generation ----------

function filterProblemsForEncounter(encounter, rules) {
  // Build a filtered problem list for note generation:
  // (1) primary diagnosis from visitDiagnoses, (2) acute problems within 365 days,
  // (3) up to 3 chronic problems relevant to today's orders/meds/labs
  
  const filtered = [];
  const orderAndMedNames = [
    ...(encounter.ordersToday || []).map((o) => (o.name || '').toLowerCase()),
    ...(encounter.newMeds || []).map((m) => (m.name || '').toLowerCase()),
  ].join(' ');
  
  // (1) Add primary diagnosis
  const primaryDiag = (encounter.visitDiagnoses || []).find((d) => d.primary);
  if (primaryDiag) {
    filtered.push({ text: primaryDiag.name, icd: primaryDiag.icd, category: 'primary-diagnosis' });
  }
  
  // (2) Add acute problems (already filtered by problemsFor)
  const acuteProblems = (encounter.problems || [])
    .filter((p) => p.category === 'acute')
    .slice(0, 2); // limit acute to 2
  filtered.push(...acuteProblems);
  
  // (3) Add up to 3 chronic problems, prioritizing those that appear in orders/meds
  const chronicProblems = (encounter.problems || []).filter((p) => p.category === 'clinical');
  const scored = chronicProblems.map((p) => ({
    ...p,
    score: orderAndMedNames.includes(p.text.toLowerCase()) ? 2 : 1,
  }));
  scored.sort((a, b) => b.score - a.score || b.onset.localeCompare(a.onset)); // ties: most recent onset first
  filtered.push(...scored.slice(0, 3 - acuteProblems.length)); // fill to 3 total after acute
  
  return filtered;
}

// ---------- labs / meds / vitals ----------

function labFlag(lab) {
  if (lab.interpretationName) return lab.interpretationName;
  const v = parseFloat(lab.result);
  if (Number.isNaN(v)) return '';
  const low = parseFloat(lab.low);
  const high = parseFloat(lab.high);
  if (!Number.isNaN(low) && v < low) return 'Low';
  if (!Number.isNaN(high) && v > high) return 'High';
  return '';
}

const shapeLab = (l) => ({
  name: l.typeName || l.displayName,
  result: l.result,
  units: l.units,
  low: l.low,
  high: l.high,
  flag: labFlag(l),
  observed: isoDate(day(l.observed)),
});

const labSort = (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || String(a.typeName).localeCompare(String(b.typeName));

const shapeMed = (m) => ({
  name: String(m.name || '').trim(),
  strength: m.products?.[0]?.strength,
  sig: m.sig,
  started: isoDate(day(m.overallStart)),
});

// ---------- visit-linked details ----------

const icd = (code) => String(code || '').replace(/^urn:(10d|icd):/, '');
const cleanCarePlan = (name) => name.replace(/^SYN ACT\s+/, '').replace(/\s*\(SCT:[^)]*\)\s*$/, '').trim();

function visitDetails(visits, byEncounter) {
  const linked = visits.flatMap((v) => byEncounter.get(v.uid) || []);
  const domain = (x) => x.uid.split(':')[2];

  const visitDiagnoses = [];
  for (const p of linked.filter((x) => domain(x) === 'pov')) {
    visitDiagnoses.push({ name: p.name, icd: icd(p.icdCode), primary: p.type === 'P' });
  }
  for (const v of visits) {
    if (v.reasonName && !visitDiagnoses.some((d) => d.icd === icd(v.reasonUid))) {
      visitDiagnoses.push({ name: v.reasonName, icd: icd(v.reasonUid), primary: true });
    }
  }

  const procedures = [...new Set(linked.filter((x) => domain(x) === 'cpt' && x.name !== 'OUTPATIENT ENCOUNTER').map((x) => x.name))];
  const immunizations = [...new Set(linked.filter((x) => domain(x) === 'immunization').map((x) => x.name))];
  const carePlanActivities = [
    ...new Set(linked.filter((x) => domain(x) === 'factor' && /^SYN ACT\b/.test(x.name || '')).map((x) => cleanCarePlan(x.name))),
  ];
  return { visitDiagnoses, procedures, immunizations, carePlanActivities };
}

// ---------- extraction ----------

function extractEncounters({ byDomain, byUid, byEncounter }, { rules }) {
  const orders = byDomain.order || [];
  if (orders.length === 0) throw new Error('No orders found in patient data; cannot derive encounters.');

  const patient = (byDomain.patient || [])[0] || {};
  const dob8 = day(patient.dateOfBirth);
  const labs = byDomain.lab || [];
  const meds = byDomain.med || [];
  const vitals = byDomain.vital || [];
  const visits = byDomain.visit || [];
  const appointments = byDomain.appointment || [];

  const ordersByDay = new Map();
  for (const o of orders) {
    const d8 = day(o.start);
    if (!ordersByDay.has(d8)) ordersByDay.set(d8, []);
    ordersByDay.get(d8).push(o);
  }

  const days = [...ordersByDay.keys()].sort();
  return days.map((date8, i) => {
    const todays = ordersByDay.get(date8);
    const earliest = todays.reduce((a, b) => (String(b.start) < String(a.start) ? b : a));
    const dayVisits = visits.filter((v) => day(v.dateTime) === date8);
    const dayAppts = appointments.filter((a) => day(a.dateTime) === date8);

    const labsToday = [];
    const newMeds = [];
    const seen = new Set();
    for (const o of todays) {
      const results = (o.results || []).map((r) => byUid.get(r.uid)).filter(Boolean);
      for (const r of results) {
        if (seen.has(r.uid)) continue;
        seen.add(r.uid);
        if (r.uid.includes(':lab:')) labsToday.push(r);
        else if (r.uid.includes(':med:')) newMeds.push(r);
      }
      if (o.service === 'LR' && results.length === 0) {
        for (const l of labs) {
          if (day(l.observed) === date8 && !seen.has(l.uid)) {
            seen.add(l.uid);
            labsToday.push(l);
          }
        }
      }
    }
    labsToday.sort(labSort);

    const newMedUids = new Set(newMeds.map((m) => m.uid));
    const activeMeds = meds.filter((m) => {
      if (newMedUids.has(m.uid)) return false;
      const start = day(m.overallStart);
      const stop = day(m.overallStop || m.stopped);
      return start && start <= date8 && (!stop || stop >= date8);
    });

    const vitalsUpTo = vitals.filter((v) => day(v.observed) && day(v.observed) <= date8);
    const lastVitalDay = vitalsUpTo.map((v) => day(v.observed)).sort().pop();
    const latestVitals = vitalsUpTo
      .filter((v) => day(v.observed) === lastVitalDay)
      .map((v) => ({ type: v.typeName, result: v.result, units: v.units, observed: isoDate(day(v.observed)) }));

    const from8 = addDays(date8, -HISTORY_DAYS);
    const labsTodayUids = new Set(labsToday.map((l) => l.uid));
    const recentLabHistory = labs
      .filter((l) => !labsTodayUids.has(l.uid) && day(l.observed) >= from8 && day(l.observed) < date8)
      .sort((a, b) => day(a.observed).localeCompare(day(b.observed)) || labSort(a, b))
      .map(shapeLab);

    const clinic = earliest.locationName || dayVisits[0]?.locationName || 'UNKNOWN CLINIC';

    return {
      seq: i + 1,
      kind: 'historical',
      date: isoDate(date8),
      time: hhmm(earliest.start),
      fmDateTime: fm(earliest.start),
      clinic,
      suggestedVisitType: i === 0 ? 'New patient' : 'Follow-up',
      patient: { age: dob8 ? ageOn(dob8, date8) : null, gender: patient.genderName || null },
      ordersToday: todays.map((o) => ({ name: String(o.name || '').trim(), service: o.service, status: o.statusName })),
      labsToday: labsToday.map(shapeLab),
      newMeds: newMeds.map(shapeMed),
      activeMeds: activeMeds.map(shapeMed),
      latestVitals,
      recentLabHistory,
      ...problemsFor(byDomain.problem || [], date8, rules),
      ...visitDetails(dayVisits, byEncounter),
      existing: {
        visits: dayVisits.map((v) => ({ uid: v.uid, dateTime: String(v.dateTime), location: v.locationName })),
        appointments: dayAppts.map((a) => ({ uid: a.uid, dateTime: String(a.dateTime), location: a.locationName, status: a.appointmentStatus })),
      },
      hasAppointment: dayAppts.length > 0,
    };
  });
}

// ---------- identifier guard ----------

function findIdentifierLeaks(text, { byDomain }) {
  const p = (byDomain.patient || [])[0] || {};
  const values = [
    p.ssn,
    p.icn,
    p.fullName,
    p.familyName,
    p.givenNames,
    p.briefId,
    ...(p.addresses || []).flatMap((a) => [a.streetLine1, a.streetLine2, a.city, a.postalCode]),
    ...(p.telecoms || []).map((t) => t.telecom),
  ];
  return values
    .filter((v) => v !== undefined && v !== null)
    .map((v) => String(v).trim())
    .filter((v) => v.length >= 4 && text.includes(v));
}

module.exports = { indexVpr, extractEncounters, categorizeProblem, filterProblemsForEncounter, findIdentifierLeaks, day, isoDate, hhmm, fm, ageOn };
