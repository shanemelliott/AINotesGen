// Read a note's text and header as a given DUZ (service account). Usage: node scripts/notes/read-note.js --tiu <ien> [--duz <duz>]
require('../../src/config');
const { callRpc } = require('../../src/vistaApiClient');

const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);

(async () => {
  const tiu = arg('--tiu');
  const duz = arg('--duz') || process.env.VISTA_DUZ;
  const text = await callRpc('TIU GET RECORD TEXT', [{ string: tiu }], 'OR CPRS GUI CHART', { duz });
  console.log(String(text));
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
