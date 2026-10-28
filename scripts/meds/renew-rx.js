// Renew an outpatient prescription the way CPRS does (ORWDXR RENEW), then sign it (ORWDX SEND).
// Skips ORWDXC ACCEPT, the order check call that hangs on dev. Prints the plan unless --commit is given.
// Usage: node patient.js renew-rx --dfn <dfn> --order <order IEN of the Rx to renew> [--prov 983] [--loc 532] [--commit]
require('../../src/config');
const config = require('../../src/config');
const { callRpc } = require('../../src/vistaApiClient');
const { buildEncryptedSigString } = require('../../src/notesClient');

const args = process.argv.slice(2);
const arg = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const dfn = arg('--dfn');
const order = arg('--order');
const prov = arg('--prov', '983');
const loc = arg('--loc', '532');
const commit = args.includes('--commit');
if (!/^\d+$/.test(dfn || '') || !/^\d+$/.test(order || '')) {
  console.error('Usage: node patient.js renew-rx --dfn <dfn> --order <order IEN> [--prov 983] [--loc 532] [--commit]');
  process.exit(1);
}

const CTX = 'OR CPRS GUI CHART';
const rpc = (name, params, options) => callRpc(name, params.map((p) => (typeof p === 'object' ? p : { string: String(p) })), CTX, options);
const id = `${order};1`;

(async () => {
  const current = String(await rpc('ORWORR GETBYIFN', [order]));
  console.log(`Order ${id}:\n${current.trim()}\n`);
  const fieldsRaw = String(await rpc('ORWDXR RNWFLDS', [`${id};${loc}`])).split(/\r?\n/)[0];
  const fields = fieldsRaw.split('^').slice(0, 7).join('^');
  console.log(`Renew fields: ${fields}`);
  if (!commit) {
    console.log('DRY RUN: nothing was renewed or signed. Add --commit to renew and sign.');
    return;
  }

  let newId = null;
  try {
    await rpc('ORWDX LOCK', [dfn]);
    await rpc('ORWDX LOCK ORDER', [order]);
    const renewed = String(await rpc('ORWDXR RENEW', [id, dfn, prov, loc, { namedArray: { 1: fields } }, '0', '0'], { timeout: 120000 }));
    newId = (/~(\d+;\d+)/.exec(renewed) || [])[1];
    if (!newId) throw new Error(`RENEW did not return a new order: ${renewed.trim()}`);
    console.log(`Renewed: new order ${newId} (unsigned)\n${renewed.trim()}`);

    const esig = buildEncryptedSigString(config.esigCode());
    const sent = String(await rpc('ORWDX SEND', [dfn, prov, loc, esig, { namedArray: { 1: `${newId}^1^1^E` } }], { timeout: 120000 }));
    console.log(`Signed: ${sent.trim()}`);
    if (!sent.includes(newId)) throw new Error(`SEND did not confirm order ${newId}: ${sent.trim()}`);
  } catch (err) {
    console.error(`FAILED: ${err.message}${newId ? ` (order ${newId} may be left unsigned)` : ''}`);
    process.exitCode = 1;
  } finally {
    await rpc('ORWDX UNLOCK ORDER', [order]).catch(() => {});
    await rpc('ORWDX UNLOCK', [dfn]).catch(() => {});
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
