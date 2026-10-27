# Medication Management – Design

## Architecture

```
Medication Workflow
┌─────────────────────────────────────────┐
│ Patient loaded with Synthea FHIR data   │
│ (meds from SYN ADDRX during load)       │
└──────────────┬──────────────────────────┘
               │
      ┌────────┴─────────┬──────────────┐
      │                  │              │
      ▼                  ▼              ▼
   Enter New Rx       Renew Rx      Dispense/Refill
   (extend, manual)   (add refills)  (decrement, backdate)
      │                  │              │
      └────────┬─────────┴──────────────┘
               │
      ┌────────▼──────────────┐
      │ src/pharmClient.js    │
      │ (ADDRX, PHARM*, PSO*) │
      └───────┬───────────────┘
               │
      ┌────────▼──────────────┐
      │ VistA Pharmacy APIs   │
      │ (via vista-api-x)     │
      └───────────────────────┘
```

### Modules

1. **src/pharmClient.js**
   - Wraps pharmacy RPCs (ADDRX, PHARM RENEW, PHARM DISPENSE etc.)
   - Handles error translation, logging
   - Supports `--dry-run` flag

2. **renew-rx.js** — CLI for renewing a prescription
   - Args: `--dfn <id> --rx-ien <ien> --refills <n> [--dry-run]`
   - Looks up Rx details, calls renew RPC, updates refill count

3. **dispense-rx.js** — CLI for recording a refill/dispense
   - Args: `--dfn <id> --rx-ien <ien> --date <YYYY-MM-DD> --qty <n> [--dry-run]`
   - Calls dispense RPC with past date (if supported)
   - Decrements available refills on success

4. **add-med.js** — Optional: manual single-med entry (reuses SYN pattern)
   - Args: `--dfn <id> --drug-ien <ien> --route <route> --qty <qty> --refills <n> [--dry-run]`

## Decisions

### D1: Reuse SYN loader RPC logic
**Decision:** Extract the ADDRX and related RPC calls from VistA-FHIR-Data-Loader fork and wrap in `pharmClient.js`.
**Rationale:** SYN already handles med entry correctly during load; no need to reinvent. Consistency with the loader.
**Trade-off:** Tight coupling to loader; future loader changes must propagate here.

### D2: Past-date support via wrapper
**Decision:** Attempt to dispense with past date in RPC; if not supported, dispense then edit via second RPC call.
**Rationale:** Simpler workflow if RPC allows it; fallback to menu behavior (dispense → edit) if needed.
**Research required:** Confirm VistA pharmacy RPC past-date contract.

### D3: Idempotence & safety
**Decision:** Renew and dispense operations will check current state before writing (e.g., read current refill count, compare).
**Rationale:** Batch operations might retry; avoid double-dispensing or double-renewing.
**Trade-off:** Requires extra read RPC; worth it for safety.

### D4: Dry-run support
**Decision:** All CLI tools support `--dry-run`, which logs what would happen but makes no RPC calls.
**Rationale:** Consistent with existing tools (generate-notes, sign-notes); lets users preview.

### D5: Separate tools per operation
**Decision:** Three CLIs: `renew-rx.js`, `dispense-rx.js`, optional `add-med.js` (vs. one big `med-manager.js`).
**Rationale:** Single-responsibility; easier to test; mirrors the notes pipeline design (generate, approve, sign).
**Trade-off:** More files, but clearer intent.

## Data Model

### Rx fields (from VistA)
- **IEN** — Unique ID in file #52 (PRESCRIPTION)
- **Drug** — Link to #50 (VA PRODUCT)
- **Route** — Oral, IV, etc.
- **Schedule** — How often to take
- **Quantity** — Per dose
- **Refills** — Number remaining (0–999, or special codes for "as needed")
- **Date issued** — YYYYMMDDHHmm
- **Date expires** — YYYYMMDDHHmm (or empty)
- **Provider** — Prescriber DUZ

### Dispense event (from VistA)
- **Rx IEN** — Which prescription was filled
- **Date dispensed** — YYYYMMDDHHmm
- **Quantity dispensed** — Units
- **Location** — Pharmacy location
- **Refills remaining after** — Decremented count

## RPC Research Checklist

- [ ] Trace the `PSO LM BACKDOOR ORDERS` menu (the manual path): action routines, prompts, File #52 fields written for renew, refill and backdated refill

- [ ] Study SYN loader pharmacy routines:
  - SYNFMED.m (main medication engine; WRITERXRXN, WRITERXPS, drug lookups)
  - SYNFMED2.m (FHIR import entry point)
  - SYNINIT.m (pharmacy setup; pharmacist/site creation)
  - SYNFALG2.m (medication allergy handling)
- [ ] Extract RPC calls used by each routine (ADDRX, PHARM*, PSO*, etc.)
- [ ] Locate VistA pharmacy RPC calls for renew and dispense
- [ ] Test on dev: renew an existing Rx, check refill count in patient inquiry
- [ ] Test on dev: dispense with past date; if rejected, test dispense → edit flow
- [ ] Confirm error codes and handling for unavailable meds, invalid dates, etc.
- [ ] Optional: Create CDSPMED or CDSPRX wrapper routine(s) in cds-vista-routines (mirrors CDSPENC → SYNFENC approach)

## Research Findings (from reference/PSO*.ro, PSO*7*, 2026-10-09)

