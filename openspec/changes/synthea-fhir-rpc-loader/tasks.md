# Tasks

## Overview
Implement a direct Synthea FHIR → VistA loader to replace the manual VistA-FHIR-Data-Loader menu steps. Test incrementally (per-domain smoke tests), then batch-load.

**Target**: Load all Synthea test patients via direct RPC calls, no menu interaction.

---

## Task 1: Explore Synthea FHIR bundle structure + verify VistA dictionary matches — DONE (2026-10-01)
**Goal**: Map Synthea FHIR resources to the real `ISI IMPORT *` RPC params (verified against
https://github.com/WorldVistA/VistA-DataLoader/tree/master/Documentation/RPCs), and assess the
DRUG/SIG matching risk before building transformers.

**Steps**:
1. Read one Synthea FHIR bundle file (`Lawana430_...json` or similar from repo root)
2. Document the structure: Patient, Condition, MedicationStatement, Observation (vitals + labs),
   Encounter resources with field samples
3. Cross-check against `design.md` resource mapping tables (`ISI IMPORT PAT/PROB/MED/VITALS/LAB`
   params); note any gaps or surprises
4. Identify LOINC codes (labs/vitals) and SNOMED codes (problems) in the data
5. **Critical risk check**: Pull a sample of Synthea medication names and dosage instruction text;
   query the target VistA instance's DRUG file (#50) and MEDICATION INSTRUCTION file (#51) for
   exact or near matches. Document match rate — this determines whether `ISI IMPORT MED` is
   viable as designed or needs a mapping/fallback layer.
6. Create `docs/SYNTHEA-FHIR-STRUCTURE.md` with findings (resource counts per patient, field
   availability, quirks, DRUG/SIG match rate)

**Output**: [`docs/SYNTHEA-FHIR-STRUCTURE.md`](../../../docs/SYNTHEA-FHIR-STRUCTURE.md) — full
resource inventory (18 resource types, 1948 entries, 6.7MB for one patient) and 4 corrections to
`design.md`'s original assumptions:
- No `Appointment` resources exist at all (only `Encounter`) — simplifies the appointment mitigation
- Medication resource is `MedicationRequest` (RxNorm-coded), not `MedicationStatement` — lowers the
  DRUG/SIG risk since `wsPostFHIR` routes meds through the RxNorm pipeline, not `ISI IMPORT MED`
- Blood pressure is one Observation with `component[]` (systolic+diastolic together), not two
  separate Observations needing combination
- **Lab panel gap found**: Synthea groups panels via `DiagnosticReport.result[]`, but `SYNFPAN.m`
  scans for a panel-coded `Observation` directly — doesn't exist in this Synthea version's output,
  so panels likely won't be detected as currently written. Needs a decision before Task 1.5/8.

**Exit criteria** (all met): 
- ✓ Bundle structure documented
- ✓ Resource field samples recorded
- ✓ LOINC/SNOMED code examples noted
- ✓ DRUG/SIG match rate against target VistA instance documented
- ✓ Any missing fields or discrepancies from design noted

---

## Task 1.5: Build and verify the custom VistA RPC (`VAOS SYNFHIR LOAD`) — BLOCKING
**Goal**: Get one working, verified RPC that forwards a chunked FHIR bundle to
`wsPostFHIR^SYNFHIR` and returns its load summary. **This gates all later Node-side loader work
(Tasks 3, 4, 11)** — nothing downstream can be tested until this RPC exists and is confirmed
working from a terminal and from vista-api-x.

**Owner split**: VistA-side M code and RPC definition — the user (has programmer access); Node-side
chunking function, vista-api-x wiring, and response parsing — done together.

**Progress (2026-10-01) — Step 1 confirmed working, stopped before Step 2:**
Ran multiple terminal tests directly against `wsPostFHIR^SYNFHIR` (`D ^XUP`, hand-set `BODY(n)`
chunks, `D wsPostFHIR^SYNFHIR(.ARGS,.BODY,.RESULT)`), confirming:
- ✅ `wsPostFHIR` is public/callable directly, no shim needed
- ✅ Multi-chunk `BODY(1)`, `BODY(2)` reassembly via `merge json=BODY` + `DECODE^XLFJSON` works
  correctly — confirmed with a 5237-char bundle split into two ~2-3KB chunks at a JSON-entry
  boundary
- ✅ `RESULT` comes back the **same way** — chunked across `RESULT(1)`, `RESULT(2)`, ... — Node-side
  response parsing must reassemble this, not expect a single string (updates the "Response
  handling" assumption in `design.md`)
- ✅ Patient creation via `importPatient^SYNFPAT` works; duplicate-SSN detection surfaces cleanly
  as `loadMessage:"-1^Duplicate SSN"` — useful as a native idempotence signal
- ✅ Sub-loader chain executes in order; `importLabs^SYNFLAB` and downstream loaders ran
  successfully once at least one resource of the relevant type was present
- ⚠️ **Found a systemic latent bug class** across multiple `SYNF*.m` import wrappers
  (`importLabs^SYNFLAB`, `importPanels^SYNFPAN`, likely others following the same
  `n grtn d wsIntakeXxx(...) s rtn(...)=grtn(...)` pattern): if a resource type is **completely
  absent** from the submitted bundle, the sub-loader's early-quit path never initializes `grtn`,
  causing `<UNDEFINED>importXxx+N^SYNFxxx *grtn(...)`. **Not expected to affect real patient
  loads** — genuine Synthea bundles always include `DiagnosticReport`, `Immunization`, `Allergy`,
  etc. — only surfaced because hand-built minimal test bundles omit types. Flagged as a known
  limitation; revisit if a real full-patient load ever hits it (would mean that patient's bundle
  is unusually missing a whole resource type).

**Decision**: stop hand-crafting ever-larger test bundles resource-by-resource (diminishing
returns/whack-a-mole). Core RPC mechanism is sufficiently proven. **Next session: proceed to
Steps 2-3** (write the `VAOSFHIR` wrapper routine, define the RPC in file #8994), then test with a
**real, complete** Synthea patient chunked programmatically via Node (not hand-typed) — naturally
avoids the missing-resource-type bug class since real bundles have every type present.

**Steps**:
1. **Terminal-only verification first (no RPC Broker yet)** — ✅ DONE, see progress notes above.
2. **Write the wrapper routine** (see `design.md`'s "Payload Transport" section for the draft
   `VAOSFHIR` routine — thin pass-through confirmed viable by step 1's testing) — NOT STARTED
3. **Define the RPC** in file #8994 (`VAOS SYNFHIR LOAD` or final agreed name): one `array`-type
   input parameter, string return value, appropriate RPC context — NOT STARTED
4. **Wire up via RPC Broker** — test with a minimal 2–3 chunk payload via a raw broker test tool
   (or vista-api-x's own test/Swagger UI) before involving our Node code at all
5. **Node-side integration**: implement `chunkBundleJson()` (see `design.md`) in
   `src/fhir-bundle-transport.js`, call via `src/vistaApiClient.js`'s existing `callRpc()`, parse
   the returned **chunked** JSON summary (reassemble `RESULT(n)` same as `BODY(n)`)
6. **End-to-end test**: a real, complete Synthea patient (programmatically chunked, not hand-built)
   → full round trip → confirm via VPR fetch that all domains landed in VistA

**Output**: Working `VAOS SYNFHIR LOAD` RPC, confirmed from both a terminal and from Node via
vista-api-x, with a known-good chunk size baseline.

**Exit criteria**:
- ✓ `wsPostFHIR` confirmed callable (public) or shim built
- ✓ Terminal test with hand-set chunked array succeeds and returns parseable `RESULT`
- ○ RPC defined in file #8994 and reachable via vista-api-x — NOT YET DONE
- ○ Node `chunkBundleJson()` round-trips a small test bundle successfully — NOT YET DONE
- ○ Known per-chunk size ceiling documented (tested empirically, not guessed) — NOT YET DONE
- ✓ Confirmed `importEncounters^SYNFENC`'s automatic appointment-creation side effect is disabled
  per Task 1.6 before relying on `wsPostFHIR` for real patient loads (not the originally-assumed
  "no Appointment resources to strip" mitigation, which turned out not to apply — see Task 1.6)

---

## Task 1.6: Disable automatic appointment creation in `ENCTUPD^SYNDHP61` — DONE (2026-10-01)
**Goal**: Stop every `Encounter` load from unconditionally attempting the broken, direct-file-write
appointment path, so appointments are created exclusively by our own `src/appointmentCreator.js`
(SDEC ARSET/APPADD). Confirmed via a live VistA load-log screenshot + source inspection that
`importEncounters^SYNFENC` → `ENCTUPD^SYNDHP61` calls `APPTADD^SYNDHP62`/`APPTCKIN^SYNDHP62`/
`APTCKOUT^SYNDHP62` for **every** encounter with no flag to skip it — there are no `Appointment`
FHIR resources to omit from the bundle (confirmed zero across all 4 test patients), so filtering
bundle content cannot prevent this; the routine itself must be patched.

**Owner**: VistA-side M patch — the user (has programmer access).

**Confirmed already done** — screenshot of the installed `SYNDHP61.int` routine (lines 366-395)
shows the exact patch already in place, matching the plan below precisely:
```
 M RETSTA("ENCDATA")=ENCDATA
 ; 10/1/2026 removed appointment creation from this routine for now as
 ; it uses the old SDAM routines / writes to 44/2.98 and excludes 408.84/5
 ; Appts will be created via RPC before note creation to ensure correct
 ; appts are created.
 ;
 Q
 ;change APPTDATE back to HL7 format for these next calls
 S APPTDATE=$$FMTHL7^XLFDT(APPTDATE)
 ;create appointment
 ... (unreachable appointment block, left in place for reference)
```
Note: the in-routine comment currently reads "10/1/2025" — a typo for "10/1/2026" (today), purely
cosmetic, no functional impact.

**Steps** (for reference — already completed):
1. Locate the actual installed routine (not assume GitHub master matches — confirmed it didn't
   need to, since the patch was applied directly and verified by screenshot)
2. Confirm patch point by matching surrounding code (`M RETSTA("ENCDATA")=ENCDATA` → insert `Q`)
3. Insert a single `Q` — additive, non-destructive, reversible (appointment block left in place,
   just unreachable), with a clear dated comment explaining why
4. Encounter loads now return `RETSTA` with the visit creation result only; no nested
   `APPT`/`CKIN`/`CKOUT` entries will appear in future load logs

**Output**: Patched `SYNDHP61.m` on the target VistA instance; encounters load cleanly with zero
appointment side effects, appointments handled entirely by `src/appointmentCreator.js` downstream.

**Exit criteria** (all met):
- ✓ Actual installed routine source located and patched (confirmed via screenshot, not assumed)
- ✓ Single `Q` inserted with explanatory comment, appointment block unreachable
- ⏳ Regression check (one fresh encounter load, confirm visit still creates, no `APPT` in log) —
  recommended before relying on this for a full patient load, not yet explicitly verified

---



## Task 2: Implement `src/fhir-transformer.js`
**Goal**: Pure transformations from Synthea FHIR → `ISI IMPORT *` RPC MISC-array param format.

**Steps**:
1. Create `src/fhir-transformer.js` with transformers for each resource type:
   - `transformPatient(resource)` → `{ rpcName: 'ISI IMPORT PAT', miscParams: ['NAME^...', 'SEX^...', 'DOB^...', 'SSN^...'], sourceUid }`
   - `transformCondition(resource, providerDefault)` → `{ rpcName: 'ISI IMPORT PROB', miscParams: ['PROBLEM^...', 'PROVIDER^...', 'PAT_SSN^...', 'STATUS^A|I', 'TYPE^A|C', 'ONSET^...'], sourceUid }`
   - `transformMedicationStatement(resource, medicationMap, providerDefault)` → `{ rpcName: 'ISI IMPORT MED', miscParams: ['PAT_SSN^...', 'DRUG^...', 'DATE^...', 'EXPIRDT^...', 'SIG^...', 'QTY^...', 'SUPPLY^...', 'REFILL^...', 'PROV^...'], sourceUid }`
   - `transformVitalObservation(resource, locationMap, providerDefault)` → `{ rpcName: 'ISI IMPORT VITALS', miscParams: ['DT_TAKEN^...', 'PAT_SSN^...', 'VITAL_TYPE^...', 'RATE^...', 'LOCATION^...', 'ENTERED_BY^...'], sourceUid }` (combine systolic+diastolic Observations into one BP call)
   - `transformLabObservation(resource, locationMap)` → `{ rpcName: 'ISI IMPORT LAB', miscParams: ['PAT_SSN^...', 'LAB_TEST^...', 'RESULT_DT^...', 'RESULT_VAL^...', 'LOCATION^...'], sourceUid }`
2. Each transformer should:
   - Handle missing/optional fields gracefully
   - Preserve source resource UID for idempotence tracking
   - Convert Synthea dates (YYYY-MM-DD) to VistA FileMan date/time format expected by each RPC
   - Apply heuristics (e.g., mark problems with `onset > 1 year ago` as `STATUS^I`; default `PROVIDER`/`PROV`/`ENTERED_BY` from `VISTA_DATA_LOAD_PROVIDER` config)
   - For `ISI IMPORT MED`: attempt DRUG/SIG lookup against known VistA values (informed by Task 1 findings); fall back to a documented default or skip with a warning if no match
3. Add unit test cases (no RPC calls, pure data transforms)

**Output**: `src/fhir-transformer.js` with tested transformers.

**Exit criteria**:
- ✓ All resource types have transformers
- ✓ Date conversion works correctly for each RPC's expected format
- ✓ Edge cases handled (missing fields, null values, BP component combination)
- ✓ Unit tests pass (at least one example per transformer)

---

## Task 3: Implement `src/synthea-loader.js`
**Goal**: Orchestrate load sequence with idempotence and error handling.

**Steps**:
1. Create `src/synthea-loader.js` with main `async load(bundle, dfn, dryRun)` function
2. Implement load sequence in order:
   - Patient (register or use provided DFN)
   - Problems
   - Medications
   - Vitals
   - Labs
   - Appointments/Encounters (via existing `src/appointmentCreator.js`, not `ISI IMPORT APPT`)
3. For each step:
   - Check idempotence log (`src/synthea-loads.json`) — skip if already loaded
   - Call RPC (or log for dry-run)
   - Update tracking log with result (VistA IEN, status, timestamp)
4. Implement error handling:
   - Log RPC errors with params for review
   - Continue on non-fatal errors (e.g., duplicate problem)
   - Fail fast on critical errors (e.g., patient not found)
5. Add logging: per-resource status, cumulative counts, warnings

**Output**: `src/synthea-loader.js` orchestrator and `src/synthea-loads.json` tracking.

**Exit criteria**:
- ✓ Load sequence executes in correct order
- ✓ Idempotence check prevents duplicate loads
- ✓ RPC calls (with params) logged
- ✓ Tracking file updated with all loaded resources
- ✓ Error handling + retry logic works

---

## Task 4: Extend `src/vistaApiClient.js` with `ISI IMPORT *` RPC wrappers
**Goal**: Add convenience wrappers for the verified DataLoader RPCs.

**Steps**:
1. Add new RPC wrappers (using `callRpc()` with the `MISC` array format these RPCs expect —
   `MISC(n) = "PARAMETER^VALUE"`, passed as a string array, not `namedArray`):
   - `registerPatient(name, sex, dob, ssn, ...)` → `ISI IMPORT PAT`
   - `addProblem(problem, provider, patSsn, status, type, onset, ...)` → `ISI IMPORT PROB`
   - `createMedOrder(patSsn, drug, date, expirdt, sig, qty, supply, refill, prov)` → `ISI IMPORT MED`
   - `createVital(dtTaken, patSsn, vitalType, rate, location, enteredBy)` → `ISI IMPORT VITALS`
   - `createLabResult(patSsn, labTest, resultDt, resultVal, location, collectionSample)` → `ISI IMPORT LAB`
   - Appointments: reuse existing `src/appointmentCreator.js` (SDEC ARSET/APPADD) — no new wrapper needed
2. Each wrapper should:
   - Build the `MISC` array in the `"PARAM^VALUE"` format each RPC's docs specify
   - Parse the `ISIRESUL` response: `ISIRESUL(0) = 1` (or positive) + `ISIRESUL(1)` = result data on
     success; `ISIRESUL(0) = -1^ERROR_MESSAGE` on failure
   - Return `{ success, ien/dfn, rawResult, errorMessage }`
3. Test with one successful RPC call per wrapper (smoke tests in Tasks 5–9)

**Output**: Enhanced `src/vistaApiClient.js` with `ISI IMPORT *` RPC wrappers.

**Exit criteria**:
- ✓ All required RPCs have wrappers (PAT, PROB, MED, VITALS, LAB)
- ✓ MISC array format correct (tested in smoke tests)
- ✓ `ISIRESUL` response parsing correct (success and error cases)
- ✓ Error messages logged with full MISC params for debugging

---

## Task 5: Smoke test Task 1 — Patient registration
**Goal**: Register one patient from Synthea, verify in VPR.

**Steps**:
1. Create `test-synthea-patient.js`:
   - Parse one Synthea bundle
   - Extract Patient resource
   - Transform via `transformPatient()`
   - Call `registerPatient()` RPC
   - Fetch same patient via `VPR GET PATIENT DATA JSON` RPC
   - Compare: returned DFN, name, DOB match Synthea input
2. Print summary: success/fail, DFN assigned, any discrepancies

**Output**: Proof that patient registration works end-to-end.

**Exit criteria**:
- ✓ Patient registered successfully
- ✓ DFN assigned and retrievable
- ✓ Name, DOB, MRN match Synthea data
- ✓ VPR fetch confirms data in VistA

---

## Task 6: Smoke test Task 2 — Problem list loading
**Goal**: Load problems for the test patient, verify in VPR.

**Steps**:
1. Create `test-synthea-problems.js`:
   - Use DFN from Task 5
   - Parse Synthea bundle again
   - Extract all Condition resources
   - Transform each via `transformCondition()`
   - Call `addProblem()` RPC for each
   - Fetch patient via VPR, count problems in `problem` domain
   - Compare: # problems, problem codes, onset dates
2. Document any Synthea problems that should be marked INACTIVE (onset > 1 year ago)

**Output**: Proof that problem list loading works.

**Exit criteria**:
- ✓ All Synthea problems loaded (or correctly skipped if INACTIVE)
- ✓ Problem counts match in VPR
- ✓ Problem codes (SNOMED) preserved
- ✓ Onset dates correct

---

## Task 7: Smoke test Task 3 — Medication loading
**Goal**: Load meds for the test patient, verify in VPR. **Highest-risk domain** — expect partial
failures due to DRUG/SIG dictionary matching (see Task 1 findings).

**Steps**:
1. Create `test-synthea-meds.js`:
   - Use DFN from Task 5
   - Extract MedicationStatement + Medication resources
   - Transform each via `transformMedicationStatement()` (`ISI IMPORT MED`)
   - Call `createMedOrder()` RPC for each
   - Fetch patient via VPR, count active meds
   - Compare: # meds loaded vs. # attempted, drug names, dose/route/frequency, order dates
   - **Document every DRUG/SIG mismatch** (RPC returns `-1^Invalid DRUG...` or `-1^Invalid Medication Instruction/SIG...`) — this determines whether Task 2's transformer needs a real mapping table before this is usable beyond a few lucky matches

**Output**: Proof (or disproof) that med orders can load via exact-name matching, with a documented match/failure rate.

**Exit criteria**:
- ✓ At least one med successfully loaded end-to-end
- ✓ Match/failure rate against DRUG (#50) and MEDICATION INSTRUCTION (#51) files documented
- ✓ Decision made: proceed as-is, add a mapping table, or defer full med loading to a follow-up task

---

## Task 8: Smoke test Task 4 — Lab loading
**Goal**: Load lab results for the test patient, verify in VPR.

**Steps**:
1. Create `test-synthea-labs.js`:
   - Use DFN from Task 5
   - Filter Observation resources (category == 'laboratory')
   - For each lab Observation:
     - Transform via `transformLabObservation()` (`ISI IMPORT LAB` — single call creates order + files result)
     - Call `createLabResult()` RPC
   - Fetch patient via VPR, count labs in `lab` domain
   - Compare: # tests, LOINC codes, result values, specimen dates
2. Document any Synthea labs without LOINC codes or without a matching LABORATORY TEST file (#60) entry

**Output**: Proof that lab results load correctly via `ISI IMPORT LAB`.

**Exit criteria**:
- ✓ All Synthea labs loaded
- ✓ Lab counts match in VPR
- ✓ LOINC codes preserved
- ✓ Result values correct
- ✓ Specimen dates correct
- ✓ Duplicate-detection behavior observed and documented (RPC rejects same patient/date/test)

---

## Task 9: Smoke test Task 3b — Vitals loading
**Goal**: Load vitals for the test patient, verify in VPR.

**Steps**:
1. Create `test-synthea-vitals.js`:
   - Use DFN from Task 5
   - Filter Observation resources (category == 'vital-signs')
   - Combine systolic/diastolic BP components into single `BP` readings
   - Transform each via `transformVitalObservation()` (`ISI IMPORT VITALS`)
   - Call `createVital()` RPC for each
   - Fetch patient via VPR, count vitals in `vital` domain
   - Compare: # vitals, vital types, values, dates

**Output**: Proof that vitals loading works.

**Exit criteria**:
- ✓ All Synthea vitals loaded (including combined BP readings)
- ✓ Vital counts match in VPR
- ✓ Vital types (per LOINC mapping table in design.md) and values correct

---

## Task 10: Smoke test Task 6 — Appointment loading (reuse Task 4 logic)
**Goal**: Load appointments for the test patient using the existing SDEC-based creator, verify in VPR.

**Steps**:
1. Create `test-synthea-appointments.js`:
   - Use DFN from Task 5
   - Extract Encounter resources (preferred) or Appointment resources
   - Call `src/appointmentCreator.js`'s existing `SDEC ARSET` → `SDEC APPADD` flow (same code
     path as Task 4 — do NOT use `ISI IMPORT APPT`)
   - Fetch patient via VPR, count appointments in `appointment` domain
   - Compare: # appointments, appointment dates, reasons, status

**Output**: Proof that appointment loading via the correct (SDEC) path works for Synthea-sourced dates.

**Exit criteria**:
- ✓ All Synthea encounters/appointments loaded via `appointmentCreator.js`
- ✓ Appointment counts match in VPR
- ✓ Appointment dates, times, reasons correct
- ✓ Confirmed no use of `ISI IMPORT APPT` anywhere in the pipeline

---

## Task 11: Implement `load-synthea.js` CLI
**Goal**: Bundle all smoke tests + transformers into one orchestrator CLI.

**Steps**:
1. Create `load-synthea.js` at repo root:
   ```
   node load-synthea.js --input <dir> [--dfn <dfn>] [--dry-run] [--patient <id>]
   ```
2. Scan `--input` directory for `.json` files (Synthea bundles)
3. For each bundle:
   - Parse and validate (is it a valid FHIR Bundle?)
   - Extract patient ID from Patient resource
   - If `--patient` set and doesn't match, skip
   - If `--dfn` set, load to that DFN (skip patient registration)
   - If `--dfn` not set, register patient and get new DFN
   - Call `synthea-loader.load(bundle, dfn, dryRun)`
   - Print per-resource status and cumulative counts
4. Support `--dry-run` (transform + log, no RPCs)
5. Support `--verbose` (log all RPC calls + responses)
6. Print final summary: # patients, # resources loaded per type, # errors

**Output**: Working CLI for batch-loading Synthea patients.

**Exit criteria**:
- ✓ CLI parses command-line args
- ✓ Scans input directory correctly
- ✓ Dry-run mode works (no VistA updates)
- ✓ Live mode loads all resources in sequence
- ✓ Idempotence check prevents re-loading
- ✓ Final summary printed

---

## Task 12: Test batch load with all repo Synthea files
**Goal**: Load all Synthea patients from repo root using new CLI.

**Steps**:
1. Gather all Synthea FHIR bundles from repo root (`Lawana430_...json`, `Madlyn383_...json`, etc.)
2. Create input directory: `synthea-bundles/`
3. Move (or copy) all Synthea `.json` files there
4. Run CLI:
   ```
   node load-synthea.js --input synthea-bundles/ --dry-run
   ```
5. Review transformed data (print to console or to file)
6. If dry-run output looks good, run live:
   ```
   node load-synthea.js --input synthea-bundles/ --verbose
   ```
7. Verify in VistA (spot-check 2–3 patients: fetch via VPR, compare to Synthea)
8. Document results: # patients loaded, total resources, any errors

**Output**: Proof that all Synthea patients load successfully.

**Exit criteria**:
- ✓ All Synthea bundles parsed without errors
- ✓ All patients registered (new DFNs or reused)
- ✓ All resources loaded (problems, meds, labs, etc.)
- ✓ No duplicates (idempotence check working)
- ✓ Spot-check VPR data matches Synthea source
- ✓ `src/synthea-loads.json` tracks all loads

---

## Task 13: Document and clean up
**Goal**: Finalize code, documentation, and repo state.

**Steps**:
1. Add comments and docstrings to all new modules (`synthea-loader.js`, `fhir-transformer.js`, `load-synthea.js`, transformers)
2. Update `README.md` with new "Synthea Data Load" section (replaces old manual export step):
   - Synthea FHIR bundle generation (external)
   - Direct RPC load via `load-synthea.js`
   - Idempotence and re-run behavior
   - Dry-run testing
3. Update `.env.sample` with new config:
   - `VISTA_DATA_LOAD_CONTEXT`
   - `VISTA_DATA_LOAD_DUZ`
4. Move Synthea `.json` files from repo root to `synthea-bundles/` (or leave them, but update `.gitignore` to clarify they're test data)
5. Add `synthea-loads.json` to `.gitignore` (it contains patient IDs)
6. Create `docs/SYNTHEA-FHIR-STRUCTURE.md` from Task 1 findings (already done)
7. Test one full round: Synthea bundle → load-synthea → VPR fetch → notes generation

**Output**: Production-ready code, full documentation, clean repo state.

**Exit criteria**:
- ✓ All modules documented (comments, docstrings)
- ✓ README updated with new workflow step
- ✓ Config documented in `.env.sample`
- ✓ `.gitignore` updated
- ✓ No stray Synthea files in root (or clarified)
- ✓ Full end-to-end workflow tested (Synthea → load → VPR → notes)

---

## Summary

| Task | Domain | RPC | Smoke Test | Status |
|---|---|---|---|---|
| 1 | Synthea FHIR structure + DRUG/SIG match risk | — | Doc | Not started |
| 2 | FHIR transformers | — | Unit tests | Not started |
| 3 | Load sequencer | — | Dry-run | Not started |
| 4 | RPC wrappers | `ISI IMPORT *` | RPC calls | Not started |
| 5 | Patient registration | `ISI IMPORT PAT` | VPR fetch | Not started |
| 6 | Problem list | `ISI IMPORT PROB` | VPR fetch | Not started |
| 7 | Medications (high risk) | `ISI IMPORT MED` | VPR fetch | Not started |
| 8 | Labs | `ISI IMPORT LAB` | VPR fetch | Not started |
| 9 | Vitals | `ISI IMPORT VITALS` | VPR fetch | Not started |
| 10 | Appointments (reuse Task 4) | SDEC ARSET/APPADD | VPR fetch | Not started |
| 11 | CLI orchestrator | — | Batch load | Not started |
| 12 | Batch test | — | All patients | Not started |
| 13 | Docs + cleanup | — | Finalization | Not started |

---

## Deferred (Future)

- **Task 14** (separate OpenSpec): "Add additional data" — insert ER visits, specialty encounters, custom labs into existing patients (future work, depends on Task 13 completion)
- **Task 15** (separate OpenSpec): Support HL7 v2, CSV, other data formats (out of scope for now; FHIR JSON only)
