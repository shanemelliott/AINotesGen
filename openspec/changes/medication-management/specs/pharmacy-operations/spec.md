# Spec Delta: Medication Management

## Purpose

Enable CLI-driven pharmacy operations (renew, dispense, and document medication workflows) to support realistic medication history on test patients, with past-date support and dry-run mode.

## ADDED Requirements

### Requirement: Wrap VistA pharmacy RPCs in a reusable client module
The system SHALL provide `src/pharmClient.js` that wraps VA pharmacy RPCs (ADDRX, PHARM RENEW, PHARM DISPENSE, etc.) with error translation, logging, and dry-run support.

#### Scenario: Add a medication via ADDRX
- **WHEN** called with DFN, drug IEN, route, quantity, refills, schedule
- **THEN** invoke the ADDRX RPC from the SYN loader pattern
- **AND** return the created Rx IEN on success, or throw a descriptive error

#### Scenario: Dry-run mode
- **WHEN** `pharmClient.js` is called with `dryRun: true`
- **THEN** log the RPC call that would be made, but do not write to VistA
- **AND** return a mock response (e.g., IEN 99999)

---

### Requirement: Renew an existing prescription
The system SHALL support renewing a prescription and adding new refills via CLI.

#### Scenario: Renew an Rx with additional refills
- **WHEN** `node renew-rx.js --dfn 100965 --rx-ien 12345 --refills 5`
- **THEN** read the current prescription to confirm it exists
- **AND** call the pharmacy renew RPC to add 5 refills
- **AND** log the updated refill count from VistA
- **AND** exit 0 on success, non-zero on error

#### Scenario: Renew with dry-run
- **WHEN** `node renew-rx.js --dfn 100965 --rx-ien 12345 --refills 5 --dry-run`
- **THEN** log "Would renew Rx 12345 with 5 new refills" but do not write
- **AND** exit 0

#### Scenario: Rx not found or invalid
- **WHEN** the Rx IEN does not exist for that patient
- **THEN** error: "Rx 12345 not found for DFN 100965"
- **AND** exit non-zero

---

### Requirement: Dispense a medication and document refill
The system SHALL support recording a refill of an Rx, with optional past-date support, and decrement the refill count.

#### Scenario: Dispense on current date
- **WHEN** `node dispense-rx.js --dfn 100965 --rx-ien 12345 --qty 30`
- **THEN** call the pharmacy dispense RPC with today's date
- **AND** decrement the available refill count
- **AND** log the dispense event (date, qty, refills remaining)
- **AND** exit 0 on success

#### Scenario: Dispense on past date
- **WHEN** `node dispense-rx.js --dfn 100965 --rx-ien 12345 --date 2025-10-04 --qty 30`
- **THEN** attempt to dispense with the specified past date
- **AND** if the RPC supports past dates, use it directly
- **AND** if not, dispense with today's date, then call a second RPC to edit the dispense date (research VistA pharmacy RPC contract)
- **AND** log the final result (which approach was taken, final date and refills remaining)

#### Scenario: Dispense with dry-run
- **WHEN** `node dispense-rx.js --dfn 100965 --rx-ien 12345 --date 2025-10-04 --qty 30 --dry-run`
- **THEN** log "Would dispense 30 units of Rx 12345 on 2025-10-04; refills remaining after: <computed>"
- **AND** do not write to VistA
- **AND** exit 0

#### Scenario: No refills remaining
- **WHEN** attempting to dispense an Rx with 0 refills
- **THEN** error: "Rx 12345 has 0 refills remaining; cannot dispense"
- **AND** exit non-zero (unless the RPC allows dispensing with 0 refills by policy)

---

### Requirement: Pharmacist-ready log output
The system SHALL produce clear, structured logs for all pharmacy operations.

#### Scenario: Log format
- **WHEN** a pharmacy operation completes
- **THEN** print to stdout:
  ```
  [medication] DFN <dfn> Rx <ien> <operation>: <status>
  [medication] Details: <field1>=<value1>, <field2>=<value2>, ...
  ```
- **AND** include date, provider, location, refills remaining (where applicable)

#### Scenario: Error logging
- **WHEN** an RPC fails
- **THEN** print to stderr:
  ```
  [error] DFN <dfn> Rx <ien> <operation> failed: <rpc-error-code> <rpc-error-text>
  [error] Recommended action: <hint>
  ```

---

### Requirement: Research VistA pharmacy RPC contracts
Before implementation, the system SHALL document (in a research artifact):

- The exact RPC calls used by SYN loader for ADDRX (file, params, return)
- The RPC for renewing a prescription (add refills)
- The RPC(s) for dispensing (does it support past dates? does it auto-decrement refills?)
- The RPC for editing a dispense date (if past-date requires a second call)
- Error codes and handling for: invalid DFN, invalid Rx IEN, invalid date, no refills, expired Rx, etc.

---

## Notes

- Dry-run mode is implemented at the `pharmClient.js` level, so all dependent CLIs inherit it.
- Past-date support is conditional based on RPC contract research; fallback to dispense-then-edit if needed.
- All operations are logged for audit and troubleshooting; logs go to stdout (success) or stderr (error).
- These specs assume integration with the existing notes pipeline (meds already present from load; these tools add refills/dispenses for testing realism).
