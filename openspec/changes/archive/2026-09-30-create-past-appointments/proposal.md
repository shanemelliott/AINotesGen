# Proposal

## Why

Task 3 verified that AI-generated notes work well with proper prompt engineering. Before writing notes to VistA TIU, past appointments must exist in the system. The patient VPR has 38 distinct order dates, but only 31 have existing appointments. The 7 missing dates (1980-06-20, 1986-06-06, 1987-03-12, 2016-10-28, 2025-10-04, 2025-10-21, 2026-04-19) need appointments created so TIU notes can be tied to them. This task automates appointment creation using the SDEC ARSET/APPADD RPC flow and PIV card authentication (patterns from single-appointment-api).

## What Changes

- **Appointment client module** (`src/appointmentClient.js`): Wraps SDEC ARSET (create request) and SDEC APPADD (create appointment) via Vista-API-X.
- **Token management** (`src/tokenService.js`): Reuses PIV card auth via token server (from single-appointment-api).
- **Dedupe logic** (`src/appointments.json`): Track created appointments (DFN, date, IEN) to support idempotent re-runs.
- **CLI** (`create-appointments.js`): Loop over missing dates; create ARSET request → APPADD appointment; log results.
- **Dry-run mode**: Test without actually creating appointments.
- **Error handling**: Retry on transient failures; log failures for manual review.

## Capabilities

### New Capabilities
- `appointment-creation`: Create past appointments in VistA for historical encounter dates using SDEC ARSET/APPADD; support idempotent re-runs via dedupe log; include PIV card auth via token server and Vista-API-X RPC invoke.

### Modified Capabilities
<!-- None -->

## Impact

- **Code added**: `src/appointmentClient.js`, `src/tokenService.js`, `create-appointments.js`, `src/appointments.json` (tracking log)
- **Dependencies**: axios, dotenv (already present)
- **Integration**: Reuses token server and Vista-API-X patterns from createAppts/single-appointment-api
- **Output**: `src/appointments.json` with created appointment records (DFN, date, requestIEN, appointmentIEN)
- **Idempotence**: Re-running on same dates uses cached IENs; doesn't create duplicates

## Non-goals

- Update existing appointments (only create missing ones)
- Check clinic availability or patient conflicts
- Implement SDEC CHECKIN/CHECKOUT (appointments created as requested, not kept; Task 5 will handle)
- Support multiple patients in one run (Task 6 will add patient loop)
