// Word-wrap any line exceeding maxChars so note generation never produces
// TIU lines over the limit (avoids flagging notes for line-length alone).
function wrapLine(line, maxChars) {
  if (line.length <= maxChars) return [line];

  const leading = (line.match(/^\s*/) || [''])[0];
  const isListItem = /^\d+\.\s/.test(line);
  const continuationIndent = isListItem ? '   ' : leading;
  const words = line.trim().split(/\s+/);

  const lines = [];
  let current = '';
  for (const word of words) {
    const prefix = lines.length === 0 && current === '' ? leading : (current === '' ? continuationIndent : '');
    const withPrefix = current === '' ? prefix + word : `${current} ${word}`;
    if (withPrefix.length > maxChars && current !== '') {
      lines.push(current);
      current = continuationIndent + word;
    } else {
      current = withPrefix;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function reflowText(text, maxChars = 80) {
  return text
    .split('\n')
    .flatMap((line) => wrapLine(line, maxChars))
    .join('\n');
}

module.exports = { reflowText, wrapLine };
