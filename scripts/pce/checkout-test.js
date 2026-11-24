// PCE check-out tests (openspec change pce-checkout-rpc-tests). Preview by default; --apply writes to staging station 500 only.
// Usage: node scripts/pce/checkout-test.js <T1|T1b|T3|T3b|T6|T8|T9|all> [--apply] [--day-offset N]
require('../../src/config');
const { callRpc } = require('../../src/vistaApiClient');
const { assertDevSite, svcDuz, ddrLister } = require('./lib/ddr');
const { snapshot } = require('./lib/snapshot');
const { plan, createFixture, sdes2CheckOut } = require('./lib/fixture');
const report = require('./lib/report');

const CTX_PCE = 'CDSP RPC CONTEXT';
const PKGNAME = 'PCE PATIENT CARE ENCOUNTER';
const SRC = 'CHECKOUT RPC TEST';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const val = (rec, f) => (rec && rec[f] ? rec[f].internal : '');

// PCELIST lines in the CPRS format read by DQSAVE^PXRPC1. Service category is required when no visit exists.
function pcelist(fx, { dxcpt = true, visit = '', provider = false, sc = false } = {}) {
  const lines = [
    `HDR^0^0^${fx.clinicIen};${fx.fmApptDt};A^${visit}`,
    `VST^DT^${fx.fmApptDt}`,
    `VST^PT^${fx.dfn}`,
    `VST^HL^${fx.clinicIen}`,
    'VST^ET^P',
    'VST^VC^A'
  ];
  if (dxcpt) {
    lines.push('POV^I10^^ESSENTIAL HYPERTENSION^1');
    lines.push('CPT^99213^^OFFICE VISIT^1');
  }
  if (provider) lines.push('PRV^983^^PROVIDER,ONE^1');
  // Service-connected classification at visit level; DFN 100969 is eligible for SC, AO, IR and EC only (answered SC yes, the rest no).
  if (sc) ['SC^1', 'AO^0', 'IR^0', 'EC^0'].forEach((c) => lines.push(`VST^${c}`));
  const out = {};
  lines.forEach((l, i) => { out[String(i + 1)] = l; });
  return out;
}

function checkoutState(s) {
  return {
    apptCheckOut_409_84_14: val(s.appt, '.14'),
    clinicAppt_303: val(s.clinicAppt, '303'),
    clinicAppt_306: val(s.clinicAppt, '306'),
    encounterStatus_409_68_12: s.oe && s.oe['.12'] ? `${s.oe['.12'].internal} ${s.oe['.12'].external}` : '',
    encounterCheckOut_409_68_7: val(s.oe, '.07'),
    visitCheckOut_9000010_18: val(s.visit, '.18')
  };
}

const isCheckedOut = (st) => Boolean(st.clinicAppt_303 || st.apptCheckOut_409_84_14 || st.encounterCheckOut_409_68_7 || /CHECKED OUT/.test(st.encounterStatus_409_68_12));
// 1 = filed, -5 = filed with warnings.
const filed = (resp) => /^(1|-5)(\^|\r?\n|$)/.test(resp);

async function save2(fx, visit, { provider = false, sc = false } = {}) {
  return String(await callRpc(
    'PXRPC SAVE2',
    [{ namedArray: pcelist(fx, { visit, provider, sc }) }, { string: PKGNAME }, { string: SRC }, { string: String(visit || '') }],
    CTX_PCE,
    { timeout: 60000, duz: svcDuz() }
  ));
}

// Header-only PCELIST (no DX/CPT) as the consuming team would send it to ORWPCE SAVE.
async function orwpceSave(fx, visit, { dxcpt = false, provider = false, sc = false } = {}) {
  return String(await callRpc(
    'ORWPCE SAVE',
    [{ namedArray: pcelist(fx, { visit, dxcpt, provider, sc }) }, { string: '' }, { string: fx.clinicIen }],
    CTX_PCE,
    { timeout: 60000, duz: svcDuz() }
  ));
}

// Rows of V POV / V CPT for a visit: AD xref, internal values, FROM is exclusive so start one below the visit.
async function vCounts(visit) {
  if (!visit) return null;
  const count = async (file) => {
    try {
      const rows = await ddrLister({ file, fields: '.01;.03', xref: 'AD', from: String(Number(visit) - 1), max: 50, flags: 'IP' });
      return rows.filter((r) => r.values[1] === String(visit)).length;
    } catch (e) { return `error: ${e.message}`; }
  };
  return { vPov: await count('9000010.07'), vCpt: await count('9000010.18') };
}

const same = (resp, st) => (filed(resp) && !isCheckedOut(st) ? 'match' : 'unexpected');
const checkedOut = (resp, st) => (filed(resp) && isCheckedOut(st) ? 'match' : 'unexpected');

