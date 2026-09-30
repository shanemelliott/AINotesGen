// Centralized VistA config loader: reads .env once, validates required
// values, and exposes them for appointment creation (Task 4) and note
// writing (Task 5). Values with no default throw only when actually used.
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '..', '.env') });

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured. See .env.sample and set it in .env`);
  }
  return value;
}

const config = {
  vistaApiBaseUrl: () => required('VISTA_API_BASE_URL'),
  vistaSiteId: () => required('VISTA_SITE_ID'),
  vistaApiKey: () => required('VISTA_API_KEY'),
  duz: () => required('VISTA_DUZ'),
  esigCode: () => required('VISTA_ESIG_CODE'),
  clinicIen: () => process.env.VISTA_CLINIC_IEN || '23',
  resourceIen: () => process.env.VISTA_RESOURCE_IEN || '2',
  noteTitleIen: () => required('VISTA_NOTE_TITLE_IEN')
};

module.exports = config;
