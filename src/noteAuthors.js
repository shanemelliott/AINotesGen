// Note author DUZ per clinic (src/clinic-authors.json); clinics not listed use VISTA_AUTHOR_DUZ.
const config = require('./config');
const { clinics } = require('./clinic-authors.json');

function authorFor(clinic, clinicIen) {
  const hit = clinics[clinic] || Object.values(clinics).find((c) => clinicIen != null && String(c.ien) === String(clinicIen));
  return hit ? String(hit.duz) : config.authorDuz();
}

module.exports = { authorFor };
