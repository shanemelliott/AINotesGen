// Fail if note text contains claim, rating-request, compensation, C&P, DBQ, VBA or regional office wording.
// Usage: node patient.js check-no-claim [file|dir ...] [--text "sentence"] [--stdin]   (default dir: output/ready)
const fs = require('fs');
const path = require('path');
const { ROOT } = require('../../src/paths');

const TERMS = [
  /\bclaim(s|ed|ing|ant)?\b/i,
  /\brating (request|decision|increase|exam)/i,
  /\bincrease (in|of|to) (his |the )?(rating|disability|service[- ]connect)/i,
  /\bcompensation\b/i,
  /\bC\s?(&|and)\s?P\b/i,
  /\bDBQ\b/i,
  /\bVBA\b/i,
  /\bregional office\b/i,
  /\bdisability (benefits?|exam)\b/i,
];

function findHits(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const re of TERMS) {
      const m = line.match(re);
      if (m) hits.push({ line: i + 1, term: m[0], text: line.trim() });
    }
  });
  return hits;
}

function filesIn(target) {
  const full = path.isAbsolute(target) ? target : path.join(ROOT, target);
  if (!fs.existsSync(full)) throw new Error(`Not found: ${target}`);
  if (fs.statSync(full).isFile()) return [full];
  return fs.readdirSync(full).filter((f) => f.endsWith('.txt')).map((f) => path.join(full, f));
}

function main() {
  const argv = process.argv.slice(2);
  let total = 0;
  const report = (label, text) => {
    const hits = findHits(text);
    hits.forEach((h) => console.log(`HIT  ${label}:${h.line}  "${h.term}"  ${h.text}`));
    total += hits.length;
  };

  const textAt = argv.indexOf('--text');
  if (textAt !== -1) {
    report('text', argv[textAt + 1] || '');
  } else if (argv.includes('--stdin')) {
    report('stdin', fs.readFileSync(0, 'utf8'));
  } else {
    const targets = argv.length ? argv : ['output/ready'];
    let n = 0;
    for (const t of targets) for (const f of filesIn(t)) { report(path.relative(ROOT, f), fs.readFileSync(f, 'utf8')); n++; }
    console.log(`Checked ${n} file(s).`);
  }
  console.log(total ? `FAIL: ${total} hit(s)` : 'OK: no claim wording found');
  process.exit(total ? 1 : 0);
}

if (require.main === module) main();
module.exports = { findHits };
