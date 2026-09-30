// Note storage: each note is a pair of files sharing an id -
// `<id>.txt` (plain note body, directly editable) and `<id>.json`
// (metadata only - no note text, to keep JSON short and readable).
const fs = require('fs');
const path = require('path');

function noteId(dfn, date) {
  return `${dfn}-${date}`;
}

function writeNote(dir, id, { noteText, ...meta }) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.txt`), noteText);
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(meta, null, 2));
}

function readNote(dir, id) {
  const jsonPath = path.join(dir, `${id}.json`);
  const txtPath = path.join(dir, `${id}.txt`);
  if (!fs.existsSync(jsonPath) || !fs.existsSync(txtPath)) return null;
  const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const noteText = fs.readFileSync(txtPath, 'utf8');
  return { ...meta, noteText };
}

function existsInDir(dir, id) {
  return fs.existsSync(path.join(dir, `${id}.json`)) && fs.existsSync(path.join(dir, `${id}.txt`));
}

function listIds(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -'.json'.length));
}

function moveNote(fromDir, toDir, id) {
  fs.mkdirSync(toDir, { recursive: true });
  for (const ext of ['.json', '.txt']) {
    fs.renameSync(path.join(fromDir, `${id}${ext}`), path.join(toDir, `${id}${ext}`));
  }
}

module.exports = { noteId, writeNote, readNote, existsInDir, listIds, moveNote };
