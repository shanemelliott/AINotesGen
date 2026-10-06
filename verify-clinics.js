// Check each clinic in src/clinic-lookup.json can take appointments: active, has a resource, and availability slots in a date window.
// Usage: node verify-clinics.js [--from YYYY-MM-DD] [--to YYYY-MM-DD]   (default: today to +14 days)
require('./src/config'); // loads .env
const { callRpc } = require('./src/vistaApiClient');
const lookup = require('./src/clinic-lookup.json');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const day = (offset) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
const from = arg('--from', day(0));
const to = arg('--to', day(14));

// Pattern char to open slots: 0-9 = 0-9, j-z = 10-26; A-W and *$!@# are overbooks, so 0 open.
function openSlots(v) {
  if (typeof v === 'number') return v;
  const s = String(v || '');
  if (/^[0-9]+$/.test(s)) return Number(s);
  if (/^[j-z]$/.test(s)) return s.charCodeAt(0) - 'j'.charCodeAt(0) + 10;
  return 0;
}

async function main() {
  console.log(`Window ${from} to ${to}\n`);
  for (const [name, c] of Object.entries(lookup.clinics)) {
    const row = { name, clinic: c.clinicIen, resource: c.resourceIen };
    try {
      const info = (await callRpc('SDES GET CLINIC INFO2', [String(c.clinicIen)], 'SDECRPC', { jsonResult: true })).Clinic || {};
      row.status = info.ClinicStatus;
      row.resourceMatch = info['Resource IEN'] === c.resourceIen;
      row.overbooksMax = info.OverbooksPerDayMax;
      const av = await callRpc(
        'SDES GET CLIN AVAILABILITY',
        [String(c.clinicIen), `${from}T00:00:01-05:00`, `${to}T23:59:00-05:00`],
        'SDESRPC',
        { jsonResult: true }
      );
      const slots = (av && av.ClinAvail) || [];
      row.windows = slots.length;
      row.windowsWithOpenSlots = slots.filter((s) => openSlots(s.SlotsAvail) > 0).length;
      row.totalOpenSlots = slots.reduce((n, s) => n + openSlots(s.SlotsAvail), 0);
    } catch (err) {
      row.error = err.message;
    }
    console.log(JSON.stringify(row));
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
