# Proposal

## Why

A consuming team files diagnoses and procedures with `PXRPC SAVE2` and asks for `ORWPCE SAVE` only to set the encounter check-out, claiming `SAVE2` "will not checkout 100%" when an appointment is attached. The CPRS team does not want outside teams using `ORWPCE SAVE`. `reference/PXRPC_SAVE2_vs_ORWPCE_SAVE_Checkout_Research.md` reached its conclusions by reading source only. Nothing has been run on station 500, and the stated reason is unconfirmed. We need test evidence before recommending an RPC.

## What Changes

- Add a dev-only test harness in NotesGenerator that, on station 500 dev, creates a scheduled appointment, checks it in, files encounter data through the RPC under test, and snapshots the result before and after.
- Run a numbered test matrix (T1 to T9) comparing `PXRPC SAVE2`, `ORWPCE SAVE` and the scheduling check-out RPC `SDES2 SET APPT CHECKOUT` against the same fixture.
- Snapshot the visit (9000010), outpatient encounter (409.68), clinic appointment (44.003) and SDEC appointment (409.84) through `DDR GETS ENTRY DATA` and `DDR LISTER`, so no new VistA routine is needed for reads.
- Save each run as JSON under `logs/pce-checkout/` and write a findings update to the research document.
- Optional: a dev-only wrapper routine in `cds-vista-routines` to call `DATA2PCE^PXAI` with `CHECKOUT D/T` (test T7). Only built if T1 to T9 leave it relevant.

## Capabilities

### New Capabilities
- `pce-checkout-testing`: Repeatable dev-only tests that show which RPCs set the appointment and encounter check-out, and under which preconditions.

### Modified Capabilities

None.

## Impact

- New scripts under `scripts/pce/` registered in `scripts/steps.json`, using the existing `src/vistaApiClient.js` `callRpc` with a per-call context.
- Writes to station 500 dev only: test appointments, check-ins, check-outs, PCE data on the chosen patient, and a temporary change to parameter `ORWPCE DISABLE AUTO CHECKOUT` on one clinic (reset afterward).
- Contexts needed: `SDESRPC` (SDES2 RPCs), `SDECRPC` (SDEC RPCs), `CDSP RPC CONTEXT` (`PXRPC SAVE2`, `ORWPCE SAVE`, and `DDR` reads as the service-account user).
- Fixture: DFN 100969, clinic IEN 532 (DEV PACT 4).
- The harness stays in NotesGenerator for now, not `vista-patient-builder`, to avoid adding to that repo while `move-to-vista-patient-builder` is open.

## Non-goals

- Changing any VistA routine behavior or any RPC definition on station 500.
- Adding `ORWPCE SAVE` or any other RPC to a production context option.
- Building a production check-out service or a new PCE RPC (this change only informs that decision).
- Running against any station other than 500 dev.
- Covering inpatient (`H`) encounters or immunization-reading paths.
