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

### [x] Task 1.6: Why every loaded med gets 1 refill, and why lisinopril is listed many times
- Observed 2026-10-13: every Rx the loader files has `# OF REFILLS` 1, 30-day supply, quantity 30 (for example Kim439 DFN 100973 and HARRIS,SHEBA DFN 237 loaded Rxs from the loader; `WRITERXPS^SYNFMED` hard-codes refills 1, days 30, qty 30), and Kim439 has 27 separate lisinopril Rxs from 2014 to 2026
- Read `SYNFMED2` (`importMeds`) and `WRITERXPS^SYNFMED`: how each Synthea `MedicationRequest` maps to one Rx, whether `dispenseRequest` (quantity, days supply, refills) or `dosageInstruction` is ignored, and whether the number of requests per drug comes from Synthea (a new request per refill period) or from the loader
- Check the Synthea bundle for Kim439 (`synthea/output/batch-1/trimmed/`): count lisinopril `MedicationRequest` resources, their `authoredOn` dates and `dispenseRequest`
- Decide, and record in `patches/LOADER-CHANGES.md` if the fork changes: take quantity, days supply, refills and sig from the request; or collapse repeated requests for the same drug into one Rx with refills and fills (which is what a real history looks like and what `FILLRX` needs)
- **Success Criteria**: a short written finding (cause for the 1-refill default, cause for the repeated Rxs, and a recommended fix or a decision to leave it) in this file
- **Finding (2026-10-13)**:
  - *One refill, 30 days, qty 30, "ONE TABLET DAILY":* `wsIntakeMeds^SYNFMED2` calls `$$WRITERXRXN^SYNFMED(dfn,rxnorm,fmOrderDateTime)` with only the RxNorm code and the `authoredOn` date. `WRITERXPS^SYNFMED` then hard-codes days supply 30, qty 30, refills 1 and the dose text, and uses the authored date as both issue and fill date. Nothing in the Synthea request could fill them anyway: Kim439's 73 `MedicationRequest` resources have no `dispenseRequest` (no refills, quantity or supply) and no dosage text, only `timing.repeat` (1 per day) and a reason.
  - *Lisinopril listed many times:* the loader files one Rx per `MedicationRequest` and never merges. Synthea writes 27 lisinopril requests for Kim439 (2014-08-15 twice, then yearly, with extras in 2020-2023 and weekly from 2026-08-28), and 19 simvastatin. The loader also ignores request `status` (it reads `verificationStatus` into a variable it never uses), so every Rx is issued as new and active in VistA.
  - *Recommendation:* two options, not decided. (a) Change the loader fork so `WRITERXRXN` takes qty, days supply, refills and sig from a table keyed by drug class (chronic drugs: 90 days, 3 refills, qty to match the daily dose from `timing.repeat`), and collapse repeated requests for the same drug into one Rx whose later requests become refills (what a real chronic-med history looks like). (b) Leave the loader and fix patients after loading with `fill-rx.js` and `fill-plan.js`, plus a renew for expired Rxs. Option (a) is cleaner but changes upstream-bound code; option (b) needs no loader change but must be repeated for each patient.

