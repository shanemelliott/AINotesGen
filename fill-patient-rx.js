// Refill every active Rx of a patient that still has refills (DEV ONLY). Dry run unless --commit.
// Each refill is dated last fill + days supply + a small deterministic lateness, and skipped if that date is after today.
// Usage: node fill-patient-rx.js --dfn <dfn> [--late-max <days>] [--commit]
//   --late-max  most days a fill can be late (default 5; each Rx gets IEN % (late-max + 1) days)
require('./src/config'); // loads .env
const { callRpc } = require('./src/vistaApiClient');
const { fileRefill } = require('./src/rxFill');

function arg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const ymd = (n) => String(n).slice(0, 8);
const parseDay = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

async function main() {
  const args = process.argv.slice(2);
  const dfn = arg(args, '--dfn');
  const lateMax = args.includes('--late-max') ? Number(arg(args, '--late-max')) : 5;
  const commit = args.includes('--commit');
  if (!/^\d+$/.test(dfn || '') || !Number.isInteger(lateMax) || lateMax < 0) {
    console.error('Usage: node fill-patient-rx.js --dfn <dfn> [--late-max <days>] [--commit]');
    process.exit(1);
  }

  const body = await callRpc('VPR GET PATIENT DATA JSON', [{ namedArray: { patientId: dfn } }], 'CDSP RPC CONTEXT',
    { jsonResult: true, timeout: 120000, raw: true });
  const items = body?.payload?.data?.items || [];
  const meds = items.filter((it) => String(it.uid || '').split(':')[2] === 'med'
    && it.vaStatus === 'ACTIVE' && /^\d+;O$/.test(it.localId || '')
    && Number(it.orders?.[0]?.fillsRemaining) > 0);

  const today = Date.now();
  console.log(`${commit ? 'COMMIT' : 'DRY RUN'}: DFN ${dfn}, ${meds.length} active Rx with refills remaining\n`);
  let filed = 0;
  let skipped = 0;
  let failed = 0;
  for (const med of meds.sort((a, b) => String(a.name).localeCompare(b.name) || Number(a.localId) - Number(b.localId))) {
    const ien = parseInt(med.localId, 10);
    const order = med.orders[0];
    const fills = (med.fills || []).map((f) => ymd(f.dispenseDate)).filter(Boolean).sort();
    const days = Number(order.daysSupply) || Number(med.fills?.[0]?.daysSupplyDispensed) || 30;
    const label = `${String(med.name).padEnd(40)} Rx ${order.prescriptionId} (IEN ${ien})`;
    if (!fills.length) {
      console.log(`SKIP  ${label}: no fill on record`);
      skipped += 1;
      continue;
    }
    const fillMs = parseDay(fills[fills.length - 1]) + (days + (ien % (lateMax + 1))) * 86400000;
    if (fillMs > today) {
      console.log(`SKIP  ${label}: next fill ${isoDay(fillMs)} is after today`);
      skipped += 1;
      continue;
    }
    try {
      const r = await fileRefill({ dfn, rxIen: ien, fillDate: isoDay(fillMs), commit });
      console.log(`${r.dryRun ? 'WOULD' : 'FILED'} ${label}: refill #${r.refillNumber} on ${isoDay(fillMs)}, ${r.refillsRemaining} left${r.early ? ' (early)' : ''}`);
      filed += 1;
    } catch (err) {
      console.log(`FAIL  ${label}: ${err.message}`);
      failed += 1;
    }
  }
  console.log(`\n${commit ? 'Filed' : 'Would file'} ${filed}, skipped ${skipped}, failed ${failed}`);
  if (!commit) console.log('Nothing was written. Add --commit to file them.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
