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
- [ ] 4.2 Extract every visit day, so visits without orders, labs or meds (for example dental) get notes and appointments
- [ ] 4.3 Key the appointment duplicate check on date and clinic, not date alone
- [ ] 4.4 Cancel the test appointments left on DFN 100969 (61664 to 61667, 61669, 61670) and the half-written entry from the failed ED walk-in
- [ ] 4.5 Investigate the 6 encounters that failed to load for DFN 100970
