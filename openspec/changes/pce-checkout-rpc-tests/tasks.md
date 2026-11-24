# Tasks

## 1. Prerequisites and access

- [x] 1.1 Confirm `.env` points at the station 500 dev site and the service account can call `DDR GETS ENTRY DATA` under `CDSP RPC CONTEXT` (done 2026-11-24: staging host, site 500; PIV user gets 403 from the gateway, the service-account JWT as `VISTA_AUTHOR_DUZ` works; `DDR GETS ENTRY DATA` read visit 10353 of another patient, DFN 100969 visits are not findable by DDR LISTER xref `C`/`AA`, so snapshots start from the appointment IEN, see 2.2). Verify: a read of a visit returns fields.
- [x] 1.2 Confirm fixture clinic 532 (DEV PACT 4) is active, has a resource and slots (done 2026-11-24: clinic 532 is DEV PACT MD 4, ACTIVE, resource 185, provider PROVIDER,ONE (983), 30-minute slots, OverbooksPerDayMax 4, so past-day fixtures use overbook and at most 4 per day). Verify: `SDES GET CLINIC INFO2` for 532 returns a resource IEN, and a slots check for a past same-day window returns at least one slot (or overbook is allowed).
- [x] 1.3 Find the context option that holds `ORWPCE SAVE`, and confirm whether the service account or proxy user has it (done 2026-11-24: `ORWPCE SAVE` is reachable in both `CDSP RPC CONTEXT` and `OR CPRS GUI CHART`, as PIV user and as service account; an empty-PCELIST probe failed inside the routine with an expected `<SUBSCRIPT>SAVE+3^ORWPCE` and filed nothing; `PXRPC SAVE2` is reachable in `CDSP RPC CONTEXT` and `OR CPRS GUI CHART`; the context name `CDS RPC CONTEXT SAVE in ORCPRS GUI CHART` does not exist on the server). Verify: a harmless call under that context returns without a context error. If unavailable, record it in the research document and stop for a decision.
- [x] 1.4 Confirm exact RPC names and contexts for appointment check-in (SDEC CHECKIN or an SDES2 equivalent) and `SDES2 SET APPT CHECKOUT` (done 2026-11-24: `SDES2 CHECKIN` (params `APPOINTMENT IEN`, `CHECKIN DATE TIME` ISO, optional `PROVIDER`) and `SDES2 SET APPT CHECKOUT` (`APPT IEN`, `CHECKOUT DATE` ISO) both exist in `SDESRPC` and answer `Invalid Appointment ID.` for IEN 0; `SDES2 SET APPT CHECKIN` is the check-in steps RPC, not the check-in; `SDES2 CHECKIN APPT` does not exist). Verify: each is found in `SD-all.ro` or in the target context by a name lookup, and the choice is written in the research document.
- [x] 1.5 Obtain `SDPCE` source into `reference/` if exportable, or note it as unavailable (done 2026-11-24: not in `SD-all.ro` or `reference/`, listed as an open item in the research document section 10). Verify: the file exists, or the research document lists it as an open item.

## 2. Snapshot and fixture library

