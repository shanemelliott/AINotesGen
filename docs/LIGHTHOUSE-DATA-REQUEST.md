# Lighthouse sandbox data request

Generated 2026-10-16 from `docs/lighthouse-review/`. Requested by the CDS team.

These test patients are used with the Lighthouse clinical FHIR sandbox (`/services/clinical-fhir/v1/r4`) and VistA station 500.
Lighthouse is the source of truth for demographics, so VistA was changed to match it wherever Lighthouse had a value.
The items below are values Lighthouse does not have or cannot represent. Please add them to the sandbox data; the
suggested values are what VistA now holds, so the two systems agree afterwards.

| Patient | ICN | VistA DFN (500) | Field | Problem | Suggested value |
|---|---|---|---|---|---|
| KESSLER503,KARMEN270 | 37000071V557411 | 100899 | Address | Lighthouse ZIP 00000 is not valid | 110 N CARPENTER ST, CHICAGO, ILLINOIS 60607 |
| GONZALEZ,PEDRO | 1013945038V059335 | 99935791 | Phone | Lighthouse has no phone | (909)435-1808 |
| GONZALEZ,PEDRO | 1013945038V059335 | 99935791 | Marital status | Lighthouse has no marital status | Unknown |
| JAMES,FORDHAM | 1013947334V272145 | 99935792 | Address | Lighthouse has no street address | 60 E BROADWAY, BLOOMINGTON, MINNESOTA 55425 |
| JAMES,FORDHAM | 1013947334V272145 | 99935792 | Phone | Lighthouse has no phone | (999)333-4567; (909)435-1808 |
| JAMES,FORDHAM | 1013947334V272145 | 99935792 | Marital status | Lighthouse has no marital status | Legally Separated |
| ALDIE,STANFORD | 1013947267V661431 | 99935794 | Address | Lighthouse has no street address | 2800 E OBSERVATORY RD, LOS ANGELES, CALIFORNIA 90027 |
| ALDIE,STANFORD | 1013947267V661431 | 99935794 | Gender | Lighthouse gender is "other"; VistA only holds M or F | Male |
| ALDIE,STANFORD | 1013947267V661431 | 99935794 | Phone | Lighthouse has no phone | (909)435-1808 |
| ALDIE,STANFORD | 1013947267V661431 | 99935794 | Marital status | Lighthouse has no marital status | Married |
| JAMIE,FORLAN | 1013947268V717360 | 99935795 | Address | Lighthouse has no street address | 13000 HIGHWAY 244, KEYSTONE, SOUTH DAKOTA 57751 |
| JAMIE,FORLAN | 1013947268V717360 | 99935795 | Birth date | Lighthouse has no birth date | 19810403 |
| JAIME,SANDERS | 1013947342V378264 | 99935796 | Address | Lighthouse has no street address | 1 LODGE ST, ASHEVILLE, NORTH CAROLINA 28803 |
| JAIME,SANDERS | 1013947342V378264 | 99935796 | Marital status | Lighthouse has no marital status | Divorced |
| ALEC,CRANE | 1013947445V272814 | 99935797 | Address | Lighthouse has no street address | 5100 S LAS VEGAS BLVD, LAS VEGAS, NEVADA 89119 |
| ALEC,CRANE | 1013947445V272814 | 99935797 | Marital status | Lighthouse has no marital status | Married |
| ACDSPMPIINTEGRATIONLONGLN, ACDSPMPIINTEGRATIONLONGFN | 1013947508V294584 | 99935798 | Phone | Lighthouse has no phone | (651)249-9714 |

## Problem list (Condition, problem-list-item)

Active problems in VistA that are not in the Lighthouse problem list. Onset is from the VistA problem list (month-only dates are given as year-month).

