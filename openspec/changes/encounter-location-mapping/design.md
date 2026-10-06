# Design

## Context

The SYN loader filed every visit at the "OP" location from its map (GENERAL MEDICINE). Orders, labs and vitals carry that same default location, so the VPR gave no sign of a visit's real clinic apart from the visit record itself. Appointments were created in one clinic (`DEV PACT MD 4`, clinic 532, resource 185). The clinic-selection requirement for the load itself was added to `synthea-fhir-load` when `synthea-fhir-rpc-loader` was archived, so this change covers the appointment and extraction side.

## Goals / Non-Goals

**Goals:**
- Visits and appointments in ED and specialty clinics for loaded patients.
- Nothing changes for patients already loaded at GENERAL MEDICINE.

**Non-Goals:**
- A walk-in appointment flow: `SDES2 CREATE WALKIN APPT` rejects past start times and failed on the ED clinic, which lacks an availability setup, so ED history is booked with `SDEC ARSET` and `SDEC APPADD` instead.
- Provider assignment per clinic (a separate plan item).
- Dental, OB/GYN and pediatric clinics: dental visits are loaded but not yet extracted as encounters; no OB/GYN or pediatric clinics exist in the test system.

## Decisions

- **Location map lives in a new routine** (`CDSPENC`) with one added line in `SYNFENC`, so a SYN reinstall removes only one line and the table survives. Order: emergency class, encounter type, reason code. Names are checked against the hospital location file and fall back to the default.
- **Lookup file for appointments** (`src/clinic-lookup.json`) holds clinic IEN and resource IEN for each clinic the loader can use. GENERAL MEDICINE is deliberately left out: its resource has a home-care stop code, and leaving it out keeps existing patients on the default clinic.
- **Encounter clinic from the visit**, because order locations are always the default.
- **Past dates use overbook.** Tested bookings in 1978 were accepted in the default clinic, CARDIOLOGY, PULMONARY, DENTAL (overbook limit 0), HEMODIALYSIS and EMERGENCY DEPARTMENT, so the per-day overbook limit did not block them.

## Risks / Trade-offs

- The reason-code table is built from reasons seen in 11 local bundles; other bundles will have reasons that fall back to the default.
- One extracted day has one clinic; a day with visits in two clinics gets one note and one appointment.
- Visit days with no orders, labs or meds are not extracted, so those visits (for example dental) get no note or appointment.
- Main spec `appointment-creation` still contains scenarios that name clinic 23 and resource 2 for GENERAL MEDICINE; they predate this change and were not rewritten.
