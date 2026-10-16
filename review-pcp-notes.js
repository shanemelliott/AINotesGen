// Read-only: extract the existing notes at PCP visits for the roster patients so they can be read and checked.
// Usage: node review-pcp-notes.js   (writes logs/pcp-notes/<dfn>.txt and prints a one-line summary per note)
const fs = require('fs');
const path = require('path');
require('./src/config');
const { callRpc } = require('./src/vistaApiClient');
const roster = require('./src/lighthouse-patients.json');

const OUT = path.join(__dirname, 'logs', 'pcp-notes');
const PCP = /PRIMARY CARE|DEV PACT|GENERAL MEDICINE|20 MINUTE/i;
const dom = (i) => i.uid.split(':')[2];
const day = (v) => { const s = String(v || '').replace(/\D/g, ''); return s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : ''; };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const e of roster) {
    const dfn = e.dfns[0];
    const body = await callRpc('VPR GET PATIENT DATA JSON', [{ namedArray: { patientId: dfn } }], 'CDSP RPC CONTEXT', { jsonResult: true, timeout: 120000, raw: true });
    const items = (body.payload && body.payload.data && body.payload.data.items) || [];
    const visits = new Map(items.filter((i) => dom(i) === 'visit').map((v) => [v.uid, v]));
    const lines = [];
    for (const d of items.filter((i) => dom(i) === 'document')) {
      const v = visits.get(d.encounterUid);
      const loc = (v && v.locationName) || d.encounterName || '';
      if (!PCP.test(loc) && !PCP.test(d.encounterName || '')) continue;
      const text = (d.text || []).map((t) => t.content || '').join('\n').trim();
      const author = ((d.text || [])[0] || {}).author || '';
      lines.push({ date: day(d.referenceDateTime), title: d.localTitle, status: d.statusName, loc, author, len: text.length, text });
    }
    lines.sort((a, b) => a.date.localeCompare(b.date));
    fs.writeFileSync(path.join(OUT, `${dfn}.txt`), lines.map((n) => `===== ${n.date} | ${n.title} | ${n.status} | ${n.loc} | ${n.author} | ${n.len} chars\n${n.text}\n`).join('\n'));
    console.log(`${dfn} ${e.name}: ${lines.length} PCP-location notes, ${lines.filter((n) => n.len < 400).length} under 400 chars`);
  }
})().catch((e) => { console.error(`FAIL ${e.message}`); process.exit(1); });