- [x] 2.1 Create `scripts/pce/lib/snapshot.js` that returns the visit, outpatient encounter, 44.003 and 409.84 check-out fields for an appointment through DDR (done 2026-11-24; the 409.68 and visit branches are untested until an appointment has an encounter, first exercised in 3.2). Verify: run against an existing appointment and compare field values with the same record read in VistA.
- [x] 2.2 Resolve how to read 44.003 (DDR subfile IENS or an alternative) and document it in the design (done 2026-11-24: `DDR LISTER` on file 44.003 with IENS `,apptDT,clinic,` finds the sub IEN by matching field .01 to the DFN, then `DDR GETS ENTRY DATA` with IENS `sub,apptDT,clinic,`; clinic comes from 409.84 .07 then 409.831 .04; visits are reached through 2.98 field 21 then 409.68 .05, not by patient lookup). Verify: check-in and check-out fields of an existing appointment are read correctly.
- [ ] 2.3 (deferred 2026-11-24: T4 and T5 no longer decide the recommendation, see design Results) Identify the `XPAR` RPCs and context for reading and setting `ORWPCE DISABLE AUTO CHECKOUT` on a clinic. Verify: reading the value for clinic 532 works, with no write yet.
- [x] 2.4 Create `scripts/pce/lib/fixture.js` that creates a past scheduled appointment for DFN 100969 in clinic 532 (one calendar day per test from 2026-11-02, overbook), optionally checks it in with `SDES2 CHECKIN`, and returns appointment IEN, date/time and visit IEN (done 2026-11-24; `--day-offset` picks the day because clinic 532 allows 4 overbooks per day). Verify: preview prints calls and writes nothing. A real run creates a checked-in appointment confirmed by a snapshot.
- [x] 2.5 Create `scripts/pce/lib/report.js` to write `logs/pce-checkout/<id>-<timestamp>.json` and print a summary table; created IENs are appended to `logs/pce-checkout/created-iens.jsonl` (done 2026-11-24). Verify: a dry run of a stub test writes a file with the documented fields.
- [x] 2.6 Add the dev-site guard (site 500 on a `staging.` host) and a no-secrets log check (done 2026-11-24; records hold RPC responses and snapshots, no tokens or codes). Verify: running with a different `VISTA_SITE_ID` exits before any RPC call, and no token or access code appears in the log files.

## 3. SAVE2 tests

- [ ] 3.1 Create `scripts/pce/checkout-test.js` runner with `--apply`, test id selection, and a preview default (runner done 2026-11-24, preview verified; still to do: register it in `scripts/steps.json`). Verify: `T1` without `--apply` prints the plan only.
- [x] 3.2 Implement T1 (SAVE2 with POV and CPT on a checked-in appointment) and T1b (same, no check-in) with `PCELIST` built per the design (done 2026-11-24; T1 appt 66329 and T1b appt 66330 both filed the data and left the appointment not checked out; a first T1 attempt, appt 66328, failed with `Service Category is a required field`, so `VST^VC^A` is now always sent). Verify: run both, each record has response plus before and after snapshots, and the verdict compares against the stated expectation.
- [x] 3.3 Implement T2 (T1 plus a `VC` line) (dropped 2026-11-24: a new visit cannot be filed without `VST^VC`, so every SAVE2 test sends it and T2 has nothing to compare). Verify: record exists and the difference from T1 is reported.
- [x] 3.4 Update the research document with the T1, T1b and T2 results (done 2026-11-24, section 11). Verify: the "Appointment attached" claim is marked confirmed or refuted with test ids.

## 4. ORWPCE SAVE tests

- [x] 4.1 Implement T3 (header-only `ORWPCE SAVE`, auto check-out enabled) (done 2026-11-24, appt 66331, plus T3b with POV, CPT and provider, appt 66335). Verify: record shows whether `CHECKOUT D/T` was set and whether 44.003 and 409.68 changed.
- [ ] 4.2 (deferred 2026-11-24, depends on 2.3) Implement the parameter toggle with restore in `finally`, then T4 (auto check-out disabled) and T5 (T4 plus a POV). Verify: after each run the parameter reads its original value, even when a test is forced to fail.
- [x] 4.3 Implement T6 (SAVE2 then ORWPCE SAVE on the same visit) (done 2026-11-24, appt 66336, visit 17011: V POV 1 and V CPT 1 before and after the ORWPCE SAVE, so no duplicates). Verify: record lists V POV and V CPT entries before and after, showing duplicates or not, and the package and source values.
- [x] 4.4 Update the research document with T3 to T6 (done 2026-11-24, sections 11 and the T6c table; T4 and T5 not run). Verify: conclusions 3 and 4 in the research document are marked confirmed or revised.

## 5. Scheduling check-out tests

- [x] 5.1 Implement T8 (SAVE2 then `SDES2 SET APPT CHECKOUT`) using `SDESRPC` and the namedArray context pattern from `test-walkin.js` (done 2026-11-24, appt 66333). Verify: record shows 44.003 fields 303/304/306, 409.68 status and 409.84 field .14 set.
- [x] 5.2 Implement T9 (`SDES2 SET APPT CHECKOUT` then SAVE2) (done 2026-11-24, appt 66334). Verify: record shows the check-out remains set and the PCE data is filed.
- [x] 5.3 Update the research document with T8 and T9 and a recommendation among: ORWPCE SAVE, SDES2 SET APPT CHECKOUT, a new PCE RPC (done 2026-11-24, section 11; recommendation is provisional until the status question there is resolved). Verify: section 9 of the research document is revised.

