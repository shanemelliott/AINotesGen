# Decision: Hybrid Load Path (SYN initial load, ISI append)

Date: 2026-10-06
Status: Decided in principle. One open spike (meds append method, below).

## Decision

1. **Initial patient load uses the VistA FHIR Data Loader (SYN package)**, called through our
   `CDSP UTIL LOAD FHIR` RPC, with a small set of local patches and data fixes.
2. **Appends to an existing patient use our own tools and the VistA Data Loader RPCs (`ISI IMPORT *`) where they fit**
   (allergies, immunizations, problems). Appointments and notes use SDEC and TIU. **Medications are appended through a
   CDSP RPC built on the SYN prescription routines**, because the ISI RPCs only create (no renew, discontinue or edit)
   and `ISI IMPORT MED` does not create a missing drug.
3. **Pipeline:** Synthea JSON, then Node preprocessing and a preflight check, then SYN load, then create
   appointments, then generate and sign notes. Later additions are appended.

## Why

The owner's priorities, in order, are: notes, labs, meds, problems, appointments. Vitals are not on the list, and
another process will add labs and vitals going forward. Patients are loaded once. What must be repeatable later is
appending appointments, meds and notes. Specialty and ED data are wanted, because every encounter currently shows as
medicine or primary care.

| Need | Best fit | Reason |
|---|---|---|
| Whole-patient first load | SYN | One call loads patient, problems, labs, meds, immunizations and encounters, reusing tested domain logic (RxNorm drug resolution and auto-create, lab panels, SNOMED to ICD) |
| Append to an existing patient | ISI RPCs, our SDEC and TIU tools | SYN is built to create a patient and load a whole bundle; the ISI RPCs work one record at a time, take location and provider per call, and check for duplicates |
| Specialty and ED encounters | Patch SYN (`SYNFENC`) | The loader reads one fixed location for every encounter; the fix is a few lines plus map values |
| Realistic meds | Both | SYN invents quantity 30, 30 days, 1 refill and "ONE TABLET DAILY"; ISI needs the same values supplied, but we can supply real ones |

### Why not ISI for everything

- No encounter RPC exists; the V-file RPCs create a visit from the date and time with no location parameter, which
  could break our appointment and note visit linking.
- We would rebuild about ten transformers (dates, units, blood pressure, race and ethnicity, sequencing) and make
  about 1,500 calls per patient.
- `ISI IMPORT MED` needs the drug to already exist in file #50; SYN creates missing drugs and orderable items.
- The gaps that matter most to the owner (labs, meds, problems) are no better on the ISI path unless the VistA
  file already has the test or drug.

### Why not SYN for everything

- It cannot append: it creates a patient and loads a bundle.
- Location and provider are fixed ("OP" mapping), and medication details are hardcoded.
- Its lookups are not all editable through configuration (some are code, some are data wiped by a reinstall).

## What this means in practice

### Initial load (SYN) fixes, in priority order

| # | Fix | Where | Effect on Lan153 (DFN 100969) |
|---|---|---|---|
| 1 | Choose the encounter location from `Encounter.class.code` (AMB, EMER, IMP) and encounter type; point `SYNQLDM` location values at clinics that exist in #44 | `SYNFENC`, `SYNQLDM` | Specialty and ED visits at the right clinic (7 ED and 2 inpatient encounters in this patient) |
| 2 | Lab names: change mapped names to existing #60 tests (TOT. BILIRUBIN, TOTAL PROTEIN, ALKALINE PHOSPHATASE, RDW); rebuild the `^XTMP("SYNQLD","MAPS")` cache | `loinc-lab-map`, `SYNQLDM` | About 37 labs, plus possibly 16 more after the cache rebuild |
| 3 | Translate two failing RxNorm codes (243670 aspirin, 235389 mestranol/norethynodrel) | `RXNBADDATA` in `SYNFMED` | 6 meds |
| 4 | Conditions on pre-1978 dates: treat an ICD code that is not yet effective as unmapped | `SYNFPRB` | 9 conditions; only if the date theory is confirmed |
| 5 | Mark patients as veterans: `SYNFPAT` never sends `VETERAN` to the patient import (`ISI IMPORT PAT` accepts it), so every loaded patient has `isVet` 0 | `SYNFPAT` (one line), or a post-load step | All patients |

