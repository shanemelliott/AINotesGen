// Cancel an appointment by its SDEC APPOINTMENT IEN (RPC SDEC APPDEL, cancelled by clinic). DEV ONLY. Dry run unless --apply.
// Usage: node cancel-appointment.js --ien <409.84 ien> [--reason "APPOINTMENT NO LONGER REQUIRED"] [--note "<text>"] [--apply]
// Find the IEN with: node logs/probe-appts.js <dfn> <from> <to> (SDES GET APPTS BY PATIENT DFN3 returns AppointmentIEN).
// Undo with SDEC UNCANCEL APPT (UNDOCANA^SDEC08) using the same IEN.
require('./src/config');
const { callRpc } = require('./src/vistaApiClient');

const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : undefined);
const ien = arg('--ien');
if (!/^\d+$/.test(ien || '')) { console.error('Usage: node cancel-appointment.js --ien <ien> [--reason <text>] [--note <text>] [--apply]'); process.exit(1); }
const reason = arg('--reason') || 'APPOINTMENT NO LONGER REQUIRED';
const note = arg('--note') || 'Cancelled for test data setup.';

(async () => {
  if (!process.argv.includes('--apply')) { console.log(`DRY RUN: would cancel SDEC appointment ${ien} (type C, reason ${reason}, note "${note}")`); return; }
  const r = await callRpc('SDEC APPDEL', [ien, 'C', reason, note].map((s) => ({ string: s })), 'SDECRPC', { timeout: 60000 });
  console.log(`SDEC APPDEL ${ien}: ${JSON.stringify(r)}`);
})().catch((e) => { console.error(`FAIL ${e.message}`); process.exit(1); });
