// TIU note title IEN per clinic (src/note-titles.json); clinics not listed use VISTA_NOTE_TITLE_IEN.
const config = require('./config');
const byClinic = require('./note-titles.json');

function noteTitleFor(clinic) {
  return String(byClinic[clinic] || config.noteTitleIen());
}

module.exports = { noteTitleFor };
