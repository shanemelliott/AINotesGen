// Read-only "what will fail" report for a Synthea bundle (Task 1.7, layer 2).
// Usage: node preflight-vista.js <bundle.json | logs/preflight-*.json>
// Calls RPC CDSP UTIL LOAD PREFLIGHT, which only looks mappings up and writes nothing.
const fs = require('fs');
const path = require('path');
require('./src/config'); // loads .env
const { callRpc } = require('./src/vistaApiClient');
const { parseRpcResult } = require('./src/fhirBundleTransport');

const RPC_NAME = 'CDSP UTIL LOAD PREFLIGHT';
const RPC_CONTEXT = 'CDSP RPC UTILS';
// inventory domain -> RPC type; other domains have no side-effect-free lookup yet.
const DOMAIN_TYPE = { procedures: 'PROC', vitals: 'VITAL', labs: 'LAB', conditions: 'COND', meds: 'MED' };
const OK_STATUS = new Set(['mapped', 'will-create']);
// Codes the loader cannot map but VistA does not need; never counted as failures.
const NOT_NEEDED = {
  VITAL: { '39156-5': 'VistA calculates BMI from height and weight' },
};

function loadInventory(file) {
  const abs = path.resolve(file);
  const json = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (json.domains) return { name: json.file, domains: json.domains };
  // Raw bundle: reuse the offline inventory script by running it first.
  console.error('Pass the logs/preflight-*.json file written by preflight-synthea.js');
  process.exit(1);
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node preflight-vista.js <logs/preflight-*.json>');
    process.exit(1);
  }
  const inv = loadInventory(file);

  const lines = {};
  const items = [];
  const skipped = [];
  for (const [domain, type] of Object.entries(DOMAIN_TYPE)) {
    for (const e of inv.domains[domain] || []) {
      const reason = (NOT_NEEDED[type] || {})[e.code];
      if (reason) {
        skipped.push({ domain, code: e.code, display: e.display, count: e.count, status: 'not-needed', target: reason });
        continue;
      }
      items.push({ ...e, type, domain });
      lines[String(items.length)] = `${type}^${e.code}`;
    }
  }

  const payload = await callRpc(RPC_NAME, [{ namedArray: lines }], RPC_CONTEXT, { timeout: 120000 });
  const result = parseRpcResult(payload);
  if (result.ERROR) throw new Error(`${RPC_NAME}: ${result.ERROR}`);

  const rows = Array.isArray(result.results) ? result.results : Object.values(result.results || {});
  const status = new Map(rows.map((r) => [`${r.type}|${r.code}`, r]));

  const report = [];
  for (const it of items) {
    const r = status.get(`${it.type}|${it.code}`) || { status: 'no-answer', target: '' };
    report.push({ domain: it.domain, code: it.code, display: it.display, count: it.count, status: r.status, target: r.target });
  }

  console.log(`${inv.name}\n`);
  for (const domain of Object.keys(DOMAIN_TYPE)) {
    const rs = report.filter((r) => r.domain === domain);
    const total = rs.reduce((n, r) => n + r.count, 0);
    const bad = rs.filter((r) => !OK_STATUS.has(r.status));
    const badTotal = bad.reduce((n, r) => n + r.count, 0);
    // Conditions without an ICD map still load through a SNOMED-only fallback, so they are gaps, not failures.
    const verb = domain === 'conditions' ? 'lack a full ICD map (fallback path used)' : 'will fail';
    console.log(`${domain}: ${rs.length - bad.length}/${rs.length} codes mapped; ${badTotal} of ${total} resources ${verb}`);
    for (const r of bad.sort((a, b) => b.count - a.count)) {
      const why = r.status === 'target-missing' ? `mapped to "${r.target}", not in file #60`
        : (domain === 'conditions' || domain === 'meds') ? `${r.status} (${r.target})` : r.status;
      console.log(`  ${String(r.count).padStart(4)}  ${r.code.padEnd(12)} ${String(r.display).slice(0, 52).padEnd(52)} ${why}`);
    }
    for (const s of skipped.filter((x) => x.domain === domain)) {
      console.log(`  ${String(s.count).padStart(4)}  ${s.code.padEnd(12)} ${String(s.display).slice(0, 52).padEnd(52)} not needed: ${s.target}`);
    }
  }

  report.push(...skipped);

  const outPath = path.join(__dirname, 'logs', `preflight-report-${path.basename(inv.name || file, '.json')}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nFull report: ${outPath}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
