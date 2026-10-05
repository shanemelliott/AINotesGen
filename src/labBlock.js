// Labs are rendered from the extracted data, not by the LLM: o3-mini was
// shifting values onto the wrong test names (e.g. sodium value under calcium).
const PLACEHOLDER = /^[ \t]*\[\[LABS\]\][ \t]*$/m;

function flagLabel(flag) {
  const f = String(flag || '').trim();
  if (!f) return '';
  if (/^h/i.test(f)) return ' (HIGH)';
  if (/^l/i.test(f)) return ' (LOW)';
  return ` (${f.toUpperCase()})`;
}

function renderLabBlock(labs) {
  if (!labs || labs.length === 0) return null;
  const lines = labs.map((l) => {
    const units = l.units ? ` ${String(l.units).trim()}` : '';
    return `  ${l.name}: ${l.result}${units}${flagLabel(l.flag)}`;
  });
  return ['Labs today:', ...lines].join('\n');
}

// Replaces the [[LABS]] placeholder; if the model omitted it, inserts before ASSESSMENT:.
function insertLabBlock(noteText, ctx) {
  const block = renderLabBlock(ctx.labsToday);
  if (PLACEHOLDER.test(noteText)) {
    return noteText.replace(PLACEHOLDER, block === null ? '' : block).replace(/\n{3,}/g, '\n\n');
  }
  if (block === null) return noteText;
  const lines = noteText.split('\n');
  const idx = lines.findIndex((l) => l.trimStart().startsWith('ASSESSMENT:'));
  if (idx === -1) return `${noteText}\n${block}`;
  lines.splice(idx, 0, block);
  return lines.join('\n');
}

module.exports = { renderLabBlock, insertLabBlock };
