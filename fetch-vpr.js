// Fetch a patient's full VPR JSON via vista-api-x and save as <dfn>.json
// (same shape the pipeline already reads via test-ai.js loadPatient()).
// Usage: node fetch-vpr.js <dfn> [<dfn> ...]
const fs = require('fs');
const path = require('path');
require('./src/config'); // loads .env (VISTA_API_BASE_URL, VISTA_SITE_ID, VISTA_API_KEY)
const { callRpc } = require('./src/vistaApiClient');

async function fetchVpr(dfn) {
  const body = await callRpc(
    'VPR GET PATIENT DATA JSON',
    [{ namedArray: { patientId: dfn } }],
    'CDSP RPC CONTEXT',
    { jsonResult: true, timeout: 60000, raw: true }
  );

  const outPath = path.join(__dirname, `${dfn}.json`);
  fs.writeFileSync(outPath, JSON.stringify(body, null, 2));
  const itemCount = body?.payload?.data?.items?.length ?? 'unknown';
  console.log(`OK  ${dfn}.json (${itemCount} items)`);
}

async function main() {
  const dfns = process.argv.slice(2);
  if (dfns.length === 0) {
    console.error('Usage: node fetch-vpr.js <dfn> [<dfn> ...]');
    process.exit(1);
  }

  for (const dfn of dfns) {
    console.log(`START ${dfn}...`);
    try {
      await fetchVpr(dfn);
    } catch (err) {
      console.error(`FAIL  ${dfn}: ${err.message}`);
    }
  }
}

main();
