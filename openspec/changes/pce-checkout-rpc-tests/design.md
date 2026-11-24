# Design

## Context

See proposal.md for motivation. The station 500 source (`reference/PX-all.ro`, `OR-all.ro`, `SD-all.ro`) was read and the findings are in `reference/PXRPC_SAVE2_vs_ORWPCE_SAVE_Checkout_Research.md`. The relevant facts for test design:

- `CHECKOUT D/T` is set only in `DQSAVE1^ORWPCE1`, when `MDS` is true (parameter `ORWPCE DISABLE AUTO CHECKOUT` not set for the location, or a diagnosis, procedure or provider is present).
- The `PXRPC1` translator has no `VST` code for `CHECKOUT D/T` or for `ENCOUNTER,1,"APPT"`.
- `PXAIVST` copies `CHECKOUT D/T` to visit piece 18. `EVENT^PXKMAIN` then calls `EN^SDPCE` (not in `SD-all.ro`), and `UPD` clears the visit's check-out field afterward. So the appointment check-out is decided inside Scheduling.
- `SDES2 SET APPT CHECKOUT` (SD*5.3*945) requires a check-in, a non-future check-out time after the check-in, and an appointment that is not already checked out or cancelled. It writes 44.003 fields 303/304/306, 409.68 status 14, 409.84 field .14 and visit field .18.
- `SDEC CHECKOUT` needs the `SD SUPERVISOR` key and is not used here.
- Existing harness pieces: `callRpc(name, params, context, options)` in `src/vistaApiClient.js` (context per call), `src/appointmentCreator.js` (SDEC ARSET then APPADD), `scripts/appointments/test-walkin.js` (SDES2 namedArray context pattern under `SDESRPC`), `scripts/notes/link-note-visits.js` (reading PCE back).
- Contexts: SDES2 RPCs are in `SDESRPC`, SDEC RPCs in `SDECRPC`, `PXRPC SAVE2` and `ORWPCE SAVE` in `CDSP RPC CONTEXT` (also in `OR CPRS GUI CHART`), `DDR GETS ENTRY DATA` and `DDR LISTER` in `CDSP RPC CONTEXT`. These two are refused (403, gateway allowlist) for the PIV user but work through the service-account JWT as another DUZ (`callRpc` option `duz`, same path as note signing; DUZ from `PCE_TEST_DUZ` or `VISTA_AUTHOR_DUZ`).

## Goals / Non-Goals

**Goals:**
- Produce comparable before/after evidence for each RPC on the same kind of fixture.
- Keep each test independent, so one failure does not block the rest.
- Keep the first run read-only, so context and permissions problems appear before any write.

**Non-Goals:**
- A general PCE client library.
- Parsing every field of the four record types, only the check-out related ones.

## Decisions

1. **Scripts in NotesGenerator under `scripts/pce/`, one runner plus a shared library.** `scripts/pce/checkout-test.js` takes a test id (`T1`, `T1b`, ... or `all`) and `--apply`. Without `--apply` it prints the plan. Shared code in `scripts/pce/lib/` covers fixture, snapshot and reporting. Alternative: a new repo or `vista-patient-builder`. Rejected because the user asked to avoid adding to the new repo during the move.
2. **Read through DDR, not a new routine.** `DDR GETS ENTRY DATA` for 9000010, 409.68, 409.84 and 44.003 (subfile IENS `ien,apptdt,clinic,`), `DDR LISTER` to find the encounter for the visit. Alternative: a dev routine returning raw nodes. Rejected as unneeded, since DDR is already in the context. If DDR cannot read 44.003, fall back to `SDES GET APPT BY APPT IEN` style RPCs or read it via `^SC` using `DDR GET ENTRY DATA`. Resolve this in task 2.2 (read path) after task 1.1 confirms DDR access.
3. **Fixture built with the existing SDEC ARSET and APPADD flow, then check-in.** Check-in uses `SDEC CHECKIN` (context `SDECRPC`) or the SDES2 check-in RPC, whichever is in the available context. The exact check-in RPC is chosen in task 1.4. Alternative: `SDES2 CREATE WALKIN APPT`, which creates and checks in, but walk-ins differ from scheduled appointments and would weaken the comparison, so it is a fallback only.
4. **Appointment time is in the past (same day, earlier hour).** Check-out must not be in the future, and check-out must be after check-in. The fixture picks an appointment slot a few hours before now, checks in shortly after the slot start, and the check-out time is now.
5. **Per-test record is JSON: `{id, expectation, request, response, before, after, verdict}`.** Written to `logs/pce-checkout/<id>-<timestamp>.json`. A final summary table is printed.
6. **Parameter toggle uses `XPAR` RPCs in a try/finally.** Read the prior value, set `ORWPCE DISABLE AUTO CHECKOUT` for the clinic entity (`LOC`), run, restore in `finally`. The RPC and context for `XPAR` are confirmed in task 2.3 before T4 is built.
7. **`PCELIST` is built from the CPRS format.** `VST^DT^<fm date>`, `VST^PT^<dfn>`, `VST^HL^<clinic>`, `VST^ET^P`, then one `POV` and one `CPT` line. A real CPRS capture is preferred if available, otherwise the format from the `PXRPC1` source is used. T7 (`DATA2PCE` with a check-out date) is deferred.
8. **Dev-site guard.** The runner checks `VISTA_SITE_ID` and refuses unless it matches the station 500 dev configuration.