Accepted losses (not a priority): vitals gaps (71 of 289), procedures (247 of 259), dental codes, and labs with no
equivalent test. BMI is calculated by VistA and is not a loss.

### Append path

| Data | Tool | Status |
|---|---|---|
| Appointments | `SDEC ARSET` and `SDEC APPADD` (`src/appointmentCreator.js`) | Built; clinic should come from the encounter, not one global clinic |
| Notes | `TIU CREATE RECORD` and sign (`src/notesClient.js`) | Built |
| Meds (add) | New CDSP RPC, parameterized from `WRITERXPS^SYNFMED` (SIG, quantity, supply, refills, provider, clinic, date) | **To build** |
| Meds (renew, discontinue) | Standard CPRS RPCs (context `OR CPRS GUI CHART`) driven by a script, not custom M code | **Decided 2026-10-06; to build with Task 14** |
| Allergies, immunizations, problems | `ISI IMPORT ALLERGY`, `IMMUNIZATIONS`, `PROB` | Later, if needed |
| Labs, vitals | Separate process owned elsewhere | Out of scope |

`ISI IMPORT APPT` is not used: it writes appointments the older direct-file way.

### Operating rules

- Run the preflight check (`preflight-synthea.js`, then `preflight-vista.js`) on every bundle before loading it, and
  choose bundles with few gaps.
- Keep every local patch to the loader in a repo-tracked patch set with an apply step. A reinstall of the loader
  kills and re-merges `sct2icd`, `sct2icdnine`, `sct2os5` and the `loinc-lab-map` graph and replaces its routines.
- Loads are one-time per patient; a reload fails on the duplicate SSN.

## Open items and risks

1. **Meds append RPC:** none of the 26 ISI RPCs renews, discontinues or edits a prescription; `ISI IMPORT MED` only
   creates, and only for a drug that already exists in #50. SYN creates missing drugs but hardcodes quantity 30, 30 days,
   1 refill and "ONE TABLET DAILY", and also only creates. The planned RPC wraps the SYN logic with real values. Renewals and
   discontinues use the standard CPRS RPCs through a script (decided 2026-10-06), so no custom renewal code is needed.
   Still to research when that task starts: the exact CPRS call sequence for renew and discontinue, the e-signature step
   (we already encrypt the e-sig for `TIU SIGN RECORD`), which prescriptions are eligible (CPRS refuses some expired or
   controlled-substance prescriptions), and the provider keys required (ties to PROJECT-PLAN Task 12). Today every loaded
   med shows `active`, so old prescriptions also need discontinuing or expiring.
2. **Encounter patch is untested.** It needs a fresh patient with ED and specialty encounters. Use the preflight
   check to find one among the files on the server.
3. **Duplicate visits:** the loader creates a visit per encounter at its chosen clinic, and our appointments and
   notes may create their own. Once the patch lands, appointment creation should read the existing visit's clinic
   instead of a single global clinic.
4. **Provider per encounter** is separate work (PROJECT-PLAN Task 12).
5. **Reinstall exposure** of local patches is accepted, mitigated by the patch set.

## When to revisit

- The encounter patch cannot be made to work, or visits remain duplicated.
- Appending meds through ISI or the wrapper fails the spike.
- Priorities change: if vitals or procedures become important, the ISI path for those domains looks better.

## Evidence and references

- `docs/SYNTHEA-LOAD-PREFLIGHT-FINDINGS.md`: gap findings and the preflight results for Lan153.
- `openspec/changes/archive/2026-10-06-synthea-fhir-rpc-loader/tasks.md`: Task 1.7 (preflight), 1.8 (encounter location), 1.9 (gap
  decisions), 1.10 (ISI RPC gap analysis).
- SYN routines read: `SYNFENC`, `SYNDHP61`, `SYNFMED`, `SYNFMED2`, `SYNFPRB`, `SYNFLAB`, `SYNFVIT`, `SYNDHP65`, `SYNDHPMP`,
  `SYNQLDM`, `SYNKIDS`, `SYNINIT`, `SYNFHIR`.
- VistA-DataLoader RPC docs: PAT, PROB, VITALS, LAB, MED, ALLERGY, IMMUNIZATIONS, HFACTOR, V CPT, V POV.
