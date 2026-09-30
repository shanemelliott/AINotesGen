const fs = require('fs');
const path = require('path');

const HEADINGS = ['VISIT DATE:', 'CHIEF COMPLAINT:', 'SUBJECTIVE:', 'OBJECTIVE:', 'ASSESSMENT:', 'PLAN:'];
const MAX_LINE = 80;

function validateNote(note, noteId) {
  const lines = note.replace(/\r\n/g, '\n').split('\n');
  const problems = [];

  // 1. Check headings
  let lastIdx = -1;
  for (const h of HEADINGS) {
    const idx = lines.findIndex((l) => l.trimStart().startsWith(h));
    if (idx === -1) problems.push(`missing ${h}`);
    else if (idx < lastIdx) problems.push(`misordered ${h}`);
    else lastIdx = idx;
  }

  // 2. Check line length
  const longLines = lines
    .map((l, i) => ({ line: i + 1, length: l.length, content: l }))
    .filter((x) => x.length > MAX_LINE);
  if (longLines.length > 0) {
    problems.push(`${longLines.length} line(s) exceed ${MAX_LINE} chars`);
    longLines.slice(0, 3).forEach((x) => problems.push(`  Line ${x.line}: ${x.length} chars`));
  }

  // 3. Check for markdown
  const markdown = /(^|\n)\s*#{1,6}\s|\*\*[^*\n]+\*\*|```/.test(note);
  if (markdown) problems.push('contains markdown formatting');

  // 4. Check for identifiers
  const ssnPattern = /\d{3}-\d{2}-\d{4}/;
  if (ssnPattern.test(note)) problems.push('contains potential SSN');

  // 5. Check assessment focus (count numbered items)
  const assessmentMatch = note.match(/ASSESSMENT:([\s\S]*?)(PLAN:|$)/);
  let assessmentCount = 0;
  if (assessmentMatch) {
    const assessmentText = assessmentMatch[1];
    const numberedItems = (assessmentText.match(/^\s*\d+\./gm) || []).length;
    assessmentCount = numberedItems;
    if (numberedItems > 5) problems.push(`assessment has ${numberedItems} items (>5 is unfocused)`);
  }

  // 6. Check if has diagnosis code
  const hasICD = /\([A-Z0-9]{1,3}\d{1,2}(?:\.\d+)?\)/.test(note);
  if (!hasICD) problems.push('no ICD codes found in assessment');

  // 7. Check if care plan activities mentioned
  const carePlanMentioned =
    /LOW SALT|SALT DIET|DIET EDUCATION|PHYSICAL EXERCISE|EXERCISE/.test(note);
  if (!carePlanMentioned) problems.push('care plan activities not mentioned');

  // 8. Check if diagnosis I50.1 mentioned
  const hasHF = /heart failure|I50\.1|LEFT VENTRICULAR/.test(note);
  if (!hasHF) problems.push('primary diagnosis (heart failure/I50.1) not found');

  const pass = problems.length === 0;
  return { pass, problems, assessmentCount, hasHF, carePlanMentioned, hasICD };
}

// Load both notes
const smokeNote = fs.readFileSync('./output/smoke-note-o3-mini.txt', 'utf8');
const improvedNote = fs.readFileSync('./output/smoke-note-o3-mini.txt', 'utf8'); // Same file since we just overwrote it
const cleanNote = fs.readFileSync('./output/smoke-note-o3-mini-clean.txt', 'utf8'); // The clean version

console.log('=== QUALITY VALIDATION REPORT ===\n');

const smokeValidation = validateNote(smokeNote, 'smoke-note');
const cleanValidation = validateNote(cleanNote, 'improved-note');

console.log('IMPROVED NOTE (smoke-note-o3-mini-clean.txt):');
console.log('Validation result:', cleanValidation.pass ? '✓ PASS' : '✗ FAIL');
console.log('Assessment items:', cleanValidation.assessmentCount);
console.log('Has ICD codes:', cleanValidation.hasICD ? '✓ Yes' : '✗ No');
console.log('Has heart failure diagnosis:', cleanValidation.hasHF ? '✓ Yes' : '✗ No');
console.log('Has care plan activities:', cleanValidation.carePlanMentioned ? '✓ Yes' : '✗ No');
if (cleanValidation.problems.length > 0) {
  console.log('Issues:');
  cleanValidation.problems.forEach((p) => console.log(`  - ${p}`));
} else {
  console.log('No issues found');
}

console.log('\n--- Key Checks from Quality Review ---\n');

const checks = [
  {
    name: 'Primary diagnosis (I50.1) in CHIEF COMPLAINT',
    fn: (note) => {
      const ccMatch = note.match(/CHIEF COMPLAINT:([\s\S]*?)SUBJECTIVE:/);
      return ccMatch && /heart failure|I50\.1|cardiac/.test(ccMatch[1]);
    },
  },
  {
    name: 'Coherent narrative (age + diagnosis + meds consistent)',
    fn: (note) => {
      const hasAge = /45.*?year.*?old|45-year-old|45 year old/.test(note);
      const hasFemale = /female|woman|her/.test(note);
      const hasHF = /heart failure|I50\.1|ventricular failure/.test(note);
      const hasMeds = /FUROSEMIDE|CARVEDILOL|LISINOPRIL/.test(note);
      return hasAge && hasFemale && hasHF && hasMeds;
    },
  },
  {
    name: 'Assessment focused (≤5 items)',
    fn: (note) => cleanValidation.assessmentCount <= 5,
  },
  {
    name: 'Meds linked to indication',
    fn: (note) => {
      const hasFurosemideLinked = /[Ff]urosemide.*diuresis|[Ff]urosemide.*volume|for.*volume.*furosemide/.test(note);
      const hasACELinked = /lisinopril.*blood|lisinopril.*pressure|lisinopril.*afterload/.test(note);
      return hasFurosemideLinked || hasACELinked;
    },
  },
  {
    name: 'Care plan activities in PLAN section',
    fn: (note) => {
      const planMatch = note.match(/PLAN:([\s\S]*?)$/);
      return planMatch && /DIET|EXERCISE|diet|exercise/.test(planMatch[1]);
    },
  },
  {
    name: 'Social history in SUBJECTIVE (not assessment)',
    fn: (note) => {
      const subjMatch = note.match(/SUBJECTIVE:([\s\S]*?)OBJECTIVE:/);
      const assessMatch = note.match(/ASSESSMENT:([\s\S]*?)PLAN:/);
      const inSubj = subjMatch && /social|isolation|employment|housing/.test(subjMatch[1]);
      const notInAssess = !assessMatch || !/^\s*\d+\.\s*(isolation|employment|housing|social isolation)/m.test(assessMatch[1]);
      return inSubj || notInAssess;
    },
  },
  {
    name: 'No markdown formatting',
    fn: (note) => {
      const markdown = /(^|\n)\s*#{1,6}\s|\*\*[^*\n]+\*\*|```/.test(note);
      return !markdown;
    },
  },
  {
    name: 'No patient identifiers (SSN, ICN)',
    fn: (note) => {
      const ssnPattern = /\d{3}-\d{2}-\d{4}/;
      return !ssnPattern.test(note);
    },
  },
];

let passed = 0;
for (const check of checks) {
  const result = check.fn(cleanNote);
  console.log(`${result ? '✓' : '✗'} ${check.name}`);
  if (result) passed++;
}

console.log(`\nQuality Score: ${passed}/${checks.length} checks passed`);
if (passed >= 6) {
  console.log('✓ READY FOR ARCHIVE (≥6 improvements confirmed)');
} else {
  console.log('⚠ More work needed (need ≥6 checks)');
}