## Risks / Trade-offs

- [`ORWPCE SAVE` context is not available to the service account] → Task 1.3 finds the option and tests it with a read-only-safe call first. If it is not available, T3 to T6 are blocked and reported as blocked, not skipped silently. Do not add the RPC to a shared option without approval.
- [`SDPCE` source is not available, so the `ORWPCE`→appointment link cannot be predicted] → T3 is the first test that reveals it, and the research document is updated with the observed result.
- [Test appointments and PCE data accumulate on DFN 100969] → Every created IEN is logged. Existing leftovers (IENS 61664 to 61667, 61669, 61670) are not touched. Use `scripts/appointments/cancel-appointment.js` to clean up created appointments afterward.
- [Clinic 532 may not have open slots] → `verify-clinics.js` style availability check in the fixture, with overbook allowed only if the clinic permits it.
- [Visit check-out is cleared by `UPD^PXKMAIN`, so the visit snapshot alone can mislead] → Snapshots include 409.68 and 44.003 and the verdict uses those, not the visit field alone.
- [Setting the parameter affects other users of clinic 532] → Dev only, restore in `finally`, and record the prior value in the run log.

## Results (2026-11-24, staging station 500, DFN 100969, clinic 532)

The research document `reference/PXRPC_SAVE2_vs_ORWPCE_SAVE_Checkout_Research.md` and the run records in `logs/pce-checkout/` are git-ignored, so the outcome is kept here.

Tests that ran (each on its own fixture appointment, 66328 to 66342; 66328 was a failed first attempt):

| Test | What ran | Result |
|---|---|---|
| T1, T1b | `PXRPC SAVE2` with POV and CPT, checked in / not checked in | Filed, never checked out |
| T1c | `SAVE2` with POV, CPT, provider and SC | Filed cleanly (`1`), not checked out, `ACTION REQUIRED` |
| T3, T3b | `ORWPCE SAVE` header only / with POV, CPT, provider | Appointment checked out at the call time, `ACTION REQUIRED` stays |
| T3c | `ORWPCE SAVE` with POV, CPT, provider and SC | Checked out, `2 CHECKED OUT` |
| T6 | `SAVE2`, then header-only `ORWPCE SAVE` | No duplicate V POV or V CPT, checked out, `ACTION REQUIRED` stays |
| T6c | `SAVE2` with complete data, then check-out-only `ORWPCE SAVE` | Checked out, `2 CHECKED OUT`, no duplicates |
| T8, T8c | `SAVE2`, then `SDES2 SET APPT CHECKOUT` | Checked out, `ACT REQ/CHECKED OUT` |
| T9, T9c | `SDES2 SET APPT CHECKOUT`, then `SAVE2` (without / with provider and SC) | Checked out; with complete data `2 CHECKED OUT` |

Not run: T2 (dropped, `VST^VC` is required for a new visit), T4 and T5 (parameter toggle, deferred), T7 (superseded by the wrapper).

Conclusions:
1. `SAVE2` never sets the check-out. The "appointment attached" reason was not the cause.
2. `ACTION REQUIRED` clears only when the encounter data is complete (provider, POV, CPT, service-connected answers for the classifications the veteran is eligible for) and the check-out reaches PCE.
3. A check-out-only PCE call after a complete `SAVE2` clears it without duplicating data (T6c). `ORWPCE SAVE` is not needed for that.
4. `ORWPCE SAVE` is reachable under `CDSP RPC CONTEXT`. The CPRS team has not approved outside use of `ORWPCE SAVE` or `DQSAVE^ORWPCE1` (FORUM ICR text). Follow-up in tasks 7.1.
5. `SDES2 CHECKIN` and `SDES2 SET APPT CHECKOUT` are only in `SDESRPC`, so they are not an option where only `SDECRPC` is available.

Outcome: a CDSP wrapper RPC `CDSP PCE CHECKOUT` (`cds-vista-routines/CDSPPCE.int`, draft, doc in `cds-vista-routines/docs/CDSPPCE.md`) that calls `$$DATA2PCE^PXAPI` (ICR 1889) with the visit and `ENCOUNTER,1,"CHECKOUT D/T"`. Group 8 in tasks.md tracks what is left: the ICR 1889 subscription, install, and two untested cases (no check-in, second clinic).

ICR numbers: 7315 is the `PXRPC SAVE2` RPC (CDSP holds it), 6023 is the `PX SAVE DATA` RPC, 1889 is `$$DATA2PCE^PXAPI`.

How to run (all on staging station 500, as the service account through `VISTA_AUTHOR_DUZ`, or `PCE_TEST_DUZ`):
- `node scripts/pce/checkout-test.js <T1|T1b|T1c|T3|T3b|T3c|T6|T6c|T8|T8c|T9|T9c|all>` prints the plan only.
- Add `--apply` to write. Each test creates its own past appointment, one day per test from 2026-11-02; use `--day-offset N` (clinic 532 allows 4 overbooks per day, offsets 0 to 15 are used).
- The runner refuses any site other than 500 on a `staging.` host. Records go to `logs/pce-checkout/`.
- `node scripts/pce/probe.js` is a read-only check that `DDR` works as the service account.
