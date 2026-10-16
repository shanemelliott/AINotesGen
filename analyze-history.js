// Read-only history coverage analysis for the roster patients: visits, notes, vitals and labs over the last 3 years.
// Usage: node analyze-history.js [--today YYYY-MM-DD]   (writes docs/lighthouse-review/history-analysis.json)
const fs = require('fs');
const path = require('path');
require('./src/config');
const { callRpc } = require('./src/vistaApiClient');
const roster = require('./src/lighthouse-patients.json');

const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : undefined);
const today = arg('--today') || new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const from3y = `${+today.slice(0, 4) - 3}${today.slice(4)}`;
const from12m = `${+today.slice(0, 4) - 1}${today.slice(4)}`;
const from6m = addDays(today, -183);
const iso = (v) => { const s = String(v || '').replace(/\D/g, ''); return s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : ''; };
const kind = (loc) => (/EMERGENCY/i.test(loc) ? 'ED' : /PRIMARY CARE|DEV PACT|GENERAL MEDICINE/i.test(loc) ? 'PCP' : /LAB|PHARM/i.test(loc) ? 'ANCILLARY' : 'SPECIALTY');
const LABS = { A1C: /A1C/i, CHOL: /^CHOLESTEROL|CHOL(ESTEROL)?$/i, LDL: /LDL/i, HDL: /HDL/i, TRIG: /TRIG/i, CREAT: /CREAT/i, EGFR: /GFR/i, GLUC: /GLUC/i, K: /^POTASSIUM|^K$/i,
  NA: /^SODIUM|^NA$/i, HGB: /HGB|HEMOGLOBIN$/i, WBC: /WBC/i, PLT: /PLT|PLATELET/i, ALT: /^ALT|SGPT/i, AST: /^AST|SGOT/i, TSH: /TSH/i };

(async () => {
  const out = {};
  for (const e of roster) {
    const dfn = e.dfns.find(Boolean);
    const body = await callRpc('VPR GET PATIENT DATA JSON', [{ namedArray: { patientId: dfn } }], 'CDSP RPC CONTEXT', { jsonResult: true, timeout: 120000, raw: true });
    const items = (body.payload && body.payload.data && body.payload.data.items) || [];
    if (!items.length) { out[dfn] = { name: e.name, error: 'no VPR data' }; continue; }
    const by = {};
    for (const i of items) (by[i.uid.split(':')[2]] = by[i.uid.split(':')[2]] || []).push(i);
    const visits = (by.visit || []).map((v) => ({ date: iso(v.dateTime), loc: v.locationName || '', kind: kind(v.locationName || '') })).filter((v) => v.date && v.date <= today);
    const v3 = visits.filter((v) => v.date >= from3y);
    const pcp = v3.filter((v) => v.kind === 'PCP');
    const buckets = [];
    for (let b = 0; b < 6; b++) {
      const hi = addDays(today, -183 * b), lo = addDays(today, -183 * (b + 1));
      buckets.push(pcp.filter((v) => v.date > lo && v.date <= hi).length);
    }
    const vitals = (by.vital || []).filter((v) => iso(v.observed) >= from3y && iso(v.observed) <= today);
    const vit = {};
    for (const v of vitals) vit[v.typeName] = (vit[v.typeName] || 0) + 1;
    const labs = (by.lab || []).filter((l) => iso(l.observed || l.resulted) >= from3y && iso(l.observed || l.resulted) <= today);
    const names = new Set(labs.map((l) => l.displayName));
    const keyLabs = {};
    for (const [k, re] of Object.entries(LABS)) {
      const hit = labs.filter((l) => re.test(l.displayName || ''));
      keyLabs[k] = { n3y: hit.length, n12m: hit.filter((l) => iso(l.observed || l.resulted) >= from12m).length };
    }
    out[dfn] = {
      name: e.name,
      visits3y: { total: v3.length, PCP: pcp.length, ED: v3.filter((v) => v.kind === 'ED').length, SPECIALTY: v3.filter((v) => v.kind === 'SPECIALTY').length },
      pcpPer6moBuckets_newestFirst: buckets,
      lastPcp: pcp.map((v) => v.date).sort().slice(-1)[0] || null,
      visitsLast6mo: visits.filter((v) => v.date >= from6m).length,
      lastVisit: visits.map((v) => v.date).sort().slice(-1)[0] || null,
      firstVisit: visits.map((v) => v.date).sort()[0] || null,
      notes3y: (by.document || []).filter((d) => iso(d.referenceDateTime) >= from3y).length,
      notesTotal: (by.document || []).length,
      vitals3y: vit,
      vitalsLast12m: vitals.filter((v) => iso(v.observed) >= from12m).length,
      labs3y: labs.length,
      labTests3y: names.size,
      keyLabs,
      meds: (by.med || []).length,
      problems: (by.problem || []).filter((p) => !p.removed).length,
    };
    console.log(`${dfn} ${e.name}: visits3y ${JSON.stringify(out[dfn].visits3y)} buckets ${buckets.join('/')} last6mo ${out[dfn].visitsLast6mo} notes3y ${out[dfn].notes3y} vitals3y ${vitals.length} labs3y ${labs.length}`);
  }
  fs.writeFileSync(path.join(__dirname, 'docs', 'lighthouse-review', 'history-analysis.json'), JSON.stringify({ today, from3y, out }, null, 2));
})().catch((e) => { console.error(`FAIL ${e.message}`); process.exit(1); });
