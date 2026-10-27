# Tasks

Patient names, DFNs and planted events are test data: keep them in `plans/` (git-ignored), never in
this file. Patients are called P1 amputation, P2 burn, P3 traumatic brain injury and P4 PTSD (woman);
the name mapping is in `plans/veteran-gotcha-patients-tasks-with-names.md`.

## FIRST THING TOMORROW MORNING (2026-10-23): dev VistA work

Nothing else in this change can move until these are done on the dev VistA server.

- [x] 0.1 Put the `synfenc-time` loader patch on dev (task 2.2) and verify that an outpatient visit outside 08:00 to 16:59 moves into clinic hours (2026-10-23: `TIME^CDSPENC` test moved 00:30 to 08:30; `SYNFENC` line 132 calls it between the end-time line 130 and `STARTDT` line 150)
- [ ] 0.2 Decide and, if yes, add `MEDDEF` rows in `SYNFMED.m` on dev for the dosing gaps in task 2.7a (the user edits the dev copy; draft the rows in the fork branch `med-defaults-and-merge`)
- [x] 0.3 Load P1 as the fresh test patient (task 2.3) and run `check-midnight.js <dfn>` and `link-note-visits.js --check` (2026-10-23: P1 loaded, 58 encounters, `check-midnight.js` clean, `link-note-visits.js --check` empty because no notes yet; still to do: fetch-vpr again and re-run the midnight check on fresh data, compare appointments with `src/appointments.json` (0.5.3), check meds with `check-rx-vpr.js`) (done 2026-10-27: all four patients loaded and checked with `check-midnight.js`, `logs/check-path.js` and `link-note-visits.js`; P1 was the first)
- [x] 0.4 Check `node preflight-vista.js` still answers (PIV prompt appears in the terminal; enter the PIN there) (done: `preflight-vista.js` answered on every run during the four loads)
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
- [x] 2.2 Put the `synfenc-time` loader patch on dev and verify it (see 0.1; the call line is not yet in the fork's `SYNFENC.m`, so reapply it after a SYN KIDS reinstall)
- [x] 2.3 encounter-location-mapping 4.6.4: test on a fresh patient (cover sheet dates, notes link to visits); use P1 and run `check-midnight.js` after the load (see 0.3) (done: P1 and the later patients show visits and notes linked, 0 unlinked)
- [x] 2.4 `create-appointments.js` keys the duplicate check on date and clinic; older log entries without a clinic IEN do not match, so the extract's `hasAppointment` flag still guards re-runs
- [x] 2.5 Every visit day is extracted: a checked patient has an encounter for each of its 177 visit dates, including dental days with no orders. Visits on one date still merge into one encounter
- [x] 2.6 Scoring rules added to the first answer key (`scoring`, and a `scoringRule` on D1, E1, F1) and printed by `sacred-manifest.js`; manifest regenerated 2026-10-22
- [x] 2.7 Med preflight for the 4 bundles (output in `logs/vista-preflight-<name>.txt`): nothing blocks the load. Meds: 0 failures for three bundles and 2 single-resource failures (an injectable with no VUID, an invalid RxNorm code) for P2. Labs, vitals and procedures fail only on codes already accepted (PDW, pediatric vitals, temperature 8310-5, screening, dental) plus urine odor and clarity (cosmetic). Conditions use the SNOMED fallback
- [ ] 2.7a Structured dosing gaps (dose, route and schedule blank in the VPR): amlodipine, insulin 70/30, acetaminophen, acetaminophen/codeine, two inhalers, two oral contraceptives, an implant (not-oral-solid) and sodium fluoride gel. Decide whether to add `MEDDEF` rows before the load or accept blanks (blank dosing can hide a med from the summary) (see 0.2)

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

- [x] 6.1 Finalize the 4 answer keys against what actually loaded; run `sacred-manifest.js --dfn <dfn>` for each
- [x] 6.2 Run the AI summary and the MCP chatbot on each patient and score every key item, shouldNotSay and noise
- [x] 6.3 Record the runs in each key and list the misses by item family (runs are in each key; misses by item family are summed in the git-ignored `docs/TestPatientsWithAnswers/README.md`)

## 7. Document for future middle-initial-A patients (last task)

- [ ] 7.1 Create `docs/ANSWER-KEY-PATIENTS.md` (tracked, no patient data): the name rule, the import steps, the key structure, item families A to F, scoring rules, and where the git-ignored files live
- [ ] 7.2 Edit `README.md` (link under Gotchas) and `PROJECT-PLAN.md` so the sacred fourteen process points to the new document
- [ ] 7.3 Record the rename method that worked

## 8. Separate the answer-key patients from the sacred fourteen (added 2026-10-26)

We no longer work with the sacred fourteen for answers. Answer-key patients get their own folder.

- [x] 8.1 Create `docs/TestPatientsWithAnswers/` (git-ignored) with `README.md`: a list of the test patients that have answer keys, key file, runs and latest results
- [x] 8.2 Change `sacred-manifest.js` to write the answer-key output (keys, scoring rules, side-by-side runs table) to `docs/TestPatientsWithAnswers/` instead of `docs/sacredFourteen/` (done 2026-10-27: output is one pair per patient named `<label>-<first>-<last>.json` and `.md` (for example `p1-first-last`), `SUMMARY-SCORING-GUIDE.md` moved there too with a recommended scoring prompt; `docs/sacredFourteen/` is now empty)
- [x] 8.2b Fix the manifest header for P1 ("ICN undefined": the ICN is in `logs/load-*.result.json`) (done 2026-10-27: `sacred-manifest.js` falls back to the load result file)
- [x] 8.3 Decide whether the Lighthouse patient with a key stays in the answer-key list (decided 2026-10-27: it stays and is labelled lighthouse, meaning it can be used for applications with Lighthouse FHIR dependencies)
- [x] 8.4 Update `docs/SUMMARY-SCORING-GUIDE.md` ("Where things live") and `README.md` to point to the new folder (done 2026-10-27: the scoring guide and the folder README were updated; the root README has no reference to the old folder)

## 9. P1 loose ends (added 2026-10-26)

- [ ] 9.1 Oxycodone Rx 407586, 407587 and 407588 (P1) cannot be verified in the pharmacy backdoor menu. Research: `ADDRX` sets `PSONEW("VERIFY")=1` and a pharmacist, but `PSON52` also sets the status to 1 (non-verified) when the user lacks the `PSORPH` key and the dosing check flag `^TMP("PSODOSF",$J,0)` is set (PSON-all.ro near the end of `PSON52`). Gabapentin (same call) went active, so the difference is drug-specific. `PSOVER1` verifies from the non-verified file `^PS(52.4)`: check on dev `W $D(^PS(52.4,407586,0))`, `W ^PSRX(407586,"STA")`, and the same for the gabapentin Rx 407585. Owner theory: an Rx with a fill cannot be verified; the verify code handles refills (`"RF"` versus `"OF"`), so it is not the cause by reading alone. Then fix `ADDRX` (user with `PSORPH`, or write `STA` 0 and remove the `^PS(52.4)` entry) and decide how to repair these three. Pharmacist friend (2026-10-26): narcotics get no refills (the three Rxs are correct as separate orders) and verifying needs the `PSORPH` key (not `PSDRPH`, which is the drug accountability key); PSO-all.ro line 12082 sets `PSORX("VERIFY")=1` (status 1) when the site parameter requires verification and the user lacks `PSORPH`. Owner to grant `PSORPH` and retry through `PSO LM BACKDOOR ORDERS`. Result 2026-10-26: owner already had `PSORPH`; `^PS(52.4,407586,0)` exists and STA was 1; the Verify action is under `??` on the List Manager screen (the visible action line is truncated); verify hung on "Report order checks" (the `CDS SERVER` web server named in the medication-management notes is not in the WEB SERVER file #18.12 on dev, so there is nothing to disable there; the `CDS WEB SERVICE` entry is in the WEB SERVICE file #18.02); Rx 407586 now has STA 0 (verified). Still to check: STA of 407587 and 407588 (`W ^PSRX(407587,"STA")`), then fix `ADDRX` so new narcotic Rxs do not need this. Result 2026-10-26: 407587 and 407588 are STA 11 (expired), not non-verified, so they need no verification and do not appear in the active list (only 407586 does; it expires 02/18/27); the VPR fills 08-18, 08-28, 09-07 are intact so item F2 stands. Launching `PSO LM BACKDOOR ORDERS` still dumps the local variable table with `%XOBWERR="186005^CDS SERVER"` ("Vendor Database cannot be reached") from the order check step (`OCXSEG="ZCL"`) at the Extended Patient Demographics page; it does not stop the screen. Open: why 407587/407588 became 11 while 407586 stayed 1
- [ ] 9.2 The signed ortho note of P1 has the wrong title (default title 16, "PRIMARY CARE ATTENDING INITIAL EVALUATION NOTE"). A signed note cannot be retitled: the owner hides it in the HIMS menus and marks it entered in error (no steps are written down in this repo; lighthouse-verification 4.2b lists it as open research). Done 2026-10-27: `DEV/ORTHO` and `DEV/NEUROLOGY` rows added to `src/note-titles.json`, both mapped to 1631 GENERIC CONSULT NOTE because VistA has no orthopedic or neurology title. Still to do: mark the signed ortho note entered in error and re-enter it with `custom-visits.js --generate` and `sign-notes.js`
- [ ] 9.3 Wordy-mode notes seeded an alcohol-trend sentence (2026-05-25 note: "alcohol use may be increasing as a maladaptive coping strategy") that led the AI summary headline; decide whether to regenerate wordy notes with a "no new clinical claims" rule or accept it as noise in the key
- [ ] 9.4 (low priority, cosmetic) A full local-variable dump (a `ZW`-style printout) appears (a) at the start of `PSO LM BACKDOOR ORDERS` on the Extended Patient Demographics page (it includes `%XOBWERR="186005^CDS SERVER"`, "Vendor Database cannot be reached", `RTN="COPAY^PSOPTPST"`) and (b) inside the result of the CPRS Health Summary report CVP Past Clinic Visits (`ORWRP REPORT TEXT`, after the header and before the component text, `RTN="ORDV01"`, `ENT="HSQUERY"`). The report body after it is correct, and nothing in the pipeline reads the Health Summary (the summary app and chatbot read the VPR). The WEB SERVER file (#18.12) on dev has no `CDS SERVER`; the owner disabled two WEB SERVER entries during this search and the dump stayed, so re-enable them unless they were test-only (`PSO WEB SERVER`, `PSO DOJ/DEA WEB SERVER` and `PEPS` are real pharmacy entries). `D ^%RFIND` for `ZW` (exact case) found only a commented-out line (`SDES2RECLDIPREAS` `GETDELREASON+14`) in `SDES*`, `SDAPI*`, `XOBW*`, and nothing visible in `SDAM*`. Next: search `GMTS*`, `ORWRP*`, `ORDV*`, `ORRP*`, `GMPL*`, `TIU*`, `ORQ*`, `PSOPTPST`, `DGENR*`, `CDSP*`; inspect the Health Summary component CVP (file 142.1) and the OE/RR report `ORRPW ADT PAST CLINIC` (file 101.24) for custom M code; check the Kernel error trap log (`D ^XUERTRP`) around 20:05 to 20:07 on 2026-10-26

## 10. Status at the end of 2026-10-27

All four patients (P1 to P4) are loaded, rewritten notes signed and linked, keyed and scored with both tools. New this day: `set-name.js` and the RPC `CDSP UTIL VET SET NAME` (routine `CDSPVET` in cds-vista-routines) set a name with its digits; the answer-key output is one `<label>-<first>-<last>` pair per patient in the git-ignored `docs/TestPatientsWithAnswers/`; the old sacred label is now `lighthouse`.

Open: 0.2 and 2.7a (dosing rows for `SYNFMED` on dev), 0.5 (appointment import check), 7.1 to 7.3 (the tracked how-to document), 9.1 to 9.4 (P1 loose ends and the variable dump). Owner decisions waiting: whether the borderline headings in the scored runs count as must-not-say hits.
