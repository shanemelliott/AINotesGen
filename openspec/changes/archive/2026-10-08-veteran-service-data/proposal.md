# Proposal

## Why

Loaded Synthea patients are flagged as veterans but nothing else about them looks like a veteran: patient inquiry shows primary
eligibility UNSPECIFIED, enrollment priority IN PROCESS, not service connected, no rated disabilities, no military service,
and every exposure (combat, Agent Orange, Southwest Asia, MST) No or Unknown. Neither the SYN loader nor the VistA Data
Loader (`ISI IMPORT PAT` only sets `VETERAN` and `TYPE` on new patients) can set these, so veteran-specific features cannot be
tested with our patients. Four batch-1 patients are loaded with signed notes and are ready to receive this data now.

## What Changes

- Derive a veteran service profile for each loaded patient from its Synthea record and age: period of service and branch,
  entry and separation dates, combat and exposure flags, rated disabilities with a percentage each (from conditions such as
  PTSD, TBI, amputation, burn scar, tinnitus, hearing loss, back pain), the combined service-connected percentage by the VA
  combined ratings method, primary eligibility and enrollment priority group.
- Write the profile to a reviewable per-patient file (gitignored, synthetic data) before anything is written to VistA.
- Add a dev-only CDSP RPC that reads and sets these fields on an existing patient, dry run by default, reporting old and
  new values per field. It refuses production accounts, like the other CDSP loader RPCs.
- Add a Node script that builds the profile, calls the RPC (dry run unless asked), and verifies the result through the VPR
  (`veteran.serviceConnected`, `scPercent`, rated disabilities, exposures).
- Apply to one patient first, then to the other loaded batch-1 patients. Add the service data to `docs/loaded-patients.md`.

## Capabilities

### New Capabilities
- `veteran-service-data`: derive a veteran service profile (eligibility, service connection and rated disabilities,
  military service, exposures, enrollment priority) for a loaded test patient and set it in VistA with a dry-run-first RPC.

### Modified Capabilities
- None. The Synthea load (`synthea-fhir-load`) is unchanged; this runs after a patient is loaded.

## Non-goals

- Changing the SYN loader or `ISI IMPORT PAT`; patching `SYNFPAT` (a loader reinstall would remove it and it only helps new loads).
- Means test, income, insurance, catastrophic disability, residential address and other registration data.
- Clinical accuracy of ratings beyond plausible test data: percentages come from a documented table, not from the VA
  Schedule for Rating Disabilities applied to each case.
- Production systems: the RPC is dev only.
- Rewriting notes already signed to mention service connection.

## Impact

- New routine in `cds-vista-routines` (branch `fhir-patient-import`), new RPC entries on dev station 500.
- New Node script and a rating/era mapping table in NotesGenerator; `summarize-patients.js` gains the service fields.
- Writes to the PATIENT file (#2) and its rated disabilities multiple, and to enrollment data, for test patients only.
- Field numbers, pointer files (#8 eligibility codes, #21 period of service, #23 branch, #31 disability conditions) and the
  enrollment storage must be confirmed on dev before writing.
