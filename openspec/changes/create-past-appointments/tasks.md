# Tasks

## Group 1: Setup & Infrastructure (2 tasks)

### [x] Task 1.1: Copy or import vistaApiClient.js and tokenService.js from single-appointment-api
- Copy `createAppts/single-appointment-api/src/services/vistaApiClient.js` to `src/vistaApiClient.js` (or create import alias)
- Copy `createAppts/single-appointment-api/src/services/tokenService.js` to `src/tokenService.js` (or import alias)
- Verify imports work: `import { callRpc } from './vistaApiClient.js'` and `import { getToken, getDuzForSite } from './tokenService.js'`
- No modifications to vistaApiClient/tokenService needed (reuse as-is)

### [x] Task 1.2: Create src/appointments.json template (empty array)
- Create empty file: `src/appointments.json` with content `[]`
- This will hold created appointment records (one per successful ARSET+APPADD pair)
- Add to .gitignore if not already there (it will grow with each run)

---

## Group 2: Smoke Test (2 tasks)

### [x] Task 2.1: Write test-create-appointment.js smoke test
**Purpose**: Verify one ARSET + APPADD call works (2025-10-21, DFN 100965).

**Implementation**:
- Accept CLI args: `--dfn 100965 --date 2025-10-21 --dry-run` (optional)
- Load env vars from .env
- Call `callRpc('SDEC ARSET', [...params...], 'SDECRPC')`
  - Params: patient DFN, clinic IEN, clinic name, desired date (MM/DD/YYYY), and standard request metadata
  - See test-arset.js in single-appointment-api for param structure (29-param ARSET call)
- Parse response to extract requestIEN using regex `/\x1E(\d+)/`
- Call `callRpc('SDEC APPADD', [...params...], 'SDECRPC')`
  - Params: start datetime, end datetime (1 hour later), patient DFN, resource IEN, duration 60 min
  - See test-appadd.js in single-appointment-api for param structure
- Parse response to extract appointmentIEN
- Log: HTTP status, latency, requestIEN, appointmentIEN
- If `--dry-run`: show params and exit 0 without calling RPC
- Exit 0 on success, exit 1 on failure (config missing, RPC error)

**Success Criteria**:
- `node test-create-appointment.js --date 2025-10-21 --dry-run` shows ARSET/APPADD params
- `node test-create-appointment.js --date 2025-10-21` (with valid .env) creates appointment, prints requestIEN + appointmentIEN + latency
- Exits with 0 on success, logs error message on failure

### [x] Task 2.2: Document smoke test output and verify with createAppts reference
- Run smoke test against staging VistA (using valid TOKEN_SERVER_URL, VISTA_API_BASE_URL, VISTA_API_KEY)
- Verify requestIEN and appointmentIEN are numeric IENs (e.g., "12345")
- Compare response format and latency with test-appadd.js run time (~3-5s expected)
- Document in TASK-4-SMOKE-TEST.md: date tested, IENs created, latency, status
- Verify appointment exists in VistA by visual inspection or follow-up query (if needed)

---

## Group 3: Batch Appointment Creation (3 tasks)

### [x] Task 3.1: Write create-appointments.js batch processor
**Purpose**: Loop over 7 missing dates; create ARSET+APPADD for each; log to src/appointments.json.

**Implementation**:
- Accept CLI args: `--dfn 100965 --dates "1980-06-20,1986-06-06,...,2026-04-19"` or hardcode 7 dates
- Load src/appointments.json; build Map of (date) → appointmentIEN for dedup
- Loop over each date:
  - If date already in map: log "appointment already created for {date}" and skip
  - Else: call ARSET → parse requestIEN → call APPADD → parse appointmentIEN
  - On success: append {dfn, date, requestIEN, appointmentIEN, clinicIEN, resourceIEN, createdAt} to array
  - On error (RPC failure, timeout, missing DUZ): log error with date/RPC name; add to failures array; continue
- After loop: write updated array to src/appointments.json (atomic write)
- Print summary: "{N} appointments created, {S} skipped (already exist), {F} failed"
- Exit 0 if created > 0 or all skipped; exit 1 if all failed

**Success Criteria**:
- `node create-appointments.js` (with 7 missing dates, valid .env) creates appointments for each date
- src/appointments.json has 7 entries with dfn, date, requestIEN, appointmentIEN, createdAt
- Re-running same dates skips already-created ones (idempotence)
- Summary output shows "7 appointments created, 0 skipped, 0 failed"

