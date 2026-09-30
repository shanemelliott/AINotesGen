// Shared SDEC ARSET + APPADD logic for creating a single appointment.
const { callRpc } = require('./vistaApiClient');

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Historical dates rarely have a slot template built out in VistA, so
// default to overbook=true for past dates unless the caller overrides it.
function defaultOverbook(dateStr) {
  return dateStr < todayIso();
}

// Clinic slot templates are usually on the hour/half-hour; round the
// encounter's actual time backward to the nearest 30-minute boundary
// so the appointment lands on a plausible slot (e.g. 12:24 -> 12:00).
function roundDownToHalfHour(timeStr) {
  const [hour, minute] = timeStr.split(':').map(Number);
  const roundedMinute = minute < 30 ? 0 : 30;
  return `${String(hour).padStart(2, '0')}:${String(roundedMinute).padStart(2, '0')}`;
}

// Builds VistA-formatted date pieces without timezone drift (no Date object parsing of the input string).
function buildDateParts(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const monthName = MONTHS[month - 1];
  const dayPadded = String(day).padStart(2, '0');
  const hourPadded = String(hour).padStart(2, '0');
  const minutePadded = String(minute).padStart(2, '0');
  const monthPadded = String(month).padStart(2, '0');

  const startDateTime = `${monthName} ${dayPadded}, ${year}@${hourPadded}:${minutePadded}`;
  const desiredDate = `${monthPadded}/${dayPadded}/${year}`;

  let endHour = hour + 1;
  if (endHour >= 24) endHour = 0;
  const endDateTime = `${monthName} ${dayPadded}, ${year}@${String(endHour).padStart(2, '0')}:${minutePadded}`;

  return { startDateTime, endDateTime, desiredDate };
}

function buildArsetParams({ dfn, clinicIen, clinicName, startDateTime, desiredDate }) {
  return [
    '', dfn, startDateTime, clinicName, 'APPT', clinicIen, 'SYSTEM USER', 'ASAP', 'PATIENT',
    '', desiredDate, '', 'GROUP 1', 'NO', '0', '0', '', 'YES', '75', desiredDate, '',
    '11', 'ESTABLISHED', '', '', '', '', '', ''
  ];
}

function buildAppaddParams({ dfn, clinicIen, resourceIen, startDateTime, endDateTime, desiredDate, requestIen, overbook }) {
  return [
    startDateTime, endDateTime, dfn, resourceIen, '60', '', '0', '0', 'FALSE', desiredDate,
    'PATIENT', '', '', '', `A|${requestIen}`, 'YES', '', clinicIen, '', '', '11', 'ESTABLISHED',
    overbook ? '1' : '0', '', '16'
  ];
}

function parseRequestIen(payload) {
  const match = payload.match(/\x1E(\d+)/);
  return match ? match[1] : null;
}

function parseAppointmentIen(payload) {
  const match = payload.match(/\x1E(\d+)/);
  // "0" is VistA's failure indicator, not a valid IEN
  return match && match[1] !== '0' ? match[1] : null;
}

function extractErrorText(payload) {
  const parts = payload.split('|');
  return parts.length > 1 ? parts.slice(1).join('|').trim() : payload;
}

// Creates one appointment via SDEC ARSET + SDEC APPADD.
// Throws an Error (with .code and .payload set) on any failure.
async function createAppointment({ dfn, date, time, clinicIen, resourceIen, clinicName, overbook }) {
  const resolvedOverbook = overbook === undefined ? defaultOverbook(date) : overbook;
  const { startDateTime, endDateTime, desiredDate } = buildDateParts(date, time);
  const start = Date.now();

  const arsetParams = buildArsetParams({ dfn, clinicIen, clinicName, startDateTime, desiredDate });
  const arsetPayload = await callRpc('SDEC ARSET', arsetParams, 'SDECRPC');
  const requestIen = parseRequestIen(arsetPayload);
  if (!requestIen) {
    const err = new Error(`Could not parse requestIEN from ARSET response: ${arsetPayload}`);
    err.code = 'ARSET_PARSE_FAILED';
    err.payload = arsetPayload;
    throw err;
  }

  const appaddParams = buildAppaddParams({
    dfn, clinicIen, resourceIen, startDateTime, endDateTime, desiredDate, requestIen, overbook: resolvedOverbook
  });
  const appaddPayload = await callRpc('SDEC APPADD', appaddParams, 'SDECRPC');
  const appointmentIen = parseAppointmentIen(appaddPayload);
  if (!appointmentIen) {
    const err = new Error(`SDEC APPADD failed: ${extractErrorText(appaddPayload)}`);
    err.code = 'APPADD_FAILED';
    err.payload = appaddPayload;
    err.requestIen = requestIen;
    throw err;
  }

  return {
    requestIen,
    appointmentIen,
    overbook: resolvedOverbook,
    latencyMs: Date.now() - start
  };
}

module.exports = {
  todayIso,
  defaultOverbook,
  roundDownToHalfHour,
  buildDateParts,
  buildArsetParams,
  buildAppaddParams,
  parseRequestIen,
  parseAppointmentIen,
  extractErrorText,
  createAppointment
};
