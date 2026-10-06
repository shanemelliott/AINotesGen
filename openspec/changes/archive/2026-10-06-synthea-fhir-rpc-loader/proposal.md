# Proposal

## Why

The current workflow for loading synthetic patient data into VistA is multi-step and opaque:
1. Generate Synthea patient FHIR bundles (external tool)
2. Export to VistA using VistA-FHIR-Data-Loader menu (manual, slow, error-prone)
3. Fetch updated patient data via VPR RPC (to confirm upload)
4. Generate progress notes based on the result

Steps 1–3 create friction, especially for iterating on test data or loading new patient batches. The old VistA-FHIR-Data-Loader uses deprecated SDAM routines for appointments (newer SDES routines exist). We already have direct RPC access via vista-api-x, the same transport used for note writing.

**Goal**: Build a direct Synthea → VistA loader using RPC calls, bypassing the menu-driven import step. This enables:
- Rapid iteration on test data (re-load patients without VistA admin steps)
- Reproducible, logged uploads (know what was loaded, when, and which RPC calls failed/succeeded)
- Appointment creation via newer SDES routines (same as the note-writing pipeline uses)
- Foundation for future "add additional data" feature (inject ER visits, specialty encounters, custom labs into existing patients)
- Reusable for any new Synthea patient batches going forward

## What Changes

- **New module**: `src/synthea-loader.js` — sequences Synthea FHIR bundle resources through the real **VistA-DataLoader RPCs** (`ISI IMPORT *` namespace, package `VISTA DATALOADER` v3.1 — the same RPCs `VistA-FHIR-Data-Loader` calls internally, verified against https://github.com/WorldVistA/VistA-DataLoader/tree/master/Documentation/RPCs)
- **New module**: `src/fhir-transformer.js` — resource-type-specific FHIR → RPC param mappers (Patient→`ISI IMPORT PAT`, Condition→`ISI IMPORT PROB`, MedicationStatement→`ISI IMPORT MED`, vital Observation→`ISI IMPORT VITALS`, lab Observation→`ISI IMPORT LAB`)
- **Appointments/Encounters**: reuse the existing `src/appointmentCreator.js` (SDEC ARSET/APPADD, Task 4) rather than the DataLoader's `ISI IMPORT APPT`, which writes appointments via the older direct-file-write path — this is the specific behavior the user flagged as "done wrong" by the old FHIR loader
- **New CLI**: `load-synthea.js --input <dir> [--dfn <dfn>] [--dry-run]` — scan input directory for Synthea FHIR bundles, load each patient sequentially with domain-by-domain validation
- **Idempotent logging**: `src/synthea-loads.json` tracks which Synthea resources have been loaded (by patient ID, bundle filename, resource UID) to support safe re-runs
- **Smoke-test scripts**: Domain-specific test files (`test-synthea-patient.js`, `test-synthea-problems.js`, etc.) to validate each stage independently

## Capabilities

### New Capabilities
- `synthea-fhir-load`: Directly load Synthea FHIR bundles into VistA using RPC calls, with idempotent re-run support and per-domain smoke testing

### Modified Capabilities
- `vista-api-client`: Add domain-specific RPC wrappers (patient registration, problem list, med orders, labs, appointments)

## Impact

- **Code added**: `src/synthea-loader.js`, `src/fhir-transformer.js`, `load-synthea.js`, `test-synthea-*.js` (smoke tests), `src/synthea-loads.json` (tracking)
- **Code modified**: `src/vistaApiClient.js` (if needed for RPC param formatting), `.env.sample` (new config for default provider/location)
- **New config**: `VISTA_DATA_LOAD_PROVIDER` (default provider for PROB/MED/VITALS RPCs — Synthea has no VistA NEW PERSON mapping), `VISTA_DATA_LOAD_LOCATION` (default hospital location fallback)
- **Input**: Synthea FHIR JSON bundles in `<input-dir>/` (one file per patient)
- **Output**: `src/synthea-loads.json` (tracking which resources loaded); uploaded patient data in VistA via `ISI IMPORT PAT`/`PROB`/`MED`/`VITALS`/`LAB`; appointments via existing `src/appointmentCreator.js`; optional dry-run reports with transformed data
- **Dependencies**: Reuses `src/vistaApiClient.js`, `src/tokenService.js`, `src/config.js`, `src/appointmentCreator.js`; no new npm packages needed (plain JSON parsing)
- **Known risk**: `ISI IMPORT MED`'s `DRUG` and `SIG` params must match existing VistA dictionary entries (files #50, #51) exactly — Synthea's free-text drug names/dosage instructions will likely require a mapping table; this is the highest-uncertainty part of the design and needs Task 1 exploration against the real VistA instance before implementation.

## Non-goals

- Transform labs/problems with full SNOMED code mapping (use Synthea codes directly, VistA auto-maps)
- Support HL7 v2 or CSV formats (Synthea FHIR JSON only)
- Add additional data to *existing* patients during load (separate "add-additional-data" feature, future task)
- VistA GUI validation or user-facing appointment slot checking (overbook all historical dates)
- Batch load across multiple VistA instances (single-instance, single-site focus)

## Success Criteria

- ✓ Load all domains from one Synthea patient (patient, problems, meds, labs, encounters, appointments) without VistA menu steps
- ✓ Idempotent re-runs (no duplicates, safe re-load)
- ✓ Smoke test each domain independently (patient → problems → meds → labs → appointments → encounters)
- ✓ Output matches VPR fetch of the same patient (confirmation)
- ✓ Ready for future "add additional data" feature
- ✓ Reusable for new Synthea patient batches
