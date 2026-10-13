# Proposed Outpatient Prescription Defaults for Synthea Test Patients

Draft for clinical review, 2026-10-13. All patients are synthetic test patients on a development VistA system. Nothing here affects real patients.

## 1. Why this is needed

Synthea creates a medication history for each test patient. When we load a patient into VistA, every medication order becomes an outpatient prescription (Rx), but the Synthea file gives us only:

- the drug (RxNorm code)
- the order date
- the reason (the condition it treats)
- "once a day" timing

It does not give a quantity, days supply, number of refills or sig text. The loader fills those in with the same fixed values for every drug:

| Field | Current value for every Rx |
|---|---|
| Days supply | 30 |
| Quantity | 30 |
| Refills | 1 |
| Sig | ONE TABLET DAILY |

So a statin, an opioid and an antibiotic all look alike, and no Rx can show a realistic refill pattern. We want defaults that match how each kind of drug is normally prescribed.

## 2. Proposed approach

- Add a small table to the data loader (the fork of the VistA FHIR Data Loader), keyed by **VA drug class** (for example CV800, ACE inhibitors).
- When a prescription is created, look up the drug's VA class and use that row for days supply, refills, doses per day and sig text.
- Quantity is calculated as days supply x doses per day.
- A drug with no row keeps today's defaults, so the change is safe to roll out one class at a time.
- A few rows can be keyed by drug name where one class mixes once-daily and twice-daily drugs (for example beta blockers).

This changes only how new test Rxs are created. It does not change how refills are recorded or how existing Rxs look.

Decided so far (project owner, 2026-10-13): chronic classes use 90 days with 3 refills; the sig text comes from the table; repeated Synthea orders for the same drug are merged (section 5).

## 3. Proposed table (draft values, please review)

The VA classes below are the ones that actually appear in the ten test patients loaded so far (VA class code and name as shown in VistA).

| VA class | Drugs seen in the test data | Days supply | Refills | Doses per day | Quantity | Proposed sig |
|---|---|---|---|---|---|---|
| CV800 ACE inhibitors | lisinopril | 90 | 3 | 1 | 90 | TAKE ONE TABLET BY MOUTH EVERY DAY |
| CV805 Angiotensin II inhibitors | losartan | 90 | 3 | 1 | 90 | TAKE ONE TABLET BY MOUTH EVERY DAY |
| CV350 Antilipemic agents | simvastatin, pravastatin | 90 | 3 | 1 | 90 | TAKE ONE TABLET BY MOUTH EVERY EVENING |
| CV701 Thiazide diuretics | hydrochlorothiazide | 90 | 3 | 1 | 90 | TAKE ONE TABLET BY MOUTH EVERY MORNING |
| CV702 Loop diuretics (tablets only) | furosemide tablets | 90 | 3 | 1 | 90 | TAKE ONE TABLET BY MOUTH EVERY MORNING |
| CV100 Beta blockers | carvedilol, metoprolol succinate, labetalol | 90 | 3 | 1 (see exceptions) | 90 | TAKE ONE TABLET BY MOUTH EVERY DAY |
| BL117 Platelet aggregation inhibitors | clopidogrel, ticagrelor, prasugrel | 90 | 3 | 1 | 90 | TAKE ONE TABLET BY MOUTH EVERY DAY |
| CN609 Antidepressants, other | fluoxetine | 90 | 3 | 1 | 90 | TAKE ONE CAPSULE BY MOUTH EVERY MORNING |
| CN101 Opioid analgesics | hydrocodone/acetaminophen, oxycodone/acetaminophen, oxycodone ER, fentanyl patch, hydrocodone ER | 30 | 0 | as needed | 30 | TAKE ONE TABLET BY MOUTH EVERY 6 HOURS AS NEEDED FOR PAIN |
| AM* Antimicrobials (all AM classes) | amoxicillin, amoxicillin/clavulanate, cephalexin, penicillin VK, ciprofloxacin, nitrofurantoin, others | 10 | 0 | per drug | 20 (twice daily) | TAKE ONE TABLET BY MOUTH TWICE A DAY UNTIL GONE |
| CN103 Non-opioid analgesics | acetaminophen, aspirin | 30 | 0 | as needed | 30 | TAKE ONE TABLET BY MOUTH EVERY 6 HOURS AS NEEDED |
| MS102 Nonsalicylate NSAIDs | ibuprofen, naproxen | 30 | 0 | as needed | 30 | TAKE ONE TABLET BY MOUTH EVERY 8 HOURS AS NEEDED WITH FOOD |
| CV250 Antianginals | nitroglycerin sublingual | 30 | 0 | as needed | 1 container | PLACE ONE TABLET UNDER THE TONGUE AS NEEDED FOR CHEST PAIN |
| RE101 Inhaled anti-inflammatories, RE102 inhaled bronchodilators | fluticasone, albuterol | 30 | 5 | per drug | 1 inhaler | INHALE 2 PUFFS BY MOUTH AS DIRECTED |
| Insulins (VA class to be confirmed on the dev system) | human insulin 70/30 (Humulin) | 30 | 5 | 2 | 1 vial | INJECT 20 UNITS UNDER THE SKIN TWICE A DAY BEFORE MEALS (units to be reviewed) |
| HS200 Contraceptives, systemic (tablets only) | norgestimate, norethindrone, levonorgestrel combinations | 84 | 3 | 1 | 84 | TAKE ONE TABLET BY MOUTH EVERY DAY |

