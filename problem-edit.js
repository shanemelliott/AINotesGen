// Align VistA problems with Lighthouse through the CPRS problem list RPCs (DEV ONLY). Dry run unless --apply.
// Usage: node problem-edit.js [--dfn <dfn>] [--apply]
// Reads src/lighthouse-problem-fixes.json: per problem an onset date (YYYY-MM-DD), optional status (A or I) and an
// ICD code copied from another problem that already has it (icdFrom, found through ORQQPL EDIT LOAD of that problem).
// Calls ORQQPL EDIT SAVE with GMPFLD and GMPORIG strings as CPRS sends them. Results: docs/lighthouse-review/problem-changes.json.
const fs = require('fs');
const path = require('path');
require('./src/config');
const { callRpc } = require('./src/vistaApiClient');

const CTX = 'OR CPRS GUI CHART';
const SEP = '\u00fe';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fixes = JSON.parse(fs.readFileSync(path.join(__dirname, 'src', 'lighthouse-problem-fixes.json'), 'utf8'));
const rpc = (name, params) => callRpc(name, params.map((p) => (typeof p === 'object' ? p : { string: String(p) })), CTX, { timeout: 60000 });

const fmDate = (iso) => String((+iso.slice(0, 4) - 1700) * 10000 + +iso.slice(5, 7) * 100 + +iso.slice(8, 10));
const display = (iso) => `${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(8, 10)} ${iso.slice(0, 4)}`;

async function load(ien) {
  const out = { NEW: {}, ORG: {} };
  for (const line of String(await rpc('ORQQPL EDIT LOAD', [ien])).split(/\r?\n/)) {
    const [type, fld, ...rest] = line.split(SEP);
    if (out[type]) out[type][fld] = rest.join(SEP);
  }
  return out;
}

const q = (v) => `"${String(v).replace(/"/g, '""')}"`;

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const only = args.includes('--dfn') ? args[args.indexOf('--dfn') + 1] : null;
  const duz = process.env.VISTA_DUZ;
  const today = new Date().toISOString().slice(0, 10);
  const results = {};
  for (const fx of fixes.filter((f) => !only || f.dfn === only)) {
    const cur = await load(fx.ien);
    const next = { ...cur.NEW };
    const changes = [];
    const same = (a, b) => String(a).split('^')[0] === String(b).split('^')[0]; // VistA reformats the display text
    const set = (fld, value) => { if (!same(next[fld], value)) { changes.push({ field: fld, old: cur.NEW[fld], new: value }); next[fld] = value; } };
    if (fx.onset) set('.13', `${fmDate(fx.onset)}^${display(fx.onset)}`);
    if (fx.status) set('.12', fx.status === 'A' ? 'A^ACTIVE' : 'I^INACTIVE');
    if (fx.icdFrom) {
      const src = (await load(fx.icdFrom.ien)).NEW['.01'];
      if (!src || src.split('^')[1] !== fx.icdFrom.code) throw new Error(`problem ${fx.icdFrom.ien} does not hold ${fx.icdFrom.code}: ${src}`);
      set('.01', src);
    }
    console.log(`\n=== DFN ${fx.dfn} problem ${fx.ien}: ${fx.note}`);
    for (const c of changes) console.log(`  ${c.field.padEnd(5)} ${c.old} -> ${c.new}`);
    if (!changes.length) { console.log('  unchanged'); results[`${fx.dfn}/${fx.ien}`] = { note: fx.note, changes, applied: false }; continue; }
    if (changes.length) set('.08', `${fmDate(today)}^${display(today)}`);
    let applied = false;
    if (apply) {
      const list = {};
      let n = 0;
      for (const f of Object.keys(cur.ORG)) list[String(++n)] = `GMPORIG(${f})=${q(cur.ORG[f])}`;
      for (const f of Object.keys(next)) list[String(++n)] = `GMPFLD(${f})=${q(/^(2|10),0$/.test(f) ? '0' : next[f])}`;
      const reply = String(await rpc('ORQQPL EDIT SAVE', [fx.ien, duz, '500', '1', { namedArray: list }, ''])).trim();
      const after = await load(fx.ien);
      applied = reply === '1' && Object.entries(next).every(([f, v]) => !changes.some((c) => c.field === f) || f === '.08' || same(after.NEW[f], v));
      console.log(`  RPC reply ${reply}; ${applied ? 'verified' : 'NOT VERIFIED'}`);
    } else console.log('  dry run');
    results[`${fx.dfn}/${fx.ien}`] = { note: fx.note, changes, applied };
  }
  if (apply) {
    const file = path.join(__dirname, 'docs', 'lighthouse-review', 'problem-changes.json');
    const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    fs.writeFileSync(file, JSON.stringify({ ...prev, ...results }, null, 2));
    console.log('\nSaved docs/lighthouse-review/problem-changes.json');
  }
}

main().catch((e) => { console.error(`FAIL ${e.message}`); process.exit(1); });
