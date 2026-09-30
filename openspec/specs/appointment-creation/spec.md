# appointment-creation Specification

## Purpose
Create historical appointments in VistA for past encounter dates via SDEC ARSET/APPADD RPC calls, authenticated with PIV credentials through a token server. Support idempotent re-runs, dry-run mode, and detailed logging of created appointments.

## Requirements

### Requirement: Create appointment request via SDEC ARSET
The system SHALL call RPC `SDEC ARSET` with patient DFN, clinic IEN, desired date, and request metadata to create an appointment request; extract the request IEN from the response (after record separator ASCII 30).

#### Scenario: Create request for missing date
- **WHEN** encounter date 2025-10-21 has no appointment
- **THEN** call SDEC ARSET with patient DFN 100965, clinic IEN 23, desired date 10/21/2025
- **AND** extract requestIEN from response (`\x1E{requestIEN}`)

#### Scenario: Clinic and date mapping
- **WHEN** encounter has `clinic` and `date` fields
- **THEN** ARSET params include: patient DFN, clinic name, clinic IEN (23 for GENERAL MEDICINE), desired date in MM/DD/YYYY format

### Requirement: Create appointment via SDEC APPADD
The system SHALL call RPC `SDEC APPADD` with start datetime, end datetime, patient DFN, resource IEN, and duration to create the appointment; extract appointment IEN from response.

#### Scenario: Create appointment from request
- **WHEN** ARSET successfully returns requestIEN
- **THEN** call SDEC APPADD with: start datetime, end datetime (1 hour later), patient DFN, resource IEN (2 for GENERAL MEDICINE), duration 60 minutes
- **AND** extract appointmentIEN from response

#### Scenario: Duration and time calculation
- **WHEN** encounter date is 2025-10-21 at 10:00
- **THEN** appointment start is 10/21/2025@10:00, end is 10/21/2025@11:00, duration is 60 minutes

### Requirement: Support PIV card authentication via token server
The system SHALL get a JWT token from a token server (via TOKEN_SERVER_URL), extract the DUZ for the site from the token payload, and use the token in Vista-API-X RPC calls.

#### Scenario: Get token from server
- **WHEN** TOKEN_SERVER_URL is configured (e.g., http://localhost:3000)
- **THEN** system makes GET request to token server and receives JWT
- **AND** extracts vistaIds[].duz for configured VISTA_SITE_ID from JWT payload

#### Scenario: Authenticate RPC calls
- **WHEN** calling Vista-API-X RPC endpoint
- **THEN** request includes headers: `Authorization: Bearer {token}`, `X-OCTO-VistA-API: {apiKey}`

### Requirement: Support Vista-API-X RPC invocation
The system SHALL call Vista-API-X endpoint `/vista-sites/{siteId}/users/{duz}/rpc/invoke` with normalized RPC parameters; extract payload from response.

#### Scenario: ARSET RPC call
- **WHEN** creating appointment request
- **THEN** POST to `{VISTA_API_BASE_URL}/vista-sites/{VISTA_SITE_ID}/users/{duz}/rpc/invoke`
- **AND** body includes: `context: "SDECRPC"`, `rpc: "SDEC ARSET"`, `parameters: [{string: "value"}, ...]`
- **AND** extract response.payload

#### Scenario: Parameter normalization
- **WHEN** parameters are provided as strings or mixed types
- **THEN** normalize all to `{string: "value"}` format before sending

### Requirement: Track created appointments for idempotence
The system SHALL log each created appointment (DFN, date, requestIEN, appointmentIEN) to `src/appointments.json`; on re-run, skip dates already present in the log.

#### Scenario: First run creates appointments
- **WHEN** `src/appointments.json` is empty
- **THEN** loop over 7 missing dates, create ARSET/APPADD for each
- **AND** write results to appointments.json with fields: dfn, date, requestIEN, appointmentIEN, createdAt

#### Scenario: Second run is idempotent
- **WHEN** `src/appointments.json` already contains entry for 2025-10-21
- **THEN** skip that date (don't call ARSET/APPADD again)
- **AND** report "appointment already created" to console

### Requirement: Support dry-run mode
The system SHALL accept a `--dry-run` flag; when set, log what would be created without calling RPC endpoints.

#### Scenario: Dry-run preview
- **WHEN** called with `--dry-run` flag
- **THEN** show: dates to process, clinic/resource IENs, ARSET parameters
- **AND** do NOT make RPC calls
- **AND** do NOT update src/appointments.json

### Requirement: Handle errors and retry logic
The system SHALL catch RPC failures (timeouts, 4xx, 5xx), log the error, and continue to next date; at end, report summary (created, skipped, failed).

#### Scenario: Transient failure (e.g., 502)
- **WHEN** ARSET call returns HTTP 502
- **THEN** log error with date and RPC name
- **AND** continue to next date
- **AND** mark in summary as "failed"

#### Scenario: Fatal error (e.g., missing DUZ)
- **WHEN** token extraction fails (no vistaIds for siteId)
- **THEN** fail early with clear error message
- **AND** do NOT create appointments

### Requirement: Log appointments.json with audit trail
The system SHALL write appointment results in JSON format with: dfn, encounter date, request IEN, appointment IEN, clinic IEN, resource IEN, created timestamp.

#### Scenario: Appointments log entry
- **WHEN** appointment created successfully
- **THEN** write to appointments.json: `{dfn: "100965", date: "2025-10-21", requestIEN: "123", appointmentIEN: "456", clinicIEN: "23", resourceIEN: "2", createdAt: "2026-09-29T...Z"}`

### Requirement: Support configurable clinic and resource IENs
The system SHALL use VISTA_CLINIC_IEN (default 23 = GENERAL MEDICINE) and VISTA_RESOURCE_IEN (default 2) from environment or config; log values at startup.

#### Scenario: Default clinics
- **WHEN** .env has VISTA_CLINIC_IEN=23 (GENERAL MEDICINE)
- **THEN** all appointments created in that clinic
- **AND** log "Using clinic IEN 23 (GENERAL MEDICINE)"

#### Scenario: Custom clinic
- **WHEN** .env has VISTA_CLINIC_IEN=17 (MENTAL HYGIENE)
- **THEN** use clinic 17 instead

### Requirement: Smoke test - create single past appointment
The system SHALL include a smoke test (`test-create-appointment.js`) that creates one appointment for a specific historical date (2025-10-21, DFN 100965) to verify ARSET/APPADD flow before batch processing.

#### Scenario: Smoke test succeeds
- **WHEN** running `node test-create-appointment.js --dfn 100965 --date 2025-10-21`
- **THEN** call SDEC ARSET with date 10/21/2025
- **AND** call SDEC APPADD with requestIEN returned from ARSET
- **AND** print HTTP status, requestIEN, appointmentIEN, and latency
- **AND** exit 0 if both RPCs succeed

#### Scenario: Smoke test handles missing config
- **WHEN** TOKEN_SERVER_URL or VISTA_API_BASE_URL is not set
- **THEN** fail with clear error message naming the missing variable
- **AND** exit 1

#### Scenario: Smoke test supports dry-run
- **WHEN** running with `--dry-run` flag
- **THEN** show what would be created (ARSET/APPADD parameters)
- **AND** do NOT make RPC calls
- **AND** exit 0
