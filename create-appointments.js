// Batch-create appointments for encounters missing them (reads output/encounters-{dfn}.json).
// Usage: node create-appointments.js [--dfn 100965] [--dry-run]
const fs = require('fs');
const path = require('path');
const config = require('./src/config');
const clinicLookup = require('./src/clinic-lookup.json');
const { createAppointment, defaultOverbook, roundDownToHalfHour } = require('./src/appointmentCreator');

// Clinic for the encounter's visit location; unknown locations use the lookup default.
function clinicFor(encounter) {
  const name = clinicLookup.clinics[encounter.clinic] ? encounter.clinic : clinicLookup.default;
  return { clinicName: name, ...clinicLookup.clinics[name] };
}

const APPOINTMENTS_LOG_PATH = path.join(__dirname, 'src', 'appointments.json');

function parseArgs(argv) {
  const args = { dfn: '100965', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dfn') args.dfn = argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
  }
  return args;
}

function loadEncounters(dfn) {
  const encountersPath = path.join(__dirname, 'output', `encounters-${dfn}.json`);
  if (!fs.existsSync(encountersPath)) {
    throw new Error(`Encounters file not found: ${encountersPath}`);
  }
  const data = JSON.parse(fs.readFileSync(encountersPath, 'utf8'));
  return data.encounters || [];
}

function loadAppointmentsLog() {
  if (!fs.existsSync(APPOINTMENTS_LOG_PATH)) return [];
  return JSON.parse(fs.readFileSync(APPOINTMENTS_LOG_PATH, 'utf8'));
}

// Atomic write: write to temp file, then rename over the target.
function saveAppointmentsLog(records) {
  const tmpPath = `${APPOINTMENTS_LOG_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(records, null, 2));
  fs.renameSync(tmpPath, APPOINTMENTS_LOG_PATH);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const encounters = loadEncounters(args.dfn);
  const missing = encounters.filter((e) => !e.hasAppointment);
  const log = loadAppointmentsLog();
  const alreadyCreated = new Set(
    log.filter((r) => r.dfn === args.dfn).map((r) => r.date)
  );

  console.log(`Found ${missing.length} encounters missing appointments for DFN ${args.dfn}. dryRun=${args.dryRun}`);

  const created = [];
  const skipped = [];
  const failed = [];

  for (const encounter of missing) {
    const { date, time } = encounter;
    const slotTime = roundDownToHalfHour(time);

    if (alreadyCreated.has(date)) {
      console.log(`SKIP  ${date}: appointment already created`);
      skipped.push(date);
      continue;
    }

    const overbook = defaultOverbook(date);
    const { clinicName, clinicIen, resourceIen } = clinicFor(encounter);

    if (args.dryRun) {
      console.log(`DRY   ${date} @ ${time} -> ${slotTime}: would create at ${clinicName} (${clinicIen}/${resourceIen}, overbook=${overbook})`);
      continue;
    }

    console.log(`START ${date} @ ${time} -> ${slotTime}...`);
    try {
      const result = await createAppointment({
        dfn: args.dfn, date, time: slotTime, clinicIen, resourceIen, clinicName, overbook
      });
      console.log(`OK    ${date}: requestIen=${result.requestIen} appointmentIen=${result.appointmentIen} (${result.latencyMs}ms)`);
      created.push({
        dfn: args.dfn,
        date,
        time: slotTime,
        requestIen: result.requestIen,
        appointmentIen: result.appointmentIen,
        clinicIen,
        resourceIen,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      console.error(`FAIL  ${date}: ${err.message}`);
      failed.push({ date, reason: err.message });
    }
  }

  if (created.length > 0) {
    const updatedLog = log.concat(created);
    saveAppointmentsLog(updatedLog);
  }

  console.log('\nSummary:');
  console.log(`  Created: ${created.length}`);
  console.log(`  Skipped: ${skipped.length}`);
  console.log(`  Failed:  ${failed.length}`);
  if (failed.length > 0) {
    console.log('  Failed dates:', failed.map((f) => f.date).join(', '));
    console.log('  Re-run after checking logs; already-created dates will be skipped.');
  }

  if (args.dryRun) {
    process.exit(0);
  }
  process.exit(failed.length > 0 && created.length === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
