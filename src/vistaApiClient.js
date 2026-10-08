// Vista-API-X RPC client; ported from createAppts/single-appointment-api
// (converted to CommonJS).
const axios = require('axios');
const { getToken, getDuzForSite } = require('./tokenService');

function safeTrimmedString(value, maxLen = 1000) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  if (!raw) return '';
  return raw.length > maxLen ? `${raw.slice(0, maxLen)}...` : raw;
}

async function callRpc(rpcName, params, context = 'SDECRPC', options = {}) {
  const jsonResult = options.jsonResult === true;
  const timeout = options.timeout || 30000;
  // vista-api-x defaults to a 15 s VistA socket timeout unless the body sets one.
  const serverTimeout = options.timeout ? { timeout: options.timeout } : {};
  const baseUrl = process.env.VISTA_API_BASE_URL;
  const siteId = process.env.VISTA_SITE_ID;
  const apiKey = process.env.VISTA_API_KEY;
  if (!baseUrl) {
    throw new Error('VISTA_API_BASE_URL is not configured');
  }
  if (!siteId) {
    throw new Error('VISTA_SITE_ID is not configured');
  }
  if (!apiKey) {
    throw new Error('VISTA_API_KEY is not configured');
  }

  const token = await getToken();
  const userDuz = await getDuzForSite(siteId);

  const normalizedParameters = (params || []).map((value) => {
    // Pass through already-wrapped RPC parameter objects (string, namedArray, list) untouched.
    if (value && typeof value === 'object' && (
      Object.prototype.hasOwnProperty.call(value, 'string')
      || Object.prototype.hasOwnProperty.call(value, 'namedArray')
      || Object.prototype.hasOwnProperty.call(value, 'list')
    )) {
      return value;
    }
    return { string: String(value ?? '') };
  });

  let response;
  try {
    response = await axios.post(
      `${baseUrl}/vista-sites/${siteId}/users/${userDuz}/rpc/invoke`,
      {
        context,
        rpc: rpcName,
        jsonResult,
        ...serverTimeout,
        parameters: normalizedParameters
      },
      {
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
          'X-OCTO-VistA-API': apiKey
        },
        timeout: options.timeout ? timeout + 15000 : timeout
      }
    );
  } catch (err) {
    const upstreamStatus = err.response && err.response.status ? err.response.status : null;
    const upstreamBody = err.response ? err.response.data : null;

    const wrapped = new Error(
      `RPC ${rpcName} failed${upstreamStatus ? ` (${upstreamStatus})` : ''}: ${err.message}`
    );
    wrapped.status = upstreamStatus || 502;
    wrapped.details = {
      rpc: rpcName,
      context,
      upstreamStatus,
      upstreamBody: safeTrimmedString(upstreamBody)
    };
    throw wrapped;
  }

  if (options.raw === true) {
    return response.data;
  }

  if (response.data && typeof response.data === 'object' && response.data.payload !== undefined) {
    return response.data.payload;
  }

  return response.data;
}

module.exports = {
  callRpc
};
