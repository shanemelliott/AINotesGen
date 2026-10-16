// Book appointments and generate notes for hand-specified visits (plans/dfn<dfn>-visits.json), for patients
// whose visits do not come from Synthea orders. DEV ONLY. Dry run unless --book.
// Usage: node custom-visits.js --dfn <dfn> --plan plans/dfn<dfn>-visits.json [--book] [--generate] [--date YYYY-MM-DD]
//   --book      create the appointments (SDEC ARSET + APPADD) for visits without existingAppointment
//   --generate  call the LLM and write each note to output/review/<dfn>-<date>.txt (+ .json) for review
// Then: node approve-note.js <id>, node sign-notes.js <id> --sign, node link-note-visits.js --dfn <dfn> --commit
const fs = require('fs');
const path = require('path');
const config = require('./src/config');
const { loadPatient, callCandidate, stripMarkerLine } = require('./test-ai');
const { loadApiKey, DEFAULT_MODEL } = require('./src/noteGenerator');
const { insertLabBlock } = require('./src/labBlock');
const { reflowText, toAscii } = require('./src/reflow');
const { flagNote } = require('./src/noteFlags');
const { noteId, writeNote, existsInDir } = require('./src/noteStore');
const { filemanDateTime, buildVisitString } = require('./src/notesClient');
const { createAppointment } = require('./src/appointmentCreator');
const { noteTitleFor } = require('./src/noteTitles');

