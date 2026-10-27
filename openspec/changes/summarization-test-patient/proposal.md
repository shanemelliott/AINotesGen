# Proposal

## Why

AI summarization needs a fully synthetic test patient with a complex chart: AFib, CKD,
heart failure, anticoagulation, a positive stool screen, and long specialty notes. The
patient should reproduce the failure modes found in the summarization review, so the
staging summary can be checked against known issues without using any real patient
data. The first load (test patient DFN 100978) did not reproduce most issues. Problems
loaded inactive, there were no specialty notes, some chart items were missing, and the
staging summary only covered one day.

## What Changes

- A generator (`build-test-patient.js`) that writes a Synthea-style FHIR bundle for a
  synthetic patient whose clinical pattern resembles the issue review. It contains no
  identifiers and is built from the clinical pattern only. It also writes a supplement
  plan for data the loader cannot file (eGFR, FIT, SpO2).
- A verbose specialty-note generator (`build-test-notes.js`). It writes very long
  primary care, cardiology, nephrology, GI and anticoagulation notes, with copy-forward
  blocks, contradictory templates and unreconciled outside values. The notes stress
  token count and fragmentation. It can also book a matching appointment for each note.
- Loader fix: problems filed through the full-ICD path keep the bundle's clinical
  status, instead of always loading INACTIVE.
- Fix the amiodarone RxNorm code in the generator. It currently uses the code for
  amlodipine 5 mg.
- Add the missing chart items to the test patient: 5 procedures, INR, dupilumab,
  bisacodyl and simethicone.
- Research how the staging summarizer chooses its window ("since last visit"), and
  confirm that notes link to the right encounters.

## Capabilities

### New Capabilities
- `summarization-test-patient`: generating a de-identified synthetic test patient
  (bundle, supplement plan and verbose specialty notes) that reproduces known
  summarization failure modes.

### Modified Capabilities
- `synthea-fhir-load`: loaded problems keep the bundle's clinical status.

## Non-goals

- No real patient data, names, identifiers, dates of birth or record numbers in any
  generated file, spec, task or log.
- No changes to the AI summarizer itself. This change only builds test data for it.
- No production VistA writes. All writes target DEV/SQA site 500.

## Impact

- New scripts: `build-test-patient.js`, `build-test-notes.js`. Output goes to
  `SynthiaFiles\`, `plans\<name>-supplement.json` and `output\ready\`.
- Loader M routines `SYNFPRB` / `SYNDHP62` (problem status), logged in
  `patches\LOADER-CHANGES.md`.
- Test patient DFN 100978 on site 500: problems, labs, vitals, appointments and notes.
