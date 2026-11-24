// Writes one JSON record per test run under logs/pce-checkout/ and keeps a log of created IENs.
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '..', '..', '..', 'logs', 'pce-checkout');

function write(record) {
  fs.mkdirSync(DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(DIR, `${record.id}-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2));
  const created = path.join(DIR, 'created-iens.jsonl');
  fs.appendFileSync(created, `${JSON.stringify({ id: record.id, at: stamp, appointmentIen: record.appointmentIen, visitIen: record.visitIen })}\n`);
  return file;
}

function summary(records) {
  console.log('\nid\tverdict\texpected\tobserved');
  for (const r of records) console.log(`${r.id}\t${r.verdict}\t${r.expectation}\t${r.observed}`);
}

module.exports = { write, summary };
