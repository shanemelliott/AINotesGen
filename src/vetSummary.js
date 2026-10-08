'use strict';
// Human-readable veteran service summary from a CDSP UTIL VET GET result, laid out like Patient Inquiry.
// Empty fields and internal codes are left out.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const list = (v) => (Array.isArray(v) ? v : Object.values(v || {}));

function fmText(fm) {
  const s = String(fm || '').split('.')[0];
  if (!/^\d{7}$/.test(s)) return '';
  const y = 1700 + Number(s.slice(0, 3));
  const m = Number(s.slice(3, 5));
  const d = Number(s.slice(5, 7));
  if (!m) return String(y);
  return d ? `${MONTHS[m - 1]} ${d}, ${y}` : `${MONTHS[m - 1]} ${y}`;
}

const range = (from, to) => [fmText(from), fmText(to)].filter(Boolean).join(' to ');

// Fields shown in their own lines; any other YES field is listed under "Other".
const SHOWN = new Set(['1901', '.301', '.302', '.361', '.3611', '.3612', '.323', '.325', '.326', '.327', '.324',
  '.5291', '.5292', '.5293', '.5294', '.32101', '.32104', '.32105', '.32102', '.3213', '.32103', '.32201',
  '.322011', '.322012', '.322013', '.525', '.32117', '.32118']);

function summarize(result) {
  const f = {};
  for (const x of list(result.fields)) f[String(x.field).replace(/^0\./, '.')] = x;
  const ext = (n) => String(f[n]?.external ?? '');
  const int = (n) => String(f[n]?.internal ?? '');
  const yes = (n) => int(n) === 'Y' || int(n) === '1';
  const lines = [];
  const add = (label, value) => { if (value) lines.push(`${label.padEnd(24)}${value}`); };

  lines.push(`${result.name} (DFN ${result.dfn}), born ${fmText(result.dob)}`, '');
  add('Veteran:', ext('1901'));

  const eligStatus = [ext('.3611'), fmText(int('.3612'))].filter(Boolean).join(', ');
  add('Primary eligibility:', ext('.361') && `${ext('.361')}${eligStatus ? ` (${eligStatus})` : ''}`);
  const others = list(result.eligibilities).map((e) => e.name).filter((n) => n && n !== ext('.361'));
  add('Other eligibilities:', others.join('; '));

  const sc = yes('.301');
  add('Service connected:', int('.301') && (sc ? `YES, ${int('.302') || '?'}%` : 'NO'));
  for (const r of list(result.ratedDisabilities).sort((a, b) => b.percent - a.percent)) {
    lines.push(`  ${String(r.percent).padStart(3)}%  ${r.name} (${r.dxCode})${r.serviceConnected === '1' || r.serviceConnected === 1 ? '' : ' - not SC'}`);
  }

  const service = [ext('.325'), ext('.323'), range(int('.326'), int('.327')), ext('.324')].filter(Boolean).join(', ');
  add('Military service:', service);
  const episodes = list(result.serviceEpisodes).length;
  if (episodes > 1) add('', `${episodes} service episodes on file`);

  if (yes('.5291')) add('Combat:', [ext('.5292'), range(int('.5293'), int('.5294'))].filter(Boolean).join(', ') || 'YES');

  const exposures = [];
  if (yes('.32101')) exposures.push(`Vietnam service${range(int('.32104'), int('.32105')) ? ` (${range(int('.32104'), int('.32105'))})` : ''}`);
  if (yes('.32102')) exposures.push(`Agent Orange${ext('.3213') ? ` (${ext('.3213')})` : ''}`);
  if (yes('.32103')) exposures.push('Ionizing radiation');
  if (yes('.32201')) exposures.push(`Persian Gulf / SW Asia service${range(int('.322011'), int('.322012')) ? ` (${range(int('.322011'), int('.322012'))})` : ''}`);
  if (yes('.322013')) exposures.push('SW Asia conditions');
  if (yes('.525')) exposures.push('Prisoner of war');
  add('Exposures:', exposures.join('; ') || 'none');
  if (yes('.32117')) add('Persian Gulf indicator:', 'YES');

  const other = list(result.fields)
    .filter((x) => !SHOWN.has(String(x.field).replace(/^0\./, '.')) && x.internal === 'Y')
    .map((x) => String(x.label).replace(/\?$/, ''));
  add('Other (YES):', other.join('; '));

  const mst = String(result.mst || '').split('^');
  add('MST:', mst[0] === '0' || !mst[5] ? 'Unknown, not screened' : `${mst[5]} (${fmText(mst[2])})`);

  const e = result.enrollment?.record;
  if (result.enrollment?.ien && e && typeof e === 'object') {
    const status = e.statusName || `status ${e.STATUS}`;
    add('Enrollment:', `${e.PRIORITY ? `Priority group ${e.PRIORITY}` : 'No priority group'}, ${status}${e.DATE ? `, enrolled ${fmText(e.DATE)}` : ''}`);
  } else {
    add('Enrollment:', result.enrollment?.ien ? 'on file (reload CDSPVET to read it)' : 'NOT ENROLLED');
  }
  return lines.join('\n');
}

module.exports = { summarize, fmText };
