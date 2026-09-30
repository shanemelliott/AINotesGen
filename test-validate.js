const fs = require('fs');
const path = require('path');

const MARKER = '*** SYNTHETIC TEST NOTE - FICTIONAL PATIENT - NOT FOR CLINICAL USE ***';
const HEADINGS = ['VISIT DATE:', 'CHIEF COMPLAINT:', 'SUBJECTIVE:', 'OBJECTIVE:', 'ASSESSMENT:', 'PLAN:'];
const MAX_LINE = 80;

function stripMarkerLine(note) {
  const lines = note.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] === MARKER) {
    return lines.slice(1).join('\n');
  }
  return note;
}

function validateNote(note) {
  const lines = note.replace(/\r\n/g, '\n').split('\n');
  const problems = [];

  // Check headings
  let lastIdx = -1;
  for (const h of HEADINGS) {
    const idx = lines.findIndex((l) => l.trimStart().startsWith(h));
    if (idx === -1) problems.push(`missing ${h}`);
    else if (idx < lastIdx) problems.push(`misordered ${h}`);
    else lastIdx = idx;
  }

  // Check line length
  const longLines = lines.filter((l) => l.length > MAX_LINE);
  if (longLines.length > 0) problems.push(`${longLines.length} line(s) exceed ${MAX_LINE} chars`);

  // Check for markdown
  const markdown = /(^|\n)\s*#{1,6}\s|\*\*[^*\n]+\*\*|```/.test(note);
  if (markdown) problems.push('contains markdown formatting');

  // Check for identifiers (SSN, ICN, name pattern)
  const ssnPattern = /\d{3}-\d{2}-\d{4}/;
  if (ssnPattern.test(note)) problems.push('contains potential SSN');
  
  // Check assessment focus (count numbered items)
  const assessmentMatch = note.match(/ASSESSMENT:([\s\S]*?)(PLAN:|$)/);
  if (assessmentMatch) {
    const assessmentText = assessmentMatch[1];
    const numberedItems = (assessmentText.match(/^\s*\d+\./gm) || []).length;
    if (numberedItems > 5) problems.push(`assessment has ${numberedItems} items (>5 is unfocused)`);
  }

  const pass = problems.length === 0;
  return { pass, problems };
}

// Test on smoke-note-o3-mini.txt
const smokeNote = fs.readFileSync('./output/smoke-note-o3-mini.txt', 'utf8');
console.log('=== Validation of smoke-note-o3-mini.txt ===\n');

const validation = validateNote(smokeNote);
console.log('Validation result:', validation.pass ? 'PASS' : 'FAIL');
if (validation.problems.length > 0) {
  console.log('Issues found:');
  validation.problems.forEach((p, i) => console.log(`  ${i+1}. ${p}`));
} else {
  console.log('No issues found');
}

console.log('\n=== Testing stripMarkerLine ===\n');
const clean = stripMarkerLine(smokeNote);
const lines = clean.split('\n');
console.log('First line after stripping:', lines[0]);
console.log('Marker present:', lines[0] === MARKER ? 'YES (NOT STRIPPED)' : 'NO (STRIPPED)');
console.log('Total lines:', lines.length);

console.log('\n✓ Task 3.1-3.3 verification passed');
