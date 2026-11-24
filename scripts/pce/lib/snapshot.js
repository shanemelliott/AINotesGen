// Snapshot of the check-out related fields for one appointment, read through DDR. Read-only.
const { ddrGets, ddrLister } = require('./ddr');

const val = (rec, f) => (rec && rec[f] ? rec[f].internal : '');

// Appointment (409.84) -> resource (409.831) -> clinic; clinic appointment (44.003); patient appointment (2.98) -> encounter (409.68) -> visit (9000010).
async function snapshot(apptIen) {
  const appt = await ddrGets({ file: '409.84', iens: `${apptIen},`, fields: '.01;.03;.05;.07;.12;.14;.15;.19' });
  const apptDt = val(appt, '.01');
  const dfn = val(appt, '.05');
  const resource = val(appt, '.07');
  const res = resource ? await ddrGets({ file: '409.831', iens: `${resource},`, fields: '.04' }) : {};
  const clinic = val(res, '.04');

  let clinicAppt = null;
  if (clinic && apptDt) {
    const rows = await ddrLister({ file: '44.003', iens: `,${apptDt},${clinic},`, fields: '.01;303;304;306;309;310', max: 20 });
    for (const r of rows) {
      const rec = await ddrGets({ file: '44.003', iens: `${r.ien},${apptDt},${clinic},`, fields: '.01;303;304;306;309;310' });
      if (val(rec, '.01') === dfn) { clinicAppt = { sub: r.ien, ...rec }; break; }
    }
  }

  const pat = dfn && apptDt ? await ddrGets({ file: '2.98', iens: `${apptDt},${dfn},`, fields: '3;21' }) : {};
  const oeIen = val(pat, '21');
  const oe = oeIen ? await ddrGets({ file: '409.68', iens: `${oeIen},`, fields: '.05;.07;.08;.12' }) : null;
  const visitIen = val(oe, '.05');
  const visit = visitIen ? await ddrGets({ file: '9000010', iens: `${visitIen},`, fields: '.01;.07;.18;.22;15003;81202' }) : null;

  return { apptIen: String(apptIen), dfn, apptDt, clinic, appt, clinicAppt, patientAppt: pat, oeIen, oe, visitIen, visit };
}

module.exports = { snapshot };
