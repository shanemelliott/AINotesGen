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
| 2026-10-06 | `loinc-lab-map` graph (data) | 8 LOINC to #60 name entries ([loader-maps.json](loader-maps.json)), applied with `apply-loader-maps.js` | Map names not in #60, or no entry | Yes | No (data, not code) |

Our own routines (`CDSPFHIR`, `CDSPENC`, `CDSPRX`) are tracked in `cds-vista-routines`, not here.