const TESTS = {
  T1: {
    desc: 'SAVE2 with POV and CPT on a checked-in appointment',
    fixture: { checkIn: true },
    expectation: 'data filed, appointment not checked out',
    run: async (fx, steps) => { steps.save2 = await save2(fx, fx.snap.visitIen); return steps.save2; },
    verdict: same
  },
  T1b: {
    desc: 'SAVE2 with POV and CPT, appointment never checked in',
    fixture: { checkIn: false },
    expectation: 'data filed, appointment not checked out',
    run: async (fx, steps) => { steps.save2 = await save2(fx, fx.snap.visitIen); return steps.save2; },
    verdict: same
  },
  T3: {
    desc: 'ORWPCE SAVE header only on a checked-in appointment, auto check-out enabled',
    fixture: { checkIn: true },
    expectation: 'check-out set (MDS true through auto check-out)',
    run: async (fx, steps) => { steps.orwpce = await orwpceSave(fx, fx.snap.visitIen); return steps.orwpce; },
    verdict: checkedOut
  },
  T3b: {
    desc: 'ORWPCE SAVE with POV, CPT and provider on a checked-in appointment (CPRS-style full save)',
    fixture: { checkIn: true },
    expectation: 'check-out set and encounter status CHECKED OUT',
    run: async (fx, steps) => { steps.orwpce = await orwpceSave(fx, fx.snap.visitIen, { dxcpt: true, provider: true }); return steps.orwpce; },
    verdict: (resp, st) => (filed(resp) && isCheckedOut(st) && /CHECKED OUT/.test(st.encounterStatus_409_68_12) ? 'match' : 'unexpected')
  },
  T1c: {
    desc: 'SAVE2 with POV, CPT, provider and SC classification (SC yes, special authorities no)',
    fixture: { checkIn: true },
    expectation: 'filed without the SC warning (code 1), not checked out',
    run: async (fx, steps) => { steps.save2 = await save2(fx, fx.snap.visitIen, { provider: true, sc: true }); return steps.save2; },
    verdict: (resp, st) => (/^1(\^|\r?\n|$)/.test(resp) && !isCheckedOut(st) ? 'match' : 'unexpected')
  },
  T3c: {
    desc: 'ORWPCE SAVE with POV, CPT, provider and SC classification',
    fixture: { checkIn: true },
    expectation: 'check-out set and encounter status no longer ACTION REQUIRED',
    run: async (fx, steps) => { steps.orwpce = await orwpceSave(fx, fx.snap.visitIen, { dxcpt: true, provider: true, sc: true }); return steps.orwpce; },
    verdict: (resp, st) => (filed(resp) && isCheckedOut(st) && !/ACTION REQUIRED/.test(st.encounterStatus_409_68_12) ? 'match' : 'unexpected')
  },
  T8c: {
    desc: 'SAVE2 with POV, CPT, provider and SC classification, then SDES2 SET APPT CHECKOUT',
    fixture: { checkIn: true },
    expectation: 'checked out and Scheduling status no longer ACT REQ',
    async run(fx, steps) {
      steps.save2 = await save2(fx, fx.snap.visitIen, { provider: true, sc: true });
      steps.checkout = await sdes2CheckOut(fx.appointmentIen, fx.checkOutIso);
      steps.currentStatus = (((steps.checkout || {}).Appointment || [])[0] || {}).CurrentStatus;
      return steps.save2;
    },
    verdict: (resp, st, steps) => (filed(resp) && isCheckedOut(st) && !/ACT REQ/.test(steps.currentStatus || st.encounterStatus_409_68_12) ? 'match' : 'unexpected')
  },
  T9c: {
    desc: 'SDES2 SET APPT CHECKOUT first, then SAVE2 with POV, CPT, provider and SC classification',
    fixture: { checkIn: true },
    expectation: 'checked out and encounter status no longer ACTION REQUIRED',
    async run(fx, steps) {
      steps.checkout = await sdes2CheckOut(fx.appointmentIen, fx.checkOutIso);
      steps.save2 = await save2(fx, fx.snap.visitIen, { provider: true, sc: true });
      return steps.save2;
    },
    verdict: (resp, st) => (filed(resp) && isCheckedOut(st) && !/ACTION REQUIRED/.test(st.encounterStatus_409_68_12) ? 'match' : 'unexpected')
  },
  T6c: {
    desc: 'SAVE2 with complete data (POV, CPT, provider, SC), then a check-out-only ORWPCE SAVE on the same visit',
    fixture: { checkIn: true },
    expectation: 'checked out and encounter status no longer ACTION REQUIRED, no duplicates (stand-in for a check-out-only DATA2PCE call)',
    async run(fx, steps) {
      steps.save2 = await save2(fx, fx.snap.visitIen, { provider: true, sc: true });
      const visit = ((steps.save2.match(/^-?\d+\^(\d+)/) || [])[1]) || fx.snap.visitIen;
      steps.visit = visit;
      steps.countsAfterSave2 = await vCounts(visit);
      steps.orwpce = await orwpceSave(fx, visit);
      steps.countsAfterOrwpce = await vCounts(visit);
      return steps.orwpce;
    },
    verdict(resp, st, steps) {
      const a = steps.countsAfterSave2;
      const b = steps.countsAfterOrwpce;
      const dup = a && b && (a.vPov !== b.vPov || a.vCpt !== b.vCpt);
      return filed(resp) && !dup && isCheckedOut(st) && !/ACTION REQUIRED/.test(st.encounterStatus_409_68_12) ? 'match' : 'unexpected';
    }
  },
  T6: {
    desc: 'SAVE2 with POV and CPT, then ORWPCE SAVE header only, same visit',
    fixture: { checkIn: true },
    expectation: 'no duplicate V POV or V CPT; check-out set by ORWPCE SAVE',
    async run(fx, steps) {
      steps.save2 = await save2(fx, fx.snap.visitIen);
      const visit = ((steps.save2.match(/^-?\d+\^(\d+)/) || [])[1]) || fx.snap.visitIen;
      steps.visit = visit;
      steps.countsAfterSave2 = await vCounts(visit);
      steps.orwpce = await orwpceSave(fx, visit);
      steps.countsAfterOrwpce = await vCounts(visit);
      return steps.orwpce;
    },
    verdict(resp, st, steps) {
      const a = steps.countsAfterSave2;
      const b = steps.countsAfterOrwpce;
      const dup = a && b && (a.vPov !== b.vPov || a.vCpt !== b.vCpt);
      return filed(steps.save2) && filed(resp) && !dup && isCheckedOut(st) ? 'match' : 'unexpected';
    }
  },
  T8: {
    desc: 'SAVE2 with POV and CPT, then SDES2 SET APPT CHECKOUT',
    fixture: { checkIn: true },
    expectation: 'data filed, then appointment checked out',
    async run(fx, steps) {
      steps.save2 = await save2(fx, fx.snap.visitIen);
      steps.checkout = await sdes2CheckOut(fx.appointmentIen, fx.checkOutIso);
      return steps.save2;
    },
    verdict: checkedOut
  },
  T9: {
    desc: 'SDES2 SET APPT CHECKOUT first, then SAVE2 with POV and CPT',
    fixture: { checkIn: true },
    expectation: 'checked out, and data still filed afterward',
    async run(fx, steps) {
      steps.checkout = await sdes2CheckOut(fx.appointmentIen, fx.checkOutIso);
      steps.save2 = await save2(fx, fx.snap.visitIen);
      return steps.save2;
    },
    verdict: checkedOut
  }
};