### [x] Task 3.2: Add --dry-run mode to create-appointments.js
- Accept `--dry-run` flag
- When set: print what would be created (dates, clinic IEN, resource IEN, ARSET/APPADD params) without calling RPC
- Do NOT update src/appointments.json
- Exit 0
- **Success Criteria**: `node create-appointments.js --dry-run` shows 7 dates, clinic 23, resource 2, and param structure

### [x] Task 3.3: Test batch run on actual VistA (all 7 dates)
- Run `node create-appointments.js` with valid .env and 7 missing dates
- Verify src/appointments.json has 7 entries (one per date)
- Verify each entry has valid numeric requestIEN and appointmentIEN
- Re-run and verify idempotence (0 created, 7 skipped)
- Run with `--dry-run` and verify output format and no RPC calls made
- Document results in TASK-4-IMPLEMENTATION-RESULTS.md: dates created, IENs, latency per date, total time

---

## Group 4: Validation & Documentation (2 tasks)

### [x] Task 4.1: Verify appointments in VistA (visual or RPC query)
- Check VistA SDEC interface or appointment list for DFN 100965 to confirm 7 new appointments are visible
- Verify each appointment is on correct date and clinic (GENERAL MEDICINE)
- Verify appointment state is correct (e.g., "requested" or "scheduled" per SDEC rules)
- Log findings in TASK-4-IMPLEMENTATION-RESULTS.md

### [x] Task 4.2: Update PROJECT-PLAN.md and document Task 4 as DONE
- Update PROJECT-PLAN.md: Task 4 status to DONE with summary:
  - 7 appointments created for missing dates (1980-06-20, 1986-06-06, 1987-03-12, 2016-10-28, 2025-10-04, 2025-10-21, 2026-04-19)
  - Smoke test passed (test-create-appointment.js, 2025-10-21, latency ~3-5s)
  - Batch creation successful (create-appointments.js, idempotent)
  - Dedup log: src/appointments.json with 7 entries
- Create TASK-4-IMPLEMENTATION-RESULTS.md with detailed results (before/after appointment count, IENs, latency, validation)

---

## Group 5: Code Quality & Testing (2 tasks)

### [x] Task 5.1: Add error handling and logging to test-create-appointment.js
- Catch network errors, timeouts, malformed responses
- Log with context: HTTP status, upstream error message (if available), RPC name, param count
- Provide helpful error messages:
  - If TOKEN_SERVER_URL missing: "TOKEN_SERVER_URL is not configured in .env"
  - If ARSET fails with 500: "SDEC ARSET failed (500): {error from VistA}"
  - If requestIEN parse fails: "Could not parse requestIEN from ARSET response: {response snippet}"
- Exit 1 with error message on failure
- **Success Criteria**: Running with incomplete .env shows clear error message; running with VistA error shows upstream details

### [x] Task 5.2: Add error handling and logging to create-appointments.js
- Log each date as it starts and completes (for progress visibility)
- On RPC error: log with date, RPC name, status, upstream error; mark as failed; continue
- On write error (src/appointments.json): log and fail with helpful message
- Final summary includes count of each outcome: created, skipped, failed
- If any failed: print "Failed dates: [date1, date2, ...] - re-run after checking logs"
- **Success Criteria**: Running with 1 transient failure (e.g., mock 502) logs error and continues; summary shows 6 created, 1 failed

---

## Group 6: Integration & Handoff (1 task)

### [x] Task 6.1: Prepare for Task 5 (TIU Note Writing)
- Verify src/appointments.json has all 7 appointment IENs
- Pass appointmentIEN to Task 5 note-writing module (src/notesClient.js will use it in TIU CREATE RECORD call)
- Document appointment IEN schema in TASK-4-IMPLEMENTATION-RESULTS.md: field name, format, usage in TIU CREATE
- Ready for Task 5: "Given an encounter date, look up appointmentIEN from appointments.json, use in TIU CREATE RECORD RPC"
- **Success Criteria**: Task 5 implementation can import appointments.json and find IEN by date

---

## Summary

- **Group 1 (Setup)**: 2 tasks → Copy RPC clients, create empty log
- **Group 2 (Smoke Test)**: 2 tasks → Smoke test + verification (1 appointment on 2025-10-21)
- **Group 3 (Batch)**: 3 tasks → Batch creation + dry-run + full VistA test (7 dates)
- **Group 4 (Validation)**: 2 tasks → VistA verification + documentation
- **Group 5 (Quality)**: 2 tasks → Error handling + logging for both scripts
- **Group 6 (Handoff)**: 1 task → Prepare appointments.json for Task 5

**Total: 12 tasks**

**Estimated effort**: 3-4 hours (including smoke test wait time, VistA testing, and documentation)
