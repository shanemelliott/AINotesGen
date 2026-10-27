# Spec Delta: Pharmacy Operations

## Purpose

Give test patients a realistic outpatient medication history on the development VistA system: new prescriptions with a sig and structured dosing, backdated refills, renewals, and repair of earlier loads. Writes are previewed before they are committed.

## ADDED Requirements

### Requirement: Loader defaults by drug
The system SHALL give each prescription filed by the loader a days supply, refills, quantity and sig taken from a table keyed by drug name or VA drug class, and SHALL keep the plain loader defaults (30 days, quantity 30, 1 refill, "ONE TABLET DAILY") for a drug with no table row.

#### Scenario: Chronic drug with a class row
- **WHEN** a drug in a chronic class (for example an ACE inhibitor) is filed
- **THEN** the prescription has 90 days supply, 3 refills, a quantity that matches the daily dose, and the table sig

#### Scenario: Drug with no row
- **WHEN** a drug matches no name row and no class row
- **THEN** the prescription keeps 30 days supply, quantity 30, 1 refill and the default sig

#### Scenario: Outpatient injectable
- **WHEN** an outpatient injectable such as insulin is filed
- **THEN** it uses its own name row (days supply, refills, vial quantity and an injection sig) instead of a class row

---

### Requirement: Repeated requests become refills
The system SHALL merge repeated requests for the same drug on one patient into one prescription with refills, using the rule that a request on or after the next possible refill date (last fill plus days supply minus ten days), inside the expiration and with refills left, is filed as a refill at the request date; a request before that date is dropped as a duplicate; any other request starts a new prescription.

#### Scenario: Yearly reorders
- **WHEN** a patient has many requests for one chronic drug over many years
- **THEN** about one prescription per year results, with refills only where a request came at least 80 days after the last fill

#### Scenario: Release date follows the fill date
- **WHEN** a prescription or refill is filed from a past request
- **THEN** its release date equals its fill date, not the load date

---

### Requirement: Structured dosing from the sig
The system SHALL fill the structured dose, units, noun, route, schedule and verb of a prescription from the drug strength and the sig text where they can be derived, and SHALL fill route and schedule from the sig alone when no dose can be derived.

#### Scenario: Tablet with a strength
- **WHEN** a tablet or capsule whose drug entry has a numeric strength and unit is filed with a sig that maps to a route and a schedule
- **THEN** dose, units, noun, route, schedule and verb are all filed

#### Scenario: Drug with no strength
- **WHEN** a drug has no strength in the drug file (for example a combination tablet, gel or insulin)
- **THEN** the dose is left blank and the route and schedule are still filed when the sig maps to them

#### Scenario: Sig that maps to nothing
- **WHEN** the sig has no known route or schedule phrase
- **THEN** that field is left blank rather than guessed

---

### Requirement: Add an outpatient prescription
The system SHALL add a released outpatient prescription to a patient with a chosen sig, quantity, days supply, refills, provider and clinic, resolving the drug from an RxNorm code, and SHALL optionally copy the structured dosage from an existing prescription for the same drug.

#### Scenario: New prescription
- **WHEN** a prescription is added with an RxNorm code and an issue date
- **THEN** a released prescription exists with that sig and issue date and its structured dosing

#### Scenario: Protected patient
- **WHEN** the target is the protected critical test patient
- **THEN** no prescription is written

---

### Requirement: Refill at a past date
The system SHALL file a refill on an existing prescription at a past fill date, release it, and set its release date, previewing the result unless a commit is requested.

#### Scenario: Backdated refill
- **WHEN** a refill is committed with a fill date after the last fill and before expiration
- **THEN** the refill appears with that fill date and release date and the refills remaining drop by one

#### Scenario: Preview only
- **WHEN** no commit is requested
- **THEN** the checks run and the result is reported without writing

#### Scenario: Refused refill
- **WHEN** no refills remain, or the fill date is on or before the last fill, before the issue date, after the expiration date, or in the future, or the prescription is in a status that cannot be refilled
- **THEN** the refill is refused with the reason

---

### Requirement: Renew a prescription
The system SHALL renew a prescription through the CPRS order path so that a new pending order results, and the original prescription SHALL keep its own refills.

#### Scenario: Renew
- **WHEN** a prescription is renewed
- **THEN** a new pending order exists for the same drug, and it becomes a new prescription when pharmacy finishes it

#### Scenario: Future first fill
- **WHEN** pharmacy finishes a renewed order
- **THEN** the first fill date may be the next possible refill date, which can be in the future

---

### Requirement: Backfill dosing and sig on earlier loads
The system SHALL repair prescriptions that were filed without structured dosing or with a default sig, previewing the change unless a commit is requested, and SHALL refuse the protected critical test patient.

#### Scenario: Default sig
- **WHEN** a prescription still has a default sig and its drug has a table sig
- **THEN** the backfill replaces the sig and fills the dosing and order responses the record reads

#### Scenario: Already has a dose
- **WHEN** a prescription already has a numeric dose
- **THEN** only a blank route or schedule is added, and a default sig is replaced, when the sig maps to them

#### Scenario: Nothing to add
- **WHEN** nothing would change
- **THEN** the prescription is skipped and reported as such

## Notes

- Replaces the earlier draft that planned a single client module and separate renew and dispense command-line tools; the delivered tools are in the add, refill, renew, finish and backfill scripts and the `CDSPRX` routine.
- Quantity for table rows is days supply times doses per day unless the row gives a fixed quantity.
