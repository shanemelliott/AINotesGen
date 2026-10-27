> Parked 2026-10-27 (reviewed; mostly unstarted). Tasks 6.1 and 6.2 (loader fix so active conditions stay ACTIVE through the full-ICD path, and its entry in `patches/LOADER-CHANGES.md`) are moved to the CLI and cleanup change because they affect every future load. The rest (3.x chart additions, 4.x summary window research, 5.x notes tuning) is parked until the summary team asks for this patient again; start with 4.1.

# Tasks

## 1. Test patient generator and load (done)

- [x] 1.1 Add `build-test-patient.js` to write a synthetic bundle with no identifiers,
  and verify that `preflight-synthea.js` accepts it
- [x] 1.2 Write the supplement plan (eGFR at +1 min, FIT, SpO2) and verify the values
  in the VPR for DFN 100978 (11 eGFR, 1 FIT, 24 SpO2)
- [x] 1.3 Load DFN 100978 and run the veteran profile, encounters (every visit day),
  appointments and notes, and verify that 41 signed notes are linked to appointments
- [x] 1.4 Reactivate the 10 problems that loaded inactive on DFN 100978, and verify
  that 15/15 are ACTIVE in the VPR

## 2. Verbose specialty notes (done)

- [x] 2.1 Add `build-test-notes.js` for the 6 notes (primary care, cardiology x2,
  hemodialysis/nephrology, GI, anticoagulation), and verify that no line exceeds 80
  characters and no identifier appears
- [x] 2.2 Book the appointments (`--book`), then sign and file the notes, and verify
  TIU 6250-6255 are signed and linked (PCE4NOTE)

## 3. Generator and chart fixes

- [ ] 3.1 Verify the amiodarone 200 mg RxNorm code (833528?) and replace 197361
  (amlodipine) in `build-test-patient.js`, then verify that preflight maps it
- [ ] 3.2 Add amiodarone to DFN 100978, and verify it is an active med in the VPR
- [ ] 3.3 Add the 5 procedures (echo, ECG, renal US, cardioversion, retinal imaging)
  to DFN 100978, and verify they appear in the VPR
- [ ] 3.4 Add INR results (find a usable sample on dev), and verify that INR appears
  in the VPR
- [ ] 3.5 Add dupilumab, bisacodyl and simethicone (RxNorm translation or MEDDEF),
  and verify they appear in the VPR

## 4. Summary window and note linkage research

- [ ] 4.1 Find out how staging chooses the summary window ("since last visit"):
  appointments, visits or note dates. Record the findings in design.md
- [ ] 4.2 Check that every DFN 100978 note links to the correct encounter (VPR document
  encounterUid vs. visit/appointment), compared against `output\encounters-100961.json`,
  and list any mismatches
- [ ] 4.3 If the window is one day, move or add the verbose notes so that the window
  covers the history, re-run the staging summary, and record what it reproduces

## 5. Staging run 2 follow-ups (verbose note tuning)

- [ ] 5.1 Spread the verbose notes across clinically matching dates (cardiology on the
  09/03 cardioversion, GI on 09/22, and so on) so the summary window covers about 3
  months (depends on 4.1), and verify the note dates in the VPR
- [ ] 5.2 Cap the note length below the summarizer failure point (about 15-20 KB per
  note; drop the 80-entry encounter log), and verify the generator's reported sizes
- [ ] 5.3 File the GI and anticoagulation notes at their own specialty clinics
  instead of primary care, and verify they appear under "Specialist(s) Seen" in staging
- [ ] 5.4 Keep the template-only cardiology note as a second same-day note to test
  which note staging picks, and record the result
- [ ] 5.5 Regenerate the notes from the current VPR so the problem block lists 15
  active problems, and verify the note text
- [ ] 5.6 Retire or replace the six 10/19 notes (TIU 6250-6255), re-run the staging
  summary, and verify that it generates (no "Unable to generate summary") and record
  which review issues it reproduces

## 6. Loader inactive-problem fix

- [ ] 6.1 Patch `SYNFPRB` / `SYNDHP62` (DHPCLNST) so full-ICD-path problems keep their
  bundle status, and verify on a new test load that active conditions are ACTIVE
- [ ] 6.2 Log the change in `patches\LOADER-CHANGES.md`, and verify the entry lists
  the routines and the test patient used
