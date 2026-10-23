// Shared call for the dosing backfill RPC (backfill-rx-dosing.js, backfill-all-rx.js). DEV ONLY.
const { callRpc } = require('./vistaApiClient');
const { parseRpcResult } = require('./fhirBundleTransport');

const RPC_NAME = 'CDSP UTIL RX DOSING BACKFILL';
const RPC_CONTEXT = 'CDSP RPC UTILS';

// Returns the parsed RPC result {dryRun,count,rx:[...]}; throws on an RPC error.
async function backfill({ dfn, rx, commit, resig }) {
  const params = { DFN: String(dfn), COMMIT: commit ? '1' : '0' };
  if (rx) params.RXIEN = String(rx);
  if (resig) params.RESIG = '1';
  const payload = await callRpc(RPC_NAME, [{ namedArray: params }], RPC_CONTEXT, { timeout: 120000 });
  const result = parseRpcResult(payload);
  if (result.ERROR) throw new Error(`${RPC_NAME}: ${result.ERROR}`);
  return result;
}

module.exports = { backfill, RPC_NAME };
