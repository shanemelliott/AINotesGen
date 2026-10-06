// Smoke test for SDES2 CREATE WALKIN APPT (context SDESRPC). WRITES a walk-in appointment and check-in.
// Usage: node test-walkin.js [--dfn 100969] [--clinic 426] [--date 1978-10-06] [--time 10:00] [--type REGULAR] [--length 60]
require('./src/config'); // loads .env
const crypto = require('crypto');
const { callRpc } = require('./src/vistaApiClient');
const { getDuzForSite } = require('./src/tokenService');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const dfn = arg('--dfn', '100969');
const clinic = arg('--clinic', '426');
const date = arg('--date', '1978-10-06');
const time = arg('--time', '10:00');
const length = Number(arg('--length', '60'));
const type = arg('--type', 'REGULAR');

const iso = (d, t, addMin = 0) => {
  const [h, m] = t.split(':').map(Number);
  const mins = h * 60 + m + addMin;
  return `${d}T${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:00-05:00`;
};

async function main() {
  const duz = await getDuzForSite(process.env.VISTA_SITE_ID);
  const context = {
    'ACHERON AUDIT ID': crypto.randomBytes(20).toString('hex'),
    'PATIENT DFN': dfn,
    'USER DUZ': duz
  };
  const params = {
    'APPOINTMENT TYPE NAME': type,
    'PATIENT STATUS': 'E',
    'APPT LENGTH': String(length),
    'APPT START': iso(date, time),
    'APPT END': iso(date, time, length),
    DFN: dfn,
    'PATIENT INDICATED DATE': iso(date, time),
    'CLINIC IEN': clinic,
    OVERBOOK: 'O',
    'STATION NUMBER': process.env.VISTA_SITE_ID,
    SDNOTE: 'Synthea walk-in smoke test'
  };
  console.log('SDCONTEXT', JSON.stringify(context));
  console.log('PARAMS', JSON.stringify(params));
  const out = await callRpc(
    'SDES2 CREATE WALKIN APPT',
    [{ namedArray: context }, { namedArray: params }],
    'SDESRPC',
    { jsonResult: true, timeout: 60000 }
  );
  console.log('RESULT', JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  if (err.details) console.error(JSON.stringify(err.details));
  process.exit(1);
});
