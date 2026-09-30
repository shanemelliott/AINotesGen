# ai-note-generation Specification

## Purpose
Generate a synthetic clinical progress note from structured VPR encounter data for a fictional test patient using the VA Azure OpenAI endpoint, so that notes can later be written to VistA TIU for generated encounters.

## Requirements

### Requirement: Credential handling
The note generator SHALL read the Azure OpenAI API key from the `AZURE_OPENAI_API_KEY` environment variable loaded from `../VAOSAI/.env`. It MUST NOT print, log, or persist the key.

#### Scenario: Key present
- **WHEN** the generator runs and `AZURE_OPENAI_API_KEY` is set
- **THEN** requests are sent with the key in the `api-key` header
- **AND** no output contains the key value

#### Scenario: Key missing
- **WHEN** the generator runs and `AZURE_OPENAI_API_KEY` is not set
- **THEN** it exits with a non-zero code and a message naming the missing variable, without making any network request

### Requirement: Encounter context from patient JSON
The note generator SHALL build the clinical context for one encounter date from the patient VPR JSON. The context SHALL include: patient age at the encounter and gender; orders started on that date; lab results linked to those orders; outpatient meds active on that date; problems with onset on or before that date (deduplicated by text); the most recent vitals on or before that date; and lab results from the preceding 90 days as recent history.

#### Scenario: Test encounter assembled
- **WHEN** the generator runs against `100965.json` for encounter date 2025-10-21
- **THEN** the context contains the BASIC METABOLIC PANEL order with its linked lab results, and the FUROSEMIDE, CARVEDILOL, and LISINOPRIL orders
- **AND** it contains the 2025-10-04 lab results as recent history

#### Scenario: Encounter date has no orders
- **WHEN** the requested date has no orders in the patient JSON
- **THEN** the generator exits with a non-zero code and a message stating that no orders were found for that date

### Requirement: Data minimization
The context sent to the LLM MUST NOT contain SSN, address, telecom, ICN, or the patient's name. It SHALL contain only the clinical fields needed to write the note.

#### Scenario: Identifiers excluded
- **WHEN** the prompt payload is built
- **THEN** it contains none of the patient record's `ssn`, `addresses`, `telecoms`, `icn`, or `fullName` values

### Requirement: Synthetic note output format
The generated note SHALL be a SOAP-format outpatient progress note in plain text. Its first line MUST be exactly `*** SYNTHETIC TEST NOTE - FICTIONAL PATIENT - NOT FOR CLINICAL USE ***`. It SHALL contain these section headings, each on its own line and in this order: `VISIT DATE:`, `CHIEF COMPLAINT:`, `SUBJECTIVE:`, `OBJECTIVE:`, `ASSESSMENT:`, `PLAN:`. The `VISIT DATE:` line SHALL include the encounter date (MM/DD/YYYY) and clinic name. `OBJECTIVE:` SHALL list vitals and pertinent labs with values and abnormal flags. `ASSESSMENT:` SHALL be a numbered problem list, and `PLAN:` SHALL address each assessed problem (medications started or changed, labs ordered, follow-up). No line SHALL exceed 80 characters, and the note MUST NOT contain markdown formatting.

#### Scenario: Format check passes
- **WHEN** the LLM returns a note
- **THEN** the generator reports whether the first line is the synthetic marker, whether all required headings are present in order, the maximum line length, and whether markdown characters (`#`, `**`, backtick fences) are present
- **AND** it reports PASS only when all four checks pass

#### Scenario: Missing section
- **WHEN** the returned note lacks any required heading or has headings out of order
- **THEN** the format check reports FAIL and names the missing or misordered headings

#### Scenario: Note grounded in provided data
- **WHEN** the LLM returns a note
- **THEN** any lab values the note cites match values present in the provided context

### Requirement: Model candidate reporting
The generator SHALL try each configured model/api-version candidate in order. For each candidate it SHALL report the HTTP status, latency, token usage (if returned), and whether the response was a refusal or a content-filter block. A failed candidate MUST NOT stop the remaining candidates from being tried.

#### Scenario: One candidate fails
- **WHEN** the first candidate returns an HTTP error (for example 404 or 400)
- **THEN** the generator reports that error and continues with the next candidate

#### Scenario: Summary
- **WHEN** all candidates have been tried
- **THEN** the generator prints a summary table of candidates with success/failure
- **AND** it exits with code 0 if at least one candidate produced a note that passes the format check, otherwise non-zero

#### Scenario: Content filter
- **WHEN** a candidate's response is blocked by the Azure content filter
- **THEN** the generator reports the candidate as `content-filtered`, including the filter category if one is provided
