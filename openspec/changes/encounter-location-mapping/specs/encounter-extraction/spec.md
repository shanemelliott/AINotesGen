## MODIFIED Requirements

### Requirement: One encounter per order date
The extractor SHALL create exactly one encounter for each distinct calendar date (YYYYMMDD) on which the patient has at least one order. Its date/time SHALL be the earliest order start time on that date. Its clinic SHALL be the hospital location of the patient's visit on that date: when the date has more than one visit, the earliest, preferring the emergency department when visits share a time; when the date has no visit, the location of the earliest order that day. Encounters SHALL be output in ascending date order, with a sequence number starting at 1.

#### Scenario: Encounters for the test patient
- **WHEN** the extractor runs against `100965.json`
- **THEN** it outputs 38 encounters, the first dated 1980-06-20 and the last dated 2026-07-03

#### Scenario: Multiple orders on one date
- **WHEN** a date has several orders (for example 2025-10-04 has 16 lab orders)
- **THEN** a single encounter is produced containing all of that date's orders

#### Scenario: Patient with no orders
- **WHEN** the input JSON has no order records
- **THEN** the extractor exits with a non-zero code and a message stating that no orders were found

#### Scenario: Specialty visit
- **WHEN** the day's visit is at CARDIOLOGY and its orders and labs carry the default location
- **THEN** the encounter's clinic is CARDIOLOGY

#### Scenario: Emergency and specialty visit at the same time
- **WHEN** an emergency department visit and a CARDIOLOGY visit share the same time on one date
- **THEN** the encounter's clinic is EMERGENCY DEPARTMENT

#### Scenario: No visit on the date
- **WHEN** a date has orders but no visit
- **THEN** the encounter's clinic is the location of the day's earliest order

