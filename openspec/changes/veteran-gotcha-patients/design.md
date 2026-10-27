# Design

Patient names, ages, DFNs, planted events and answer keys are test data and are not in this
change. They live in the git-ignored `plans/` folder (`plans/veteran-gotcha-patients-design.md`
and `plans/veteran-gotcha-patients-tasks-with-names.md`). Never commit them.

## Open work reviewed (2026-10-22)

Must finish before the first load:

| Change | Task | Why it blocks |
|---|---|---|
| encounter-location-mapping | 4.6.3, 4.6.4 | A new load can still book midnight (`.24`) appointments; the loader time patch (`patches/synfenc-time.txt`) is "not yet on dev" |
| encounter-location-mapping | 4.3 | Duplicate appointment check used the date only |
| encounter-location-mapping | 4.2 | Visits without orders (dental, ED) need a note and appointment |
| medication-management | "Review the preflight output for every new Synthea upload" | Meds without full structured dosing need a `MEDDEF` row |
| lighthouse-verification | 4.5b | The scoring rules are the template for the new keys |

Not blocking: encounter-location-mapping 4.1, 4.4, 4.5, 4.6.5; veteran-test-population 1.3,
1.5, 2.2, 2.6, 4.1 to 4.3; the rest of lighthouse-verification; summarization-test-patient;
the medication-management renew, finish and merge items.

## Process to copy from the sacred fourteen

1. `history-plan.js --dfn` builds `plans/dfn<dfn>-visits.json`: about 3 years of history, PCP
   visits about every 6 months, and the last PCP visit 3 to 12 months before the summary date
   (a different gap per patient).
2. `history-labs-plan.js` and `import-labs-vitals.js --apply` load labs, panels and vitals
   (ISI IMPORT LAB, LAB PANEL, VITALS). Temperature must be a plain number.
3. `fetch-vpr.js <dfn>`, then `custom-visits.js --book` and `--generate`, `approve-note.js`,
   `sign-notes.js --all --sign` (check `output/ready` holds only that patient),
   `link-note-visits.js --check`.
4. Meds: `add-rx.js`, `fill-plan.js` (dry run unless `--commit`).
5. Planted events sit after the last PCP visit so a summary for a new PCP visit has to find them.
6. `plans/dfn<dfn>-answerkey.json` is written by hand; `build-answer-key-files.js --dfn <dfn>`
   writes the manifest. `plans/` and `docs/sacredFourteen/` are git-ignored.
7. Each AI run (summary and MCP chatbot) is scored per key item and stored under the key's `runs`.

Key structure: `summaryAsOf`, `summaryFor`, `keyItems[]` (id, severity, date, source, finding,
mustMention, scoringRule on judgment items), `distractors[]`, `shouldNotSay[]`, `scoring`, `runs[]`.
Item families: A critical event (ED), B critical specialty result, C outpatient labs with no
visit, D open loop, E trend, F medication adherence or new medicine.

## Patients

Four standalone Synthea runs, one veteran issue each: lower-limb amputation, burn, traumatic
brain injury, and PTSD in a woman. Not part of the sacred fourteen. Each gets planted events in
families A to F, one resolved-but-alarming distractor, and one plausible-but-false
`shouldNotSay`. Sensitive scenarios (suicidal thoughts, intimate partner abuse, seizure) are
approved as synthetic test data. Check each plan against the bundle first: a planted event
must not contradict what the bundle already holds (for example a diagnosis or drug it has).

## Name rule: middle initial A

- New answer-key patients only, never the sacred fourteen.
- The loader uses only the first given name (`patname^SYNFPAT` takes `given,1`). Try the
  initial in the first given name before the load (`FIRST A`); if the loader or ISI rejects
  it, rename after the load and before any note is written (notes carry the name).
- Check CPRS search by last name and the MCP chatbot output.

## Import process per patient

1. Trim: `trim-synthea.js`.
2. Preflight: `preflight-synthea.js`, `preflight-vista.js`, `apply-loader-maps.js`; fix gaps
   that matter; add `MEDDEF` rows for meds without full structured dosing.
3. Add the middle initial A (bundle or after the load).
4. Load: `load-synthea.js`. Record the DFN.
5. Veteran data through the veteran service data tool; `vet-profile.js` check.
6. Encounters and appointments: `extract-encounters.js`, `create-appointments.js`, then
   `check-midnight.js <dfn>`.
7. History and planted events: `history-plan.js --dfn <dfn> --sentinels`,
   `history-labs-plan.js`, `import-labs-vitals.js --apply`.
8. Meds: `add-rx.js`, `fill-plan.js` with the planned refill gaps.
9. Notes: `fetch-vpr.js`, `custom-visits.js --book` and `--generate`, review, `approve-note.js`,
   `sign-notes.js --all --sign`, `link-note-visits.js --check`.
10. Key: write `plans/dfn<dfn>-answerkey.json`, run `build-answer-key-files.js --dfn <dfn>`.
11. Score both AI runs and store them under `runs`.