### Drugs that keep the current defaults (30 days, quantity 30, 1 refill)

- Injectables and infusion drugs in any class that are clearly inpatient or procedural (heparin, anesthetics, neuromuscular blockers, and similar). Synthea marks 30 of the 3,436 medication orders in the first batch as inpatient; those could be skipped or filed with the defaults.
- Outpatient injectables are **not** treated as inpatient drugs (see the pharmacy review in section 8). They need their own rows; insulin is the first one proposed in the table. Other outpatient injectables (GLP-1 agonists such as semaglutide, biologics, vitamin B12) get rows when they appear in the generated data.
- Non-tablet contraceptives (ring, patch, IUD, implant, injection), progestins (HS800), sodium fluoride gel (OR100), antihistamine/antitussive liquids (RE507), prednisone (HS051).
- Any class not listed above.

### Exceptions by drug name

| Drug | Doses per day | Reason |
|---|---|---|
| carvedilol | 2 | usually twice daily |
| metoprolol tartrate (not succinate) | 2 | usually twice daily |

## 4. What the change would produce

Example: a patient with lisinopril from the current Synthea data.

| | Today | With the table |
|---|---|---|
| Days supply | 30 | 90 |
| Quantity | 30 | 90 |
| Refills | 1 | 3 |
| Sig | ONE TABLET DAILY | TAKE ONE TABLET BY MOUTH EVERY DAY |
| Fills possible in a year | 2 | 4 |

An opioid Rx would be 30 days with no refills, so it cannot be refilled and would need a renewal, as in practice.

## 5. What this does not cover

- The loader creates one Rx per Synthea medication order and never merges them. For example, one test patient has 27 separate lisinopril Rxs from 2014 to 2026, because Synthea reissues the order. **Merging repeated orders is now part of this work** (decided 2026-10-13). Draft rule, per patient and per drug (RxNorm code), in order of order date: an order that falls inside the current Rx's expiration, after its next possible refill date (last fill + days supply - 10), and while refills remain, is recorded as a refill of that Rx at the order date; an order that falls before the next possible refill date is dropped as a duplicate; otherwise (the Rx has expired or has no refills left) it starts a new Rx. With 90 days and 3 refills, an Rx covers a year and yearly reorders from Synthea each become a new Rx, which is what a renewal looks like.
- Refills (fills after the first) are created afterwards by a separate tool, which can place each fill on a chosen date to show adherence, gaps or a drop-off.
- Dose changes, titration, tapering and dose-by-weight are not modeled.

## 6. Questions for clinical review

1. **Days and refills for chronic drugs.** Is 90 days with 3 refills a reasonable default for the chronic classes (ACE inhibitors, ARBs, statins, diuretics, beta blockers, platelet inhibitors, antidepressants)? Would you prefer 30 days with 11 refills, or 90 days with 1 refill and a renewal?
2. **Class grouping.** Are any classes grouped in a way that would be wrong for a patient? For example, CV100 beta blockers mix once-daily and twice-daily drugs; CV702 loop diuretics mix tablets and injections.
3. **Controlled substances.** Is "30 days, no refills" right for the opioid class? Should fentanyl patches use a shorter supply?
4. **Antimicrobials.** Is a flat 10 days and no refills acceptable, or should durations vary by drug (for example amoxicillin/clavulanate vs. ciprofloxacin vs. nitrofurantoin)?
5. **Sig text.** Are the sig wordings acceptable as test data? Should they follow a local standard (for example "BY MOUTH" vs. "ORALLY")?
6. **Missing classes.** Are there other drug classes you would expect in a veteran test population that are not in this table (for example diabetes drugs, anticonvulsants, antipsychotics, smoking cessation)? The table can only cover classes that appear in the loaded data, so these would be added when Synthea generates them.
7. **Contraceptives.** Is 84 days with 3 refills reasonable for tablets, given they come in 28-day cycles?
8. **Outpatient injectables.** The first batch of Synthea patients includes outpatient human insulin 70/30 (418 orders) and vitamin B12 injection. What days supply, refills, quantity (vials or pens) and sig would you use for insulin? Which other outpatient injectables (GLP-1 agonists, biologics, specialty drugs) should get rows?
9. **Merging repeated orders.** Is the draft merge rule in section 5 reasonable, in particular treating an order before the next possible refill date as a duplicate and an order after expiration as a renewal?

## 7. Reference

- Source of the current defaults: `WRITERXPS^SYNFMED` in the VistA FHIR Data Loader (days 30, quantity 30, refills 1, sig "ONE TABLET DAILY").
- Where the table would live: a data block in the loader fork's `SYNFMED.m`, in the same style as the existing code table for corrected RxNorm codes.
- OpenSpec change: `openspec/changes/medication-management` (Task 1.7).

## 8. Review log

| Date | Reviewer | Feedback | Response |
|---|---|---|---|
| 2026-10-13 | Pharmacist | Generating sig and supply from drug class is a good start, but there are many exceptions that will not follow a class rule. How accurate the data needs to be is the deciding factor | Kept as a first step: class rows plus name-based exceptions, with unlisted drugs on the current defaults. Accuracy per drug can be raised by adding name rows |
| 2026-10-13 | Pharmacist | Outpatient injectables are common (for example Ozempic and specialty drugs/biologics), so injectables should not be treated as inpatient drugs | Changed: injectables are no longer excluded as a group. An insulin row is proposed, other outpatient injectables get rows when they appear in the data, and only clearly inpatient or procedural drugs keep the defaults. Added question 8 |
