# Clinic availability and appointment clinics

## Availability pattern characters

`SDES GET CLIN AVAILABILITY` returns `SlotsAvail` per window. The values come from the VistA clinic availability pattern:

| Character | Meaning |
|-----------|---------|
| `0`-`9` and `j`-`z` | Open slots: `j`=10, `k`=11, ... `z`=26 |
| `A`-`W` | Overbooks; `A` is the first slot overbooked, `B` the second at the same time, and so on |
| `*` `$` `!` `@` `#` | Overbooks or appointments outside the clinic's regular hours |

`verify-clinics.js` decodes this (`openSlots()`); a letter is never a count of zero.

## Clinic lookup

`src/clinic-lookup.json` maps a visit location name to its SDES clinic IEN and SDEC resource IEN. Any visit location not in the file uses `default` (`DEV PACT MD 4`, 532/185).

- `node fetch-clinics.js [ien ...]` reads `SDES GET CLINIC INFO2` (clinic and resource IENs, stop code, providers) into `logs/clinics.json`.
- `node verify-clinics.js [--from d] [--to d]` checks that each clinic in the lookup is active, that its resource IEN matches, and how many slots are open.
- Which clinic a visit lands in is decided in the loader by `CDSPENC` (TABLE tag); keep its rows in step with the lookup.

## Past dates

`create-appointments.js` books past dates with overbook on, so no open slot is needed. `OverbooksPerDayMax` limits that: on 2026-10-06 DEV PACT MD 4 allows 4 a day, HEMODIALYSIS - MIKEB 1 and DENTAL 0.
