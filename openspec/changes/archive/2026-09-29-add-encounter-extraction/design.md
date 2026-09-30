# Design

## Context

- `test-ai.js` already has working pieces: VPR indexing by domain/uid, VPR date helpers (dates are 8/12/14-digit numbers, so compare the first 8 digits), `labFlag`, `shapeLab`, a one-date `buildContext`, and an identifier-leak guard. See proposal.md for motivation.
- Data facts from `100965.json`:
  - 65 orders across 38 dates.
  - Order `start` and `visit.dateTime` share the same HHmm (for example 2025-10-21 13:17).
  - 49 of 56 problems have a `resolved` value, but it equals the onset timestamp. It's a loader artifact, not a real resolution date, which is why the spec forbids relying on it.
  - PSO orders' `results[].uid` point to `med` records. LR orders point to `lab` records.
  - Order `locationName` is always GENERAL MEDICINE here.

## Goals / Non-Goals

**Goals:**
- A pure, synchronous module (`src/encounters.js`) with no I/O beyond what's passed in, so the next changes can `require` it.
- Output that's easy to review by eye, and stable across runs (deterministic ordering).

**Non-Goals:**
- Rewriting `test-ai.js` to use the module. That's deferred to the ai-note-generation change, so the archived smoke test stays reproducible.
- Performance work. The files are about 700 KB, so everything runs in memory.

## Decisions

1. **Module layout.**
   - `src/encounters.js` exports `indexVpr(items)`, `extractEncounters(index, { rules })`, and `findIdentifierLeaks(text, index)`, plus small date helpers.
   - `extract-encounters.js` (repo root) handles args, file discovery, writing, and `--summary`.
   - *Alternative:* one big script like `test-ai.js`. Rejected because the appointment and note changes need the same logic.

2. **Rules file, `src/problem-rules.json`.** It maps each category to case-insensitive substrings:

   ```json
   {
     "categories": {
       "social": ["employment", "labor force", "education", "housing", "criminal", "isolation", "social contact", "abuse", "violence", "unemployment", "risk activity"],
       "administrative": ["medication review due", "encountering health services"],
       "acute": ["acute", "sprain", "fracture", "pharyngitis", "sinusitis", "cystitis", "otitis", "bronchitis", "laceration", "contusion", "concussion", "pregnancy", "gingivitis", "tooth eruption"]
     },
     "acuteWindowDays": 365
   }
   ```

   Categories are checked in the order social → administrative → acute. First match wins; anything unmatched is `clinical`. *Alternative:* map SNOMED codes parsed from `(SCT nnn)`. Rejected for now because not every problem has one (some are ICD-9/10), and text patterns are easier for a non-developer to edit. Codes can be added later as a second key.

3. **Linking labs and meds to orders.** `order.results[].uid` is looked up in the uid index, and the domain of the result decides where it goes: `lab` → `labsToday`, `med` → `newMeds`. An LR order with no resolvable results falls back to labs whose `observed` day equals the encounter day, deduplicated by uid.

4. **Active meds.** A med is active if `overallStart` ≤ date ≤ (`overallStop` ?? `stopped` ?? ∞). Meds already listed in `newMeds` are excluded from `activeMeds`.

4a. **Visit-linked details.** Build an `encounterUid → items[]` index once. For each encounter, take the uids of the same-day visits, then collect their linked `pov`, `cpt`, `immunization`, and `factor` items. Care-plan text is cleaned with `/^SYN ACT\s+/` and `/\s*\(SCT:[^)]*\)$/`. `SYN CP`, `SYN ADDR`, and `SYN GOAL` factors are left out because they're placeholders with no content. The visit's `reasonName` appears to duplicate the primary `pov` (13 visits have one, and 13 visits have pov records), so it's only added when no `pov` has the same ICD code. `treatment` is skipped: all 65 duplicate an order (`orderUid` set).

5. **Output shape (per encounter).**

   ```
   { seq, kind: "historical", date: "YYYY-MM-DD", time: "HH:mm", fmDateTime: "YYYMMDD.HHMM", clinic, suggestedVisitType,
     patient: { age, gender },
     ordersToday: [...], labsToday: [...], newMeds: [...], activeMeds: [...],
     latestVitals: [...], recentLabHistory: [...],
     problems: [{ text, onset, category }], socialHistory: [{ text, onset }],
     visitDiagnoses: [{ name, icd, primary }], procedures: [...], immunizations: [...], carePlanActivities: [...],
     existing: { visits: [{ uid, dateTime, location }], appointments: [{ uid, dateTime, location, status }] },
     hasAppointment }
   ```

   `fmDateTime` is included now (year − 1700 format) because the appointment and TIU changes both need it and it's easy to get wrong. Lab/med/vital fields follow the minimized shapes from `test-ai.js`.

6. **Identifier guard.** The guard is reused from `test-ai.js` and moves into the module. It scans the serialized output for `ssn`, `icn`, `fullName`, `familyName`, `briefId`, address lines/zip, and telecom values. If anything matches, the run exits 1 and nothing is written.

7. **Determinism.** Encounters are sorted by date. Within an encounter, orders keep their source order, labs are sorted by `displayOrder` then name, and problems by onset descending. The only varying field is `extractedAt`.

## Risks / Trade-offs

- [Keyword rules miscategorize a problem (for example "Stress" as clinical, or "abuse" matching "substance abuse")] → The rules file is editable, and `--summary` plus the JSON make mistakes visible. "Substance abuse" being filed as social is acceptable for synthetic notes.
- [Other patients use different clinics or orders with no location] → Fall back to the visit location on that date, then `UNKNOWN CLINIC`. The `--summary` output shows the clinic so this can be reviewed.
- [An order date is followed by a later visit on a different day (for example a lab drawn after the visit)] → Out of scope. The encounter is defined by the order date, per PROJECT-PLAN.
- [Pregnancy classed as `acute` hides a long pregnancy course after 365 days] → Acceptable, since pregnancies are shorter than the window.
