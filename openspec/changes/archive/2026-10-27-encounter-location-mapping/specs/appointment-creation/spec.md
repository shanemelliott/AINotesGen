## ADDED Requirements

### Requirement: Choose the appointment clinic and resource from the visit location
The system SHALL create each appointment in the clinic named by the encounter's visit location, using that clinic's own SDEC resource, taken from a maintained lookup of clinic name to clinic IEN and resource IEN. A visit location that is not in the lookup SHALL use the configured default clinic.

#### Scenario: Specialty visit
- **WHEN** an encounter's visit location is CARDIOLOGY
- **THEN** the appointment is created with CARDIOLOGY's clinic IEN and resource IEN

#### Scenario: Emergency department visit
- **WHEN** an encounter's visit location is EMERGENCY DEPARTMENT
- **THEN** the appointment is created in that clinic like any other, dated in the past with overbooking on

#### Scenario: Location not in the lookup
- **WHEN** an encounter's visit location is GENERAL MEDICINE, or any name not in the lookup
- **THEN** the appointment is created in the default clinic

#### Scenario: Dry run shows the clinic
- **WHEN** the appointment script runs with `--dry-run`
- **THEN** each line names the clinic and its clinic and resource IENs that would be used, and nothing is created

### Requirement: Verify that lookup clinics can take appointments
The system SHALL provide a read-only check that, for each clinic in the lookup, reports whether the clinic is active, whether its resource IEN matches the server, and how many appointment slots are open in a date window, decoding the availability pattern (0-9 and j-z as 0-26 open slots; A-W and the characters `*$!@#` as overbooks).

#### Scenario: Resource mismatch
- **WHEN** a lookup entry's resource IEN differs from the server's
- **THEN** the check reports the mismatch for that clinic
