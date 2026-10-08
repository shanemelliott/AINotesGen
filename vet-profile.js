// Derive a veteran service profile for a loaded patient, review it, and set it in VistA (DEV ONLY).
// Usage: node vet-profile.js --dfn <dfn> [--derive-only] [--apply] [--from-file]
//   default      derive, write output/vet-profile-<dfn>.json, dry run through CDSP UTIL VET SET
//   --apply      write the values (only after reviewing a dry run)
//   --from-file  use the (possibly hand-edited) output/vet-profile-<dfn>.json instead of deriving
// The dry-run report with the old values is saved to logs/vet-dryrun-<dfn>.json (rollback input).
const fs = require('fs');
const path = require('path');
require('./src/config'); // loads .env
const { callRpc } = require('./src/vistaApiClient');
const { parseRpcResult } = require('./src/fhirBundleTransport');
const { deriveProfile, profileFields, fmDate } = require('./src/vetProfile');

const rules = JSON.parse(fs.readFileSync(path.join(__dirname, 'src', 'veteran-rules.json'), 'utf8'));
const list = (v) => (Array.isArray(v) ? v : Object.values(v || {}));

async function vprItems(dfn) {
  const body = await callRpc('VPR GET PATIENT DATA JSON', [{ namedArray: { patientId: dfn } }], 'CDSP RPC CONTEXT',
    { jsonResult: true, timeout: 120000, raw: true });
  if (body?.payload?.error) throw new Error(body.payload.error.message);
  return body?.payload?.data?.items || [];
}

function describe(p) {
  const lines = [
    `${p.name} (DFN ${p.dfn}), born ${p.dob}`,
    `  Service: ${p.branch.name}, ${p.periodOfService.name}, ${p.entryDate} to ${p.separationDate}`,
    `  Service connected: ${p.serviceConnected ? `YES, ${p.combinedPercent}% combined (exact ${p.combinedExact})` : 'NO'}`,
    ...p.ratedDisabilities.map((d) => `    ${String(d.percent).padStart(3)}%  ${d.dxCode} ${d.label}  <- "${d.source}" (${d.onset || 'no onset'})${d.presumptive ? ' presumptive' : ''}`),
    `  Primary eligibility: ${p.primaryEligibility.name}; priority group ${p.priorityGroup}; enrollment ${p.enrollmentStatus.name}${p.enrollmentDate ? ` ${p.enrollmentDate}` : ''}`,
    ...(p.mst ? [`  MST: ${p.mst.name} ${p.mst.date}`] : []),
    `  Combat: ${p.combat ? `YES ${p.combat.location?.name || ''} ${p.combat.from} to ${p.combat.to}` : 'NO'}`,
    `  Vietnam service: ${p.exposures.vietnam ? `YES ${p.exposures.vietnam.from} to ${p.exposures.vietnam.to}` : 'NO'}; Agent Orange: ${p.exposures.agentOrange ? 'YES' : 'NO'}`,
    `  Persian Gulf / SW Asia service: ${p.exposures.persianGulf ? `YES ${p.exposures.persianGulf.from} to ${p.exposures.persianGulf.to}` : 'NO'}; POW: ${p.pow ? 'YES' : 'NO'}`,
  ];
  return lines.join('\n');
}

async function setProfile(profile, apply) {
  const items = {};
  let n = 0;
  for (const [field, value] of Object.entries(profile.fields)) items[String(++n)] = `F^${field}^${value}`;
  for (const d of profile.ratedDisabilities) items[String(++n)] = `D^${d.dxCode}^${d.percent}^${d.serviceConnected}`;
  const f = profile.fields;
  items[String(++n)] = `E^${f['.326']}^${f['.327']}^${f['.325']}^${f['.324'] || ''}`;
  const fm = (s) => fmDate(new Date(`${s}T00:00:00Z`));
  if (profile.enrollmentDate) items[String(++n)] = `N^${profile.priorityGroup}^${profile.enrollmentStatus.ien}^${fm(profile.enrollmentDate)}`;
  if (profile.mst) items[String(++n)] = `M^${profile.mst.status}^${fm(profile.mst.date)}`;
  const payload = await callRpc('CDSP UTIL VET SET',
    [{ string: String(profile.dfn) }, { namedArray: items }, { string: apply ? '1' : '0' }], 'CDSP RPC UTILS', { timeout: 60000 });
  const result = parseRpcResult(payload);
  if (result.ERROR) throw new Error(`CDSP UTIL VET SET: ${result.ERROR}`);
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const dfn = args.includes('--dfn') ? args[args.indexOf('--dfn') + 1] : undefined;
  const apply = args.includes('--apply');
  if (!/^\d+$/.test(dfn || '')) {
    console.error('Usage: node vet-profile.js --dfn <dfn> [--derive-only] [--apply] [--from-file]');
    process.exit(1);
  }

  const outPath = path.join(__dirname, 'output', `vet-profile-${dfn}.json`);
  let profile;
  if (args.includes('--from-file')) {
    profile = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  } else {
    profile = deriveProfile({ dfn, items: await vprItems(dfn) }, rules);
    profile.fields = profileFields(profile);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(profile, null, 2));
  }
  console.log(describe(profile));
  console.log(`\nProfile: ${outPath}`);
  if (args.includes('--derive-only')) return;

  const result = await setProfile(profile, apply);
  const rows = list(result.changes);
  console.log(`\n${apply ? 'APPLY' : 'DRY RUN'}: ${rows.filter((r) => r.status === 'changed').length} field change(s), rated disabilities ${result.ratedDisabilitiesChange}, service episodes ${result.serviceEpisodesChange}, enrollment ${result.enrollmentChange}, MST ${result.mstChange}, ${result.errors} error(s)`);
  for (const r of rows.filter((x) => x.status !== 'unchanged')) {
    console.log(`  ${String(r.item)} ${String(r.field).padEnd(9)} ${String(r.label).padEnd(34)} ${String(r.old).padEnd(9)} -> ${String(r.new).padEnd(14)} ${r.status}`);
  }
  if (!apply) {
    const dryPath = path.join(__dirname, 'logs', `vet-dryrun-${dfn}.json`);
    fs.writeFileSync(dryPath, JSON.stringify(result, null, 2));
    console.log(`\nDry-run report (old values): ${dryPath}`);
  } else {
    console.log(result.applied ? 'Written.' : `Not written: ${result.writeError || 'errors above'}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
