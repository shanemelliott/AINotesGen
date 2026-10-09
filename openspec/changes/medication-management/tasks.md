# Tasks

## Group 1: Research & Planning (3 tasks)

### [ ] Task 1.0: Trace the `PSO LM BACKDOOR ORDERS` menu on dev
- Known: type action, package OUTPATIENT PHARMACY, menu text "Patient Prescription Processing", entry action `D ^PSORX1`
- Source is in `reference/PSO-all.ro` (all PSO routines, includes `PSODIR2`, `PSOUTIL`, `PSODISPS`, `PSOSUPOE`)
- Export `PSORX1` and the routines it calls (PSO* source is not in the workspace) so they can be read here; add them to `cds-vista-routines` only if we wrap them
- Look up the menu in the dev account (OPTION and PROTOCOL files) and list its actions (new order, renew, refill/dispense, edit dates) with the routine each action runs
- Walk through a renew, a refill and a backdated refill by hand and note each prompt, the fields written (File #52 and its REFILL multiple) and the routines that write them
- Decide which of those routines can be called directly from a CDSP wrapper versus needing an RPC
- **Success Criteria**: `docs/PHARMACY-RPCS.md` has a "Backdoor orders" section naming the routines, prompts and fields for each of the three operations

### [ ] Task 1.1: Document SYN loader pharmacy routines and RPC calls
- Study VistA-FHIR-Data-Loader `src/` routines:
  - **SYNFMED.m**: Main medication engine; extract `WRITERXRXN`, `WRITERXPS`, drug lookup logic
  - **SYNFMED2.m**: FHIR import entry point (`importMeds`); understand FHIR→RxNorm→drug flow
  - **SYNINIT.m**: Pharmacy setup (`PHARM`, `PHRSS`, `PSOSITE`); extract pharmacist/site creation
  - **SYNFALG2.m**: Medication allergy handling (`ADDMEDADR`)
- Extract pharmacy-related RPC calls from loader code
- Document in `docs/PHARMACY-RPCS.md`:
  - Routine names, entry points, purpose (e.g., `WRITERXRXN^SYNFMED`: create Rx from RxNorm)
  - Associated RPC calls (if any) and their signatures
  - Error codes and handling
  - Example format from `docs/APPOINTMENT-RPCS.md`
- List any `patches/LOADER-CHANGES.md` pharmacy-related patches (RXNBADDATA, VAP2MED guard, etc.)
- **Success Criteria**: `docs/PHARMACY-RPCS.md` documents ≥5 routine/RPC entries with signatures and examples

### [ ] Task 1.2: Research VistA pharmacy RPC contract for renew and dispense
- On dev VistA: Find which RPC renews a prescription (adds refills)
  - Check PHARM*, PSO*, or related menus for available RPCs
  - Test against DFN 100969 (existing test patient)
- Test dispense RPC:
  - Does `PHARM FILL PRESCRIPTION` or equivalent support past dates?
  - Does it auto-decrement refills, or is a separate call needed?
  - What are error codes for: 0 refills, expired Rx, invalid date?
- Document findings in `docs/PHARMACY-RPCS.md` (add a "Research Findings" section)
- **Success Criteria**: Findings documented; at least one successful test call on dev (even if manual via menu)

### [ ] Task 1.3: Optional: Extract pharmacy routines to cds-vista-routines
- Create wrapper routine(s) in `cds-vista-routines/` to mirror/document pharmacy operations
  - Option A: **CDSPMED.int** — wrapper for SYNFMED medication operations (WRITERXRXN, WRITERXPS, drug lookups)
  - Option B: **CDSPRX.int** — wrapper for Rx renew/dispense operations (TBD from research)
  - Document entry points, purpose, and link to SYNFMED source
- This mirrors the approach used for encounters (CDSPENC → SYNFENC) and FHIR loading (CDSPFHIR → SYNFHIR)
- **Success Criteria**: At least one wrapper routine created and compiled on dev; documented in `README.md`
- **Status**: Optional; proceed only if time permits and provides value for future extensions

### [ ] Task 1.4: Design fallback for past-date dispense
- If dispense RPC does not accept past dates:
  - Find the RPC/method to edit a dispense date after creation
  - Document the two-call flow: dispense today, then edit date
  - Estimate complexity (1 = trivial edit RPC exists; 3 = requires menu workflow or complex logic)
- If dispense RPC does support past dates, document that directly
- Update `design.md` with the confirmed past-date strategy
- **Success Criteria**: `design.md` includes a "Past-Date Implementation" section with the chosen flow

---

### [ ] Task 1.5: Test `FILLRX^CDSPRX` on Kim439 (DFN 100973)
- Draft written 2026-10-09 in `cds-vista-routines/CDSPRX.int` (`FILLRX`, dry run unless `COMMIT=1`); compile on dev and register RPC `CDSP UTIL RX FILL` (tag `FILLRX`, routine `CDSPRX`, return type ARRAY, context `CDSP RPC UTILS`)
- Existing meds (30-day supply, 1 refill allowed, original fill only), from `100973.json`:
  - Lisinopril Rx 100003607, IEN 407290, issued 2025-10-17, expires 2026-10-18, status active
  - Simvastatin Rx 100003608, IEN 407291, issued 2025-10-18, expires 2026-10-19, status active
- Steps: dry run with fill date 2025-11-20 (3 days late) and compare `early`, `refillNumber`, `refillsRemaining`; commit; re-pull VPR and check the refill fill date and release date; try a second fill on the same Rx (expect "No refills remaining") and one dated before the first (expect rejection)
- Note: the original fills of the loaded Rxs show release date 2026-10-08 (the load date), so their release dates are not backdated; decide whether to fix them with the same `FILE^DIE` edit
- **Success Criteria**: refill appears in VPR with the backdated fill date and release date; refills remaining drops by 1

## Pending (as of 2026-10-09)

- [ ] Compile `CDSPRX` on dev; register RPC `CDSP UTIL RX FILL` (tag `FILLRX`, routine `CDSPRX`, ARRAY, context `CDSP RPC UTILS`; literal params DFN, RXIEN, FILLDATE, RELEASED, COMMIT)
- [ ] Register `CDSP UTIL ADD RX` (tag `ADDRX`; params DFN, RXNCUI, RXDATE, SIG, QTY, DAYS, REFILLS, PROV, CLINIC); `ADDRX` has never been run
- [ ] Write `fill-rx.js` (dry run by default, `--commit` to write) and `add-rx.js`; run the Task 1.5 dry run on DFN 100973, Rx IEN 407290
- [ ] Answer on dev: which date is edited after a backdated dispense; Renew vs Copy for renewals
- [ ] Read `PSORENW0`, `PSORENW1`, `PSORN52A` in `reference/PSO-all.ro` to see what a renew copies and prompts for (renew creates a new Rx), then draft a `RENEWRX` entry point
- [ ] Story 1 test: `ADDRX` a new Rx on DFN 100973 (90 days, qty 90, 3 refills, issue date about a year back, RxNorm from the patient's bundle, check with `preflight-vista.js`), then `FILLRX` oldest first with one or two late fills
- [ ] Correct spec requirement 2 in `specs/pharmacy-operations/spec.md`: a renew creates a new Rx, it does not add refills to the old one
- [ ] Decide whether to backdate the release date of the original fills of loaded Rxs (all show the 2026-10-08 load date)

## Group 2: Core Implementation (5 tasks)

### [ ] Task 2.1: Write src/pharmClient.js wrapper
- Create a reusable pharmacy RPC client (similar to `src/notesClient.js`)
- Export functions:
  - `addMedication(dfn, drugIen, route, qty, refills, schedule, dryRun)`
  - `renewRx(dfn, rxIen, refills, dryRun)`
  - `dispenseRx(dfn, rxIen, qty, date, dryRun)` — with fallback logic for past-date if needed
- Wrap each RPC call with:
  - Error handling (translate VistA error codes to descriptive messages)
  - Logging (stdout for success, stderr for errors)
  - Dry-run bypass (log intent, return mock response)
- **Success Criteria**: All three functions callable without error; dry-run returns early with log

### [ ] Task 2.2: Write renew-rx.js CLI
- Args: `--dfn <dfn> --rx-ien <ien> --refills <n> [--dry-run]`
- Call `renewRx()` from `pharmClient.js`
- On success: log refill count before/after
- On error: print to stderr and exit non-zero
- Smoke test:
  - `node renew-rx.js --dfn 100969 --rx-ien <test-ien> --refills 3 --dry-run` (prints intent, exits 0)
  - Note the test Rx IEN from patient inquiry after loading
- **Success Criteria**: CLI parses args correctly; dry-run works; smoke test passes

### [ ] Task 2.3: Write dispense-rx.js CLI
- Args: `--dfn <dfn> --rx-ien <ien> --qty <qty> [--date <YYYY-MM-DD>] [--dry-run]`
- Default date to today if omitted
- Call `dispenseRx()` from `pharmClient.js`
- On success: log dispense details (date, qty, refills remaining)
- On error: print to stderr and exit non-zero
- Smoke test:
  - `node dispense-rx.js --dfn 100969 --rx-ien <test-ien> --qty 30 --dry-run` (prints intent, exits 0)
  - `node dispense-rx.js --dfn 100969 --rx-ien <test-ien> --qty 30 --date 2025-10-04 --dry-run` (same for past date)
- **Success Criteria**: CLI parses args correctly; dry-run works; smoke tests pass

### [ ] Task 2.4: Write optional add-med.js CLI (experimental)
- Args: `--dfn <dfn> --drug-ien <ien> --route <route> --qty <qty> --refills <n> [--dry-run]`
- Reuse SYN loader pattern for ADDRX
- Useful for manually adding a single med to a patient (not loaded by Synthea)
- Smoke test:
  - `node add-med.js --dfn 100969 --drug-ien 2 --route 1 --qty 30 --refills 3 --dry-run` (IV saline)
- **Success Criteria**: CLI parses args; dry-run works; documented as experimental

### [ ] Task 2.5: Integrate into existing pipeline (documentation + example)
- Document the medication workflow in `README.md#pipeline`:
  - After `create-appointments.js`, optionally run renew/dispense if testing medication-heavy notes
  - Link to `docs/PHARMACY-RPCS.md` for RPC reference
  - Show examples: renew all test Rxs, dispense before note generation
- Write an example script `example-med-workflow.sh` (or `.ps1`):
  - Load a patient → create appointments → renew 3 Rxs → dispense 2 → generate notes
  - With `--dry-run` so it doesn't write
- **Success Criteria**: `README.md` and example script document the workflow; script runs without error

---

## Group 3: Validation & Testing (2 tasks)

### [ ] Task 3.1: End-to-end test on dev with DFN 100969
- Renew one Rx (add 5 refills)
  - Check patient inquiry before and after; verify refill count incremented
- Dispense that Rx on a past date (2025-10-04)
  - Check dispense appears in patient inquiry on the correct date
  - Verify refills decremented (if applicable)
- Dispense again on a different past date (2025-10-11)
  - Verify second dispense recorded and refills further decremented
- Document results in `TASK-<n>-IMPLEMENTATION-RESULTS.md` (counts, any errors, fallbacks used)
- **Success Criteria**: At least 2 successful dispenses on past dates; refill count consistent with operations

### [ ] Task 3.2: Update PROJECT-PLAN.md
- Add row to status table:
  - **Medication management** (Task <n>): Renew, dispense, add-med CLIs; past-date support; integration with notes pipeline
- Link to `docs/PHARMACY-RPCS.md` and OpenSpec change
- **Success Criteria**: `PROJECT-PLAN.md` reflects medication tools as complete and integrated

---

## Summary

- **Group 1 (Research)**: 4 tasks — understand SYN and VistA pharmacy routines/RPCs, optional wrapper extraction
- **Group 2 (Implementation)**: 5 tasks — write `pharmClient.js` and three CLIs
- **Group 3 (Validation)**: 2 tasks — end-to-end test and documentation

**Total: 11 tasks** (or 10 if Task 1.3 skipped)

**Dependencies:** Group 1 must complete before Group 2; Group 2 before Group 3.
