# Tasks

## 1. Verification tool

- [x] 1.1 Read the Bruno collection `Lighthouse - 1`: SMART launch with PKCE (not an Entra JWT), one token per patient launch
- [x] 1.2 Build `lighthouse-verify.js` and `src/lighthouseClient.js` (Patient and Condition compare, browser login with paste, cached or supplied token) and document it in `docs/LIGHTHOUSE-VERIFY.md`
- [x] 1.3 Run it for ALDIE,STANFORD (DFN 99935794) with a Bruno token in `.lighthouse-token.json` (browser login dropped: the AVS redirect fails with "No state found")
- [x] 1.4 Differences for 99935794 (2026-10-15): Lighthouse gender is `other` (VistA Male); Lighthouse address is country USA only (no street, city, state, zip, phone, marital status); Lighthouse problems are Diabetes Mellitus (E08-E13, onset 2022-11-01) and Hypertensive diseases (I10-I15, onset 2023-01-02), VistA has hypertension onset 2026-04-15 and diabetes coded R69 onset 2026-07-21; name and birth date match

## 2. Align the 14 patients with Lighthouse (done 2026-10-15; Lighthouse is the source of truth)

- [x] 2.1 Demographics: `lighthouse-apply-demographics.js` set address, birth date and sex from Lighthouse in VistA (easter egg address when Lighthouse has none or a bad ZIP); changes in `docs/lighthouse-review/vista-changes.json`
- [x] 2.2 Problems: `problem-edit.js` set onset dates and ICD codes for the same condition (8 problems on 7 patients); guide `docs/PROBLEM-EDIT.md`; changes in `docs/lighthouse-review/problem-changes.json`
- [x] 2.3 Data request to Lighthouse for values it lacks (17 demographic items, 60 problems): `docs/LIGHTHOUSE-DATA-REQUEST.md`, sent 2026-10-15
- [x] 2.4 Veteran data (2026-10-15): derived profile applied with `vet-profile.js` to 11 patients (service dates now fit the Lighthouse birth dates; WWII period added to src/veteran-rules.json); GONZALEZ, ALDIE and JAIME keep their curated data; leftover rated disabilities of MAYER, STAMM704 and METZ set not service connected
- [x] 2.4a Veteran data cleanup (2026-10-19): JAIME (SC 100%, PG 1 kept) and ALDIE (SC 40% hypertension and diabetes kept) got period of service PERSIAN GULF WAR, branch (JAIME Air Force), full service dates, eligibility VERIFIED, enrollment VERIFIED, MST screened No, Persian Gulf service (`vet-profile.js --from-file` after editing the derived profile with `logs/vet-keep-sc.js` and `logs/vet-aldie.js`; the derived ALDIE profile wrongly rated another engineer's low back pain problem). JAMES, JAMIE and ACDSPMPI set to priority group 5 VERIFIED (`logs/vet-enroll.js`); MAYER and STAMM704 (was REGISTRATION ONLY) and BEAHAN and METZ (was UNVERIFIED) set to enrollment VERIFIED, so all 14 are now VERIFIED. Rated non-SC disabilities on MAYER, STAMM704 and METZ are left as is (valid in VistA). Old values: `logs/vet-dryrun-<dfn>.json`
- [ ] 2.5 Meds, notes, encounters for the 14 patients (see the 2026-10-15 analysis of 99935794: no meds; generic note titles; appointments and visits do not line up). Split into section 4 below (2026-10-16): no Synthea data for most of them, so history is generated
- [ ] 2.6 LAST STEP, after every other change: `node lighthouse-preregistration.js` records the pre-registration check as C (CONNECTED, `SDEC EDIT PAT PRE-REGISTRATION`) so no demographics update check is due for a year. Run on all 14 on 2026-10-15 (after demographics, problems and veteran data); re-run after meds, notes and encounters. Results: `docs/lighthouse-review/preregistration.json`

## 3. Review all 14 important patients

- [x] 3.1 Roster in `src/lighthouse-patients.json` (team table); `lighthouse-verify.js --all` saves one file per patient in `docs/lighthouse-review/`
- [x] 3.2 VistA part collected for all 14 on 2026-10-15 (DFN 99935793 of ALDIE,STANFORD does not exist on dev)
- [x] 3.3 Lighthouse part for all 14 on 2026-10-15: one token without a patient launch (`node lighthouse-launch.js --none`) reads every roster ICN
- [ ] 3.4 Write the final report from `docs/lighthouse-review/*.json` (`lighthouse-report.js`)
- [ ] 3.5 Add AllergyIntolerance, MedicationRequest and Observation to the compare

## 4. Generated history for the 14 patients (planned 2026-10-16)

Target per patient: 3 years of history (2023-10-16 to 2026-10-16), a PCP visit about every 6 months with none in the last 6 months, 1 to 3 random ED visits, 2 to 4 specialty visits with notes, a note for every visit, and labs and vitals that match the problems.

- [x] 4.1 Coverage analysis of existing visits, notes, vitals and labs: `analyze-history.js`, results in `docs/lighthouse-review/history-analysis.json`
- [x] 4.2 Existing PCP-location notes read (2026-10-16, `review-pcp-notes.js`, text in `logs/pcp-notes/`): of 48, 17 are under 150 characters (gibberish, "TEST NOTE", empty templates) and many others are loader templates or AI scribe notes with wrong ages, wrong patient names or placeholders; only a few are usable (GONZALEZ 2025-10-09 and 2026-10-02, JAMES 2026-08-27, MAYER 2025-10-28, some HARRIS 2025 notes)
- [ ] 4.2b Note quality gate: a PCP visit counts toward the 6-month cadence only if its note is at least 600 characters, has history, exam and assessment sections, matches the patient's name, age and sex, and has no placeholders; otherwise the visit is a gap that a new generated visit fills. The bad signed notes stay for now (owner is researching the HIMS menus to hide or delete them)
- [x] 4.2c Specialty note titles now exist (IEN 7222 to 7234): `src/note-titles.json` and `docs/NOTE-TITLES.md` updated
- [ ] 4.2d Hosted TPMS exists (owner has access): need its URL and auth. TPMS (`cds-test-patient-management-system`) reviewed: it backfills labs (`ISI IMPORT LAB`) and vitals (`ISI IMPORT VITALS`) from condition definitions for patients already in VistA; needs PostgreSQL, the scheduler and inserter workers, and the Data Loader import RPCs. Test with one patient (ALDIE) before using it for all 14
- [x] 4.2e Labs and vitals import without TPMS (2026-10-16): `import-labs-vitals.js --plan <plan>` calls ISI IMPORT VITALS, ISI IMPORT LAB and ISI IMPORT LAB PANEL (context ISI DATA IMPORT, array parameter) through vista-api-x; dry run unless --apply. Tested on Synthea patient 100973 (plans/test-import-100973.json): 3 vitals, an A1C and a lipid panel dated 2026-10-16 07:40 all returned success and show in the VPR. VistA names: vitals BLOOD PRESSURE, PULSE, RESPIRATION, WEIGHT (value gets suffix L), PAIN, HEIGHT; labs HEMOGLOBIN A1C, CHOLESTEROL, TRIGLYCERIDE, HDL, LDL CHOLESTEROL, GLUCOSE, UREA NITROGEN, SODIUM, POTASSIUM, CHLORIDE, CO2, CREATININE, CALCIUM; location PRIMARY CARE; entered by PROVIDER,ONE
- [x] 4.3 `history-plan.js --dfn`: build `plans/dfn<dfn>-visits.json` (same format as `custom-visits.js`) with dates, clinics, scenarios and visit diagnoses from the patient's problems; fills gaps only, no duplicate of an existing visit
- [ ] 4.4 Labs and vitals gap list per patient (`docs/lighthouse-review/lab-gaps.json`): test, LOINC, date next to the PCP visits; labs loaded with the other system, vitals through a vitals RPC (to confirm)
- [x] 4.5a ALDIE step 1 (2026-10-16): 53 labs, panels and vitals imported (sentinel events after the last PCP visit: ED hypertensive urgency 2026-06-24, cardiology echo EF 35 percent 2026-08-18, outpatient labs 2026-09-01); `sacred-manifest.js` writes `docs/sacredFourteen/sacred-fourteen.md` and `.json` with an answer key (`plans/dfn99935794-answerkey.json`). Temperature must be sent as a plain number (98.8F is rejected)
- [x] 4.5 ALDIE (DFN 99935794) done end to end (2026-10-16): 10 visits booked, 10 notes signed (TIU 6196 to 6205; the 2026-01-09 note needed one re-sign), labs and vitals loaded, all notes linked to their visits; first AI summary scored 5 found, 2 partial, 1 missed of 8 (answer key and scoring in docs/sacredFourteen, local only; the plans and sacredFourteen folders are git-ignored because the VA treats test data as sensitive) (plan, labs and vitals, booking, notes, signing and linking; see 4.5a)
- [x] 4.5b (2026-10-22: `scoring` block and `scoringRule` on D1, E1, F1 added to the key, and `sacred-manifest.js` prints them; manifest regenerated) Answer key scoring rules (add to `plans/dfn99935794-answerkey.json` and use as the template for the other 13): a `scoringRule` on each judgment item (D1 overdue follow-up, E1 worsening trend, F1 refill gap) that defines found, partial and missed (found = the conclusion is stated; partial = the data is there but no conclusion; missed = absent); a definition of noise (items not in the key and not from our loaded data); a pass threshold; and `sacred-manifest.js` prints the rules
- [ ] 4.5c ALDIE: add heart failure (I50.2, onset 2026-08-18) and maybe hypertensive urgency to the problem list (`ORQQPL ADD SAVE`, same call as CPRS), then re-run the AI summary and score it as a third run; the headline lists only diabetes and hypertension and the likely cause is the missing problem
- [ ] 4.6 Remaining 13 patients. Per-patient flow: check for kept PCP appointments after the planned last PCP date (ask before cancelling), `history-plan.js --dfn <dfn> --sentinels` (only hypertension has sentinels so far; add other conditions), `history-labs-plan.js`, `import-labs-vitals.js --apply`, `fetch-vpr.js <dfn>`, `custom-visits.js --book` and `--generate`, review notes, `approve-note.js`, `sign-notes.js --all --sign` (check that `output/ready` holds only that patient), `link-note-visits.js --check`, meds (`add-rx.js`, `fill-plan.js`), `sacred-manifest.js --dfn <dfn>`, and a hand-written `plans/dfn<dfn>-answerkey.json`. Next candidates: JAMIE (99935795, no history) or ALEC (99935797)
- [ ] 4.7 Re-run `analyze-history.js`, then task 2.6 (pre-registration check) on all 14

## 5. CPRS error: Past Clinic Visits report prints a variable dump (reported 2026-10-16)

RPC `ORWRP REPORT TEXT` for DFN 99935794 (ALDIE) with `OR_CVP:PAST CLINIC VISITS~;;14;101`, days 180, run from the CPRS Reports tab (CPRS 1.33.214.1, user ELLIOTT,SHANE). The report header prints and then a dump of the whole M symbol table (`%DT=`, `DUZ=`, `GMTS...`, `XWB...`, about 500 lines) appears before the real list of visits. The visit list itself is correct and comes after the dump.

What the dump shows:
- Report routine path: `X0="ORRPW ADT PAST CLINIC^OR_CVP^1^5^ORDV01^HSQUERY..."`, `GOTO="HSTYPEB^ORWRP1(...)"`, `RTN="ORDV01"`, `HSTAG=";;14;101"`; the visits come from a scheduling call (`SDARRAY(1)="3260419;3261016.24"`, flags `R;I;NS;NSR;CC;CCR;CP;CPR;NT`).
- The last clinic record read before the dump is `W="ZZXXX-NEPHROLOGY OUTPATIENT^^^^^^1^0"`, which is not one of ALDIE's clinics; `SDNODE` holds the last appointment (2026-10-15 occupational therapy). `ERR=0`, `ERROR=0`.
- The cancelled 2026-09-30 DEV PACT MD 4 appointment (IEN 60538) is still listed, with no CANCELLED marker, because the flags include cancelled statuses; check whether the report should mark it.

- [ ] 5.1 Reproduce: call the same RPC for other patients (my attempt with the same parameters through vista-api-x returned HTTP 400, so copy the exact CPRS call, including the REMOTE and ORMAX parameters) and see if the dump is only on ALDIE or on every patient
- [ ] 5.2 Find what writes the dump: a stray `ZW` or debug line in `ORDV01`, `ORWRP1` or the scheduling lookup on the dev server, or an error trap that writes the symbol table to the device (`IO="/tmp/ORU_..."`); compare those routines with the VistA FOIA versions
- [ ] 5.3 Check clinic `ZZXXX-NEPHROLOGY OUTPATIENT` (file #44) for bad data, since it is the last clinic read before the dump
- [ ] 5.4 Fix or report, then re-run the report for ALDIE