Manual path: `PSO LM BACKDOOR ORDERS` -> `PSORX1` -> List Manager actions (`PSOREF` refill, `PSORENW` renew).

**Refill** (`OERR^PSOREF` -> `^PSOREF1` prompts -> `PROCESS^PSOREF0` -> `EN^PSOR52(.PSOREF)`)
- `EN^PSOR52` files the refill: `^PSRX(IRXN,1,NUMBER,0)`, with `NUMBER` = last refill subscript + 1, and sets `^PSRX(IRXN,3)` pieces 1, 2, 4 (last dispensed, next possible refill, last refill date).
- Fill date is just `PSOX("FILL DATE")` (refill node 0 piece 1); `PSOREF0` defaults it to today. A past fill date needs no later edit, but `PSOREF0` rejects a date on or before the last refill date, so backdated refills must be entered oldest first, and rejects a date past the Rx expiration (`^PSRX(IRXN,2)` piece 6).
- If the site parameter `$P(PSOPAR,"^",6)` is off, a fill before the next possible refill date prompts "LESS THAN n DAYS", or is refused when `PSOREF("EAOK")=0`.
- There is no stored refills-remaining field: remaining = `$P(^PSRX(IRXN,0),"^",9)` minus the count of entries in `^PSRX(IRXN,1,*)`. "Decrement" happens by filing the refill entry.
- Preconditions to mirror: Rx status 0 (active) or 6 only (`CHECK^PSOREF0` refuses any other status), same division, not suspended, not titration, no open 3rd-party reject, schedule II refused, DEA days-supply check (`DEACHK^PSOUTLA1`).

**Release** (`BATCH^PSODISP`): sets the release date/time to `NOW` (original fill: field 31 via `^DIE`). This is the likely reason the manual flow needs a date edit afterward: the fill date can be set, but the release date/time is always "now". Refill release goes through `QTY^PSODISPS` (not yet read). `PSOR52` also carries `PSOX("RELEASED DATE/TIME")` (refill node 0 piece 18) and `PSOX("DISPENSED DATE")` (piece 19).

**Renew** (`OERR^PSORENW` -> `ASK` -> `^PSORENW0` -> `EN^PSORN52`)
- A renew creates a new Rx (new `^PSRX` entry, new Rx number), not more refills on the old one. The old Rx keeps its refills; the new one takes `# OF REFILLS` and `DAYS SUPPLY` from the old Rx unless changed in `PSORENW0/1/3`.
- Entry data: `PSORENW("OIRXN")` (old IEN), `FILL DATE` (from `FILLDT^PSODIR2`), `MAIL/WINDOW`, then `NOORE^PSONEW`. `PSORN52` also handles copay/SC/MST flags and ECME submission.
- `RENEW^PSORENW(PLACER)` is a side-effect-free eligibility check (expired more than 120 days, drug inactive, Rx # suffix limit of 26 renewals, duplicate renewal request).
- This changes spec requirement 2: "renew and add refills" is a new Rx, so the CLI should report the new Rx number and IEN.

**Backdating limit in the menu** (confirmed in `FILLDT^PSODIR2`): the prompt accepts fill dates from `PSOID` to `PSOID + 366` days (184 for controlled substances). For a refill, `PSOREF1` sets `PSOID` to the later of the Rx issue date and today minus 6 months. Screenshot check: `APR 09, 2026` + 366 days = `APR 10, 2027`. So the menu cannot backdate a refill more than 6 months. The refill filing code (`EN^PSOR52`) has no such limit, only the checks in `DATES^PSOREF0` (after the last refill date, not past expiration). A tool that calls it directly can file fills at any past date in order.

**Next possible refill** (`NEXT^PSOUTIL`): last fill date + days supply - 10, or issue date + (fills + 1) x days supply - 10, whichever is later. A fill earlier than that prompts "LESS THAN n DAYS" (or is refused when `PSOREF("EAOK")=0` and the site suspense parameter is off). Late fills (adherence gaps) are never blocked.

**Refill release** (`QTY^PSODISPS`): for each refill with fill date on or after `PSIN` (`$P(^PS(59.7,1,49.99),"^",2)`) and no release date yet, it requires a label on file (`^PSRX(IRXN,"L")`, from `DQ^PSOLBL`), then sets refill field 17 (release date/time, node 0 piece 18) to `NOW` and field 4 (pharmacist) via `^DIE`. A tool can instead set field 17 to the fill date (or fill date + a day or two) with `UPDATE^DIE`, so no release date edit is needed afterward.

**Year of history (user story 1):** new Rx with a year-old issue/fill date (`WRITERXPS^SYNFMED` already takes the date as `RXDATE`), then refills in date order. With 90-day supply, a 12-month history needs 3 refills after the original fill, plus enough `# OF REFILLS` and an expiration date that covers the last fill. Gaps are just fill dates later than the previous fill plus days supply.

**Open questions for the dev session:** which field is edited after dispensing in a backdated refill; whether renew is used rather than copy; how `QTY^PSODISPS` stamps release for refills.

## Testing Strategy

1. **Unit test:** Mock RPC responses for each operation
2. **Integration test:** Against dev VistA with DFN 100969 (test patient)
3. **Batch test:** Run all three workflows in sequence for multiple patients
4. **Dry-run test:** Verify no writes occur with `--dry-run` flag
