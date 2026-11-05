// Sign an unsigned test note as its author via RPC CDSP UTIL TIU SIGN AS (CDSPTIUS, DEV ONLY). Dry run unless --commit.
// --esig sends VISTA_ESIG_CODE (encrypted) so the RPC checks it against the signer's stored code.
// Usage: node scripts/notes/sign-note-as.js --tiu <note ien> --signer <duz> [--esig] [--commit]
require('../../src/config'); // loads .env
const config = require('../../src/config');
const { callRpc } = require('../../src/vistaApiClient');
const { buildEncryptedSigString } = require('../../src/notesClient');
const { parseRpcResult } = require('../../src/fhirBundleTransport');

const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);

async function main() {
  const tiu = arg('--tiu');
  const signer = arg('--signer');
  const commit = process.argv.includes('--commit');
  const esig = process.argv.includes('--esig') ? buildEncryptedSigString(config.esigCode()) : '';
  if (!/^\d+$/.test(tiu || '') || !/^\d+$/.test(signer || '')) {
    console.error('Usage: node scripts/notes/sign-note-as.js --tiu <note ien> --signer <duz> [--esig] [--commit]');
    process.exit(1);
  }
  const payload = await callRpc('CDSP UTIL TIU SIGN AS', [{ string: tiu }, { string: signer }, { string: commit ? '1' : '0' }, { string: esig }], 'CDSP RPC UTILS', { timeout: 60000 });
  console.log(JSON.stringify(parseRpcResult(payload), null, 2));
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
