# Proposal

## Why

Every visit the SYN loader filed landed at GENERAL MEDICINE, and appointment creation used one fixed clinic, so synthetic patients looked like primary-care-only patients. Test data needs emergency department and specialty visits, each with an appointment in the matching clinic.

## What Changes

- The loader picks a visit's clinic from the Synthea encounter class, type and reason (requirement added to `synthea-fhir-load` when `synthea-fhir-rpc-loader` was archived).
- Appointment creation takes the clinic and its SDEC resource from the encounter's visit location through a lookup table, with a default clinic for anything not in the table.
- Encounter extraction reports the visit's hospital location as the encounter clinic, instead of the location of the day's earliest order.
- Scripts and docs to find and check clinic and resource IENs and clinic availability.

## Capabilities

### New Capabilities

### Modified Capabilities
- `appointment-creation`: the clinic and resource come from the encounter's visit location, not a single configured clinic.
- `encounter-extraction`: an encounter's clinic comes from the day's visit location.

## Impact

- `create-appointments.js`, `src/encounters.js`, new `src/clinic-lookup.json`.
- New scripts `fetch-clinics.js`, `verify-clinics.js` and `test-walkin.js`; docs `docs/CLINIC-AVAILABILITY.md` and `docs/APPOINTMENT-RPCS.md`.
- Server side (cds-vista-routines): `CDSPENC.int` plus one added line in `SYNFENC` (`patches/synfenc-location.txt`).
- Existing patients keep working: visits at GENERAL MEDICINE still get appointments in the default clinic (`DEV PACT MD 4`).
