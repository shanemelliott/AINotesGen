// Make VistA demographics follow Lighthouse (DEV ONLY): address, birth date, sex. Dry run unless --apply.
// Usage: node lighthouse-apply-demographics.js [--dfn <dfn> ...] [--all] [--apply]
// Reads docs/lighthouse-review/dfn-*.json (from lighthouse-verify.js). Writes through CDSP UTIL VET SET (F lines).
// Rules: Lighthouse address if it has street, city, state and a ZIP VistA accepts; otherwise an easter egg address
// (src/easter-egg-addresses.json, picked by DFN). Birth date and sex are copied from Lighthouse when it has them.
// Data Lighthouse lacks or cannot hold goes to docs/lighthouse-review/lighthouse-request-items.json.
// All roster patients are written, including DFN 99935791 (owner approved 2026-10-15). Results: docs/lighthouse-review/vista-changes.json.
const fs = require('fs');
const path = require('path');
require('./src/config');
const { callRpc } = require('./src/vistaApiClient');
const { parseRpcResult } = require('./src/fhirBundleTransport');

const DIR = path.join(__dirname, 'docs', 'lighthouse-review');
const eggs = JSON.parse(fs.readFileSync(path.join(__dirname, 'src', 'easter-egg-addresses.json'), 'utf8')).addresses;
const list = (v) => (Array.isArray(v) ? v : Object.values(v || {}));
// File #5 IEN is the state FIPS code on VistA.
const FIPS = { AL: 1, AK: 2, AZ: 4, AR: 5, CA: 6, CO: 8, CT: 9, DE: 10, DC: 11, FL: 12, GA: 13, HI: 15, ID: 16, IL: 17, IN: 18, IA: 19,
  KS: 20, KY: 21, LA: 22, ME: 23, MD: 24, MA: 25, MI: 26, MN: 27, MS: 28, MO: 29, MT: 30, NE: 31, NV: 32, NH: 33, NJ: 34, NM: 35,
  NY: 36, NC: 37, ND: 38, OH: 39, OK: 40, OR: 41, PA: 42, RI: 44, SC: 45, SD: 46, TN: 47, TX: 48, UT: 49, VT: 50, VA: 51, WA: 53,
  WV: 54, WI: 55, WY: 56 };

const fmDate = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? String((+iso.slice(0, 4) - 1700) * 10000 + +iso.slice(5, 7) * 100 + +iso.slice(8, 10)) : null);
const up = (s) => String(s || '').toUpperCase().trim();

function lighthouseAddress(a) {
  const street = (a.line || [])[0];
  const zip = String(a.postalCode || '').replace(/\D/g, '');
  const state = FIPS[up(a.state)];
  if (!street || !a.city || !state) return null;
  if (!/^(\d{5}|\d{9})$/.test(zip) || /^0+$/.test(zip)) return { invalid: `ZIP ${a.postalCode}` };
  return {
    '.111': up(street), '.112': up((a.line || [])[1]), '.113': '', '.114': up(a.city), '.115': String(state), '.1112': zip, '.121': '',
  };
}

function eggFields(dfn) {
  const e = eggs[Number(dfn) % eggs.length];
  return { egg: e, fields: { '.111': e.street1, '.112': '', '.113': '', '.114': e.city, '.115': String(e.stateIen), '.1112': e.zip, '.121': '' } };
}