| Patient | ICN | VistA DFN (500) | Problem | ICD | SNOMED CT | Onset |
|---|---|---|---|---|---|---|
| MAYER,LUIS | 2000190V550184 | 100876 | Diabetes Mellitus without mention of Complication, type II or unspecified type, | ICD-9 250.00 |  | 2009 |
| MAYER,LUIS | 2000190V550184 | 100876 | Ischemic stroke | 433.11 | 422504002 | 2013-03 |
| MAYER,LUIS | 2000190V550184 | 100876 | Ex-smoker | F17.210 | 8517006 | 2013-08-12 |
| MAYER,LUIS | 2000190V550184 | 100876 | Peripheral pulmonary artery disease | 440.23 | 251042004 | 2013-08-02 |
| MAYER,LUIS | 2000190V550184 | 100876 | Cocaine use disorder | F14.129 | 1336231000 | 2024-04-16 |
| MAYER,LUIS | 2000190V550184 | 100876 | Proteinuria | E09.3592 | 29738008 | 2024-01-18 |
| MAYER,LUIS | 2000190V550184 | 100876 | Peripheral sensory neuropathy | G60.8 | 789588003 | 2024-02-10 |
| MAYER,LUIS | 2000190V550184 | 100876 | Chronic kidney disease stage 5 on dialysis | Z99.2 | 714152005 | 2025-01-25 |
| MAYER,LUIS | 2000190V550184 | 100876 | Chronic liver disease | K70.11 | 328383001 | 2024-06-19 |
| MAYER,LUIS | 2000190V550184 | 100876 | Congestive heart failure | 433.11 | 42343007 | 2024-10-17 |
| MAYER,LUIS | 2000190V550184 | 100876 | H/O: Stroke in last year | 433.11 | 308067002 | 2024-10-17 |
| MAYER,LUIS | 2000190V550184 | 100876 | Heart failure | I50.23 | 84114007 | 2024-10-17 |
| MAYER,LUIS | 2000190V550184 | 100876 | Myocardial infarction | I21.21 | 22298006 | 2024-10-17 |
| MAYER,LUIS | 2000190V550184 | 100876 | Coronary atherosclerosis | I25.110 | 443502000 | 2024-10-17 |
| MAYER,LUIS | 2000190V550184 | 100876 | Moderate cognitive impairment | R41.81 | 702955000 | 2023-11-02 |
| MAYER,LUIS | 2000190V550184 | 100876 | Chronic obstructive pulmonary disease | J44.0 | 13645005 | 2024-05-20 |
| MAYER,LUIS | 2000190V550184 | 100876 | Diabetes mellitus | E11.9 | 73211009 | 2025-07-04 |
| MAYER,LUIS | 2000190V550184 | 100876 | History of percutaneous transluminal coronary angioplasty | Z95.5 | 428308007 | 2025-07-04 |
| MAYER,LUIS | 2000190V550184 | 100876 | Alcoholism | 303.01 | 7200002 | 2014-09-14 |
| MAYER,LUIS | 2000190V550184 | 100876 | Obesity | E66.9 | 414916001 | 2024-12-18 |
| MAYER,LUIS | 2000190V550184 | 100876 | Hypertension | I10. | 38341003 | 2025-01-07 |
| MAYER,LUIS | 2000190V550184 | 100876 | Diabetes Mellitus Type 2 | E11.9 | 44054006 |  |
| MAYER,LUIS | 2000190V550184 | 100876 | Hyperlipidemia | E78.5 | 55822004 |  |
| MAYER,LUIS | 2000190V550184 | 100876 | Patient Overweight | E66.3 | 238131007 |  |
| STAMM704,LANE844 | 38000527V381838 | 100898 | High cholesterol | E78.00 | 13644009 |  |
| STAMM704,LANE844 | 38000527V381838 | 100898 | Diabetes Mellitus Type 2 | E11.9 | 44054006 |  |
| STAMM704,LANE844 | 38000527V381838 | 100898 | Essential hypertension | I10. | 59621000 |  |
| STAMM704,LANE844 | 38000527V381838 | 100898 | CAD - Coronary Artery Disease | I25.10 | 53741008 |  |
| STAMM704,LANE844 | 38000527V381838 | 100898 | Heart failure with reduced ejection fraction | R69. | 703272007 |  |
| KESSLER503,KARMEN270 | 37000071V557411 | 100899 | Diabetes Mellitus Type 2 | E11.9 | 44054006 |  |
| KESSLER503,KARMEN270 | 37000071V557411 | 100899 | Hyperlipidemia | E78.5 | 55822004 |  |
| UPTON904,ALEC433 | 5001537977V662283 | 100906 | Heavy cigarette smoker | R69. | 230063004 | 1987 |
| UPTON904,ALEC433 | 5001537977V662283 | 100906 | Skin rash | R21. | 271807003 |  |
| UPTON904,ALEC433 | 5001537977V662283 | 100906 | Diabetes Mellitus Type 2 | E11.9 | 44054006 |  |
| UPTON904,ALEC433 | 5001537977V662283 | 100906 | Overweight | E66.3 | 238131007 |  |
| BEAHAN375,KERRY175 | 5001537978V716035 | 100907 | AF- Atrial Fibrillation | I48.91 | 49436004 |  |
| BEAHAN375,KERRY175 | 5001537978V716035 | 100907 | Diabetes Mellitus Type 2 | E11.9 | 44054006 |  |
| METZ686,JANNA498 | 5001537980V170418 | 100908 | Essential hypertension | I10. | 59621000 |  |
| METZ686,JANNA498 | 5001537980V170418 | 100908 | Depression | F32.9 | 35489007 |  |
| METZ686,JANNA498 | 5001537980V170418 | 100908 | Overweight | E66.3 | 238131007 |  |
| HARRIS,SHEBA | 6050242829V596118 | 237 | Hyperlipidemia, unspecified | E78.5 |  |  |
| HARRIS,SHEBA | 6050242829V596118 | 237 | Current smoker | F17.200 | 77176002 | 2026-04-20 |
| HARRIS,SHEBA | 6050242829V596118 | 237 | Melena | K92.1 | 2901004 | 2025-05-28 |
| HARRIS,SHEBA | 6050242829V596118 | 237 | Syncope | R55. | 271594007 | 2025-11-17 |
| HARRIS,SHEBA | 6050242829V596118 | 237 | Cardiac syncope | R69. | 788877005 | 2025-11-24 |
| HARRIS,SHEBA | 6050242829V596118 | 237 | Heart failure | I50.9 | 84114007 | 2025-10-10 |
| HARRIS,SHEBA | 6050242829V596118 | 237 | Former heavy tobacco smoker | Z87.891 | 428081000124100 | 1955-01-01 |
| HARRIS,SHEBA | 6050242829V596118 | 237 | Hypertensive heart and chronic kidney disease | I13.10 | 8501000119104 | 1967-04 |
| HARRIS,SHEBA | 6050242829V596118 | 237 | Essential hypertension | R03.1 | 59621000 |  |
| HARRIS,SHEBA | 6050242829V596118 | 237 | Hyperlipidemia | ICD-9 272.4 |  | 2005-04-07 |
| GONZALEZ,PEDRO | 1013945038V059335 | 99935791 | Low back pain | M54.50 | 279039007 | 2026-09-24 |
| GONZALEZ,PEDRO | 1013945038V059335 | 99935791 | Acute exacerbation of chronic asthmatic bronchitis | J44.1 | 442025000 | 2026-09-28 |
| GONZALEZ,PEDRO | 1013945038V059335 | 99935791 | Plantar fasciitis of left foot | M72.2 | 12241271000119101 | 2026-09-14 |
| GONZALEZ,PEDRO | 1013945038V059335 | 99935791 | Type 2 diabetes mellitus | E11.9 | 44054006 | 2019 |
| GONZALEZ,PEDRO | 1013945038V059335 | 99935791 | Essential hypertension | I10. | 59621000 | 2024 |
| GONZALEZ,PEDRO | 1013945038V059335 | 99935791 | History of placement of stent for coronary artery disease | Z95.5 | 428375006 | 2017 |
| JAMIE,FORLAN | 1013947268V717360 | 99935795 | Current heavy tobacco smoker | Z72.0 | 428071000124103 | 2003-01-04 |
| ALEC,CRANE | 1013947445V272814 | 99935797 | Atherosclerotic heart disease of native coronary artery without angina pectoris | I25.111 | 451041000124103 | 2025-08-14 |
| ALEC,CRANE | 1013947445V272814 | 99935797 | Hypertension | I10. | 38341003 | 2024-04 |
| ALEC,CRANE | 1013947445V272814 | 99935797 | Hyperlipidemia | E78.5 | 55822004 | 2024 |