# Spec Delta

## Purpose

Generate de-identified synthetic test patients and verbose specialty notes that
reproduce known AI summarization failure modes, so summaries can be tested without
real patient data.

## ADDED Requirements

### Requirement: Generated test patients contain no real identifiers
Generated bundles, supplement plans, notes, specs, tasks and logs SHALL contain only
synthetic names and identifiers. They SHALL NOT contain any name, identifier, date of
birth or record number from a reference patient.

#### Scenario: Bundle generated from a reference pattern
- **WHEN** a test patient bundle is generated
- **THEN** the patient name, identifiers and dates are synthetic
- **AND** a search of the output for reference-patient identifiers finds no match

### Requirement: Supplement plan for data the loader cannot file
The generator SHALL write a supplement plan listing labs and vitals that the bundle
loader cannot file, in the format that the lab and vitals import tool accepts.

#### Scenario: eGFR, FIT and SpO2 supplemented
- **WHEN** the bundle includes eGFR, fecal immunochemical test and pulse oximetry
  observations
- **THEN** the supplement plan lists them with a VistA test or vital type, a sample
  and a result
- **AND** applying the plan makes them appear in the patient's VPR

### Requirement: Verbose specialty notes
The note generator SHALL write long specialty notes (primary care, cardiology,
nephrology, GI, anticoagulation, plus one template-only note) for a chosen date. Each
note SHALL begin with a synthetic-data marker line and SHALL use plain-text lines of
no more than 80 characters.

#### Scenario: Notes generated for the test patient
- **WHEN** the note generator runs for a DFN
- **THEN** it writes one ready note plus metadata per specialty
- **AND** no line is longer than 80 characters and no patient identifier appears

#### Scenario: Notes booked and filed
- **WHEN** the generator runs with booking enabled and the notes are signed
- **THEN** each note has an appointment at its clinic and time
- **AND** the signed note links to that appointment's visit
