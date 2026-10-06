# Creating appointments in VistA by RPC

Short answer: yes. Appointments are created with two SDECRPC calls, `SDEC ARSET` then `SDEC APPADD`. They work for past, present and future dates and for any clinic that has an SDEC resource, including the Emergency Department and specialty clinics. This repo uses them to give synthetic patients past appointments before writing notes against them.

Tested against SQA/VEHU (station 500) on 2026-10-06 through vista-api-x, context `SDECRPC`.

## The two-call path (used by this repo)

| Step | RPC | Purpose | Returns |
|------|-----|---------|---------|
| 1 | `SDEC ARSET` | Creates the appointment request (SDEC APPT REQUEST, #409.85) | A string whose first `\x1E`-delimited number is the request IEN |
| 2 | `SDEC APPADD` | Creates the appointment (SDEC APPOINTMENT, #409.84) against that request | A string whose first `\x1E`-delimited number is the appointment IEN; `0` means failure, with the error text after a `\|` |

Code: `createAppointment()` in [src/appointmentCreator.js](../src/appointmentCreator.js). Batch use: [create-appointments.js](../create-appointments.js).

Inputs you need for each appointment:
- the patient DFN
- the clinic IEN and clinic name (file #44)
- the clinic's SDEC resource IEN (see "Finding clinic and resource IENs")
- a start time, formatted `MMM DD, YYYY@HH:MM` (for example `MAR 04, 1977@10:00`); the end time is the start plus 60 minutes in the code
- whether to overbook (see "Past dates")

`SDEC ARSET` takes 29 positional string parameters and `SDEC APPADD` takes 25. The positions that matter, from the working code:

```
ARSET:  [1]=''  [2]=DFN  [3]=start  [4]=clinic name  [5]='APPT'  [6]=clinic IEN  [7]='SYSTEM USER'
        [8]='ASAP'  [9]='PATIENT'  [11]=desired date MM/DD/YYYY  ... (the rest as in buildArsetParams)
APPADD: [1]=start  [2]=end  [3]=DFN  [4]=resource IEN  [5]='60' (length)  [10]=desired date
        [15]='A|<request IEN>'  [18]=clinic IEN  [23]=overbook ('1' or '0')  ... (see buildAppaddParams)
```

Use `buildArsetParams` and `buildAppaddParams` in the source for the complete lists; do not rebuild them by hand.

## Past dates

Historical dates have no slot template, so the code books them with overbook on (`defaultOverbook()` is true for any date before today). Tested bookings in 1978 were accepted in the default clinic, CARDIOLOGY, PULMONARY, DENTAL, HEMODIALYSIS - MIKEB and EMERGENCY DEPARTMENT, including DENTAL, whose `OverbooksPerDayMax` is 0, so that limit did not stop them.

## Emergency Department and specialty visits

Both are only a matter of which clinic and resource IEN you pass. IENs checked on SQA/VEHU, 2026-10-06 (full list in [src/clinic-lookup.json](../src/clinic-lookup.json)):

| Clinic | Clinic IEN | Resource IEN |
|--------|-----------|--------------|
| EMERGENCY DEPARTMENT | 426 | 76 |
| CARDIOLOGY | 195 | 46 |
| PULMONARY | 429 | 79 |
| DENTAL | 228 | 53 |
| HEMATOLOGY | 229 | 54 |
| DIABETIC | 285 | 71 |
| SLEEP LAB | 430 | 80 |
| HEMODIALYSIS - MIKEB | 257 | 85 |
| DEV PACT MD 4 (default primary care) | 532 | 185 |

## Finding clinic and resource IENs

| RPC | Context | Use |
|-----|---------|-----|
| `SDES GET CLINIC INFO2` (param: clinic IEN) | `SDECRPC`, `jsonResult` true | Returns `ClinicName`, `ClinicStatus`, `Resource IEN`, stop code, `OverbooksPerDayMax`, providers |
| `SDES GET CLIN AVAILABILITY` (params: clinic IEN, start, end as ISO with offset) | `SDESRPC`, `jsonResult` true | Returns windows with `SlotsAvail`; see the pattern legend in [CLINIC-AVAILABILITY.md](CLINIC-AVAILABILITY.md) |

Scripts: [fetch-clinics.js](../fetch-clinics.js) (look clinics up) and [verify-clinics.js](../verify-clinics.js) (active, resource matches, open slots).

## Walk-ins: `SDES2 CREATE WALKIN APPT`

There is a separate RPC that creates the request, the appointment and the check-in in one call (context `SDESRPC`, two LIST parameters `SDCONTEXT` and `PARAMS`, documented at https://vivian.worldvista.org/vivian-data/8994/8994-5001.html). Smoke tested with [test-walkin.js](../test-walkin.js). What we found:
- It needs `STATION NUMBER` (500) and `OVERBOOK` set to `O`.
- It rejects a start time in the past ("Invalid Appointment Start Date and Time"), so it cannot backfill history.
- It crashed on clinic 426 (`<UNDEFINED>SCH+6^SDTMPHLA ^SC(426,"SL")`) because that clinic has no availability setup. A crash can leave a half-written appointment on the patient, so test on a clinic with availability first.

For historical ED visits, use `SDEC ARSET` and `SDEC APPADD` with the ED clinic instead.

## Appointments are not clinical visits

`SDEC APPADD` creates the appointment, not the clinical encounter. This repo gets the visit by writing the note against a visit string made from the appointment's clinic and time (`clinicIEN;FileManDateTime;A`). See [README.md](../README.md) for the whole pipeline: fetch the VPR, extract encounters, create missing appointments, generate, approve and sign notes.

## Setup

- Calls go through vista-api-x with a PIV-based token. The token is cached in `.token-cache.json` (gitignored) so repeated runs do not start the PIV exe each time.
- Environment variables are in `.env` (`VISTA_API_BASE_URL`, `VISTA_SITE_ID`, `VISTA_API_KEY`, `STS_ENV`).
- The calling user needs the SDEC options for the `SDECRPC` and `SDESRPC` contexts.

## Not covered here

Cancelling or editing appointments, and check-in and check-out of past appointments, are not built. A few test appointments from 2026-10-06 (IENs 61664 to 61667, 61669, 61670, plus one half-written entry from the failed ED walk-in) were left on DFN 100969.
