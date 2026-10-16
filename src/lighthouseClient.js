// Lighthouse clinical FHIR (sandbox) client: read-only GETs with a token taken from Bruno.
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('./config'); // loads .env

const FHIR_BASE = process.env.LIGHTHOUSE_FHIR_BASE || 'https://sandbox-api.va.gov/services/clinical-fhir/v1/r4';
const CACHE = path.join(__dirname, '..', '.lighthouse-token.json'); // git-ignored; one token per ICN

function readCache() {
  try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return {}; }
}

const expiryMs = (t) => (t.expiresAt < 1e12 ? t.expiresAt * 1000 : t.expiresAt); // Bruno writes seconds

// Token for the ICN: its own entry, else "*", else any unexpired entry (tokens are not patient-bound). Null if none (60 s margin).
function cachedToken(icn) {
  const cache = readCache();
  const ok = (t) => t && t.accessToken && expiryMs(t) > Date.now() + 60000;
  const t = [cache[icn], cache['*'], ...Object.values(cache)].find(ok);
  return t ? t.accessToken : null;
}

async function get(token, resource, query) {
  const res = await axios.get(`${FHIR_BASE}/${resource}`, {
    params: query,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/fhir+json' },
    timeout: 60000,
    validateStatus: () => true,
  });
  if (res.status !== 200) {
    throw new Error(`GET ${resource} -> ${res.status} ${JSON.stringify(res.data).slice(0, 300)}`);
  }
  return res.data;
}

// Follows Bundle next links so a long problem list is not truncated.
async function getAll(token, resource, query) {
  let bundle = await get(token, resource, query);
  const entries = [...(bundle.entry || [])];
  for (let page = 0; page < 20; page++) {
    const next = (bundle.link || []).find((l) => l.relation === 'next');
    if (!next) break;
    const res = await axios.get(next.url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/fhir+json' },
      timeout: 60000,
    });
    bundle = res.data;
    entries.push(...(bundle.entry || []));
  }
  return entries.map((e) => e.resource);
}

module.exports = { cachedToken, get, getAll };
