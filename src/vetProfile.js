'use strict';
// Derives a veteran service profile for a loaded test patient from its VPR items and src/veteran-rules.json.
// Pure and deterministic: the same patient record and rules always give the same profile.

const DAY_MS = 86400000;

// Small seeded generator (mulberry32) so choices depend only on the DFN.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a hash, so neighbouring DFNs do not give correlated seeds.
function seedFor(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}

const vprDate = (v) => {
  const s = String(v || '');
  return s.length >= 8 ? new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8))) : null;
};
const iso = (d) => (d ? d.toISOString().slice(0, 10) : null);
const parseIso = (s) => (s ? new Date(`${s}T00:00:00Z`) : null);
const addYears = (d, y) => new Date(d.getTime() + Math.round(y * 365.25 * DAY_MS));
const fmDate = (d) => (d ? `${d.getUTCFullYear() - 1700}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}` : '');
const between = (r, [lo, hi]) => lo + r() * (hi - lo);
const minDate = (a, b) => (a < b ? a : b);

// VA combined ratings: apply each rating to the remaining efficiency, high to low, round each step,
// then round the result to the nearest 10 (5 rounds up). Ratings of 0 do not count.
function combineRatings(percents) {
  let combined = 0;
  for (const p of [...percents].filter((x) => x > 0).sort((a, b) => b - a)) {
    combined = Math.round(combined + ((100 - combined) * p) / 100);
  }
  return { exact: combined, rounded: Math.min(100, Math.floor((combined + 5) / 10) * 10) };
}

function pickWeighted(r, rows) {
  const total = rows.reduce((n, x) => n + x.weight, 0);
  let x = r() * total;
  for (const row of rows) if ((x -= row.weight) < 0) return row;
  return rows[rows.length - 1];
}

function periodFor(date, rules) {
  return rules.periodsOfService.find((p) => date >= parseIso(p.from) && (!p.to || date <= parseIso(p.to)))
    || rules.periodsOfService[rules.periodsOfService.length - 1];
}

function deriveProfile({ dfn, items }, rules) {
  const r = rng(seedFor(`veteran-profile:${dfn}`));
  const patient = items.find((it) => String(it.uid).includes(':patient:')) || {};
  const dob = vprDate(patient.dateOfBirth);
  if (!dob) throw new Error(`DFN ${dfn}: no date of birth in the VPR`);

  // Active problems and visit diagnoses with dates, codes stripped from the text.
  const problems = items
    .filter((it) => String(it.uid).includes(':problem:') && String(it.statusName || '').toUpperCase() !== 'INACTIVE')
    .map((p) => ({ text: String(p.problemText || '').replace(/\s*\((SCT|ICD)[^)]*\)/g, '').trim(), onset: vprDate(p.onset) }))
    .concat(items
      .filter((it) => String(it.uid).includes(':pov:'))
      .map((p) => ({ text: String(p.name || '').trim(), onset: vprDate(p.entered) })));
  const firstMatch = (pattern) => problems
    .filter((p) => new RegExp(pattern, 'i').test(p.text) && notPreService(p))
    .sort((a, b) => (a.onset || 0) - (b.onset || 0))[0];

  // Service dates: entry soon after 18; separation after the service length, or soon after an in-service injury.
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const turned18 = addYears(dob, 18);
  const entry = addYears(turned18, between(r, rules.service.entryDelayYears));
  let separation = minDate(addYears(entry, between(r, rules.service.lengthYears)), today);
  const period = periodFor(entry, rules);
  const branch = pickWeighted(r, rules.branches);

  const rated = [];
  const sources = [];
  // A combat-type injury within the longest service length after entry ends service soon after it.
  const latestService = addYears(entry, rules.service.lengthYears[1]);
  const isInjuryRow = (row) => row.combat;
  const notPreService = (p) => !p.onset || p.onset >= entry;
  const firstInjury = rules.disabilities.filter(isInjuryRow)
    .flatMap((row) => problems.filter((p) => p.onset && p.onset >= entry && p.onset <= latestService && new RegExp(row.match, 'i').test(p.text)))
    .map((p) => p.onset).sort((a, b) => a - b)[0];
  if (firstInjury) separation = minDate(addYears(firstInjury, between(r, rules.service.separationAfterInjuryYears)), today);
  for (const row of rules.disabilities) {
    // Injury-type rows only count when the injury happened during service (or has no date); other rows not before entry.
    const hits = problems.filter((p) => new RegExp(row.match, 'i').test(p.text)).sort((a, b) => (a.onset || 0) - (b.onset || 0));
    const hit = row.combat ? hits.find((p) => !p.onset || (p.onset >= entry && p.onset <= separation)) : hits.find(notPreService);
    if (hit) sources.push({ row, hit });
  }
  const injuries = sources.filter((s) => s.row.combat && s.hit.onset);

  // Exposures follow the period of service and the service dates.
  const ex = rules.exposures;
  const vietnamFrom = parseIso(ex.vietnam.inCountryFrom);
  const vietnamTo = parseIso(ex.vietnam.inCountryTo);
  const vietnam = period.name === ex.vietnam.periodOfService && separation > vietnamFrom && entry < vietnamTo && r() < ex.vietnam.serviceShare;
  const gulfFrom = parseIso(ex.persianGulf.from);
  const gulfTo = parseIso(ex.persianGulf.to);
  const post911 = parseIso(ex.persianGulf.postNineEleventhFrom);
  const persianGulf = (entry <= gulfTo && separation >= gulfFrom) || separation >= post911;
  const swFrom = persianGulf ? (separation >= post911 && entry > gulfTo ? (entry > post911 ? entry : post911) : (entry > gulfFrom ? entry : gulfFrom)) : null;

  // Rated disabilities: one per matching row; mental conditions share one rating (the highest).
  const mental = sources.filter((s) => s.row.group === 'mental').sort((a, b) => b.row.percent - a.row.percent)[0];
  for (const s of sources) {
    if (s.row.group === 'mental' && s !== mental) continue;
    rated.push({ dxCode: s.row.dxCode, label: s.row.label, percent: s.row.percent, serviceConnected: 1, source: s.hit.text, onset: iso(s.hit.onset), cfr: s.row.cfr });
  }
  for (const row of rules.presumptive) {
    const qualifies = row.periodOfService === period.name && ((row.requires === 'vietnam' && vietnam) || (row.requires === 'persianGulf' && persianGulf));
    const hit = qualifies && firstMatch(row.match);
    if (hit && !rated.some((x) => x.dxCode === row.dxCode)) {
      rated.push({ dxCode: row.dxCode, label: row.label, percent: row.percent, serviceConnected: 1, source: hit.text, onset: iso(hit.onset), cfr: row.cfr, presumptive: true });
    }
  }

  const combined = combineRatings(rated.map((x) => x.percent));
  const sc = rated.length > 0;
  const elig = rules.eligibility.find((e) => combined.rounded >= e.minPercent);
  // Combat needs a dated in-service injury; undated injuries are still rated.
  const combat = injuries.length > 0;
  const combatOnset = combat ? injuries.map((s) => s.hit.onset).sort((a, b) => a - b)[0] : null;
  const combatFrom = combat ? new Date(Math.max(entry.getTime(), addYears(combatOnset, -0.5).getTime())) : null;
  const combatTo = combatOnset;
  const combatEra = combatTo && combatTo >= post911 ? 'POST-9/11' : combatTo ? periodFor(combatTo, rules).name : null;
  const eligDate = minDate(addYears(separation, 1), today);
  // Enrollment under the 1996 eligibility reform started in October 1998; MST is screened at enrollment.
  const earliest = parseIso(rules.enrollmentEarliest);
  const enrollDate = minDate(eligDate > earliest ? eligDate : earliest, today);

  return {
    dfn: Number(dfn),
    name: patient.fullName,
    dob: iso(dob),
    periodOfService: { ien: period.ien, name: period.name },
    branch: { ien: branch.ien, name: branch.name },
    entryDate: iso(entry),
    separationDate: iso(separation),
    dischargeType: rules.dischargeType,
    serviceConnected: sc,
    combinedPercent: combined.rounded,
    combinedExact: combined.exact,
    ratedDisabilities: rated,
    primaryEligibility: { ien: elig.ien, name: elig.name },
    eligibilityStatus: { ...rules.eligibilityStatus, date: iso(eligDate) },
    priorityGroup: elig.priorityGroup,
    enrollmentStatus: rules.enrollmentStatus,
    enrollmentDate: iso(enrollDate),
    mst: { ...rules.mst, date: iso(enrollDate) },
    combat: combat ? { location: rules.combatLocations[combatEra] || null, from: iso(combatFrom), to: iso(combatTo) } : null,
    exposures: {
      vietnam: vietnam ? { from: iso(entry > vietnamFrom ? entry : vietnamFrom), to: iso(minDate(separation, vietnamTo)) } : null,
      agentOrange: vietnam,
      agentOrangeLocation: vietnam ? rules.agentOrangeLocation : null,
      radiation: false,
      persianGulf: persianGulf ? { from: iso(swFrom), to: iso(separation) } : null,
      southwestAsiaConditions: false,
    },
    pow: false,
  };
}

