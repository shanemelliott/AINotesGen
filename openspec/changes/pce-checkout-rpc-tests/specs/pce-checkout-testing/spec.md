# Spec Delta

## Purpose

Defines the dev-only test harness that shows whether PXRPC SAVE2, ORWPCE SAVE and the scheduling check-out RPC set the encounter and appointment check-out, so an RPC recommendation rests on observed behavior.

## ADDED Requirements

### Requirement: Dev-only execution with preview
The harness SHALL run only against station 500 dev, SHALL refuse to run if the configured site is not the dev site, and SHALL support a preview mode that prints the planned RPC calls without writing to VistA.

#### Scenario: Preview makes no writes
- **WHEN** a test is run with the preview flag
- **THEN** it prints the RPC names, contexts and parameters it would send, and makes no write RPC calls

#### Scenario: Wrong site is refused
- **WHEN** the configured site id is not the station 500 dev site
- **THEN** the harness exits with an error before any RPC call

### Requirement: Fresh appointment fixture
Each test run SHALL create its own scheduled appointment for the fixture patient (DFN 100969) in the fixture clinic (IEN 532), SHALL check it in unless the scenario is a no-check-in case, and SHALL record the appointment IEN, appointment date/time and visit IEN it used.

#### Scenario: Checked-in fixture
- **WHEN** a test that requires a checked-in appointment starts
- **THEN** the appointment exists, has a check-in date/time, and has no check-out date/time before the RPC under test is called

#### Scenario: No-check-in fixture
- **WHEN** a no-check-in test starts
- **THEN** the appointment exists with an empty check-in date/time

### Requirement: Before and after snapshots
For every RPC call under test the harness SHALL capture the raw RPC response and SHALL snapshot, before and after the call, the visit check-out and source fields, the outpatient encounter status and check-out fields, the clinic appointment check-in and check-out fields, and the SDEC appointment check-out fields.

#### Scenario: Snapshot contents
- **WHEN** a test finishes
- **THEN** its JSON record holds the response, a before snapshot and an after snapshot, each with the four record types and their field values

#### Scenario: Result persisted
- **WHEN** a test finishes, passes or fails
- **THEN** the record is written under `logs/pce-checkout/` with the test id and a timestamp in the file name

### Requirement: Test matrix coverage
The harness SHALL implement these tests, each with a stated expectation taken from the research document, and SHALL report match, unexpected or error for each: T1, T1b and T1c (PXRPC SAVE2 with increasing data completeness, with and without check-in); T3, T3b and T3c (ORWPCE SAVE header only, with data, with data and service-connected answers); T6 and T6c (SAVE2 then ORWPCE SAVE on the same visit, incomplete and complete data); T8 and T8c (SAVE2 then SDES2 SET APPT CHECKOUT); T9 and T9c (SDES2 SET APPT CHECKOUT then SAVE2). T2 was dropped because a new visit cannot be filed without a service category. T4, T5 (auto check-out disabled) and T7 (DATA2PCE with a check-out date) are deferred.
T1 SAVE2 with diagnosis and procedure on a checked-in appointment; T1b the same without check-in; T2 T1 plus a service-category line; T3 ORWPCE SAVE header only with auto check-out enabled; T4 T3 with auto check-out disabled; T5 T4 with a diagnosis; T6 SAVE2 followed by ORWPCE SAVE on the same visit; T8 SAVE2 followed by SDES2 SET APPT CHECKOUT; T9 SDES2 SET APPT CHECKOUT followed by SAVE2. T7 (DATA2PCE with a check-out date) is optional.

#### Scenario: Expectation recorded
- **WHEN** a test finishes
- **THEN** the report states the expected outcome, the observed outcome, and whether they match

#### Scenario: Unexpected result is kept
- **WHEN** the observed outcome differs from the expectation
- **THEN** the test is reported as unexpected with the snapshots attached, and the run continues with the next test

### Requirement: Parameter toggle is reversible
When T4 and T5 are run (deferred), they SHALL set `ORWPCE DISABLE AUTO CHECKOUT` only for the fixture clinic, SHALL record the prior value, and SHALL restore it even if the test fails.

#### Scenario: Restored after failure
- **WHEN** T4 fails after the parameter was set
- **THEN** the parameter on the fixture clinic is returned to its recorded prior value before the harness exits

### Requirement: Cleanup and traceability
The harness SHALL log every appointment IEN and visit IEN it created, SHALL NOT delete data it did not create, and SHALL NOT log tokens or access/verify codes.

#### Scenario: Created records listed
- **WHEN** a run finishes
- **THEN** a summary lists every appointment and visit IEN the run created

### Requirement: Findings reach the research document
After a full run the research document SHALL be updated so each of its open questions is marked confirmed, refuted, or still open, with the test id that supports it.

#### Scenario: Open question closed
- **WHEN** T1b shows whether SAVE2 checks out an appointment-attached encounter without a check-in
- **THEN** the research document's claim about the "Appointment attached" reason is marked confirmed or refuted citing T1b
