// Sends a Synthea FHIR bundle to VistA via RPC CDSP UTIL LOAD FHIR (CDSPFHIR, DEV ONLY).
const { callRpc } = require('./vistaApiClient');

const RPC_NAME = 'CDSP UTIL LOAD FHIR';
const RPC_CONTEXT = 'CDSP RPC UTILS';
const DEFAULT_CHUNK_SIZE = 4000;

// Sequential integer keys "1","2",... match what wsPostFHIR merges into BODY.
function chunkBundleJson(jsonText, chunkSize = DEFAULT_CHUNK_SIZE) {
  const chunks = {};
  let i = 1;
  for (let start = 0; start < jsonText.length; start += chunkSize) {
    chunks[String(i)] = jsonText.slice(start, start + chunkSize);
    i += 1;
  }
  return chunks;
}

// The ARRAY return is chunked JSON text; join in order, then parse.
function parseRpcResult(payload) {
  let text;
  if (typeof payload === 'string') {
    // XLFJSON escapes newlines inside strings, so any raw one is a broker line wrap.
    text = payload.replace(/\r?\n/g, '');
  } else if (Array.isArray(payload)) {
    text = payload.join('');
  } else if (payload && typeof payload === 'object') {
    text = Object.keys(payload)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => payload[k])
      .join('');
  } else {
    throw new Error(`Unexpected RPC payload type: ${typeof payload}`);
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    const wrapped = new Error(`Could not parse RPC result as JSON: ${err.message}`);
    wrapped.raw = text.slice(0, 2000);
    throw wrapped;
  }
}

async function loadBundle(bundleJsonText, options = {}) {
  const chunks = chunkBundleJson(bundleJsonText, options.chunkSize);
  const payload = await callRpc(
    RPC_NAME,
    [{ namedArray: chunks }],
    RPC_CONTEXT,
    { timeout: options.timeout || 120000 }
  );
  const result = parseRpcResult(payload);
  if (result && result.ERROR) {
    throw new Error(`${RPC_NAME}: ${result.ERROR}`);
  }
  return result;
}

module.exports = { chunkBundleJson, parseRpcResult, loadBundle, DEFAULT_CHUNK_SIZE };
