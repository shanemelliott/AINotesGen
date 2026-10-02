# Spec: Synthea FHIR to VistA Direct RPC Loader

## Overview
Load synthetic patient data from Synthea FHIR JSON bundles directly into VistA via the
**VistA-DataLoader** RPCs (`ISI IMPORT *` namespace, package `VISTA DATALOADER` v3.1 — verified
against https://github.com/WorldVistA/VistA-DataLoader/tree/master/Documentation/RPCs), replacing
the manual VistA-FHIR-Data-Loader menu steps. Support domain-by-domain loading with idempotence,
dry-run mode, and per-patient smoke testing.

## Capabilities

### Primary
- **synthea-fhir-load**: Load Synthea FHIR bundle (Patient, Condition, MedicationStatement,
  Observation [vitals + labs]) into VistA via `ISI IMPORT PAT`/`PROB`/`MED`/`VITALS`/`LAB` in
  strict sequence, plus appointments via the existing `src/appointmentCreator.js` (SDEC
  ARSET/APPADD), with idempotent re-run support

### Secondary
- **synthea-dry-run**: Parse, validate, and display transformed RPC MISC-array params without writing to VistA
- **synthea-smoke-test**: Per-domain validation (patient, problems, meds, vitals, labs, appointments) via VPR fetch confirmation
- **synthea-idempotence**: Track loaded resources in persistent log; skip re-uploading; detect and handle duplicates gracefully

## Input Specification

### Synthea FHIR Bundle Format
- **File format**: JSON file containing a FHIR Bundle resource
- **resourceType**: `"Bundle"`
- **entry[n].resource**: FHIR resource objects (Patient, Condition, Medication, MedicationStatement, Observation, Encounter, Appointment, etc.)
- **Per-patient bundle**: One file per Synthea-generated patient (naming convention: `<Name1>_<Name2>_<Name3>_<UUID>.json`)

### Required Resource Types (minimum)
- `Patient` (exactly 1 per bundle) — demographics, SSN
- `Condition` (0 or more) — problem list items with SNOMED codes
- `MedicationStatement`/`MedicationRequest` (0 or more) — medication orders
- `Medication` (0 or more) — medication definitions (referenced by MedicationStatement)
- `Observation` (0 or more, split by `category.coding[0].code`): `'vital-signs'` → vitals, `'laboratory'` → labs
- `Encounter` (0 or more) — used to drive appointment creation via `src/appointmentCreator.js` (not `ISI IMPORT APPT`)

### Optional Resource Types
- `Organization`, `Practitioner`, `Location`, `Device` — Synthea includes these, but none of the
  `ISI IMPORT *` RPCs we use consume them directly; PROVIDER/LOCATION params fall back to
  configured defaults (`VISTA_DATA_LOAD_PROVIDER`, `VISTA_DATA_LOAD_LOCATION`) since Synthea has
  no concept that maps cleanly to VistA's NEW PERSON (#200) or HOSPITAL LOCATION (#44) files
- Other resource types — skipped (not mapped to VistA by this change)

### File Validation
- Valid JSON
- `resourceType == "Bundle"`
- `entry[]` non-empty
- At least one `Patient` resource

## Output Specification

### VistA Data Uploaded
- **Patient registration**: `ISI IMPORT PAT` (`PNTIMPRT^ISIIMPR1`) creates new patient record (or reuses provided DFN)
- **Problem list**: `ISI IMPORT PROB` (`PROBMAKE^ISIIMPR1`) for each Condition
- **Medication orders**: `ISI IMPORT MED` (`MEDMAKE^ISIIMPR2`) for each MedicationStatement
- **Vitals**: `ISI IMPORT VITALS` (`VITMAKE^ISIIMPR1`) for each vital-sign Observation
- **Labs**: `ISI IMPORT LAB` (`LABMAKE^ISIIMPR2`) for each laboratory Observation (single call files both the order and the result)
- **Appointments**: `src/appointmentCreator.js` (`SDEC ARSET` + `SDEC APPADD`, reused from Task 4) for each Encounter — **not** `ISI IMPORT APPT`, which uses the older direct-file-write scheduling path

### Tracking Log (`src/synthea-loads.json`)
```json
[
  {
    "sourceBundleFile": "Lawana430_Temple691_...json",
    "sourcePatientId": "...",
    "sourceResourceType": "Patient",
    "sourceResourceUid": "Patient/...",
    "vistaResourceId": "dfn",
    "vistaIen": "12345",
    "vistaResourceType": "PATIENT",
    "status": "loaded",
    "uploadedAt": "2026-10-02T14:23:45Z",
    "rpcName": "ISI IMPORT PAT",
    "notes": ""
  },
  {
    "sourceBundleFile": "...",
    "sourcePatientId": "...",
    "sourceResourceType": "Condition",
    "sourceResourceUid": "Condition/...",
    "vistaResourceId": "problem-ien",
    "vistaIen": "5001",
    "vistaResourceType": "PROBLEM",
    "status": "loaded",
    "uploadedAt": "...",
    "rpcName": "ISI IMPORT PROB",
    "notes": ""
  },
  ...
]
```

### Dry-Run Output
JSON document with transformed MISC-array params (before RPC calls):
```json
{
  "sourceBundleFile": "...",
  "sourcePatientId": "...",
  "transformedData": {
    "patient": { "rpcName": "ISI IMPORT PAT", "miscParams": ["NAME^...", "SEX^...", "DOB^...", "SSN^..."] },
    "problems": [ { "rpcName": "ISI IMPORT PROB", "miscParams": ["PROBLEM^...", "STATUS^A", "TYPE^C", "..."] }, ... ],
    "medications": [ { "rpcName": "ISI IMPORT MED", "miscParams": ["DRUG^...", "SIG^...", "..."] }, ... ],
    "vitals": [ { "rpcName": "ISI IMPORT VITALS", "miscParams": ["VITAL_TYPE^...", "RATE^...", "..."] }, ... ],
    "labs": [ { "rpcName": "ISI IMPORT LAB", "miscParams": ["LAB_TEST^...", "RESULT_VAL^...", "..."] }, ... ],
    "appointments": [ { "source": "appointmentCreator.js", "params": {...} }, ... ]
  },
  "validation": {
    "warnings": [],
    "missingFields": [],
    "unmatchedDrugsOrSigs": []
  }
}
```

## API Specification

### CLI: `load-synthea.js`
```bash
node load-synthea.js --input <dir> [--dfn <dfn>] [--patient <id>] [--dry-run] [--verbose]
```

**Arguments**:
- `--input <dir>` (required) — Directory containing Synthea FHIR bundles
- `--dfn <dfn>` (optional) — Load to existing VistA patient DFN (skip patient registration); useful for adding data to existing patients (future feature)
- `--patient <id>` (optional) — Load only Synthea patient with this ID (skip others); useful for testing
- `--dry-run` (optional) — Parse, validate, transform; do NOT call any RPCs
- `--verbose` (optional) — Log all RPC calls with params + responses

**Exit codes**:
- `0` — Success (all resources loaded or dry-run completed)
- `1` — Fatal error (patient not found, invalid bundle, RPC critical failure)
- `2` — Partial success (some resources loaded, some failed; see logs for details)

**Output** (to stdout):
```
Load Results:
=============
Bundle: Lawana430_Temple691_...json
Patient: Lawana430 (DFN 12345)
  Problems: 56 loaded, 0 skipped, 0 failed (+ 12 auto-marked INACTIVE via onset heuristic)
  Medications: 18 loaded, 0 skipped, 12 failed (DRUG/SIG not found in VistA dictionary)
  Vitals: 241 loaded, 0 skipped, 0 failed
  Labs: 157 loaded, 0 skipped, 0 failed
  Appointments: 35 loaded, 3 skipped (already existed), 0 failed

Summary:
--------
Total patients: 1
Total resources: 507 loaded, 12 failed
Warnings: 12 (see logs for details)
Errors: 0 fatal

Tracking log: src/synthea-loads.json
```

### Module: `src/synthea-loader.js`
```javascript
async function load(bundle, dfn, dryRun, verbose) {
  // Main sequencer
  // Returns: { success: boolean, dfn, resourcesLoaded: { patient, problems, meds, vitals, labs, appointments }, errors: [] }
}
```

### Module: `src/fhir-transformer.js`
```javascript
function transformPatient(resource) => { rpcName: 'ISI IMPORT PAT', miscParams, sourceUid }
function transformCondition(resource, providerDefault) => { rpcName: 'ISI IMPORT PROB', miscParams, sourceUid }
function transformMedicationStatement(resource, medicationMap, providerDefault) => { rpcName: 'ISI IMPORT MED', miscParams, sourceUid }
function transformVitalObservation(resource, locationMap, providerDefault) => { rpcName: 'ISI IMPORT VITALS', miscParams, sourceUid }
function transformLabObservation(resource, locationMap) => { rpcName: 'ISI IMPORT LAB', miscParams, sourceUid }
```

## Behavior

### Load Sequence (per patient)
1. **Validate** — Check FHIR bundle format, required resources
2. **Patient** — `ISI IMPORT PAT` (register or use provided DFN)
3. **Problems** — `ISI IMPORT PROB` for each Condition (with INACTIVE heuristic for onset > 1 year ago)
4. **Medications** — `ISI IMPORT MED` for each MedicationStatement (expect partial failures — see Constraints)
5. **Vitals** — `ISI IMPORT VITALS` for each vital-sign Observation (combine BP components)
6. **Labs** — `ISI IMPORT LAB` for each laboratory Observation (single call per result)
7. **Appointments** — `src/appointmentCreator.js` (SDEC ARSET/APPADD) for each Encounter

### Idempotence
- Check `src/synthea-loads.json` before each RPC call
- If `sourceResourceUid` already in log → skip (already loaded)
- `ISI IMPORT LAB` has server-side duplicate detection (same patient/date/test) as a backstop
- If an RPC call fails with an "already exists"-style error, log and continue rather than treating as fatal
- Safe to re-run: no duplicates will be created

### Error Handling
- **Non-fatal errors** (e.g., DRUG/SIG not found for one medication, duplicate lab): Log warning, continue with next resource
- **Fatal errors** (e.g., patient not found, invalid Synthea bundle structure): Fail fast, stop processing that patient
- **RPC connection errors**: Log, retry with exponential backoff (3 attempts), then fail
- **Dry-run mode**: No RPCs, so no connection errors

### Heuristics
- **Problem STATUS**: Mark as `I` (inactive) if `onset` date is more than 1 year before load date, even if Synthea's `clinicalStatus` says active (matches Task 2's encounter extraction logic)
- **Problem TYPE**: Acute/self-limited conditions (per Task 2's classification rules) → `A`; chronic → `C`
- **Default PROVIDER/PROV/ENTERED_BY**: Synthea has no field that maps to VistA's NEW PERSON file; use `VISTA_DATA_LOAD_PROVIDER` config value for all `ISI IMPORT PROB`/`MED`/`VITALS` calls
- **Default LOCATION**: Map `Observation.encounter` → hospital location where possible, else fall back to `VISTA_DATA_LOAD_LOCATION`
- **BP combination**: Synthea reports systolic/diastolic as separate Observations (or `component[]`); combine into a single `ISI IMPORT VITALS` call with `RATE^120/80` format

## Constraints

- **Single-instance**: Load to one VistA instance (configured via `.env`)
- **FHIR JSON only**: No HL7 v2, CSV, or other formats
- **Synthea data as-is**: Use Synthea codes (SNOMED, LOINC) directly; don't attempt full code mapping
- **No rollback**: Uploaded data cannot be automatically rolled back; requires manual VistA admin action
- **Sequential per-patient**: Load one Synthea patient at a time (batch handles iteration, not parallelism)
- **Deterministic**: Same Synthea bundle always produces the same output (idempotence) when re-run
- **DRUG/SIG exact-match requirement**: `ISI IMPORT MED` requires `DRUG` to exist in file #50 and
  `SIG` to exist in file #51 — Synthea's free-text medication names and dosage instructions will
  not always match exactly. Task 1 must quantify the match rate against the target VistA instance
  before this is considered reliable; partial medication load failures are expected and
  acceptable for v1 (logged, not fatal).
- **No `ISI IMPORT APPT` usage**: Appointments must go through `src/appointmentCreator.js`
  (SDEC ARSET/APPADD) to avoid the old direct-file-write scheduling path.

## Configuration

New `.env` settings:
```
VISTA_DATA_LOAD_PROVIDER=<name-or-ien>   # Default provider for ISI IMPORT PROB/MED/VITALS (no Synthea equivalent)
VISTA_DATA_LOAD_LOCATION=<name-or-ien>   # Default hospital location fallback for VITALS/LAB
```

Reused from existing config:
- `VISTA_API_BASE_URL`
- `VISTA_SITE_ID`
- `VISTA_API_KEY`
- `src/appointmentCreator.js` config (clinic/resource IENs from Task 4)

## Non-Functional Requirements

- **Performance**: Load one Synthea patient (300–1000 resources) in < 5 minutes (sequential RPC calls, no parallelism)
- **Reliability**: 100% success rate on idempotent re-runs (no duplicate data)
- **Debuggability**: All RPC calls logged with params + responses (--verbose flag for inspection)
- **Safety**: Dry-run mode for preview before live upload

## Acceptance Criteria

- ✓ Load all domains from one Synthea patient without VistA menu interaction
- ✓ Dry-run mode produces accurate transformed MISC-array params
- ✓ VPR fetch confirms uploaded data matches Synthea source
- ✓ Idempotent re-runs produce no duplicates
- ✓ Smoke tests pass (one per domain: patient, problems, meds, vitals, labs, appointments)
- ✓ Medication DRUG/SIG match rate documented, with partial-failure handling verified (not fatal)
- ✓ Batch load all Synthea patients from input directory
- ✓ CLI handles errors gracefully (exits with appropriate code, logs details)
- ✓ Confirmed `ISI IMPORT APPT` is never called anywhere in the pipeline
