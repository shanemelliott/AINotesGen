// Shared helpers for the refill scripts (fill-rx.js, fill-patient-rx.js). DEV ONLY.
const { callRpc } = require('./vistaApiClient');
const { parseRpcResult } = require('./fhirBundleTransport');

const RPC_NAME = 'CDSP UTIL RX FILL';
const RPC_CONTEXT = 'CDSP RPC UTILS';

// YYYY-MM-DD[ HH:MM] to FileMan YYYMMDD[.HHMM] (years since 1700, trailing time zeros dropped).
function toFileMan(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(text || '');
  if (!m) return null;
  const date = `${Number(m[1]) - 1700}${m[2]}${m[3]}`;
  if (!m[4]) return date;
  const time = `${m[4]}${m[5]}`.replace(/0+$/, '');
  return time ? `${date}.${time}` : date;
}

// Files (commit) or checks (dry run) one refill. Returns the parsed RPC result; throws on an RPC error.
async function fileRefill({ dfn, rxIen, fillDate, released, commit }) {
  const params = { DFN: String(dfn), RXIEN: String(rxIen), FILLDATE: toFileMan(fillDate), COMMIT: commit ? '1' : '0' };
  if (released) params.RELEASED = toFileMan(released);
  const payload = await callRpc(RPC_NAME, [{ namedArray: params }], RPC_CONTEXT, { timeout: 60000 });
  const result = parseRpcResult(payload);
  if (result.ERROR) throw new Error(result.ERROR);
  return result;
}

module.exports = { toFileMan, fileRefill, RPC_NAME };
