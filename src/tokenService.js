// PIV card auth via STS token server; ported from createAppts/single-appointment-api
// (converted to CommonJS). See @va/sts-token for the underlying exe wrapper.
const path = require('path');
const { existsSync } = require('fs');
const { createOccJwtClient } = require('@va/sts-token');

function getStsExePath() {
  if (process.env.STS_EXE) {
    return process.env.STS_EXE;
  }
  const deploymentPath = path.join(__dirname, '..', 'sts-token', 'sts-token-generator.exe');
  const devPath = path.join(__dirname, '..', 'token-server', 'sts-token-generator.exe');
  return existsSync(deploymentPath) ? deploymentPath : devPath;
}

const tokenCache = {
  token: null,
  expiresAt: 0,
  payload: null
};

let inflightRequest = null;
let occJwtClient = null;

async function initializeJwtClient(forceNew = false) {
  if (!occJwtClient || forceNew) {
    const STS_EXE_PATH = getStsExePath();
    const STS_ENV = process.env.STS_ENV || 'preprod';
    const PIV_SERIAL = process.env.PIV_SERIAL || undefined;

    console.log('[tokenService] Initializing JWT client with STS exe:', STS_EXE_PATH);
    console.log('[tokenService] Environment:', STS_ENV);

    occJwtClient = await createOccJwtClient({
      sts: {
        provider: 'dotnet',
        exePath: STS_EXE_PATH,
        env: STS_ENV,
        serial: PIV_SERIAL,
        includeSaml: true
      }
    });
  }
  return occJwtClient;
}

function parseJwtPayload(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payloadJson = Buffer.from(parts[1], 'base64').toString('utf8');
  return JSON.parse(payloadJson);
}

function shouldRefreshToken() {
  if (!tokenCache.token) return true;
  if (!tokenCache.expiresAt) return true;
  const refreshBufferSeconds = 60;
  const now = Math.floor(Date.now() / 1000);
  return tokenCache.expiresAt <= now + refreshBufferSeconds;
}

async function getToken() {
  if (!shouldRefreshToken()) {
    return tokenCache.token;
  }

  if (inflightRequest) {
    return inflightRequest;
  }

  inflightRequest = (async () => {
    try {
      const client = await initializeJwtClient();
      const token = await client.getOccJwt();

      if (!token) {
        throw new Error('Failed to get OCC JWT token');
      }

      let expiresAt = 0;
      let payload = null;
      try {
        payload = parseJwtPayload(token);
        expiresAt = payload && payload.exp ? Number(payload.exp) : 0;
      } catch (err) {
        expiresAt = 0;
      }

      tokenCache.token = token;
      tokenCache.expiresAt = expiresAt;
      tokenCache.payload = payload;
      return token;
    } finally {
      inflightRequest = null;
    }
  })();

  return inflightRequest;
}

async function getDuzForSite(siteId) {
  await getToken();
  const payload = tokenCache.payload;
  if (!payload || !Array.isArray(payload.vistaIds)) {
    throw new Error('JWT payload does not contain vistaIds');
  }
  const match = payload.vistaIds.find((v) => String(v.siteId) === String(siteId));
  if (!match) {
    throw new Error(`No vistaIds entry found for siteId ${siteId}`);
  }
  return String(match.duz);
}

function clearJwtClient() {
  console.log('[tokenService] Clearing JWT client cache');
  if (occJwtClient) {
    try {
      occJwtClient.clearTokenCache();
      console.log('[tokenService] Token cache cleared');
    } catch (error) {
      console.error('[tokenService] Error clearing token cache:', error.message);
    }
  }
  occJwtClient = null;
  tokenCache.token = null;
  tokenCache.expiresAt = 0;
  tokenCache.payload = null;
}

module.exports = {
  getToken,
  getDuzForSite,
  clearJwtClient
};
