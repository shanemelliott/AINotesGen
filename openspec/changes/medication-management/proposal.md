# Medication Management – Proposal

## What & Why

Enable realistic medication workflows on test patients by building CLI tools for three pharmacy operations currently done manually via the VistA pharmacy menu:

1. **Enter new medication** — Add a new prescription to a patient (already working in SYN loader; needs documentation)
2. **Renew an Rx** — Renew an existing prescription and add refills
3. **Document refill/dispense** — Record a refill of an existing Rx, decrement refill count, with past-date support

**Why:** Synthea-loaded patients need medication history; notes reference meds. Manual pharmacy menu entry is slow and error-prone. Research RPCs used by the data loader to automate this.

**Manual workflow today:** the `PSO LM BACKDOOR ORDERS` menu (Outpatient Pharmacy, List Manager; entry action `D ^PSORX1`). It is the reference behavior to replicate; the routines behind its actions, and any RPC-callable equivalents, are still to be found.

**Current state:** The VistA FHIR Data Loader (SYN) already uses pharmacy RPCs to add medications during FHIR load. We reuse that logic but add renew and refill workflows, with special support for backdating (past appointments get meds dispensed on their date).

## User Stories

1. As a tester I need to create a year of medication history by first ordering the med with a date a year old, then adding 90-day fills at (or around) the expected times, leaving some gaps, so I can test adherence over the past year.

## Scope

- **Included:** Renew, refill, dispense workflows; dry-run support; past-date handling
- **Not included:** Medication approval workflows, dosage adjustments, refusal/rejection handling
- **Research required:** Exact SYN loader RPC calls; VistA pharmacy RPC contracts; past-date constraints

## Success Criteria

1. `node renew-rx.js --dfn 100965 --rx-ien 12345 --refills 5` renews the Rx with 5 new refills
2. `node dispense-rx.js --dfn 100965 --rx-ien 12345 --date 2025-10-04 --qty 30` records a dispense on past date; refill count decremented
3. New meds from `generate-batch.js` patients load and appear in patient inquiry
4. Dry-run mode shows what would happen without writing to VistA
5. Failed RPCs logged with clear error messages; batch continues

## Background

- SYN loader in VistA-FHIR-Data-Loader uses ADDRX and related pharmacy RPCs during bulk load
- Current NotesGenerator workflow: load patient → create appointments → generate/sign notes (meds already present from load)
- Append path (Task 14) parked: meds `ADDRX` written but not integrated with other flows
- This change unblocks medication workflows for testing and demo

## Open Questions

1. **Which RPCs does SYN use for add/renew/dispense?** (ADDRX, PHARM*, PSO*)
2. **Does past-date support exist in the RPC layer, or do we dispense then edit?**
3. **How are refill counts decremented — automatic on dispense, or separate RPC?**
4. **Do we need provider/signature for dispense, or test system allows unsigned?**
