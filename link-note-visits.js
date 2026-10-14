// Link a patient's notes that have no visit to their appointment's visit via RPC
// CDSP UTIL TIU LINK VISIT (CDSPTIUV, DEV ONLY), then check each note with ORWPCE PCE4NOTE.
// Dry run unless --commit.
// Usage: node link-note-visits.js --dfn <dfn> [--tiu <note ien>] [--commit]
//        node link-note-visits.js --dfn <dfn> --tiu <note ien> --check   (PCE4NOTE only)
require('./src/config'); // loads .env
const { callRpc } = require('./src/vistaApiClient');
const { parseRpcResult } = require('./src/fhirBundleTransport');

const RPC_NAME = 'CDSP UTIL TIU LINK VISIT';
const RPC_CONTEXT = 'CDSP RPC UTILS';
const list = (v) => (Array.isArray(v) ? v : Object.values(v || {}));
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);

// HDR line VStr plus the VST^DT / VST^HL lines that only appear when the note has a visit.
async function pce4note(dfn, tiuIen) {
  const payload = await callRpc('ORWPCE PCE4NOTE', [{ string: String(tiuIen) }, { string: String(dfn) }, { string: '' }], 'OR CPRS GUI CHART');
  const lines = (Array.isArray(payload) ? payload : String(payload).split(/\r?\n/)).filter(Boolean);
  const vstr = (lines[0] || '').split('^')[3] || '';
  const visitDate = (lines.find((l) => l.startsWith('VST^DT^')) || '').split('^')[2] || '';
  const clinic = (lines.find((l) => l.startsWith('VST^HL^')) || '').split('^').slice(2).filter(Boolean).join(' ') || '';
  return { vstr, visitDate, clinic, linked: Boolean(visitDate) };
}

async function main() {
  const dfn = arg('--dfn');
  const tiu = arg('--tiu') || '';
  const commit = process.argv.includes('--commit');
  if (!/^\d+$/.test(dfn || '') || (tiu && !/^\d+$/.test(tiu))) {
    console.error('Usage: node link-note-visits.js --dfn <dfn> [--tiu <note ien>] [--commit] [--check]');
    process.exit(1);
  }

  if (process.argv.includes('--check')) {
    console.log(JSON.stringify(await pce4note(dfn, tiu)));
    return;
  }

  const payload = await callRpc(RPC_NAME, [{ string: dfn }, { string: tiu }, { string: commit ? '1' : '0' }], RPC_CONTEXT, { timeout: 120000 });
  const result = parseRpcResult(payload);
  if (result.ERROR) throw new Error(`${RPC_NAME}: ${result.ERROR}`);

  console.log(`${commit ? 'COMMIT' : 'DRY RUN'} DFN ${dfn}: ${JSON.stringify(result.counts)}`);
  for (const n of list(result.notes)) {
    console.log(`  ${String(n.tiuIen).padEnd(6)} ref ${String(n.refDate).padEnd(14)} clinic ${String(n.location).padEnd(5)} appt ${String(n.apptDateTime || '').padEnd(12)} ${String(n.action).padEnd(6)} visit ${n.visitIen || '-'} ${n.status}`);
  }

  if (!commit) return;
  console.log('\nPCE4NOTE check:');
  for (const n of list(result.notes).filter((x) => ['link', 'create', 'fix'].includes(x.action))) {
    const c = await pce4note(dfn, n.tiuIen);
    console.log(`  ${String(n.tiuIen).padEnd(6)} ${c.linked ? 'LINKED' : 'NOT LINKED'} vstr ${c.vstr} visit ${c.visitDate} ${c.clinic}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
