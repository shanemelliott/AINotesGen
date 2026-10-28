// Last step of the roster review: record the pre-registration check as C (CONNECTED), so VistA does not ask for a
// demographics update check for a year. Run it after every other change. DEV ONLY.
// Usage: node lighthouse-preregistration.js [--dfn <dfn> ...]   (default: every roster patient found in VistA)
// Results: docs/lighthouse-review/preregistration.json
const fs = require('fs');
const path = require('path');
require('./src/config');
const { callRpc } = require('./src/vistaApiClient');

const DIR = path.join(__dirname, 'docs', 'lighthouse-review');

(async () => {
  const args = process.argv.slice(2);
  const only = [];
  for (let i = 0; i < args.length; i++) if (args[i] === '--dfn') only.push(args[++i]);
  const out = {};
  for (const f of fs.readdirSync(DIR).filter((x) => /^dfn-\d+\.json$/.test(x))) {
    const r = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    for (const v of r.vista.filter((x) => x.found)) {
      if (only.length && !only.includes(v.dfn)) continue;
      const reply = String(await callRpc('SDEC EDIT PAT PRE-REGISTRATION', [{ string: v.dfn }, { string: 'C' }], 'SDECRPC', { timeout: 60000 })).trim();
      out[v.dfn] = { name: v.name, at: new Date().toISOString(), reply };
      console.log(`${v.dfn} ${v.name}: ${reply}`);
    }
  }
  const file = path.join(DIR, 'preregistration.json');
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  fs.writeFileSync(file, JSON.stringify({ ...prev, ...out }, null, 2));
})().catch((e) => { console.error(`FAIL ${e.message}`); process.exit(1); });