// File #2 field values (internal form) for the set RPC, from a profile.
function profileFields(p) {
  const yn = (b) => (b ? 'Y' : 'N');
  const f = {
    1901: 'Y',
    '.301': yn(p.serviceConnected),
    '.302': p.serviceConnected ? String(p.combinedPercent) : '',
    '.323': String(p.periodOfService.ien),
    '.325': String(p.branch.ien),
    '.326': fmDate(parseIso(p.entryDate)),
    '.327': fmDate(parseIso(p.separationDate)),
    '.361': String(p.primaryEligibility.ien),
    '.3611': p.eligibilityStatus.code,
    '.3612': fmDate(parseIso(p.eligibilityStatus.date)),
    '.32101': yn(p.exposures.vietnam),
    '.32104': p.exposures.vietnam ? fmDate(parseIso(p.exposures.vietnam.from)) : '',
    '.32105': p.exposures.vietnam ? fmDate(parseIso(p.exposures.vietnam.to)) : '',
    '.32102': yn(p.exposures.agentOrange),
    '.3213': p.exposures.agentOrangeLocation ? p.exposures.agentOrangeLocation.code : '',
    '.32103': yn(p.exposures.radiation),
    '.32201': yn(p.exposures.persianGulf),
    '.32117': p.exposures.persianGulf ? '1' : '0',
    '.32118': fmDate(parseIso(p.eligibilityStatus.date)),
    '.322011': p.exposures.persianGulf ? fmDate(parseIso(p.exposures.persianGulf.from)) : '',
    '.322012': p.exposures.persianGulf ? fmDate(parseIso(p.exposures.persianGulf.to)) : '',
    '.322013': yn(p.exposures.southwestAsiaConditions),
    '.525': yn(p.pow),
    '.5291': yn(p.combat),
    '.5293': p.combat ? fmDate(parseIso(p.combat.from)) : '',
    '.5294': p.combat ? fmDate(parseIso(p.combat.to)) : '',
  };
  if (p.dischargeType?.ien) f['.324'] = String(p.dischargeType.ien);
  if (p.combat?.location?.ien) f['.5292'] = String(p.combat.location.ien);
  return f;
}

module.exports = { deriveProfile, profileFields, combineRatings, rng, seedFor, fmDate };
