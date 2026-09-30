# Spec Delta

## Purpose

Derive a fictional test patient's historical encounters from the order dates in their VPR JSON and assemble each encounter's minimized clinical context, so that appointments and synthetic progress notes can be generated for those encounters.

## ADDED Requirements

### Requirement: One encounter per order date
The extractor SHALL create exactly one encounter for each distinct calendar date (YYYYMMDD) on which the patient has at least one order. Its date/time SHALL be the earliest order start time on that date, and its clinic SHALL be the location of the earliest order that day. Encounters SHALL be output in ascending date order, with a sequence number starting at 1.

#### Scenario: Encounters for the test patient
- **WHEN** the extractor runs against `100965.json`
- **THEN** it outputs 38 encounters, the first dated 1980-06-20 and the last dated 2026-07-03

#### Scenario: Multiple orders on one date
- **WHEN** a date has several orders (for example 2025-10-04 has 16 lab orders)
- **THEN** a single encounter is produced containing all of that date's orders

#### Scenario: Patient with no orders
- **WHEN** the input JSON has no order records
- **THEN** the extractor exits with a non-zero code and a message stating that no orders were found

### Requirement: Encounter clinical context
Each encounter SHALL include:
- patient age on the encounter date, and gender
- the orders started that day (name, service, status)
- the lab results linked through each order's `results[].uid`, falling back to labs observed that day when an order has no linked results
- meds whose order started that day, flagged as new
- other meds active on that date
- the most recent vitals observed on or before that date, with their observation date
- lab results from the preceding 90 days as recent history
- the categorized problems defined in the problem-categorization requirement

Each lab result SHALL carry an abnormal flag. The flag SHALL be taken from the record's interpretation when present, otherwise computed from `low`/`high`.

#### Scenario: Test encounter context
- **WHEN** the extractor runs against `100965.json`
- **THEN** the 2025-10-21 encounter contains the BASIC METABOLIC PANEL with its 8 linked results
- **AND** it lists FUROSEMIDE, CARVEDILOL, and LISINOPRIL as new meds
- **AND** its recent lab history includes the 2025-10-04 results

#### Scenario: No vitals on the encounter date
- **WHEN** no vitals were observed on the encounter date
- **THEN** the encounter contains the latest earlier vitals, each labeled with its observation date

### Requirement: Problem categorization
Every problem with onset on or before the encounter date SHALL be placed in exactly one category, using an editable rules file of text patterns:
- `social`: social determinants such as employment, education, housing, criminal record, isolation, abuse, or violence
- `administrative`: for example "Medication review due"
- `acute`: self-limited conditions
- `clinical`: everything else

Problems SHALL be deduplicated by text, keeping the most recent onset. In the encounter, `clinical` problems SHALL appear under `problems`. `acute` problems SHALL appear under `problems` only when their onset is within 365 days before the encounter date. `social` problems SHALL appear under `socialHistory`. `administrative` problems SHALL be omitted. The Synthea `ACTIVE`/`INACTIVE` status and `resolved` date SHALL NOT be used to include or exclude problems.

#### Scenario: Social determinants separated
- **WHEN** the 2025-10-21 encounter for `100965.json` is built
- **THEN** "Full-time employment", "Has a criminal record", and "Social isolation" appear under `socialHistory` and not under `problems`

#### Scenario: Old acute problems dropped
- **WHEN** the 2025-10-21 encounter for `100965.json` is built
- **THEN** "Acute viral pharyngitis" (onset 1991) and "Fracture of forearm" (onset 1987) do not appear under `problems`
- **AND** "Normal pregnancy" (onset 2025-10-10) does appear under `problems`

#### Scenario: Rules are editable
- **WHEN** a pattern is added to the rules file
- **THEN** the next extraction categorizes matching problems accordingly, with no code change

### Requirement: Link to existing VistA visits and appointments
Each encounter SHALL list the uids, date/times, and locations of any VPR `visit` and `appointment` records on the same date, including the appointment status. It SHALL set `hasAppointment` to true or false.

