// Read-only review of one roster patient: VistA (VPR + veteran data) against Lighthouse Patient and Condition.
const { callRpc } = require('./vistaApiClient');
const { parseRpcResult } = require('./fhirBundleTransport');
const { summarize } = require('./vetSummary');
const lh = require('./lighthouseClient');

const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const domainOf = (i) => i.uid && i.uid.split(':')[2];
const list = (v) => (Array.isArray(v) ? v : Object.values(v || {}));

async function fetchVpr(dfn) {
  const body = await callRpc('VPR GET PATIENT DATA JSON', [{ namedArray: { patientId: dfn } }], 'CDSP RPC CONTEXT',
    { jsonResult: true, timeout: 60000, raw: true });
  const payload = body && body.payload;
  if (payload && payload.error) return { error: payload.error.message || JSON.stringify(payload.error) };
  return { items: (payload && payload.data && payload.data.items) || [] };
}

async function fetchVet(dfn) {
  try {
    const result = parseRpcResult(await callRpc('CDSP UTIL VET GET', [{ string: dfn }, { string: '0' }], 'CDSP RPC UTILS', { timeout: 60000 }));
    return result.ERROR ? { error: result.ERROR } : { summary: summarize(result) };
  } catch (e) {
    return { error: e.message };
  }
}

// Compact VistA record for the report (no SSN).
async function vistaSummary(dfn) {
  const vpr = await fetchVpr(dfn);
  if (vpr.error) return { dfn, found: false, error: vpr.error };
  const items = vpr.items;
  const p = items.find((i) => domainOf(i) === 'patient') || {};
  const count = {};
  for (const i of items) count[domainOf(i)] = (count[domainOf(i)] || 0) + 1;
  const vet = await fetchVet(dfn);
  const dated = (arr, f) => arr.map(f).filter(Boolean).sort();
  const visits = items.filter((i) => domainOf(i) === 'visit');
  return {
    dfn,
    found: true,
    name: p.fullName,
    dateOfBirth: p.dateOfBirth,
    gender: p.genderName,
    icnShown: p.icn,
    marital: (p.maritalStatuses || []).map((m) => m.name).join('; '),
    addresses: p.addresses || [],
    telecoms: (p.telecoms || []).map((t) => t.telecom),
    veteran: p.veteran,
    serviceConnected: (p.disability || []).map((d) => `${d.name} ${d.disPercent}%`),
    eligibility: (p.eligibility || []).map((e) => e.name),
    vetSummary: vet.summary,
    vetError: vet.error,
    counts: count,
    firstVisit: dated(visits, (v) => v.dateTime)[0],
    lastVisit: dated(visits, (v) => v.dateTime).slice(-1)[0],
    problems: items.filter((i) => domainOf(i) === 'problem' && !i.removed)
      .map((x) => ({ id: String(x.localId), icd: String(x.icdCode || '').replace(/^urn:10d:/, ''), text: x.problemText, onset: x.onset, status: x.statusName })),
    meds: items.filter((i) => domainOf(i) === 'med').map((m) => ({ name: m.name, status: m.vaStatus, start: m.overallStart })),
    notes: items.filter((i) => domainOf(i) === 'document').map((d) => ({ date: d.referenceDateTime, title: d.localTitle, status: d.statusName })),
    _items: items,
  };
}

// Each row: { field, vista, lighthouse, status: 'match' | 'DIFF' | 'info' }
function comparePatient(v, fhir) {
  const name = (fhir.name || [])[0] || {};
  const addr = (fhir.address || [])[0] || {};
  const va = (v.addresses || [])[0] || {};
  const lhName = `${name.family || ''},${(name.given || []).join(' ')}`;
  const dob = String(v.dateOfBirth || '');
  const vistaDob = dob ? `${dob.slice(0, 4)}-${dob.slice(4, 6)}-${dob.slice(6, 8)}` : '';
  const street = (addr.line || []).join(' ');
  const row = (field, vista, lighthouse, ok) => ({ field, vista: vista ?? '', lighthouse: lighthouse ?? '', status: ok === null ? 'info' : ok ? 'match' : 'DIFF' });
  return [
    row('name', v.name, lhName, norm(v.name) === norm(lhName)),
    row('gender', v.gender, fhir.gender, norm(v.gender) === norm(fhir.gender)),
    row('birthDate', vistaDob, fhir.birthDate, vistaDob === (fhir.birthDate || '')),
    row('street', va.streetLine1, street, norm(va.streetLine1) === norm(street)),
    row('city', va.city, addr.city, norm(va.city) === norm(addr.city)),
    row('state', va.stateProvince, addr.state, null),
    row('postalCode', va.postalCode, addr.postalCode, String(va.postalCode || '').slice(0, 5) === String(addr.postalCode || '').slice(0, 5)),
    row('phone', (v.telecoms || []).join('; '), (fhir.telecom || []).map((t) => t.value).join('; '), null),
    row('marital', v.marital, fhir.maritalStatus && (fhir.maritalStatus.text || ((fhir.maritalStatus.coding || [])[0] || {}).display), null),
    row('deceased', '', fhir.deceasedDateTime || (fhir.deceasedBoolean ? 'true' : ''), null),
  ];
}

