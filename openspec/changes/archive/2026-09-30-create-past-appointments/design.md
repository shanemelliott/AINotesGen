# Design

## Context

Current state:
- Patient 100965 has 38 distinct order dates (encounters) from 1980 to 2026.
- Of these, 31 already have visits/appointments in the VPR.
- 7 dates are missing appointments: 1980-06-20, 1986-06-06, 1987-03-12, 2016-10-28, 2025-10-04, 2025-10-21, 2026-04-19.
- Single-appointment-api (createAppts/) has working patterns for token server, SDEC ARSET/APPADD, and Vista-API-X integration.
- Task 3 (improve-note-quality) completed; notes are ready to be written once appointments exist.

Technical constraints:
- Reuse token server + Vista-API-X patterns from single-appointment-api (no direct broker access).
- ARSET returns requestIEN after record separator (ASCII 30, `\x1E`); must parse correctly.
- APPADD requires start datetime, end datetime (1 hour later), duration (60 min), resource IEN.
- Dates are VistA format (MM/DD/YYYY) or FileMan format (YYYMMDD.HHMM); convert as needed.

## Goals

1. Create all 7 missing appointments for DFN 100965 historical dates.
2. Support idempotent re-runs (track created appointments in JSON log).
3. Smoke test ARSET/APPADD flow on one date before batch.
4. Support dry-run mode for validation without side effects.
5. Log results with appointment IENs for later use (Task 5: TIU note writing).

## Non-Goals

- Check clinic availability or patient schedule conflicts.
- Implement appointment checkin/checkout (defer to Task 5).
- Support multiple patients in one run (defer to Task 6).
- Modify existing appointments.

## Decisions

### Decision 1: Reuse vistaApiClient.js pattern (not new wrapper)
**Choice**: Import callRpc from single-appointment-api/src/services/vistaApiClient.js directly (or copy to NotesGenerator/src/).

**Rationale**:
- vistaApiClient.js already handles token management, parameter normalization, error wrapping, and Vista-API-X endpoint.
- No need to duplicate token or RPC logic.
- Reduces scope and risk.

**Alternatives Considered**:
- Write new appointmentClient.js from scratch. Duplicates logic; harder to maintain.
- Inline RPC calls in create-appointments.js. Couples appointment logic to transport; harder to test.

### Decision 2: Track appointments in src/appointments.json (not environment state)
**Choice**: Maintain appointments.json with created records (dfn, date, requestIEN, appointmentIEN); read on startup to skip already-created dates.

**Rationale**:
- Idempotent: re-running same dates doesn't create duplicates.
- Audit trail: log shows what was created, when, and with which IENs.
- Portable: file is checked into git (or .gitignore + template) so anyone can see history.

**Alternatives Considered**:
- Query VistA to check if appointment exists. Adds complexity; RPC calls just to check.
- Env variable tracking. Not persistent; re-running clears history.

### Decision 3: Smoke test as separate script (test-create-appointment.js)
**Choice**: Create test-create-appointment.js that tests one date (2025-10-21) before running batch.

**Rationale**:
- Like Task 1 (test-ai.js) smoke test: verify RPC flow works before scaling up.
- Easy to debug if auth/config is wrong.
- Reusable for regression testing.

**Alternatives Considered**:
- Integrate smoke test into create-appointments.js --smoke-test flag. Mixes test and production logic.

### Decision 4: Clinic/resource IENs from environment with defaults
**Choice**: VISTA_CLINIC_IEN (default 23), VISTA_RESOURCE_IEN (default 2); log at startup.

**Rationale**:
- GENERAL MEDICINE clinic IEN 23, resource 2 are standard for test VistA.
- Environment variable allows override for different clinic/site without code change.
- Logging prevents silent mistakes (wrong IEN used without noticing).

### Decision 5: Parse requestIEN using regex, not string split
**Choice**: Use regex `/\x1E(\d+)/` to find requestIEN after record separator.

**Rationale**:
- ARSET response format varies; record separator is the reliable anchor.
- Regex is robust to whitespace/format variations.
- Same pattern as test-arset.js in single-appointment-api.

## Risks / Trade-offs

**Risk**: Token expiry during batch run (38+ appointments, ~5s per ARSET+APPADD = 3 min runtime).
- *Mitigation*: Token valid 1 hour; batch takes <5 min. Token refresh on expiry (getToken handles this).

**Risk**: ARSET/APPADD RPC fails transient (network hiccup, VistA overload).
- *Mitigation*: Log error, continue to next date. Manual retry for failed dates (re-run; idempotence skips successes).

**Risk**: Clinic/resource IEN wrong for new site/setup.
- *Mitigation*: Environment variable + startup log. User can verify before running.

**Risk**: Appointments created but log write fails (disk full, permission denied).
- *Mitigation*: Atomic write to temp file, then move. Will implement in Task 1.

## Migration Plan

No migration needed: appointments are new records, not updates.

**Deployment steps** (for this change):
1. Copy vistaApiClient.js + tokenService.js from single-appointment-api to NotesGenerator/src/ (or import).
2. Write test-create-appointment.js smoke test.
3. Write create-appointments.js batch processor.
4. Run smoke test on 2025-10-21 to verify auth/RPC flow.
5. Run batch on all 7 missing dates; verify src/appointments.json has 7 entries.
6. Validate appointment IENs are created in VistA (query via SDEC GET APPTS BY PATIENT).

## Open Questions

1. **Should clinic/resource be patient-specific?** (If different patients have different clinics)
   - *Answer deferred to Task 6*; assume all patients use GENERAL MEDICINE (clinic 23) for now.

2. **What if ARSET succeeds but APPADD fails for that request?**
   - *Answer deferred to Task 1*; treat as failure, log, continue. Manual cleanup in VistA if needed.

3. **Should we verify the created appointment exists in VistA before logging it?**
   - *Answer deferred to Task 1*; trust APPADD response. If needed, add verification step later.
