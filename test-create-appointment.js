// Smoke test: create one past appointment via SDEC ARSET + SDEC APPADD.
// Usage: node test-create-appointment.js [--dfn 100965] [--date 2025-10-21] [--time 10:00] [--dry-run] [--overbook|--no-overbook]
const config = require('./src/config');
const {
  defaultOverbook, roundDownToHalfHour, buildDateParts, buildArsetParams, createAppointment
} = require('./src/appointmentCreator');

function parseArgs(argv) {
  const args = { dfn: '100965', date: '2025-10-21', time: '10:00', dryRun: false, overbook: null, roundTime: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dfn') args.dfn = argv[++i];
    else if (arg === '--date') args.date = argv[++i];
    else if (arg === '--time') args.time = argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--overbook') args.overbook = true;
    else if (arg === '--no-overbook') args.overbook = false;
    else if (arg === '--round-time') args.roundTime = true;
  }
  if (args.overbook === null) {
    args.overbook = defaultOverbook(args.date);
  }
  if (args.roundTime) {
    args.time = roundDownToHalfHour(args.time);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const clinicIen = config.clinicIen();
  const resourceIen = config.resourceIen();
  const clinicName = 'GENERAL MEDICINE';

  console.log('Config: dfn=%s date=%s time=%s clinicIen=%s resourceIen=%s overbook=%s dryRun=%s',
    args.dfn, args.date, args.time, clinicIen, resourceIen, args.overbook, args.dryRun);

  if (args.dryRun) {
    const { startDateTime, desiredDate } = buildDateParts(args.date, args.time);
    const arsetParams = buildArsetParams({ dfn: args.dfn, clinicIen, clinicName, startDateTime, desiredDate });
    console.log('\n[DRY RUN] Would call SDEC ARSET with params:', JSON.stringify(arsetParams));
    console.log('[DRY RUN] No RPC calls made.');
    process.exit(0);
  }

  console.log('\nStep 1: SDEC ARSET (create request)...');
  console.log('Step 2: SDEC APPADD (create appointment)...');
  const result = await createAppointment({
    dfn: args.dfn, date: args.date, time: args.time, clinicIen, resourceIen, clinicName, overbook: args.overbook
  });

  console.log('\nSUCCESS');
  console.log('  Request IEN:', result.requestIen);
  console.log('  Appointment IEN:', result.appointmentIen);
  console.log('  Latency:', `${result.latencyMs}ms`);
  process.exit(0);
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  if (err.payload) console.error('  Raw payload:', err.payload);
  if (err.details) console.error('  Details:', JSON.stringify(err.details));
  process.exit(1);
});