async function runOne(id, apply, dayOffset) {
  const t = TESTS[id];
  const p = plan({ dayOffset, checkIn: t.fixture.checkIn });
  console.log(`\n== ${id}: ${t.desc}`);
  console.log('fixture plan', JSON.stringify(p));
  if (!apply) {
    console.log('preview only: would create the appointment, optionally check in, call the RPC(s), snapshot before/after (use --apply)');
    return null;
  }
  const fx = await createFixture(p);
  console.log(`appointment ${fx.appointmentIen}, visit ${fx.snap.visitIen || '(none yet)'}`);
  const before = fx.snap;
  const steps = {};
  let resp;
  let error = null;
  try { resp = await t.run(fx, steps); } catch (e) { error = e.message; resp = `ERROR ${e.message}`; }
  const after = await snapshot(fx.appointmentIen);
  const st = checkoutState(after);
  const verdict = error ? 'error' : t.verdict(resp, st, steps);
  const record = {
    id, desc: t.desc, expectation: t.expectation,
    observed: `${resp.split(/\r?\n/)[0]} | checkedOut=${isCheckedOut(st)} | status=${st.encounterStatus_409_68_12}`,
    verdict, appointmentIen: fx.appointmentIen, visitIen: after.visitIen || before.visitIen,
    request: { pkg: PKGNAME, src: SRC, context: CTX_PCE, pcelist: pcelist(fx, {}) }, response: resp, steps,
    checkInResult: fx.checkInResult, before, after, checkoutState: st
  };
  console.log(`result: ${record.observed} -> ${verdict}\nfile: ${report.write(record)}`);
  return record;
}

async function main() {
  assertDevSite();
  const id = process.argv[2];
  const apply = process.argv.includes('--apply');
  const ids = id === 'all' ? Object.keys(TESTS) : [id];
  if (!id || ids.some((i) => !TESTS[i])) throw new Error(`Usage: checkout-test.js <${Object.keys(TESTS).join('|')}|all> [--apply] [--day-offset N]`);
  const records = [];
  let off = Number(arg('--day-offset', '0'));
  for (const i of ids) {
    const r = await runOne(i, apply, off);
    off += 1;
    if (r) records.push(r);
  }
  if (records.length) report.summary(records);
}

main().catch((err) => {
  console.error(err.message);
  if (err.details) console.error(JSON.stringify(err.details));
  process.exit(1);
});
