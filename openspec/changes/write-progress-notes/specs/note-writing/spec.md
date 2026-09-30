# Spec Delta

## Purpose

Write AI-generated progress notes to VistA as TIU documents for each historical encounter, tied to the patient's appointment/visit, with idempotent re-runs, optional electronic signature, and dry-run support.

## ADDED Requirements

### Requirement: Generate note text via existing AI pipeline
The system SHALL reuse `test-ai.js`'s `buildContext()`/`buildInstructions()`/note-generation and `stripMarkerLine()`/`validateNote()` functions to produce marker-stripped, validated note text for a given encounter before writing it to VistA.

#### Scenario: Generate note for an encounter
- **WHEN** processing encounter date 2025-10-21 for DFN 100965
- **THEN** call the AI note generation pipeline from Task 3
- **AND** strip the marker line before sending TEXT lines to TIU CREATE RECORD
- **AND** validate the note (6 headings, ≤80 char lines, no markdown) before writing

#### Scenario: Skip encounter on validation failure
- **WHEN** validateNote() reports a failure (e.g., missing heading)
- **THEN** skip writing that note, log the validation error, and continue to the next encounter

### Requirement: Convert encounter date/time to FileMan format
The system SHALL convert the encounter's date/time to FileMan format (`YYYMMDD.HHMM`, years since 1700) for use in the TIU visit string.

#### Scenario: Convert 2025-10-21 10:00
- **WHEN** encounter date is 2025-10-21 at 10:00
- **THEN** FileMan datetime is `3251021.1000`

### Requirement: Build visit string tied to appointment
The system SHALL construct the TIU visit string as `<locationIEN>;<FMdatetime>;A` using the clinic IEN from `src/appointments.json` for that encounter date (all encounters have an appointment after Task 4).

#### Scenario: Visit string for encounter with known appointment
- **WHEN** encounter date 2025-10-21 has appointmentIen 60994 and clinicIen 532 in `src/appointments.json`
- **THEN** visit string is `532;3251021.1000;A`

#### Scenario: Missing appointment record (fallback)
- **WHEN** an encounter date has no matching entry in `src/appointments.json`
- **THEN** fall back to visit type `E` (historical, no visit link) with the default clinic IEN from config
- **AND** log a warning that no appointment was found for that date

### Requirement: Call TIU CREATE RECORD
The system SHALL call RPC `TIU CREATE RECORD` with DFN, note title IEN, location IEN, TEXT lines (one array entry per line, 1-indexed), and visit string; extract the created TIU document IEN from the response.

#### Scenario: Create note successfully
- **WHEN** calling TIU CREATE RECORD with valid params
- **THEN** the RPC returns a positive TIU document IEN
- **AND** the system logs the IEN

#### Scenario: Text line construction
- **WHEN** note body has N lines after marker stripping
- **THEN** TIUX parameter includes `'"TEXT",1,0'` through `'"TEXT",N,0'` keyed entries, one per line, in order

### Requirement: Notes unsigned by default; optional signing
The system SHALL create notes unsigned by default. When `--sign` is passed, it SHALL call `TIU SIGN RECORD` with the TIU document IEN and the electronic signature code from config.

#### Scenario: Default unsigned
- **WHEN** running without `--sign`
- **THEN** note is created via TIU CREATE RECORD only; no TIU SIGN RECORD call is made

#### Scenario: Sign flag set
- **WHEN** running with `--sign`
- **THEN** after TIU CREATE RECORD succeeds, call TIU SIGN RECORD with the new TIU IEN and esig code
- **AND** log signing success/failure separately from creation success/failure

### Requirement: Track created notes for idempotence
The system SHALL log each created note (dfn, date, tiuIen, appointmentIen, signed, createdAt) to `src/notes.json`; on re-run, skip dates already present in the log.

#### Scenario: First run creates notes
- **WHEN** `src/notes.json` is empty
- **THEN** loop over all encounters for the patient, generate and write a note for each
- **AND** write results to notes.json with fields: dfn, date, tiuIen, appointmentIen, signed, createdAt

#### Scenario: Second run is idempotent
- **WHEN** `src/notes.json` already contains an entry for 2025-10-21
- **THEN** skip that date and report "note already created" to console

### Requirement: Support dry-run mode
The system SHALL accept a `--dry-run` flag; when set, generate and print note text plus TIU CREATE RECORD params without calling the RPC or writing to `src/notes.json`.

#### Scenario: Dry-run preview
- **WHEN** called with `--dry-run`
- **THEN** show: encounter date, generated note text, visit string, TIU CREATE RECORD params
- **AND** do NOT make RPC calls or update src/notes.json

### Requirement: Handle errors and continue batch
The system SHALL catch RPC failures and note-generation failures per encounter, log the error, and continue to the next encounter; report a summary at the end (created, skipped, failed).

#### Scenario: Single encounter failure
- **WHEN** TIU CREATE RECORD fails for one encounter (e.g., invalid title IEN)
- **THEN** log the error with date and reason, continue to next encounter
- **AND** include it in the final "failed" count
