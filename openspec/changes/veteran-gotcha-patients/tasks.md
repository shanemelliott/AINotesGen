# Tasks

Patient names, DFNs and planted events are test data: keep them in `plans/` (git-ignored), never in
this file. Patients are called P1 amputation, P2 burn, P3 traumatic brain injury and P4 PTSD (woman);
the name mapping is in `plans/veteran-gotcha-patients-tasks-with-names.md`.

## FIRST THING TOMORROW MORNING (2026-10-23): dev VistA work

Nothing else in this change can move until these are done on the dev VistA server.

- [ ] 0.1 Put the `synfenc-time` loader patch on dev (task 2.2) and verify that an outpatient visit outside 08:00 to 16:59 moves into clinic hours
- [ ] 0.2 Decide and, if yes, add `MEDDEF` rows in `SYNFMED.m` on dev for the dosing gaps in task 2.7a (the user edits the dev copy; draft the rows in the fork branch `med-defaults-and-merge`)
- [ ] 0.3 Load P1 as the fresh test patient (task 2.3) and run `check-midnight.js <dfn>` and `link-note-visits.js --check`
- [ ] 0.4 Check `node preflight-vista.js` still answers (PIV prompt appears in the terminal; enter the PIN there)
- [ ] 0.5 Verify the decision "never import appointments from the Synthea files; create them ourselves with SDEC (`create-appointments.js`)" holds in the pipeline and every import script. The decision is in `docs/DECISION-LOAD-PATH.md` ("Appointments and notes use SDEC and TIU"; `ISI IMPORT APPT` is not used). The concern is that the last import did not skip them. Steps:
  - 0.5.1 Read the loader entry points and list every call that can write an appointment or visit: `load-synthea.js` (`DEFAULT_SKIP_TYPES` skips only Claim, ExplanationOfBenefit and DocumentReference, so Encounter resources are still sent), `src/fhirBundleTransport.js`, and any script that calls `ISI IMPORT APPT`
  - 0.5.2 Read the SYN routines in the fork (`SYNFENC` `wsIntakeEncounters`, `SYNDHP*`, `SYNFAPPT` if present, `CDSPENC`) and the dev server copies, and confirm none creates an SDEC or `^SC` appointment (an encounter becomes a visit only). Record the result in `patches/LOADER-CHANGES.md`
  - 0.5.3 Check the most recent Synthea import on dev: for that patient compare the appointments in the VPR with `src/appointments.json` (any appointment we did not create came from the loader) and count visits with no appointment
  - 0.5.4 If the loader created appointments, change the SYN routine (or send no Encounter resources) so a load never imports them, add a guard to `load-synthea.js` and the preflight, and write the rule in `docs/DECISION-LOAD-PATH.md`
  - 0.5.5 Confirm the loader's visits are what we want: it creates a visit per encounter, and `create-appointments.js` then books an appointment for the same day (duplicate visits; see "Duplicate visits" in `docs/DECISION-LOAD-PATH.md`)

## 1. Decisions from the owner (done 2026-10-22)

- [x] 1.1 The 4 patients are confirmed
- [x] 1.2 The middle initial A applies to new patients only, never to the sacred fourteen
- [x] 1.3 The last PCP visit is at least 3 months before the summary date and can vary up to 12 months per patient; use a different gap for each patient
- [x] 1.4 The sensitive scenarios (suicidal thoughts, intimate partner abuse, seizure) are acceptable as synthetic test data
- [x] 1.5 Both the AI summary and the MCP chatbot are scored on every patient

## 2. Clear blockers before the first load

- [x] 2.1 Post-load check `check-midnight.js <dfn>` (reads the fetched VPR, lists visits and appointments at 00:00 to 04:59 outside ED, exit 1 if any); tested 2026-10-22 on three loaded patients. Run it after load and after booking, because the loader converts the times
- [ ] 2.2 Put the `synfenc-time` loader patch on dev and verify it (see 0.1)
- [ ] 2.3 encounter-location-mapping 4.6.4: test on a fresh patient (cover sheet dates, notes link to visits); use P1 and run `check-midnight.js` after the load (see 0.3)
- [x] 2.4 `create-appointments.js` keys the duplicate check on date and clinic; older log entries without a clinic IEN do not match, so the extract's `hasAppointment` flag still guards re-runs
- [x] 2.5 Every visit day is extracted: a checked patient has an encounter for each of its 177 visit dates, including dental days with no orders. Visits on one date still merge into one encounter
- [x] 2.6 Scoring rules added to the first answer key (`scoring`, and a `scoringRule` on D1, E1, F1) and printed by `sacred-manifest.js`; manifest regenerated 2026-10-22
- [x] 2.7 Med preflight for the 4 bundles (output in `logs/vista-preflight-<name>.txt`): nothing blocks the load. Meds: 0 failures for three bundles and 2 single-resource failures (an injectable with no VUID, an invalid RxNorm code) for P2. Labs, vitals and procedures fail only on codes already accepted (PDW, pediatric vitals, temperature 8310-5, screening, dental) plus urine odor and clarity (cosmetic). Conditions use the SNOMED fallback
- [ ] 2.7a Structured dosing gaps (dose, route and schedule blank in the VPR): amlodipine, insulin 70/30, acetaminophen, acetaminophen/codeine, two inhalers, two oral contraceptives, an implant (not-oral-solid) and sodium fluoride gel. Decide whether to add `MEDDEF` rows before the load or accept blanks (blank dosing can hide a med from the summary) (see 0.2)

## 3. Prepare the 4 bundles

- [ ] 3.1 Trim the 4 `test-*` bundles (`trim-synthea.js`) and confirm gender, age and veteran conditions
- [ ] 3.2 Preflight, fix mapping gaps that matter
- [ ] 3.3 Test the middle initial A in the first given name on one bundle (does SYN and CPRS keep `LAST,FIRST A`); if not, write the post-load rename tool (dry run unless `--apply`)

## 4. Plan the gotchas

- [ ] 4.1 Write the visit, lab, vital and medication plan with planted events for each patient (in `plans/`); check each event against what the bundle already holds
- [ ] 4.2 Write a draft `plans/dfn<dfn>-answerkey.json` for each patient before loading, so the plan and key match
- [ ] 4.3 Check each key item can be seen in VPR data (no item that depends on data VistA cannot hold)

## 5. Import patient by patient

- [ ] 5.1 P1 amputation: load, rename, veteran data, encounters, planted history, meds, notes, links
- [ ] 5.2 P2 burn: same
- [ ] 5.3 P3 traumatic brain injury: same
- [ ] 5.4 P4 PTSD (woman): same
- [ ] 5.5 Run `link-note-visits.js --check`, `logs/check-path.js` and `check-midnight.js` on all 4
- [ ] 5.6 Add the 4 patients to `docs/loaded-patients.md` (`summarize-patients.js`)

## 6. Keys and scoring

- [ ] 6.1 Finalize the 4 answer keys against what actually loaded; run `sacred-manifest.js --dfn <dfn>` for each
- [ ] 6.2 Run the AI summary and the MCP chatbot on each patient and score every key item, shouldNotSay and noise
- [ ] 6.3 Record the runs in each key and list the misses by item family

## 7. Document for future middle-initial-A patients (last task)

- [ ] 7.1 Create `docs/ANSWER-KEY-PATIENTS.md` (tracked, no patient data): the name rule, the import steps, the key structure, item families A to F, scoring rules, and where the git-ignored files live
- [ ] 7.2 Edit `README.md` (link under Gotchas) and `PROJECT-PLAN.md` so the sacred fourteen process points to the new document
- [ ] 7.3 Record the rename method that worked
