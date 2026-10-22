# Tasks

## 1. Server side

- [x] 1.1 Add `CDSPENC` (class, type and reason code to hospital location) to cds-vista-routines
- [x] 1.2 Add the one-line call in `SYNFENC` (`patches/synfenc-location.txt`) and compile on dev
- [x] 1.3 Load Shonta375 (DFN 100970) and confirm visits land at EMERGENCY DEPARTMENT, CARDIOLOGY and DENTAL

## 2. Clinic lookup

- [x] 2.1 Add `fetch-clinics.js` (SDES GET CLINIC INFO2) and look up the candidate clinics
- [x] 2.2 Add `src/clinic-lookup.json` with clinic and resource IENs
- [x] 2.3 Add `verify-clinics.js` with the availability pattern decoded
- [x] 2.4 Document the availability pattern and the lookup (`docs/CLINIC-AVAILABILITY.md`)

## 3. Appointments and extraction

- [x] 3.1 Choose clinic and resource per encounter in `create-appointments.js`; default clinic for unknown locations
- [x] 3.2 Take an encounter's clinic from the visit in `src/encounters.js`
- [x] 3.3 Book past-dated test appointments in DENTAL, HEMODIALYSIS, PULMONARY, CARDIOLOGY and EMERGENCY DEPARTMENT
- [x] 3.4 Create and sign appointments and notes for DFN 100970 (28 of 28 signed)
- [x] 3.5 Smoke test `SDES2 CREATE WALKIN APPT` and record its limits (`test-walkin.js`, `docs/APPOINTMENT-RPCS.md`)

## 4. Follow-up

- [ ] 4.1 Prove the PULMONARY, SLEEP LAB, HEMATOLOGY, DIABETIC and HEMODIALYSIS rows on a real load (none appeared for DFN 100970)
- [x] 4.2 Extract every visit day (checked 2026-10-22: DFN 100974 has an encounter for each of its 177 visit dates, including DENTAL days with no orders)
- [x] 4.3 Key the appointment duplicate check on date and clinic (`create-appointments.js`, 2026-10-22)
- [ ] 4.4 Cancel the test appointments left on DFN 100969 (61664 to 61667, 61669, 61670) and the half-written entry from the failed ED walk-in
- [ ] 4.5 Investigate the 6 encounters that failed to load for DFN 100970
- [ ] 4.6 **NEXT** Load visits and book appointments at clinic-hour times, never at 00:00 (see "Known issue: midnight appointments" in `docs/APPOINTMENT-RPCS.md`)
  - [x] 4.6.1 Loader: `TIME^CDSPENC` plus one line in `SYNFENC` ([patches/synfenc-time.txt](../../../patches/synfenc-time.txt)) moves an outpatient visit outside 08:00 to 16:59 to hour 08 + (H mod 8) on the same date; ED and inpatient keep their times. Written 2026-10-14, not yet on dev
  - [x] 4.6.2 `create-appointments.js`: `appointmentSlot()` books clinic visits in clinic hours (same rule) and never books ED at 00:00; `buildDateParts` keeps a 23:xx appointment's end on the same day (an end of 00:00 made SDEC file it at `.24`)
  - [x] 4.6.3 Post-load check: `check-midnight.js <dfn>` fails if any visit or appointment is between 00:00 and 04:59 outside ED (2026-10-22; run after the load because the loader converts the times)
  - [ ] 4.6.4 Test on a fresh patient: CPRS cover sheet shows real dates, every note links to its appointment's visit (`logs/check-path.js`)
  - [ ] 4.6.5 Decide whether to move the existing midnight appointments for DFN 100973 (61), 100974 (3) and 100975 (77); try `SDEC APPDEL` on one first (its time check allows `.24`, untested), then rebook in clinic hours and relink the note; otherwise a DEV routine is needed
