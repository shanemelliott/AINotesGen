# Spec Delta

## Purpose

Gives loaded synthetic test patients realistic veteran service data in VistA (eligibility, service connection and rated
disabilities, military service, exposures, enrollment priority), derived from each patient's own record and set safely.

## ADDED Requirements

### Requirement: Derive a veteran service profile from the patient record
The system SHALL derive, for a loaded patient, a service profile from the patient's VistA record (birth date, sex, problem
list) using a documented mapping table: period of service from the date the patient turned 18, branch, service entry and
separation dates, combat and exposure flags, rated disabilities with a percentage each, the combined service-connected
percentage, primary eligibility and enrollment priority group. The same patient record and table SHALL always give the
same profile.

#### Scenario: Injured combat veteran
- **WHEN** a patient's problem list includes a traumatic amputation of a lower extremity and PTSD
- **THEN** the profile marks the patient service connected, combat veteran, with one rated disability for each condition
  at the table's percentage and a combined percentage computed by the VA combined ratings method

#### Scenario: Veteran with no rateable condition
- **WHEN** a patient has none of the conditions in the mapping table
- **THEN** the profile marks the patient not service connected, with no rated disabilities, a non-service-connected
  primary eligibility and an enrollment priority group consistent with that

#### Scenario: Era-linked exposure
- **WHEN** a patient turned 18 during the Vietnam era, or during the Gulf War or later
- **THEN** the profile sets the matching exposure (Agent Orange, or Southwest Asia) according to the table

#### Scenario: Repeatable result
- **WHEN** the profile is derived twice for the same patient without the record or table changing
- **THEN** both profiles are identical

### Requirement: Reviewable profile before writing
The system SHALL write each derived profile to a local file before anything is written to VistA, showing every field, the
source condition for each rated disability, and the combined percentage. The file holds synthetic patient data and SHALL
NOT be committed.

#### Scenario: Profile file written
- **WHEN** a profile is derived for a patient
- **THEN** a per-patient file is written that a person can read and edit before applying it, and the repository ignores it

### Requirement: Set the profile in VistA with a dry run first
The system SHALL set a profile on an existing patient through a dev-only RPC. A dry run SHALL be the default and SHALL
report, per field, the current value, the new value and whether it would change, without writing. Only an explicit apply
SHALL write. The RPC SHALL refuse to run on a production account and SHALL reject an unknown patient or a value that is not
valid for its VistA field, without writing any field for that patient.

#### Scenario: Dry run
- **WHEN** the profile is sent without the apply option
- **THEN** the response lists each field with old value, new value and changed or unchanged, and the patient record is not modified

#### Scenario: Apply
- **WHEN** the profile is sent with the apply option for a valid patient
- **THEN** the fields are written and the response lists what changed

#### Scenario: Invalid value
- **WHEN** a value does not match its field (for example an eligibility code or disability condition that does not exist on the system)
- **THEN** the RPC returns an error naming the field and value and writes nothing for that patient

#### Scenario: Production account
- **WHEN** the RPC is called on a production account
- **THEN** it returns an error and writes nothing

#### Scenario: Re-apply is safe
- **WHEN** the same profile is applied twice
- **THEN** the second apply reports no changes and creates no duplicate rated disabilities

### Requirement: Verify after writing
After an apply, the system SHALL read the patient back and confirm the service-connected flag, combined percentage, rated
disabilities and exposures match the profile, and report any mismatch.

#### Scenario: Verified
- **WHEN** an apply succeeds
- **THEN** the read-back values match the profile and the script reports the patient as verified

#### Scenario: Mismatch
- **WHEN** a read-back value differs from the profile
- **THEN** the script reports the field, the expected value and the value found