- [x] 5.4 Add SC-classification variants T1c, T3c, T8c and T9c (provider plus `VST^SC^1`, `AO^0`, `IR^0`, `EC^0`) to see what clears `ACTION REQUIRED` (done 2026-11-24: T3c, an `ORWPCE SAVE` full save, and T9c, `SDES2 SET APPT CHECKOUT` then `SAVE2` full, both reach `2 CHECKED OUT`; T1c and T8c do not). Verify: records for the four tests exist in `logs/pce-checkout/` and research document section 11 lists them.

## 6. Cleanup and wrap-up

- [ ] 6.1 (not done 2026-11-24: 15 test appointments 66328 to 66342 and their visits are still on DFN 100969, IENs are in `logs/pce-checkout/created-iens.jsonl`, which is git-ignored) Produce a list of all appointment and visit IEN created across runs, and cancel the created appointments with `scripts/appointments/cancel-appointment.js` where possible. Verify: the list is in `logs/pce-checkout/` and the cancel results are recorded. Pre-existing leftover appointments are untouched.
- [ ] 6.2 (partly done 2026-11-24: the how-to-run is in design.md Results; the wrapper doc is `cds-vista-routines/docs/CDSPPCE.md`; T7 is superseded by group 8) Document how to run the tests in `docs/` (one short file) and add T7 as optional follow-up if a PCE-owned wrapper is still wanted. Verify: following the doc from a clean checkout reproduces T1 in preview mode.

## 7. Team follow-ups (owner: Shane, not code)

- [ ] 7.1 Check the RPC multiple of the `CDSP RPC CONTEXT` option for `ORWPCE SAVE` and talk to the team about removing it from that context. Verify: after removal, repeat the empty-`PCELIST` probe of `ORWPCE SAVE` under `CDSP RPC CONTEXT` and record that it no longer reaches `SAVE^ORWPCE`.
- [ ] 7.2 Check FORUM that patch 4 is present and installed on station 500 (confirm which patch this is). Verify: the patch status is written in research document section 10.

## 8. CDSPPCE check-out wrapper (draft in `cds-vista-routines`)

- [x] 8.1 Draft `CDSPPCE.int` (`CHECKOUT^CDSPPCE`, proposed RPC `CDSP PCE CHECKOUT`): validate the visit, then `$$DATA2PCE^PXAPI` with `ENCOUNTER,1,"CHECKOUT D/T"` only (done 2026-11-24, not compiled or installed). Verify: the file exists in `cds-vista-routines` and the flow matches design.md.
- [x] 8.2 Write `cds-vista-routines/docs/CDSPPCE.md` for the development team with the flow and use of `PXRPC SAVE2` plus `CDSP PCE CHECKOUT` instead of `ORWPCE SAVE` (done 2026-11-24). Verify: the README links to it.
- [ ] 8.3 Obtain the CDSP subscription to ICR 1889 (`$$DATA2PCE^PXAPI`) and confirm the ICRs for `$$PKG2IEN^VSIT` and the V PROVIDER, V POV and V CPT `AD` cross-reference reads (owner: Shane). Verify: ICR numbers and status written in `CDSPPCE.int` header and `CDSPPCE.md`.
- [ ] 8.4 Review `CDSPPCE.int`, compile it on dev, register `CDSP PCE CHECKOUT` in `CDSP RPC CONTEXT`, run a dry run and a real run on a fresh appointment from `checkout-test.js`. Verify: the result is `1^visit^check-out time`, the encounter shows `2 CHECKED OUT` and V POV and V CPT counts are unchanged.
- [ ] 8.5 Test the wrapper on an appointment that was never checked in, and on a second clinic. Verify: results recorded in `CDSPPCE.md` Open items.
- [ ] 8.6 Test the no-new-code path: `SDEC CHECKIN` and `SDEC CHECKOUT` (needs the `SD SUPERVISOR` key) followed by `PXRPC SAVE2` with complete data (called T10 in the plan, not built). Verify: record shows whether the service account holds the key and whether the encounter reaches `2 CHECKED OUT`.
