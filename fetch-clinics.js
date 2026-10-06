// Look up SDES clinic info (resource IEN, provider, stop code) for hospital locations in logs/file44-locations.json.
// Usage: node fetch-clinics.js [ien ...]   (no args = every location with a stop code except DEV/ test clinics)
// Writes logs/clinics.json and prints the clinics that have an SDEC resource.
const fs = require('fs');
const path = require('path');
require('./src/config'); // loads .env
const { callRpc } = require('./src/vistaApiClient');

const locations = JSON.parse(fs.readFileSync(path.join(__dirname, 'logs', 'file44-locations.json'), 'utf8'));

async function lookup(ien) {
  const p = await callRpc('SDES GET CLINIC INFO2', [{ string: String(ien) }], 'SDECRPC', { jsonResult: true });
  const c = (p && p.Clinic) || {};
  const prov = Array.isArray(c.Provider) ? c.Provider : [];
  const def = prov.find((x) => x.DefaultForClinic === 'YES') || prov[0] || {};
  return {
    clinicIen: c.ClinicIEN || Number(ien),
    name: c.ClinicName,
    status: c.ClinicStatus,
    resourceIen: c['Resource IEN'] || null,
    stopCode: c.StopCodeNum,
    stopName: c.StopCodeName,
    lengthOfAppt: c.LengthOfAppt,
    defaultProvider: def.Name ? { ien: def.IEN, name: def.Name } : null,
    providerCount: prov.length
  };
}

async function main() {
  const wanted = process.argv.slice(2);
  const targets = wanted.length
    ? wanted.map(Number)
    : locations.filter((l) => l.stopCode && !l.name.startsWith('DEV/')).map((l) => l.ien);

  const out = [];
  for (const ien of targets) {
    try {
      out.push(await lookup(ien));
    } catch (err) {
      out.push({ clinicIen: ien, error: err.message });
    }
  }

  fs.writeFileSync(path.join(__dirname, 'logs', 'clinics.json'), JSON.stringify(out, null, 2));
  const usable = out.filter((c) => c.resourceIen && c.status === 'ACTIVE');
  console.log(`${out.length} looked up, ${usable.length} active with a resource, ${out.filter((c) => c.error).length} errors`);
  for (const c of usable) {
    console.log(`${String(c.clinicIen).padEnd(5)} res ${String(c.resourceIen).padEnd(5)} ${String(c.name).padEnd(28)} stop ${c.stopCode} ${c.stopName}  prov: ${c.defaultProvider ? c.defaultProvider.name : '-'}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
