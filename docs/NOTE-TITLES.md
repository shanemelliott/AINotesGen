# TIU note titles on dev (station 500)

Notes are filed with `TIU CREATE RECORD`, which needs a title IEN from file #8925.1. The title is chosen by the visit's clinic in [src/note-titles.json](../src/note-titles.json) through `noteTitleFor()` in [src/noteTitles.js](../src/noteTitles.js). A clinic that is not listed uses `VISTA_NOTE_TITLE_IEN` from `.env` (16, PRIMARY CARE VISIT). Both `generate-notes.js` and `custom-visits.js` use it.

Checked 2026-10-16 with `node fetch-note-titles.js` (RPC `CDSP GET NOTE TITLES`, context `CDSP RPC CONTEXT`), which returned 217 active titles and wrote them to `logs/note-titles.json`. Run it again after titles are added.

## Current clinic mapping

| Visit clinic | Title | IEN |
|---|---|---|
| EMERGENCY DEPARTMENT | EMERGENCY DEPARTMENT NOTE | 29 |
| CARDIOLOGY | CARDIOLOGY NOTE | 1633 |
| DERMATOLOGY | DERMATOLOGY NOTE | 1634 |
| OPHTHALMOLOGY | OPHTHALMOLOGY NOTE | 1635 |
| GASTROENTEROLOGY | GI CLINIC NOTE | 6 |
| PRIMARY CARE, DEV PACT MD 4, GENERAL MEDICINE | PRIMARY CARE VISIT | 16 |
| DENTAL | DENTAL NOTE | 7222 |
| PULMONARY | PULMONARY NOTE | 7223 |
| SLEEP LAB | SLEEP MEDICINE NOTE | 7224 |
| HEMATOLOGY | HEMATOLOGY NOTE | 7225 |
| HEMODIALYSIS - MIKEB | HEMODIALYSIS NOTE | 7226 |
| AUDIOLOGY | AUDIOLOGY NOTE | 7228 |
| OCCUPATIONAL THERAPY | OCCUPATIONAL THERAPY NOTE | 7229 |
| MENTAL HYGIENE | MENTAL HEALTH NOTE | 7232 |
| GERIATRIC | GERIATRICS NOTE | 7233 |
| DEV/ORTHO | GENERIC CONSULT NOTE | 1631 |
| DEV/NEUROLOGY | GENERIC CONSULT NOTE | 1631 |
| DIABETIC | DIABETES NOTE | 7234 |

A clinic that is not listed uses `VISTA_NOTE_TITLE_IEN` (16). GENERIC NOTE TITLE (55, class TEST) is no longer used for these clinics. The ten specialty titles were requested on 2026-10-15 and created by 2026-10-16; the IENs above come from `logs/note-titles.json`. Some are in other classes (dental, physical medicine, mental health, geriatrics), not MEDICINE.

Notes already signed keep the title they were filed with. A signed note cannot be retitled.

## Titles for visit notes

Class MEDICINE (1256) unless shown.

| IEN | Title |
|---|---|
| 16 | PRIMARY CARE VISIT |
| 22 | PRIMARY CARE GENERAL NOTE |
| 18 | PRIMARY CARE TELEPHONE |
| 4792 | PRIMARY CARE AMBIENT CLINIC NOTE |
| 4793 | PRIMARY CARE AMBIENT SCRIBE CLINIC NOTE |
| 29 | EMERGENCY DEPARTMENT NOTE |
| 1633 | CARDIOLOGY NOTE |
| 1634 | DERMATOLOGY NOTE |
| 1635 | OPHTHALMOLOGY NOTE |
| 6 | GI CLINIC NOTE |
| 32 | STRESS TEST NOTE |
| 1259 | HYPERTENSION |
| 1758 | LUNG CANCER |
| 4 | HOMELESS CALL CENTER REFERRAL NOTE |
| 435 | AVS NOTE |
| 55 | GENERIC NOTE TITLE (class TEST) |
| 1631 | GENERIC CONSULT NOTE (class CONSULTS) |
| 7220 | CARDIOLOGY CONSULT NOTE (CONSULTS) |
| 1630 | OPHTHALMOLOGIST CONSULT NOTE (CONSULTS) |
| 163 | LYMPHOMA (CONSULTS) |
| 9 | DIETICIAN CONSULT NOTE (NUTRITION NOTE) |
| 5 | MOVE! CLINIC VISIT (PATIENT EDUCATION) |
| 116 | NURSING NOTE (NURSING TITLES) |
| 134 | H&P (ADMISSION ASSESSMENT) |
| 1 | Discharge Summary (DISCHARGE SUMMARIES) |
| 125 | SURGERY NOTES (SURGERY) |
| 1660 | ATTENDING NOTE (SURGERY) |
| 1657 | GENERAL SURGERY RESIDENT NOTE (SURGERY) |
| 1290 | PROCEDURE REPORT (PROCEDURE REPORT (NON-O.R.)) |
| 1669 | MEDICATION RECONCILIATION NOTE (MEDICATION RECONCILIATION) |
| 1627, 1628 | DIABETIC RETINOPATHY SURVEILLANCE / TELERETINAL IMAGING CONSULT NOTE (CONSULTS) |
| 1391, 1390 | VISUAL IMPAIRMENT CLINIC INITIAL VISIT / MEDICAL EXAM (BLIND REHABILITATION SERVICE) |
| 1991, 1989, 1990 | ANTICOAGULATION DISCHARGE / INITIAL / INTERIM NOTE |
| 1365 | SCI GENERAL NOTE (SCI OUTCOMES) |
| 1281 | WRIISC ASSESSMENT NOTE (WRIISC) |

## Other titles (by class)

| Class | IENs | Titles |
|---|---|---|
| C&P EXAMINATION REPORTS | 1293 to 1349, 7219 | 58 C&P exam titles, for example C&P DENTAL AND ORAL (1306), C&P DIABETES MELLITUS (1307), C&P HEART (1322), C&P PTSD INITIAL EVALUATION (1338) |
| HOME TELEHEALTH NOTES / CONSULTS | 263 to 274, 1617 to 1628 | HT and CARE COORDINATION HOME TELEHEALTH titles |
| HISTORICAL PROCEDURES | 1393 to 1404 | HISTORICAL cardiac cath, echo, ECG, Holter, EP, ETT, endoscopy, PFT, hematology, rheumatology, pacemaker, pre/post surgery risk |
| IMEDCONSENT WEB, IMED TITLES | 67 to 95, 1387, 1388 | Consent, discharge instructions, patient agreement and education forms |
| NURSING TITLES / NURSING NOTES | 116, 262, 1649 to 1655 | Admission assessment, discharge instructions, reassessment, preop assessment, procedure site verification, transfusion verification |
| CLINICAL CONTACT CENTER PROGRESS NOTES | 4204 to 4208 | CCC clinical triage, pharmacy I and II, scheduling, virtual clinic visits |
| SURGERY | 125, 126, 819, 1656 to 1660 | Surgery notes, recovery room, NF preop/holding, informed consent, anesthesia pre/postop, general surgery resident, attending note |
| CLINICAL WARNING | 15, 832, 833, 1353 to 1356 | Clinical warning, fall risk, outside medication, patient record flags |
| WOMEN'S HEALTH, SMART, PDMP, other | 168 to 172, 177, 826, 822 to 825, 4213, 1267, 571, 1405, 123 | Pregnancy and lactation status, SMART notices, PDMP, interdisciplinary plans, GulfVET, adverse event disclosure, patient training |
| TEST | 55, 4194, 4197, 4199, 50 | GENERIC NOTE TITLE, NGS TEST titles, TEST NOTE (MEM) |