### [ ] Task 1.7: Loader defaults table in `SYNFMED` (option B, decided 2026-10-13)
- **Written 2026-10-13; first dev check passed for insulin**: `D MEDDEFT^SYNFMED` on `INSULIN ,ASPART,HUMAN 100 UNT/ML INJ` returned class `HS501` (so field 2 of #50 returns the class code, and `HS501` is the insulin class) and the name row `30^5^1^INJECT 20 UNITS UNDER THE SKIN TWICE A DAY BEFORE MEALS`. Still to check on dev: a name row with a fixed quantity (fentanyl Rx 407329), and a real load that files an Rx with the table values. Class row checked 2026-10-13: lisinopril (Rx 407290) returns class `CV800` and `90^3^90^TAKE ONE TABLET BY MOUTH EVERY DAY`. GLP-1 rows are 30-day supply with 3 refills, per the owner
- Decisions 2026-10-13: chronic classes 90 days, 3 refills; sig text from the table; repeated requests merged (Task 1.8). Review document for the clinical reviewers: `docs/MED-DEFAULTS-PROPOSAL.md`. Pharmacist feedback: outpatient injectables are common (insulin appears in the Synthea data), so injectables are not excluded as a group; only inpatient/procedural drugs keep the defaults (Synthea marks 30 of 3,436 requests `inpatient`)
- Add a data block `MEDDEFDATA` to the fork's `SYNFMED.m`, same style as `RXNBADDATA` (`;;key^days^refills^dosesPerDay^sig`), and a function that looks up a drug's VA class (file #50 VA CLASSIFICATION, `$P(^PSDRUG(DRUG,0),"^",2)`; verify the piece on dev) and returns the row, with optional rows keyed by drug name for exceptions
- `WRITERXPS` uses the row for days supply, refills, quantity (days x doses per day) and sig; a drug with no row keeps today's defaults (30 days, qty 30, 1 refill, "ONE TABLET DAILY")
- Draft rows (VA classes seen in the 10 loaded patient files; **values to be reviewed**): CV800 ACE inhibitors, CV805 ARBs, CV350 antilipemics, CV701 thiazides, CV100 beta blockers (once daily; carvedilol and metoprolol tartrate need name rows for twice daily), BL117 platelet inhibitors, CN609 antidepressants: 90 days, 3 refills, 1 per day. CN101 opioids: 30 days, 0 refills. AM* anti-infectives: 10 days, 0 refills. CV250 antianginals and CN103 non-opioid analgesics: as needed, 30 days. RE101/RE102 inhalers: 30 days, 5 refills. Inpatient or procedural injectables (heparin, anesthetics, neuromuscular blockers, furosemide injection) and everything else: unchanged defaults; outpatient injectables (insulin first) get their own rows (Task 1.8a)
- Test with `testall^SYNFMED2` or a load of a temp copy, then `fill-rx.js` on one of the new Rxs; log the change in `patches/LOADER-CHANGES.md`
- Not part of this task: collapsing repeated requests for one drug into a single Rx with refills (a separate change to `wsIntakeMeds^SYNFMED2`)
- **Success Criteria**: a freshly loaded patient's lisinopril, simvastatin and opioid Rxs show the days, quantity, refills and sig from the table

### [ ] Task 1.8: Merge repeated Synthea requests for one drug into one Rx plus refills
- **Written 2026-10-13, not compiled or tested** (fork): `MERGERX` and `REFILL` in `SYNFMED.m`; `wsIntakeMeds^SYNFMED2` now calls `$$MERGERX^SYNFMED` and clears `^TMP("SYNRXMRG",$J,dfn)` before each patient. Rule as approved by the owner (2026-10-13): per patient and drug, a request inside the Rx's expiration, on or after last fill + days supply - 10, with refills left, becomes a refill at the request date (release date = fill date); a request before that date is dropped as a duplicate; otherwise it starts a new Rx. `WRITERXPS` now also sets the original fill's release date to the prescription date (it was the load time). `REFILL^SYNFMED` duplicates `FILL^CDSPRX`; once both are tested, make `FILL^CDSPRX` call `REFILL^SYNFMED`
- Test on dev: compile `SYNFMED` and `SYNFMED2`; load a fresh copy of the Kim439 bundle (this creates a new test patient); expect lisinopril Rxs about one per year, with refills only where Synthea reordered at least 80 days after the last fill, no weekly Aug-Sep 2026 Rxs, and release dates equal to fill dates; compare Rx counts per drug with the 73 requests in the bundle
- **Result 2026-10-13 (Odell776, DFN 100975, load returned a gateway 504 but finished in VistA)**: 200 medication requests became 65 outpatient Rxs. Lisinopril: 86 requests became 22 Rxs, one per year 2005 to 2026 (the last, 2026-07-05, is active; no weekly Rxs), with refills filed where Synthea reordered 80 or more days after the last fill (for example 2011-04-10, 08-28, 11-26) and every release date equal to its fill date. Insulin: 83 requests became 20 Rxs, 30 days, quantity 1, 5 refills allowed, a refill on 2007-04-22. Table values confirmed in VistA for lisinopril, clopidogrel, simvastatin, metoprolol (90 days, 90, 3 refills), nitroglycerin spray (30, 1, 0), meperidine, acetaminophen and naproxen (30, 30, 0); drugs without a row kept 30/30/1. Sig confirmed 2026-10-13: the table's text is stored in the Rx's dosage multiple (`^PSRX(407425,6,1,0)` = "TAKE ONE TABLET BY MOUTH EVERY DAY"); VPR's `sig` field reads a different node, so it still shows "No SIG available"
- Original plan: in `wsIntakeMeds^SYNFMED2`, per patient and per RxNorm code, process requests in `authoredOn` order (rule above)
- Kim439 is the test case: 27 lisinopril requests (2014 to 2026) should become about one Rx per year, and no weekly Rxs in Aug-Sep 2026
- **Success Criteria**: reloading a copy of Kim439 on dev gives one Rx per year for lisinopril, with refill fills dated from the requests

### [ ] Task 1.8a: Check insulin and other outpatient injectables
- Find the VA class of the loaded insulin (Humulin 70/30) on dev, add its row, and confirm the sig and quantity reviewers want (question 8 in the proposal)
- **Success Criteria**: an insulin Rx loads with a vial quantity and an injection sig

### [x] Task 1.5: Test `FILLRX^CDSPRX` on Kim439 (DFN 100973)
- **Done 2026-10-13**: `node fill-rx.js --dfn 100973 --rx 407290 --date 2025-11-20 --commit` filed refill #1 on lisinopril Rx 100003607; Rx view shows `Filled: 11/20/25 (Window) released 11/20/25`, Last Filled 11/20/25, Refills Remaining 0. The original fill still shows released 10/8/26. Dry runs checked: second fill on the same Rx is refused ("No refills remaining"); a fill on or before the last fill date is refused (`FILLDATE must be after the last fill date`); simvastatin Rx 100003608 (IEN 407291) accepts 2025-11-25 as a dry run (not committed).
- Draft written 2026-10-09 in `cds-vista-routines/CDSPRX.int` (`FILLRX`, dry run unless `COMMIT=1`); compile on dev and register RPC `CDSP UTIL RX FILL` (tag `FILLRX`, routine `CDSPRX`, return type ARRAY, context `CDSP RPC UTILS`)
- Existing meds (30-day supply, 1 refill allowed, original fill only), from `100973.json`:
  - Lisinopril Rx 100003607, IEN 407290, issued 2025-10-17, expires 2026-10-18, status active
  - Simvastatin Rx 100003608, IEN 407291, issued 2025-10-18, expires 2026-10-19, status active
- Steps: dry run with fill date 2025-11-20 (3 days late) and compare `early`, `refillNumber`, `refillsRemaining`; commit; re-pull VPR and check the refill fill date and release date; try a second fill on the same Rx (expect "No refills remaining") and one dated before the first (expect rejection)
- Note: the original fills of the loaded Rxs show release date 2026-10-08 (the load date), so their release dates are not backdated; decide whether to fix them with the same `FILE^DIE` edit
- **Success Criteria**: refill appears in VPR with the backdated fill date and release date; refills remaining drops by 1

## Pending (as of 2026-10-09; updated 2026-10-15)

Medication work is paused on 2026-10-15 to populate notes on the important test patients. Test patients used so far: 99935791 (critical, no further writes), 100975 (renewals), 100973 (ADDRX test).

### Done 2026-10-15

- [x] `ADDRX` (`CDSP UTIL ADD RX`) registered and run. It now fills structured dosing: with `COPYFROM` it copies dose, units, noun, route, schedule and verb from an existing Rx before filing; without it, it calls `$$DOSING^SYNFMED` (strength from #50 field 901/902, units #50.607, route #51.2, schedule #51.1 from the sig). Tested on DFN 100973: atorvastatin Rx 100003816 shows `20 MG / MG / PO / QDAY` and the sig in the VPR.
- [x] Free-text sig fixed: `WRITE` (CDSPRX) and `WRITERXPS` (SYNFMED) set `SIGOK` and `SIG(1)` so `PSON52` files SIG1; PR branch `synfmed-rx-sig` (master) has the sig fix alone.
- [x] `SYNFMED` `DOSING`, `DOSINGT`, `ROUTEKEY`, `SCHEDKEY` compiled on dev; route resolves to #51.2 entry 1 (`ORAL (BY MOUTH)`, the entry the older Rxs use); QDAY and BID resolve in #51.1.
- [x] Preflight lists meds without full structured dosing (`dosing:ok|partial|check-after-create|reason`); canagliflozin is `partial`.
- [x] Renew through the CPRS RPCs works: `renew-rx.js` (`ORWDXR RENEW` then `ORWDX SEND`, skipping the `ORWDXC ACCEPT` order check that hangs on `CDS SERVER`). Tested on DFN 100975 (lisinopril 49816 to 49881).
- [x] Finish of a pending order is done by hand in Outpatient Pharmacy (backdoor): DFN 100975 insulin 49880 and lisinopril 49881 became Rx 100003799A and 100003800A.
- [x] Fill-in tools committed: `fill-rx.js`, `fill-patient-rx.js`, `fill-plan.js`, `fill-history.js`, `add-rx.js`, `renew-rx.js`, `finish-rx.js`.

### Open: when we revisit medications

- [ ] Backfill structured dosing on existing loaded Rxs that have only free text (every old loader Rx, for example 100973 has about 20 lisinopril Rxs, shows blank dose/route/schedule in the VPR). Same lookup as `$$DOSING`; write a dry-run-first tool and a CDSPRX entry point; also fill the sig (`^PSRX(rx,"SIG1")`) where it is still blank. The order text read by the VPR must change too, not just `^PSRX(rx,6)` (setting node 6 after filing did not change the VPR).
- [ ] Add dosing rows for non-oral and special meds: `DOSING` only handles oral tablets and capsules (insulin, patches, inhalers, injectables, nitroglycerin spray return `not-oral-solid`). Extend `MEDDEF`, `ROUTEKEY`, `SCHEDKEY` (check TID, QID, QAM, QPM, QHS and the sublingual route names against #51.1 and #51.2: `D LIST^DIC(51.1,,"@;.01")` then `ZW ^TMP("DILIST",$J)`).
- [ ] Review the preflight output for every new Synthea upload: meds listed under "without full structured dosing" need a `MEDDEF` row or a key.
- [ ] Test `FINORD` (`CDSP UTIL FINISH RX`, `finish-rx.js`): register the RPC (tag `FINORD`, routine `CDSPRX`, one LIST parameter, context `CDSP RPC CONTEXT`), dry run on a pending order, then one live finish. Never run. It runs `PSOORFI1` with `ACP` set, `PSON52`, `DCORD^PSONEW2`, `EOJ^PSONEW`, label and release. Remote order checks call `CDS SERVER` (HWSC error 186005) and hang on dev; disabling that web server entry would also remove the need to skip `ORWDXC ACCEPT`.
- [ ] Renew end to end in one script: `renew-rx.js` then `finish-rx.js` (the renewed order stays PENDING until pharmacy finishes it; the backdoor finish sets the first fill date to the next possible refill date, which can be in the future).
- [ ] Decide on future-dated first fills after a renew (DFN 100975 insulin 10/23/2026, lisinopril 12/28/2026) and on the original fills whose release date is the 2026-10-08 load date.
- [ ] Story 1 test: `ADDRX` a new Rx on DFN 100973 with an issue date about a year back, then `FILLRX` oldest first with one or two late fills (the 2026-10-15 test used today's date).
- [ ] Merge repeated Synthea requests (Task 1.8) and check class rows of `MEDDEF` on a real load (a fresh load through `WRITERXPS` with `DOSING` has not been run).
- [ ] Merge the `synfmed-rx-sig` PR; then merge or rebase `med-defaults-and-merge` so the sig lines are not duplicated.
- [ ] Ask the AI summary team how their medication table gets Last Filled and Expiration Date (they were blank for Rxs that have both in the VPR)
- [x] `CDSP RPC CONTEXT` given to `HELZER,BERND` (2026-10-15; VistALink error 182005 "does not have access to option CDSP RPC CONTEXT" on `VAFCTFU CONVERT ICN TO DFN`); recheck `D ^XTER` for new 182005 entries after their next run
- [ ] Correct spec requirement 2 in `specs/pharmacy-operations/spec.md`: a renew creates a new Rx, it does not add refills to the old one.
- [ ] Do not write to DFN 99935791 again; its three renewals (407496 to 407498) were created with `ADDRX` before the dosing fix, and their sig and dose were patched by hand in M.
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
