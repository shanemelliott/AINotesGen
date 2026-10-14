# Loader changes (SYN package and data on dev)

Changes made to the WorldVistA SYN loader (VistA-FHIR-Data-Loader) and its data on dev station 500.
A SYN KIDS reinstall replaces the routines and may reset the graphs, so reapply from this list.
"Fork" is the local clone at `VistA-FHIR-Data-Loader` (target: a branch for a PR upstream).

| Date | Routine or data | Change | Why | Dev | Fork |
|---|---|---|---|---|---|
| 2026-10-06 | `SYNFENC` (`wsIntakeEncounters`) | One added line calling `$$LOC^CDSPENC` to pick the clinic by class, type and reason ([synfenc-location.txt](synfenc-location.txt)) | Every encounter landed in GENERAL MEDICINE | Yes | No (depends on CDSPENC, site-specific) |
| 2026-10-06 | `SYNFPAT` | Passes `VETERAN` to the patient import (exact line not recorded) | Loaded patients had `isVet` 0 | Yes | No |
| 2026-10-06 | `SYNFMED` `RXNBADDATA` | `243670;318272` aspirin 81 MG tablet to chewable tablet | Did not resolve to a drug | Yes | Yes |
| 2026-10-06 | `SYNFMED` `RXNBADDATA` | `235389;198043` mestranol / norethynodrel to mestranol / norethindrone (substitution) | Not a valid RxNorm SCD in ETS | Yes | Yes |
| 2026-10-07 | `SYNFMED` `RXNBADDATA` | `1049504;1049502` Oxycontin 10 MG ER (abuse-deterrent) to 12 HR oxycodone 10 MG ER | Converted SCD 1860157 has no VUID on dev | Yes | Yes |
| 2026-10-07 | `SYNFMED` `RXNBADDATA` | `1535362;245593` sodium fluoride 2.72% gel to 2% gel (same 1.23% fluoride ion) | No VUID on dev | Yes | Yes |
| 2026-10-07 | `SYNFMED` `VAP2MED` | `$G(^PSDRUG(P50,"ND"))` | Guard: a `VAPN` drug with no ND node would raise M7 (first suspect for RxNorm 1049221; the real cause was `MATCHV1`, below) | Yes | Yes |
| 2026-10-07 | `SYNFMED` `MATCHV1` | Loops over each VA Product IEN from `VUI2VAP` instead of passing the `^` list to `VAP2MED` | M7 on `^PSNDF(50.68,"2485^2489",0)`: VUID 4003067 (RxNorm 1049221, acetaminophen / oxycodone 325/5) has two VA Products. `ADDDRUG` uses the master-VUID index, so the load itself may not have hit this | Yes | Yes |
| 2026-10-13 | `SYNFMED` `MEDDEF`, `MEDDEFNAME`, `MEDDEFCLASS`, `WRITERXPS` | Days supply, refills, quantity and sig come from a table by drug name or VA class (field 2 of #50); no row keeps 30 days, 1 refill, quantity 30, "ONE TABLET DAILY". `MEDDEFT` shows the lookup for a drug IEN | Every loaded Rx had the same fixed values; see `docs/MED-DEFAULTS-PROPOSAL.md`. Class lookup checked on dev 2026-10-13 for insulin (returns `HS501`, name row matched); class rows and a real load not yet checked | Partly | Yes |
| 2026-10-13 | `SYNFMED` `MERGERX`, `REFILL`; `SYNFMED2` `wsIntakeMeds` | Repeated `MedicationRequest`s for one drug are merged: a later request becomes a refill of the current Rx (on or after last fill + days supply - 10, within expiration, refills left), is dropped as a duplicate if earlier, or starts a new Rx. `WRITERXPS` sets the original fill's release date to the prescription date instead of the load time | Synthea reorders chronic drugs repeatedly (27 lisinopril requests for one patient), and every Rx showed the load time as its release date. Written, not compiled or tested | No | Yes |
| 2026-10-06 | `loinc-lab-map` graph (data) | 8 LOINC to #60 name entries ([loader-maps.json](loader-maps.json)), applied with `apply-loader-maps.js` | Map names not in #60, or no entry | Yes | No (data, not code) |
| 2026-10-14 | Notes and visits (data), DFN 100961, 100962, 100964, 100972 to 100975 | `CDSP UTIL TIU LINK VISIT` (`CDSPTIUV`) linked every note with no visit to its appointment's visit: 210 notes, 197 to the existing visit and 13 to a visit created with `^VSIT` (encounter type P, clinic stop code), 8 visits given encounter type P. Note reference dates now carry the appointment time | Midnight appointments (`.24`) did not match the `.0` visit strings, so TIU filed the notes with no visit; see "Known issue: midnight appointments" in `docs/APPOINTMENT-RPCS.md` | Yes | No (data) |

Our own routines (`CDSPFHIR`, `CDSPENC`, `CDSPRX`, `CDSPVET`) are tracked in `cds-vista-routines`, not here.
`CDSPVET` (RPCs `CDSP UTIL VET GET` and `CDSP UTIL VET SET`, context `CDSP RPC UTILS`) sets veteran service data after
load; it is not a loader change and survives a loader reinstall. Guide: `cds-vista-routines/docs/CDSPVET.md`.
