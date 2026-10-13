// Build a refill history plan for a patient's Rxs that still have refills (DEV ONLY, read only).
// Each Rx gets its remaining refills one after another: last fill + days supply + a small lateness, with an
// occasional longer gap, stopping at today or the Rx's expiration date. Dates are deterministic per Rx.
// Usage: node fill-history.js --dfn <dfn> [--late-max <days>] [--gap-chance <0-1>] [--out plans/dfn<dfn>-history.json]
// Then review the plan and file it: node fill-plan.js --plan <plan.json> [--commit]
const fs = require('fs');
const path = require('path');
require('./src/config'); // loads .env
const { callRpc } = require('./src/vistaApiClient');

function arg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const DAY = 86400000;
const parseDay = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// Small seeded generator so a re-run gives the same dates.
function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dfn = arg(args, '--dfn');
  const lateMax = args.includes('--late-max') ? Number(arg(args, '--late-max')) : 10;
  const gapChance = args.includes('--gap-chance') ? Number(arg(args, '--gap-chance')) : 0.15;
  if (!/^\d+$/.test(dfn || '') || !Number.isInteger(lateMax) || lateMax < 0 || !(gapChance >= 0 && gapChance <= 1)) {
    console.error('Usage: node fill-history.js --dfn <dfn> [--late-max <days>] [--gap-chance <0-1>] [--out <plan.json>]');
    process.exit(1);
  }
  const outPath = path.resolve(arg(args, '--out') || path.join(__dirname, 'plans', `dfn${dfn}-history.json`));

  const body = await callRpc('VPR GET PATIENT DATA JSON', [{ namedArray: { patientId: dfn } }], 'CDSP RPC CONTEXT',
    { jsonResult: true, timeout: 120000, raw: true });
  const items = body?.payload?.data?.items || [];
  const meds = items.filter((it) => String(it.uid || '').split(':')[2] === 'med'
    && /^\d+;O$/.test(it.localId || '')
    && ['ACTIVE', 'EXPIRED'].includes(it.vaStatus)
    && Number(it.orders?.[0]?.fillsRemaining) > 0
    && (it.fills || []).length > 0);

  const today = Date.now();
  const fills = [];
  const perDrug = {};
  for (const med of meds.sort((a, b) => parseInt(a.localId, 10) - parseInt(b.localId, 10))) {
    const ien = parseInt(med.localId, 10);
    const order = med.orders[0];
    const days = Number(order.daysSupply) || 30;
    const stopStr = String(med.overallStop || '').slice(0, 8);
    const limit = Math.min(today, /^\d{8}$/.test(stopStr) ? parseDay(stopStr) : today);
    let prev = parseDay(med.fills.map((f) => String(f.dispenseDate).slice(0, 8)).sort().pop());
    const rand = rng(ien * 7919);
    for (let k = 0; k < Number(order.fillsRemaining); k += 1) {
      let late = Math.floor(rand() * (lateMax + 1));
      if (rand() < gapChance) late += 14 + Math.floor(rand() * 32);
      const next = prev + (days + late) * DAY;
      if (next > limit) break;
      fills.push({ rx: ien, date: isoDay(next) });
      perDrug[med.name] = (perDrug[med.name] || 0) + 1;
      prev = next;
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({
    dfn,
    note: `Refill history for DFN ${dfn}, generated ${isoDay(today)} (late-max ${lateMax} days, gap chance ${gapChance}).`,
    fills,
  }, null, 2));

  console.log(`DFN ${dfn}: ${meds.length} Rxs with refills left, ${fills.length} fills planned`);
  for (const [name, n] of Object.entries(perDrug).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${name}`);
  console.log(`\nPlan written to ${outPath}\nNothing was sent to VistA. Review it, then: node fill-plan.js --plan "${outPath}" [--commit]`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