#### Scenario: Existing visit found
- **WHEN** the 2025-10-21 encounter for `100965.json` is built
- **THEN** it references visit `urn:va:visit:84F0:100965:14410` and has `hasAppointment` false

#### Scenario: Dates without appointments
- **WHEN** the extractor runs against `100965.json`
- **THEN** exactly 7 encounters have `hasAppointment` false: 1980-06-20, 1986-06-06, 1987-03-12, 2016-10-28, 2025-10-04, 2025-10-21, 2026-04-19

### Requirement: Suggested visit type
Each encounter SHALL include a `suggestedVisitType` of `New patient` for the first encounter and `Follow-up` for all later encounters. Each encounter SHALL include `kind` with the value `historical`.

#### Scenario: First and later encounters
- **WHEN** the extractor runs against `100965.json`
- **THEN** encounter 1 has `suggestedVisitType` "New patient" and encounter 2 has "Follow-up"
- **AND** every encounter has `kind` "historical"

### Requirement: Visit-linked clinical details
For each encounter, the extractor SHALL collect the records whose `encounterUid` matches any VPR visit on the encounter date, and output them as:
- `visitDiagnoses`: from `pov` records (name, ICD code, primary/secondary) plus the visit's `reasonName`/`reasonUid` when it isn't already listed
- `procedures`: from `cpt` records, excluding "OUTPATIENT ENCOUNTER"
- `immunizations`: names from `immunization` records
- `carePlanActivities`: from `factor` records whose name starts with `SYN ACT`, with the `SYN ACT` prefix and trailing SNOMED code removed

Each list SHALL be empty (not missing) when there is no data. `treatment` records SHALL be ignored, because they duplicate orders.

#### Scenario: Heart-failure diagnosis surfaced
- **WHEN** the 2025-10-21 encounter for `100965.json` is built
- **THEN** `visitDiagnoses` contains "Left ventricular failure, unspecified" with ICD code I50.1, listed once
- **AND** `carePlanActivities` contains "LOW SALT DIET EDUCATION (PROCEDURE)" and "PHYSICAL EXERCISES (REGIME/THERAPY)"

#### Scenario: Procedures and immunizations
- **WHEN** the 2025-10-04 and 2022-07-01 encounters for `100965.json` are built
- **THEN** 2025-10-04 `procedures` contains "PLAIN CHEST X-RAY (PROCEDURE)" and not "OUTPATIENT ENCOUNTER"
- **AND** 2022-07-01 `immunizations` contains "INFLUENZA, SEASONAL, INJECTABLE, PRESERVATIVE FREE", "TD (ADULT) PRESERVATIVE FREE", and "HEP A, ADULT"

#### Scenario: No visit-linked data
- **WHEN** an encounter's visit has no linked pov, cpt, immunization, or factor records
- **THEN** those four lists are present and empty

### Requirement: Identifier exclusion
The output MUST NOT contain the patient's name, SSN, ICN, addresses, or telecoms. It SHALL identify the patient only by DFN. If any such identifier value is found in the output, the extractor MUST exit non-zero without writing the file.

#### Scenario: Output scanned before write
- **WHEN** the output is serialized
- **THEN** it is checked against the patient record's identifier values, and it is written only if none are present

### Requirement: CLI and output
The extractor SHALL accept `--dfn <dfn>` for a single patient. With no `--dfn`, it SHALL process every `[0-9]*.json` file in the repo root. It SHALL write `output/encounters-<dfn>.json`, containing the DFN, an extraction timestamp, the encounter count, and the encounters. With `--summary` it SHALL print one line per encounter with: sequence, date, clinic, number of orders, number of labs, number of new meds, number of problems, and whether an appointment exists.

#### Scenario: Single patient run
- **WHEN** `node extract-encounters.js --dfn 100965` runs
- **THEN** `output/encounters-100965.json` is written and a count of encounters is printed

#### Scenario: Missing patient file
- **WHEN** `--dfn` names a DFN with no matching JSON file
- **THEN** the extractor exits non-zero with a message naming the missing file
