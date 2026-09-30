// Deterministic (+ cheap LLM fallback) sanity checks to catch clinically
// questionable notes before they're queued for VistA writing/signing.
const { validateNote } = require('../test-ai');

const CONTRACEPTIVE_MEDS = ['medroxyprogesterone', 'norethindrone', 'levonorgestrel', 'etonogestrel'];
const PREGNANCY_TERMS = ['pregnan', 'eclampsia', 'antepartum', 'prenatal', 'obstetric', 'postpartum'];

// Flags a note if it references pregnancy/obstetric care while the patient's
// current meds are contraceptive-only (a known Synthea data-quality pattern:
// stale "active" pregnancy problems that were never resolved).
function checkPregnancyContraceptiveMismatch(noteText, ctx) {
  const lower = noteText.toLowerCase();
  const mentionsPregnancy = PREGNANCY_TERMS.some((term) => lower.includes(term));
  if (!mentionsPregnancy) return null;

  const activeMedNames = [...(ctx.newMeds || []), ...(ctx.activeMeds || [])]
    .map((m) => (m.name || '').toLowerCase());
  const hasContraceptive = activeMedNames.some((name) => CONTRACEPTIVE_MEDS.some((c) => name.includes(c)));
  const hasOtherPregnancyRelatedOrder = (ctx.ordersToday || [])
    .some((o) => PREGNANCY_TERMS.some((term) => (o.name || '').toLowerCase().includes(term)));

  if (hasContraceptive && !hasOtherPregnancyRelatedOrder) {
    return 'note references pregnancy/obstetric care but active meds are contraceptive-only (possible stale pregnancy problem)';
  }
  return null;
}

// Flags ASSESSMENT items whose text isn't grounded in the problems/diagnoses
// actually provided to the LLM (catches hallucinated or leaked-in problems).
function checkAssessmentGrounding(noteText, ctx) {
  const match = noteText.match(/ASSESSMENT:([\s\S]*?)(PLAN:|$)/i);
  if (!match) return null;

  const groundedTerms = [
    ...(ctx.relevantProblems || []),
    ...(ctx.visitDiagnoses || []).map((d) => d.name),
  ].map((t) => (t || '').toLowerCase());
  if (groundedTerms.length === 0) return null;

  const items = (match[1].match(/^\s*\d+\.\s*(.+)$/gm) || []).map((l) => l.replace(/^\s*\d+\.\s*/, '').toLowerCase());
  const ungrounded = items.filter((item) => !groundedTerms.some((term) => term && (item.includes(term) || term.includes(item.split(' ')[0]))));

  if (ungrounded.length > 0) {
    return `${ungrounded.length} ASSESSMENT item(s) not clearly grounded in the provided problem list`;
  }
  return null;
}

function checkStructuralValidation(noteText) {
  const result = validateNote(noteText);
  return result.pass ? null : `structural validation failed: ${result.problems.join('; ')}`;
}

function checkLineLength(noteText, maxChars = 80) {
  const lines = noteText.split('\n');
  const overlong = lines
    .map((line, i) => ({ line, idx: i + 1, len: line.length }))
    .filter((x) => x.len > maxChars);
  
  if (overlong.length > 0) {
    const sample = overlong.slice(0, 3).map((x) => `line ${x.idx} (${x.len} chars)`).join(', ');
    return `${overlong.length} line(s) exceed ${maxChars} chars: ${sample}`;
  }
  return null;
}

// Runs deterministic checks first (fast, free); returns as soon as any fires.
// Callers may add an LLM-based fallback classification for borderline cases
// where no deterministic rule fires but the note reads as uncertain.
function flagNote(noteText, ctx) {
  const reasons = [];
  const checks = [checkStructuralValidation, checkLineLength, checkPregnancyContraceptiveMismatch, checkAssessmentGrounding];
  for (const check of checks) {
    const reason = check(noteText, ctx);
    if (reason) reasons.push(reason);
  }
  return { flagged: reasons.length > 0, reasons };
}

module.exports = { flagNote, checkPregnancyContraceptiveMismatch, checkAssessmentGrounding, checkStructuralValidation, checkLineLength };
