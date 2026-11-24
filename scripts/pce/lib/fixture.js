// Fixture for the PCE check-out tests: one past scheduled appointment (SDEC ARSET + APPADD), optionally checked in (SDES2 CHECKIN).
const crypto = require('crypto');
const { callRpc } = require('../../../src/vistaApiClient');
const { createAppointment } = require('../../../src/appointmentCreator');
const { svcDuz } = require('./ddr');
const { snapshot } = require('./snapshot');

const FIXTURE = { dfn: '100969', clinicIen: '532', resourceIen: '185', clinicName: 'DEV PACT MD 4' };
// Dates in November 2026 (after DST ends, UTC-5) so ISO check-in times need no DST handling.
const BASE_DATE = '2026-11-02';
const UTC_OFFSET = '-05:00';

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function fixtureDate(dayOffset) {
  const date = addDays(BASE_DATE, Number(dayOffset) || 0);
  if (date >= new Date().toISOString().slice(0, 10)) throw new Error(`Fixture date ${date} is not in the past; lower --day-offset`);
  return date;
}

function fmDate(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-');
  return `${Number(y) - 1700}${m}${d}.${timeStr.replace(':', '')}`;
}

function plan({ dayOffset, time = '09:00', checkIn = true }) {
  const date = fixtureDate(dayOffset);
  const [h, m] = time.split(':').map(Number);
  const inTime = `${String(h).padStart(2, '0')}:${String(m + 5).padStart(2, '0')}`;
  return {
    ...FIXTURE, date, time, fmApptDt: fmDate(date, time), checkIn,
    checkInIso: `${date}T${inTime}:00${UTC_OFFSET}`,
    checkOutIso: `${date}T${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}:00${UTC_OFFSET}`
  };
}

function sdesContext() {
  return { 'ACHERON AUDIT ID': crypto.randomBytes(20).toString('hex'), 'PATIENT DFN': FIXTURE.dfn, 'USER DUZ': svcDuz() };
}

async function sdes2CheckIn(apptIen, checkInIso) {
  return callRpc(
    'SDES2 CHECKIN',
    [{ namedArray: sdesContext() }, { namedArray: { 'APPOINTMENT IEN': String(apptIen), 'CHECKIN DATE TIME': checkInIso } }],
    'SDESRPC',
    { jsonResult: true, timeout: 60000, duz: svcDuz() }
  );
}

async function sdes2CheckOut(apptIen, checkOutIso) {
  return callRpc(
    'SDES2 SET APPT CHECKOUT',
    [{ namedArray: sdesContext() }, { namedArray: { 'APPT IEN': String(apptIen), 'CHECKOUT DATE': checkOutIso } }],
    'SDESRPC',
    { jsonResult: true, timeout: 60000, duz: svcDuz() }
  );
}

async function createFixture(p) {
  const appt = await createAppointment({
    dfn: p.dfn, date: p.date, time: p.time, clinicIen: p.clinicIen, resourceIen: p.resourceIen, clinicName: p.clinicName, overbook: true
  });
  let checkInResult = null;
  if (p.checkIn) checkInResult = await sdes2CheckIn(appt.appointmentIen, p.checkInIso);
  const snap = await snapshot(appt.appointmentIen);
  return { ...p, appointmentIen: appt.appointmentIen, requestIen: appt.requestIen, checkInResult, snap };
}

module.exports = { FIXTURE, plan, fmDate, createFixture, sdes2CheckIn, sdes2CheckOut };