const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : undefined);
const dfn = arg('--dfn');
const planPath = arg('--plan');
if (!/^\d+$/.test(dfn || '') || !planPath) {
  console.error('Usage: node custom-visits.js --dfn <dfn> --plan <plan.json> [--book] [--generate]');
  process.exit(1);
}
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const mdy = (d) => `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;
const day8 = (v) => String(v || '').replace(/\D/g, '').slice(0, 8);

function patientFacts(items, date) {
  const p = items.find((i) => i.uid.includes(':patient:')) || {};
  const dob = day8(p.dateOfBirth);
  const d8 = date.replace(/-/g, '');
  let age = Number(d8.slice(0, 4)) - Number(dob.slice(0, 4));
  if (d8.slice(4) < dob.slice(4)) age--;
  const meds = items.filter((i) => i.uid.includes(':med:'))
    .filter((m) => !day8(m.overallStart) || day8(m.overallStart) <= d8)
    .map((m) => ({ name: String(m.name || '').trim(), started: `${day8(m.overallStart).slice(0, 4)}-${day8(m.overallStart).slice(4, 6)}-${day8(m.overallStart).slice(6, 8)}` }));
  return { age, gender: p.genderName, meds, ...labsAndVitals(items, d8) };
}

const fmtDay = (d8) => `${d8.slice(4, 6)}/${d8.slice(6, 8)}/${d8.slice(0, 4)}`;
const addDays8 = (d8, n) => { const d = new Date(Date.UTC(+d8.slice(0, 4), +d8.slice(4, 6) - 1, +d8.slice(6, 8) + n)); return d.toISOString().slice(0, 10).replace(/-/g, ''); };
const shapeLab = (l) => ({ name: l.typeName || l.displayName, result: l.result, units: l.units, low: l.low, high: l.high, flag: l.interpretationName || '', observed: fmtDay(day8(l.observed)) });

// Vitals and labs observed on the visit day, and the previous 90 days of labs. Refresh <dfn>.json (fetch-vpr.js) after an import.
function labsAndVitals(items, d8) {
  const labs = items.filter((i) => i.uid.includes(':lab:'));
  const order = (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
  const vitalsToday = items.filter((i) => i.uid.includes(':vital:') && day8(i.observed) === d8)
    .map((v) => ({ type: v.typeName, result: /WEIGHT/i.test(v.typeName) ? String(v.result).replace(/[LK]$/i, '') : v.result, units: v.units, observed: fmtDay(d8) }));
  const labsToday = labs.filter((l) => day8(l.observed) === d8).sort(order).map(shapeLab);
  const from = addDays8(d8, -90);
  const labHistory = labs.filter((l) => day8(l.observed) >= from && day8(l.observed) < d8)
    .sort((a, b) => day8(a.observed).localeCompare(day8(b.observed)) || order(a, b)).map(shapeLab);
  return { vitalsToday, labsToday, labHistory };
}

function buildCtx(v, facts) {
  const hasVitals = facts.vitalsToday.length > 0;
  return {
    encounter: { date: mdy(v.date), clinic: v.clinic, visitType: v.visitType, setting: v.setting, presentingProblems: v.presenting },
    patient: { age: facts.age, gender: facts.gender, veteran: true },
    ordersToday: [], labsToday: facts.labsToday, newMeds: [], activeMeds: facts.meds, latestVitals: facts.vitalsToday, recentLabHistory: facts.labHistory,
    visitDiagnoses: v.visitDiagnoses, carePlanActivities: [], relevantProblems: v.relevantProblems, socialHistory: [],
    visitScenario: v.scenario,
    instructions: `Facts for this visit are in visitScenario; use them for SUBJECTIVE, ASSESSMENT and PLAN and add nothing clinical beyond them. ` +
      (hasVitals ? 'The vitals taken at this visit are in latestVitals: list exactly those under OBJECTIVE, then the exam findings given in visitScenario. Lab results are inserted automatically at [[LABS]]; mention abnormal results in words only.'
        : 'No vitals were recorded: under OBJECTIVE write exactly "Vitals not available." and describe only the exam findings given in visitScenario.'),
  };
}

async function main() {
  const items = loadPatient(dfn);
  const apiKey = (process.argv.includes('--generate')) ? loadApiKey() : null;
  for (const v of plan.visits.filter((x) => !arg('--date') || x.date === arg('--date'))) {
    const id = noteId(dfn, v.date);
    const fm = filemanDateTime(v.date, v.time);
    const visitString = buildVisitString({ clinicIen: v.clinicIen, filemanDateTime: fm, type: 'A' });
    console.log(`${id}  ${v.clinic} ${v.time}  FileMan ${fm}  visit string ${visitString}${v.existingAppointment ? '  (existing appointment)' : ''}`);

    if (process.argv.includes('--book') && !v.existingAppointment) {
      const r = await createAppointment({ dfn, date: v.date, time: v.time, clinicIen: v.clinicIen, resourceIen: v.resourceIen, clinicName: v.clinic });
      console.log(`  BOOKED requestIen=${r.requestIen} appointmentIen=${r.appointmentIen}`);
    }

    if (apiKey) {
      if (existsInDir(path.join(__dirname, 'output', 'review'), id) || existsInDir(path.join(__dirname, 'output', 'ready'), id) || existsInDir(path.join(__dirname, 'output', 'signed'), id)) {
        console.log('  SKIP note already exists');
        continue;
      }
      const ctx = buildCtx(v, patientFacts(items, v.date));
      const attempts = [4000, 8000];
      let res;
      for (const maxTokens of attempts) {
        res = await callCandidate(DEFAULT_MODEL, ctx, apiKey, maxTokens);
        if (res.outcome === 'ok') break;
      }
      if (res.outcome !== 'ok') { console.log(`  FAIL ${res.outcome} ${res.detail || ''}`); continue; }
      const text = toAscii(reflowText(stripMarkerLine(insertLabBlock(res.content, ctx))));
      const { flagged, reasons } = flagNote(text, ctx);
      writeNote(path.join(__dirname, 'output', 'review'), id, {
        noteText: text, dfn, date: v.date, visitString, noteTitleIen: noteTitleFor(v.clinic), locationIen: v.clinicIen,
        duz: config.duz(), fmDateTime: fm, flagged, flagReasons: reasons, generatedAt: new Date().toISOString(),
      });
      console.log(`  NOTE written to output/review/${id}.txt${flagged ? ` (flagged: ${reasons.join('; ')})` : ''}`);
    }
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
