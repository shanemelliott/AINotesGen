// Reactivate problems that the loader filed INACTIVE by mistake (DEV ONLY). Dry run unless --apply.
// Usage: node patient.js reactivate-problems --dfn <dfn>[,<dfn>...] [--ien <problem ien>[,<ien>...]] [--apply]
// Candidates: problems in <dfn>.json (run fetch-vpr first) that are INACTIVE, not removed and have no resolved date.
// The SYNFPRB clinical status bug filed every mapped condition as inactive; a real resolution has a resolved date.
// Sets status A through ORQQPL EDIT LOAD and ORQQPL EDIT SAVE like problem-edit. Results: logs/reactivate-problems.json.
const { ROOT } = require('../../src/paths');
const fs = require('fs');
const path = require('path');
require('../../src/config');
const { callRpc } = require('../../src/vistaApiClient');

const CTX = 'OR CPRS GUI CHART';
const SEP = '\u00fe';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const rpc = (name, params) => callRpc(name, params.map((p) => (typeof p === 'object' ? p : { string: String(p) })), CTX, { timeout: 60000 });
const fmDate = (iso) => String((+iso.slice(0, 4) - 1700) * 10000 + +iso.slice(5, 7) * 100 + +iso.slice(8, 10));
const display = (iso) => `${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(8, 10)} ${iso.slice(0, 4)}`;
const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
const list = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? String(process.argv[i + 1] || '').split(',').filter(Boolean) : []; };

async function load(ien) {
  const out = { NEW: {}, ORG: {} };
  for (const line of String(await rpc('ORQQPL EDIT LOAD', [ien])).split(/\r?\n/)) {
    const [type, fld, ...rest] = line.split(SEP);
    if (out[type]) out[type][fld] = rest.join(SEP);
  }
  return out;
}

function candidates(dfn) {
  const file = path.join(ROOT, `${dfn}.json`);
  if (!fs.existsSync(file)) throw new Error(`${dfn}.json not found; run fetch-vpr ${dfn} first`);
  const items = JSON.parse(fs.readFileSync(file, 'utf8')).payload.data.items;
  return items.filter((i) => /:problem:/.test(i.uid) && i.statusName === 'INACTIVE' && !i.removed && !i.resolved);
}

async function reactivate(ien) {
  const cur = await load(ien);
  const next = { ...cur.NEW };
  next['.12'] = 'A^ACTIVE';
  const today = new Date().toISOString().slice(0, 10);
  next['.08'] = `${fmDate(today)}^${display(today)}`;
  const duz = process.env.VISTA_DUZ;
  const params = {};
  let n = 0;
  for (const f of Object.keys(cur.ORG)) params[String(++n)] = `GMPORIG(${f})=${q(cur.ORG[f])}`;
  for (const f of Object.keys(next)) params[String(++n)] = `GMPFLD(${f})=${q(/^(2|10),0$/.test(f) ? '0' : next[f])}`;
  const reply = String(await rpc('ORQQPL EDIT SAVE', [ien, duz, '500', '1', { namedArray: params }, ''])).trim();
  const after = await load(ien);
  return { reply, verified: reply === '1' && String(after.NEW['.12']).split('^')[0] === 'A' };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const dfns = list('--dfn');
  const only = list('--ien');
  if (!dfns.length) throw new Error('Usage: node patient.js reactivate-problems --dfn <dfn>[,<dfn>] [--ien <ien>] [--apply]');
  const results = {};
  for (const dfn of dfns) {
    const found = candidates(dfn).filter((p) => !only.length || only.includes(String(p.localId)));
    console.log(`\n=== DFN ${dfn}: ${found.length} inactive problem(s) with no resolved date`);
    for (const p of found) {
      let line = `  ${String(p.localId).padEnd(7)} ${String(p.icdCode).replace(/^urn:(10d|icd):/, '').padEnd(9)} onset ${p.onset}  ${String(p.problemText || '').slice(0, 70)}`;
      if (apply) {
        const r = await reactivate(p.localId);
        results[`${dfn}/${p.localId}`] = { icd: p.icdCode, text: p.problemText, ...r };
        line += `  -> reply ${r.reply}, ${r.verified ? 'verified ACTIVE' : 'NOT VERIFIED'}`;
      }
      console.log(line);
    }
  }
  if (apply) {
    fs.mkdirSync(path.join(ROOT, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'logs', 'reactivate-problems.json'), JSON.stringify(results, null, 2));
    console.log('\nSaved logs/reactivate-problems.json. Run fetch-vpr again to refresh the VPR file.');
  } else console.log('\nDry run: nothing was written. Add --apply to reactivate.');
}

main().catch((e) => { console.error(`FAIL ${e.message}`); process.exit(1); });
