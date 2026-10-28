'use strict';
// Preflight for a loaded patient: fail if any visit or appointment sits at 00:00 to 04:59 outside the ED (VistA files 00:00 as ".24").
// Usage: node patient.js check-midnight <dfn>   (reads <dfn>.json from fetch-vpr.js; exit 1 when any are found)

const { ROOT } = require('../../src/paths');
const fs = require('fs');
const path = require('path');
const { indexVpr, day, isoDate, hhmm } = require('../../src/encounters');

const dfn = process.argv[2];
if (!/^\d+$/.test(dfn || '')) {
  console.error('Usage: node patient.js check-midnight <dfn>');
  process.exit(2);
}

const file = path.join(ROOT, `${dfn}.json`);
if (!fs.existsSync(file)) {
  console.error(`Patient file not found: ${dfn}.json (run fetch-vpr.js ${dfn} first)`);
  process.exit(2);
}

const items = JSON.parse(fs.readFileSync(file, 'utf8'))?.payload?.data?.items;
if (!Array.isArray(items)) {
  console.error(`${dfn}.json has no payload.data.items array`);
  process.exit(2);
}

const { byDomain } = indexVpr(items);
const bad = [];
for (const [kind, rows] of [['visit', byDomain.visit || []], ['appointment', byDomain.appointment || []]]) {
  for (const r of rows) {
    const stamp = String(r.dateTime || '');
    if (stamp.length < 12) continue;
    const hour = Number(hhmm(stamp).slice(0, 2));
    if (hour >= 5 || r.locationName === 'EMERGENCY DEPARTMENT') continue;
    bad.push(`${kind.padEnd(11)} ${isoDate(day(stamp))} ${hhmm(stamp)}  ${r.locationName || 'UNKNOWN'}`);
  }
}

if (bad.length === 0) {
  console.log(`DFN ${dfn}: no visits or appointments between 00:00 and 04:59 outside the ED.`);
} else {
  console.log(`DFN ${dfn}: ${bad.length} visit(s) or appointment(s) between 00:00 and 04:59 outside the ED:`);
  bad.forEach((b) => console.log(`  ${b}`));
  process.exitCode = 1;
}