function plan(review, dfn) {
  const lh = review.lighthouse.patient;
  const v = review.vista.find((x) => x.dfn === dfn);
  const fields = {};
  const notes = [];
  const requests = [];
  const lhAddr = lighthouseAddress((lh.address || [])[0] || {});
  if (lhAddr && !lhAddr.invalid) {
    Object.assign(fields, lhAddr);
    notes.push('address from Lighthouse');
  } else {
    const { egg, fields: f } = eggFields(dfn);
    Object.assign(fields, f);
    const why = lhAddr ? `Lighthouse ${lhAddr.invalid} is not valid` : 'Lighthouse has no street address';
    notes.push(`address: easter egg ${egg.name} (${why})`);
    requests.push({ field: 'address', problem: why, suggested: `${egg.street1}, ${egg.city}, ${egg.state} ${egg.zip}` });
  }
  const dob = fmDate(lh.birthDate);
  if (dob) fields['.03'] = dob;
  else requests.push({ field: 'birthDate', problem: 'Lighthouse has no birth date', suggested: String(v.dateOfBirth) });
  const sex = { male: 'M', female: 'F' }[lh.gender];
  if (sex) fields['.02'] = sex;
  else requests.push({ field: 'gender', problem: `Lighthouse gender is "${lh.gender}"; VistA only holds M or F`, suggested: v.gender });
  if ((v.telecoms || []).length && !(lh.telecom || []).length) requests.push({ field: 'phone', problem: 'Lighthouse has no phone', suggested: v.telecoms.join('; ') });
  if (v.marital && !lh.maritalStatus) requests.push({ field: 'maritalStatus', problem: 'Lighthouse has no marital status', suggested: v.marital });
  return { fields, notes, requests };
}

async function setFields(dfn, fields, apply) {
  const items = {};
  Object.entries(fields).forEach(([f, val], i) => { items[String(i + 1)] = `F^${f}^${val}`; });
  const payload = await callRpc('CDSP UTIL VET SET', [{ string: dfn }, { namedArray: items }, { string: apply ? '1' : '0' }], 'CDSP RPC UTILS', { timeout: 60000 });
  const r = parseRpcResult(payload);
  if (r.ERROR) throw new Error(r.ERROR);
  return r;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const dfns = [];
  for (let i = 0; i < args.length; i++) if (args[i] === '--dfn') dfns.push(args[++i]);
  if (!args.includes('--all') && !dfns.length) throw new Error('Usage: node lighthouse-apply-demographics.js (--all | --dfn <dfn> ...) [--apply]');

  const out = {};
  const requestItems = [];
  for (const f of fs.readdirSync(DIR).filter((x) => /^dfn-\d+\.json$/.test(x))) {
    const review = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    const primary = review.vista.find((x) => x.found);
    if (!primary || !review.lighthouse || review.lighthouse.error) { console.log(`skip ${review.roster.name}: no VistA or Lighthouse data`); continue; }
    const dfn = primary.dfn;
    if (dfns.length && !dfns.includes(dfn)) continue;
    const p = plan(review, dfn);
    if (p.requests.length) requestItems.push({ name: review.roster.name, icn: review.roster.icn, dfn, requests: p.requests });
    console.log(`\n=== ${review.roster.name} DFN ${dfn}\n  ${p.notes.join('; ')}`);
    const r = await setFields(dfn, p.fields, apply);
    const rows = list(r.changes);
    for (const x of rows.filter((y) => y.status !== 'unchanged')) console.log(`  ${String(x.field).padEnd(7)} ${String(x.label).padEnd(22)} ${x.old} -> ${x.new}  ${x.status}`);
    console.log(`  ${apply ? (r.applied ? 'WRITTEN' : `NOT WRITTEN ${r.writeError || ''}`) : 'dry run'}; errors ${r.errors}`);
    const addrChanged = rows.some((x) => x.status === 'changed' && /^\.1(11|12|13|14|15|16|112)$/.test(String(x.field).replace(/^0\./, '.')));
    let prereg;
    if (apply && r.applied && addrChanged) {
      prereg = String(await callRpc('SDEC EDIT PAT PRE-REGISTRATION', [{ string: dfn }, { string: 'C' }], 'SDECRPC', { timeout: 60000 })).trim();
    }
    out[dfn] = { name: review.roster.name, at: new Date().toISOString(), applied: !!(apply && r.applied), notes: p.notes, changes: rows, errors: r.errors, preregistration: prereg };
  }
  const file = path.join(DIR, 'vista-changes.json');
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  fs.writeFileSync(file, JSON.stringify({ ...prev, ...out }, null, 2));
  fs.writeFileSync(path.join(DIR, 'lighthouse-request-items.json'), JSON.stringify(requestItems, null, 2));
  console.log('\nSaved docs/lighthouse-review/vista-changes.json and lighthouse-request-items.json');
}

main().catch((e) => { console.error(`FAIL ${e.message}`); process.exit(1); });
