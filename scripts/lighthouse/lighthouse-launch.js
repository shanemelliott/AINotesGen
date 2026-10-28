// Lighthouse SMART launch token <-> ICN.
// Usage: node patient.js lighthouse-launch <icn> [<icn> ...]   encode (ICN looks like 1013947267V661431)
//        node patient.js lighthouse-launch <launch token>      decode
//        node patient.js lighthouse-launch --all               encode every patient in src/lighthouse-patients.json
//        node patient.js lighthouse-launch --none              encode with no patient (sta3n only), for a multi-patient token
const known = require('../../src/lighthouse-patients.json');

const encode = (icn, sta3n = '500') => Buffer.from(`${JSON.stringify(icn ? { patient: icn, sta3n } : { sta3n })}\n`).toString('base64');
const decode = (token) => JSON.parse(Buffer.from(token, 'base64').toString('utf8'));

const args = process.argv.slice(2);
if (!args.length) {
  console.error('Usage: node patient.js lighthouse-launch <icn ...> | <launch token> | --all | --none');
  process.exit(1);
}

if (args[0] === '--none') {
  console.log(encode(null));
} else if (args[0] === '--all') {
  for (const e of known) console.log(`${e.name}\t${e.icn}\t${encode(e.icn)}`);
} else {
  for (const a of args) {
    if (/^\d+V\d+$/.test(a)) console.log(encode(a));
    else {
      try {
        const d = decode(a);
        console.log(`${d.patient || '(no patient)'}  sta3n ${d.sta3n}`);
      } catch {
        console.error(`Not an ICN or launch token: ${a}`);
        process.exitCode = 1;
      }
    }
  }
}
