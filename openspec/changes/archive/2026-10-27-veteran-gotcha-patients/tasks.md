# Tasks

Patient names, DFNs and planted events are test data: keep them in `plans/` (git-ignored), never in
this file. Patients are called P1 amputation, P2 burn, P3 traumatic brain injury and P4 PTSD (woman);
the name mapping is in `plans/veteran-gotcha-patients-tasks-with-names.md`.

## FIRST THING TOMORROW MORNING (2026-10-23): dev VistA work

Nothing else in this change can move until these are done on the dev VistA server.

- [x] 0.1 Put the `synfenc-time` loader patch on dev (task 2.2) and verify that an outpatient visit outside 08:00 to 16:59 moves into clinic hours (2026-10-23: `TIME^CDSPENC` test moved 00:30 to 08:30; `SYNFENC` line 132 calls it between the end-time line 130 and `STARTDT` line 150)
- [x] 0.2 Decide whether to add `MEDDEF` rows for the dosing gaps in task 2.7a (done 2026-10-27: most rows already existed in the fork branch `med-defaults-and-merge`; added a CV200 class row for amlodipine, and `WRITERXPS` now files route and schedule from the sig when no dose can be derived; `BF1` in `CDSPRX` backfills existing Rxs)
- [x] 0.3 Load P1 as the fresh test patient (task 2.3) and run `check-midnight.js <dfn>` and `link-note-visits.js --check` (2026-10-23: P1 loaded, 58 encounters, `check-midnight.js` clean, `link-note-visits.js --check` empty because no notes yet; still to do: fetch-vpr again and re-run the midnight check on fresh data, compare appointments with `src/appointments.json` (0.5.3), check meds with `check-rx-vpr.js`) (done 2026-10-27: all four patients loaded and checked with `check-midnight.js`, `logs/check-path.js` and `link-note-visits.js`; P1 was the first)
- [x] 0.4 Check `node preflight-vista.js` still answers (PIV prompt appears in the terminal; enter the PIN there) (done: `preflight-vista.js` answered on every run during the four loads)
- [x] 0.5 (no longer needed, closed 2026-10-27 by the owner; the four loads showed no loader-created appointments to remove, and `create-appointments.js` books every visit) Verify the decision "never import appointments from the Synthea files; create them ourselves with SDEC (`create-appointments.js`)" holds in the pipeline and every import script. The decision is in `docs/DECISION-LOAD-PATH.md` ("Appointments and notes use SDEC and TIU"; `ISI IMPORT APPT` is not used). The concern is that the last import did not skip them. Steps:
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
- [x] 2.2 Put the `synfenc-time` loader patch on dev and verify it (see 0.1; the call line is not yet in the fork's `SYNFENC.m`, so reapply it after a SYN KIDS reinstall)
- [x] 2.3 encounter-location-mapping 4.6.4: test on a fresh patient (cover sheet dates, notes link to visits); use P1 and run `check-midnight.js` after the load (see 0.3) (done: P1 and the later patients show visits and notes linked, 0 unlinked)
- [x] 2.4 `create-appointments.js` keys the duplicate check on date and clinic; older log entries without a clinic IEN do not match, so the extract's `hasAppointment` flag still guards re-runs
- [x] 2.5 Every visit day is extracted: a checked patient has an encounter for each of its 177 visit dates, including dental days with no orders. Visits on one date still merge into one encounter
- [x] 2.6 Scoring rules added to the first answer key (`scoring`, and a `scoringRule` on D1, E1, F1) and printed by `build-answer-key-files.js`; manifest regenerated 2026-10-22
- [x] 2.7 Med preflight for the 4 bundles (output in `logs/vista-preflight-<name>.txt`): nothing blocks the load. Meds: 0 failures for three bundles and 2 single-resource failures (an injectable with no VUID, an invalid RxNorm code) for P2. Labs, vitals and procedures fail only on codes already accepted (PDW, pediatric vitals, temperature 8310-5, screening, dental) plus urine odor and clarity (cosmetic). Conditions use the SNOMED fallback
- [x] 2.7a Structured dosing gaps (done 2026-10-27: route and schedule are now filled for all four patients after `backfill-rx-dosing.js`; dose stays blank for drugs with no strength in the drug file (acetaminophen and combination tablets, insulin, inhalers, fluoride gel, contraceptives, implant), accepted; fluoride gel has no route because the sig says to the teeth)

## 3. Prepare the 4 bundles

- [x] 3.1 Trim the 4 `test-*` bundles (`trim-synthea.js`) and confirm gender, age and veteran conditions (2026-10-23: all 4 trimmed into `synthea/output/trimmed`; gender, age and veteran conditions confirmed from the derived veteran profiles)
- [x] 3.2 Preflight, fix mapping gaps that matter
- [x] 3.3 Test the middle initial A in the first given name on one bundle (2026-10-23, P1: the loader drops it, stored name has no A). Decision: no rename tool; the owner adds the initial by hand in VistA, before any note is written (notes carry the name). `add-middle-initial.js` stays for the bundles but has no effect after the load. 2026-10-27: `set-name.js` (RPC `CDSP UTIL VET SET NAME` in `CDSPVET`) now sets the name with the digits and the initial after the load; FileMan name entry strips the digits

## 4. Plan the gotchas

- [x] 4.1 Write the visit, lab, vital and medication plan with planted events for each patient (in `plans/`); check each event against what the bundle already holds
- [x] 4.2 Write a draft `plans/dfn<dfn>-answerkey.json` for each patient before loading, so the plan and key match
- [x] 4.3 Check each key item can be seen in VPR data (no item that depends on data VistA cannot hold) (done: every key item was scored from the VPR output of the summary app and the chatbot)

## 5. Import patient by patient

Pipeline per patient (design.md, "Import process per patient"). Status as of 2026-10-23; update the row when a step finishes.

| Step | P1 | P2 | P3 | P4 |
|---|---|---|---|---|
| a. Trim | done | done | done | done |
| b. Preflight (VistA) | done | done | done | done |
| c. Load (`load-synthea.js`) | done 2026-10-23, 58 encounters | done 2026-10-27, 92 encounters | done 2026-10-27, 54 of 58 encounters (4 encounter errors) | done 2026-10-27, 82 encounters |
| d. Rename with middle initial A | done by hand in FileMan (digits lost) | done 2026-10-27 with `set-name.js` (digits kept) | done 2026-10-27 with `set-name.js` | done 2026-10-27 with `set-name.js` |
| e. Veteran data + valid address (`vet-profile.js --from-file --apply`) | done 2026-10-23 | done 2026-10-27 as derived | done 2026-10-27 as derived | done 2026-10-27 as derived; `vet-get.js` shows enrollment priority 6 unverified although the apply said 5 (not investigated) |
| f. Appointments (`create-appointments.js`) + `check-midnight.js` | done 2026-10-23, midnight check clean | done 2026-10-27, midnight check clean (needs `fetch-vpr.js` first) | done 2026-10-27, one 04:54 visit left (appointment at 04:30) | done 2026-10-27, midnight check clean |
| g. Plan, history, planted events (`plans/dfn<dfn>-visits.json`) | done 2026-10-23, booked and noted | done 2026-10-27, booked and noted | done 2026-10-27, booked and noted | done 2026-10-27, booked and noted |
| h. Labs and vitals import (`history-labs-plan.js`, `import-labs-vitals.js`) | done 2026-10-23 | done 2026-10-27, all calls succeeded | done 2026-10-27, all calls succeeded | done 2026-10-27, all calls succeeded |
| i. Meds (`add-rx.js`, `fill-plan.js`) | done 2026-10-23, separate narcotic Rxs (see 9.1) | done 2026-10-27 | done 2026-10-27 (one drug entry was created by the add) | done 2026-10-27 |
| j. Notes (generate, approve, sign, link) | done 2026-10-23, 0 unlinked | done 2026-10-27, 0 unlinked | done 2026-10-27, 0 unlinked | done 2026-10-27, 0 unlinked |
| k. Answer key + manifest | done 2026-10-23 | done 2026-10-27 | done 2026-10-27 | done 2026-10-27 |
| l. AI summary and chatbot scored | done 2026-10-26: chatbot 0 found, 4 partial, 4 missed; app 3 found, 5 partial, 0 missed; both fail the critical rule | done 2026-10-27: chatbot 1/3/2 of 6 (fail); app 4/2/0 of 6 (fail on a critical item) | done 2026-10-27: chatbot 4/2/1 of 7 and app 4/3/0 of 7 (both pass; the chatbot has one borderline must-not-say heading) | done 2026-10-27: chatbot 3/3/0 of 6 and app 4/2/0 of 6 (both fail on a critical item) |

All four patients are through step l. Notes are generated wordy with `$env:NOTE_WORDY=1`; rewrite every planted note by hand before signing, because the generator invents facts (history that is not in the record) and leaves out the score values the key needs. Scored runs, answer keys and the per-patient manifests are git-ignored (`plans/`, `docs/TestPatientsWithAnswers/`).

- [x] 5.1 P1 amputation: done (the narcotic Rx verification is task 9.1)
- [x] 5.2 P2 burn: done
- [x] 5.3 P3 traumatic brain injury: done (neurology clinic needed a resource; a clinic that has one was used, and the clinic was renamed in VistA to fix a typo)
- [x] 5.4 P4 PTSD (woman): done (the bundle already held a delivery, so the planted events were moved to the postpartum period)
- [x] 5.5 Run `link-note-visits.js --check`, `logs/check-path.js` and `check-midnight.js` on all 4 (done 2026-10-27 for all four; one early-morning visit on an inpatient day was left as is because its appointment is at 04:30, not at the midnight .24 time)
- [x] 5.6 Add the 4 patients to `docs/loaded-patients.md` (`summarize-patients.js`) (done 2026-10-27: `summarize-patients.js` regenerated `docs/loaded-patients.md`)

## 6. Keys and scoring

- [x] 6.1 Finalize the 4 answer keys against what actually loaded; run `build-answer-key-files.js --dfn <dfn>` for each
- [x] 6.2 Run the AI summary and the MCP chatbot on each patient and score every key item, shouldNotSay and noise
- [x] 6.3 Record the runs in each key and list the misses by item family (runs are in each key; misses by item family are summed in the git-ignored `docs/TestPatientsWithAnswers/README.md`)

## 7. Document for future middle-initial-A patients (last task)

- [x] 7.1 Create `docs/ANSWER-KEY-PATIENTS.md` (tracked, no patient data): the name rule, the import steps, the key structure, item families A to F, scoring rules, and where the git-ignored files live (done 2026-10-27)
- [x] 7.2 Edit `README.md` (link under Gotchas) and `PROJECT-PLAN.md` so the answer-key process points to the new document (done 2026-10-27)
- [x] 7.3 Record the rename method that worked (done 2026-10-27: the name rule section of `docs/ANSWER-KEY-PATIENTS.md`; `set-name.js` and the RPC `CDSP UTIL VET SET NAME`)

## 8. Separate the answer-key patients from the sacred fourteen (added 2026-10-26)

We no longer work with the sacred fourteen for answers. Answer-key patients get their own folder.

- [x] 8.1 Create `docs/TestPatientsWithAnswers/` (git-ignored) with `README.md`: a list of the test patients that have answer keys, key file, runs and latest results
- [x] 8.2 Change `build-answer-key-files.js` to write the answer-key output (keys, scoring rules, side-by-side runs table) to `docs/TestPatientsWithAnswers/` instead of `docs/sacredFourteen/` (done 2026-10-27: output is one pair per patient named `<label>-<first>-<last>.json` and `.md` (for example `p1-first-last`), `SUMMARY-SCORING-GUIDE.md` moved there too with a recommended scoring prompt; `docs/sacredFourteen/` is now empty)
- [x] 8.2b Fix the manifest header for P1 ("ICN undefined": the ICN is in `logs/load-*.result.json`) (done 2026-10-27: `build-answer-key-files.js` falls back to the load result file)
- [x] 8.3 Decide whether the Lighthouse patient with a key stays in the answer-key list (decided 2026-10-27: it stays and is labelled lighthouse, meaning it can be used for applications with Lighthouse FHIR dependencies)
- [x] 8.4 Update `docs/SUMMARY-SCORING-GUIDE.md` ("Where things live") and `README.md` to point to the new folder (done 2026-10-27: the scoring guide and the folder README were updated; the root README has no reference to the old folder)

## 9. P1 loose ends (added 2026-10-26)

- [x] 9.1 Oxycodone Rxs that cannot be verified (closed 2026-10-27 by the owner as a known issue; the findings are summarized under Known issues in `docs/ANSWER-KEY-PATIENTS.md`)
- [x] 9.2 Wrong title on the signed ortho note of P1 (closed 2026-10-27 by the owner as not worth the time; noted in `docs/ANSWER-KEY-PATIENTS.md` and `PROJECT-PLAN.md`; the `DEV/ORTHO` and `DEV/NEUROLOGY` title mappings stay in `src/note-titles.json`)
- [x] 9.3 Wordy-mode notes seeded an alcohol-trend sentence (closed 2026-10-27 by the owner as accepted noise; noted in `docs/ANSWER-KEY-PATIENTS.md` and `PROJECT-PLAN.md`)
- [x] 9.4 Variable dump in `PSO LM BACKDOOR ORDERS` and the Health Summary (closed 2026-10-27 by the owner as a known issue; the search state is under Known issues in `docs/ANSWER-KEY-PATIENTS.md`)

## 10. Status at the end of 2026-10-27

All four patients (P1 to P4) are loaded, rewritten notes signed and linked, keyed and scored with both tools. New this day: `set-name.js` and the RPC `CDSP UTIL VET SET NAME` (routine `CDSPVET` in cds-vista-routines) set a name with its digits; the answer-key output is one `<label>-<first>-<last>` pair per patient in the git-ignored `docs/TestPatientsWithAnswers/`; the old sacred label is now `lighthouse`.

Open: 0.2 and 2.7a (dosing rows for `SYNFMED` on dev), 7.1 to 7.3 (the tracked how-to document), 9.1 to 9.4 (P1 loose ends and the variable dump). Owner decisions waiting: whether the borderline headings in the scored runs count as must-not-say hits.
