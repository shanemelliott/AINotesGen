// DDR read helpers and the dev-site guard for the PCE check-out tests. Read-only.
const { callRpc } = require('../../../src/vistaApiClient');
const config = require('../../../src/config');

const CTX_DDR = 'CDSP RPC CONTEXT';

// Writes go only to the staging site for station 500 dev.
function assertDevSite() {
  const site = process.env.VISTA_SITE_ID;
  const base = process.env.VISTA_API_BASE_URL || '';
  if (site !== '500' || !/\/\/staging\./i.test(base)) {
    throw new Error(`Refusing to run: expected station 500 on a staging host, got site=${site} host=${base.replace(/^https?:\/\//, '').split('/')[0]}`);
  }
}

// Service-account JWT as another user, same path as note signing.
function svcDuz() {
  return process.env.PCE_TEST_DUZ || config.authorDuz();
}

function lines(payload) {
  if (Array.isArray(payload)) return payload.map(String);
  return String(payload == null ? '' : payload).split(/\r?\n/).filter((l) => l.length);
}

// DDR GETS ENTRY DATA returns lines FILE^IENS^FIELD^INTERNAL^EXTERNAL.
async function ddrGets({ file, iens, fields, flags = 'IE' }) {
  const payload = await callRpc(
    'DDR GETS ENTRY DATA',
    [{ namedArray: { FILE: String(file), IENS: iens, FIELDS: fields, FLAGS: flags } }],
    CTX_DDR,
    { duz: svcDuz() }
  );
  const out = {};
  const errors = [];
  for (const line of lines(payload)) {
    const p = line.split('^');
    if (/^\[?(DATA|ERROR|BEGIN_DATA|END_DATA)/i.test(line) || p.length < 4) {
      if (/error|missing/i.test(line)) errors.push(line);
      continue;
    }
    out[p[2]] = { internal: p[3], external: p.slice(4).join('^') };
  }
  return errors.length ? { ...out, _errors: errors } : out;
}

// DDR LISTER returns lines IEN^value^value...
async function ddrLister({ file, fields, xref = '', from = '', part = '', max = 20, iens = '', screen = '', flags = 'P' }) {
  const payload = await callRpc(
    'DDR LISTER',
    [{ namedArray: { FILE: String(file), IENS: iens, FIELDS: fields, FLAGS: flags, MAX: String(max), XREF: xref, FROM: from, PART: part, SCREEN: screen } }],
    CTX_DDR,
    { duz: svcDuz() }
  );
  const rows = [];
  for (const line of lines(payload)) {
    if (/^\[?(DATA|BEGIN_DATA|END_DATA|MAP|ERROR)/i.test(line)) continue;
    const p = line.split('^');
    if (/^\d/.test(p[0])) rows.push({ ien: p[0], values: p.slice(1) });
  }
  return rows;
}

module.exports = { svcDuz, CTX_DDR, assertDevSite, ddrGets, ddrLister };
