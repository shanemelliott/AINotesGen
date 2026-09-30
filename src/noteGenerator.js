// Shared note-generation helper: builds context for an encounter and calls
// the Task 3 AI pipeline. Used by test-write-note.js and generate-notes.js.
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { loadPatient, getEncounter, buildContext, callCandidate } = require('../test-ai');

const DEFAULT_MODEL = { model: 'o3-mini', apiVersion: '2025-04-28' };

function loadApiKey() {
  const envVars = {};
  dotenv.config({
    path: process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '..', '..', 'VAOSAI', '.env'),
    processEnv: envVars,
    quiet: true
  });
  const apiKey = envVars.AZURE_OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY;
  if (!apiKey) throw new Error('AZURE_OPENAI_API_KEY is not set (expected in ../VAOSAI/.env)');
  return apiKey;
}

async function generateNoteText(dfn, date) {
  const items = loadPatient(dfn);
  const encounter = getEncounter(items, date);
  const problemRules = JSON.parse(fs.readFileSync(path.join(__dirname, 'problem-rules.json'), 'utf8'));
  const ctx = buildContext(encounter, problemRules);

  const apiKey = loadApiKey();
  const result = await callCandidate(DEFAULT_MODEL, ctx, apiKey);
  if (result.outcome !== 'ok') {
    throw new Error(`Note generation failed: ${result.outcome} ${result.detail || ''}`);
  }
  return { noteText: result.content, encounter, ctx };
}

module.exports = { generateNoteText, loadApiKey, DEFAULT_MODEL };