const icdOf = (c) => ((c.code && c.code.coding) || []).filter((x) => /icd-10/i.test(x.system || '')).map((x) => x.code.replace(/\.$/, ''));
const sctOf = (c) => ((c.code && c.code.coding) || []).filter((x) => /snomed/i.test(x.system || '')).map((x) => x.code);

// Lighthouse sandbox codes are sometimes ranges (E08-E13); compare on the first three characters.
function icdCovers(lhCode, icd) {
  const [from, to] = lhCode.split('-');
  if (!to) return icd === lhCode || icd.startsWith(`${lhCode}.`);
  const k = icd.slice(0, 3);
  return icd[0] === from[0] && k >= from.slice(0, 3) && k <= to.slice(0, 3);
}

function compareProblems(vistaProblems, conditions) {
  const matched = new Set();
  const out = { both: [], vistaOnly: [], lighthouseOnly: [] };
  for (const p of vistaProblems) {
    const icd = String(p.icd || '').replace(/\.$/, '');
    const sct = ((p.text || '').match(/SCT (\d+)/) || [])[1];
    const hit = conditions.find((c) => !matched.has(c.id) && (icdOf(c).some((x) => icdCovers(x, icd)) || (sct && sctOf(c).includes(sct))));
    const vtxt = `${icd} ${p.text} onset ${p.onset} (${p.status})`;
    if (hit) {
      matched.add(hit.id);
      out.both.push({ vista: vtxt, lighthouse: `${icdOf(hit).join('/')} ${(hit.code && hit.code.text) || ''} onset ${hit.onsetDateTime || ''}` });
    } else out.vistaOnly.push(vtxt);
  }
  for (const c of conditions) {
    if (!matched.has(c.id)) {
      const st = c.clinicalStatus && c.clinicalStatus.coding && c.clinicalStatus.coding[0].code;
      out.lighthouseOnly.push(`${icdOf(c).join('/')} ${sctOf(c).join('/')} ${(c.code && c.code.text) || ''} onset ${c.onsetDateTime || ''} (${st})`);
    }
  }
  return out;
}

// Reviews every DFN of a roster entry; the Lighthouse part uses the primary (first found) VistA record.
async function review(entry, { token, skipLighthouse } = {}) {
  const result = { reviewedAt: new Date().toISOString(), roster: entry, vista: [], lighthouse: null };
  for (const dfn of entry.dfns) {
    const { _items, ...summary } = await vistaSummary(dfn);
    result.vista.push(summary);
  }
  const primary = result.vista.find((x) => x.found);
  if (skipLighthouse) return result;
  const tok = token || lh.cachedToken(entry.icn);
  if (!tok) {
    result.lighthouse = { error: 'no valid token (missing or expired in .lighthouse-token.json)' };
    return result;
  }
  try {
    const patient = await lh.get(tok, `Patient/${entry.icn}`);
    const conditions = await lh.getAll(tok, 'Condition', { patient: entry.icn, category: 'problem-list-item', _count: 200 });
    result.lighthouse = {
      patient,
      conditions,
      demographics: primary ? comparePatient(primary, patient) : [],
      problems: primary ? compareProblems(primary.problems, conditions) : null,
    };
  } catch (e) {
    result.lighthouse = { error: e.message };
  }
  return result;
}

module.exports = { review, comparePatient, compareProblems };
