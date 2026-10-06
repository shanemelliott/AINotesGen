# Design

## Context

Synthea generates a whole population and exports each patient's lifetime. Our loader and note pipeline work on those files, but the records read like general-population patients. This design documents the veteran population we want (the profile), what we have verified so far about Synthea, and what is still open. Figures marked "proposed" are choices for test coverage, not epidemiology.

## Goals / Non-Goals

**Goals:**
- A written veteran population profile: sex mix, age and era mix, record start, condition mix.
- A repeatable way to generate a batch of 10 to 20 matching patients and to check it.

**Non-Goals:**
- Setting VistA eligibility, service connection and enrollment (separate future work under Task 15).
- Matching VA population statistics exactly; this is a test population that over-samples the conditions we want to exercise.

## Population profile

Decisions from the owner (2026-10-06): about 80% men and 20% women, mostly 60 and older with some younger, first batch of 10 to 20 patients, no one older than 92, combat injuries forced into some patients, a young woman with PTSD or military sexual trauma in the first batch, and service-connected cause and percentage as the first service data to carry.

**Sex.** The veteran population is about 90% men today and projected to move toward roughly 80% men by the 2050s (VA population projection by sex, FY 2023 to FY 2053, as provided; read from the chart, not exact). The 80/20 target over-samples women compared with today so that women's care is exercised. Older veteran cohorts are almost all men (the 2000 census table shows 1.6 million women against 24.9 million men).

**Age and era.** Synthea assigns the veteran era from the date the patient turns 18, using the thresholds in `veteran.json`. Mapped to age in 2026:

| Era (date the patient turned 18) | Born about | Age in 2026 |
|----------------------------------|-----------|-------------|
| WWII, Korea and between (1941 to 1961) | 1923 to 1943 | 83 to 103 (capped at 92, so only the youngest of this group) |
| Vietnam era (1961 to 1975) | 1943 to 1957 | 69 to 83 |
| Between Vietnam and Gulf War (1975 to 1990) | 1957 to 1972 | 54 to 69 |
| Early Gulf War (1990 to 2001) | 1972 to 1983 | 43 to 54 |
| After 2001 | 1983 to 2008 | 18 to 43 |

Proposed mix for a batch of 16: 6 aged 70 to 90, 4 aged 60 to 69, 3 aged 45 to 59, 3 aged 20 to 44; 13 men and 3 women, with at least one woman under 45 and one 60 or older.

**Record start.** A veteran's record starts at military entry, about age 18 to 20 (the youngest patients' records start then; for older patients the record starts at 18 too, with civilian life after service). No resource dated before the 18th birthday.

**Conditions and injuries (proposed minimum counts for a batch of 16, over-sampled for test coverage).**

| Group | Minimum | Notes |
|-------|---------|-------|
| PTSD | 3 | most common VA-recognized mental health condition |
| Depression or anxiety | 4 | includes patients with PTSD |
| Substance use disorder | 2 | |
| Traumatic brain injury | 2 | skew toward post-2001 patients |
| Spine, orthopedic and chronic pain | 5 | back, knee, shoulder; arthritis |
| Sleep apnea | 3 | |
| Hypertension | 6 | mostly older patients |
| Diabetes | 4 | |
| Hearing loss or tinnitus | 4 | |
| Lung or prostate cancer | 1 | older patients, exposure-linked |
| Kidney disease | 1 | one on dialysis if possible |
| Migraines, dermatitis, hernias, scars | 1 each | |

Also relevant, from the owner's list: bipolar disorder, schizophrenia, suicidal ideation, military sexual trauma, multiple sclerosis, Parkinson's disease, amputations. Treat as optional for the first batch.

## What the Synthea repository shows so far

Checked on 2026-10-06 from the repository and wiki.

- **Veteran status.** `modules/veteran.json` sets a `veteran` attribute when the patient turns 18, using census odds by sex and era. Men: about 57% of the oldest group (WWII, Pre-WWII), 39% in the 65 to 74 era, 20% for the Korea and between-war periods, 10% for Vietnam and the period after it, 3.8% for the Gulf War eras. Women: between 0.9% and 1.6% in every era. An attribute `veteran_population_override`, when set, makes every patient a veteran. Without it only a small share of a general population are veterans, so generation must either force veteran status or discard non-veterans.
- **Veteran-linked modules present:** `veteran_ptsd`, `veteran_mdd`, `veteran_self_harm` (with `veterans/veteran_suicide_probabilities.json`), `veteran_substance_abuse_conditions` and `_treatment`, `veteran_hyperlipidemia`, `veteran_lung_cancer`, `veteran_prostate_cancer`.
- **General modules that cover conditions on our list:** `mTBI` (mild traumatic brain injury), `sleep_apnea`, `hypertension`, `metabolic_syndrome*` (diabetes), `dermatitis`, `osteoarthritis`, `rheumatoid_arthritis`, `fibromyalgia`, `chronic_kidney_disease`, `dialysis`, `injuries`, `prescribing_opioids_for_chronic_pain_and_treatment_of_oud`, `opioid_addiction`, `lung_cancer`, `colorectal_cancer`.
- **Not seen at the module-file level (still to check in subfolders and `injuries`):** anxiety disorders, bipolar disorder, schizophrenia, migraines, back and spinal injuries, tinnitus, hearing loss, hernias, amputations, MS, Parkinson's, military sexual trauma.
- **History length.** `exporter.years_of_history` keeps the last N years from the day Synthea runs (default 10); conditions and medications still active are exported regardless; 0 keeps everything. It cannot align a record to start at age 18, because it counts back from today.
- **Selection.** Command-line options (basic setup): `-s` seed, `-r` reference date, `-cs` clinician seed, `-p` population size, `-g` gender, `-a minAge-maxAge`, `-c` configuration file, `-d` modules directory, then an optional state and city; configuration keys can also be passed as `--key value`. Java 17 or newer is required; the released jar is `synthea-with-dependencies.jar`.
- **Keep Patients module (experimental).** `-k keep_module.json` runs each candidate patient through a small module and exports only those that end in a state named `Keep`; otherwise Synthea draws a new patient for that slot, up to 1000 attempts, then leaves the slot empty. The module can test patient attributes (the sample keeps patients with `diabetes == true`) and active conditions. A keep module that tests `veteran` is not nil gives an all-veteran batch without the override attribute, and a keep module that also requires an active condition (for example a traumatic brain injury) forces that condition into the kept patients. The wiki warns it is easy to write one that no patient can satisfy.
- **Flexporter (experimental).** `-fm mapping.yml` post-processes bundles (also standalone: `run_flexporter -fm mapping -s source_fhir`). Actions include keep or delete resources by FHIRPath, set values, create resources and execute JavaScript. Resources it deletes leave dangling references. A Node trim script is simpler for the pre-18 trim.

## Decisions

- **Trim after generation.** Because `years_of_history` cannot start a record at 18, generate with full history (`years_of_history = 0`) and run a trim step that drops resources dated before each patient's 18th birthday. Open question: what to do with chronic conditions that began in childhood (drop them, or re-date them to the entry date).
- **Force veterans and injuries.** Every patient is made a veteran with `generate.veteran_population_override = true` (verified: 3 of 3 generated men had veteran-linked conditions, one had a VA community care provider). Keep modules (`-k`) are used only for the forced injury groups (traumatic brain injury, limb loss, burns, PTSD or military sexual trauma for the young woman), run as separate small runs so each forced patient is generated on purpose.
- **Generation settings** (`synthea/veteran.properties`): full history, living patients only (`generate.only_alive_patients`), and Claim, ExplanationOfBenefit, DocumentReference and ImagingStudy excluded from export, since the loader does not use them.
- **Age cap 92.** Run with `-a` ranges that stop at 92, so the oldest era groups are Korea-era and later.
- **Service connection is derived, not generated.** Synthea has no service-connection data. For each kept patient, derive a service-connected cause (combat, training injury, Agent Orange for Vietnam-era lung or prostate cancer, Gulf War or burn pit exposure) and a rating percentage from the patient's veteran-linked conditions with a mapping table, and store it in a sidecar file for the later VistA eligibility step. The mapping table and the rating values need a VA source before use.
- **Two runs for the sex mix.** Synthea selects one sex per run, so produce the men and the women as two runs and combine them.
- **Generate extra, then pick.** Generate more patients than needed and keep the ones that fit the age and condition profile, recording the seeds.

## Risks / Trade-offs

- Forcing veteran status through an attribute may not carry through to the FHIR export; the export may carry no veteran flag, so the batch check has to identify veterans another way (the veteran-linked modules' conditions), and VistA's veteran flag is set at load.
- Trimming pre-service history can leave inconsistent records (a medication with no condition, an immunization series cut mid-way).
- Older veterans' records are long; loading and note generation take longer. Smoke test (2026-10-06, seed 1001, 3 men aged 60 to 92): after trimming, 3.8 to 16.6 MB and up to about 750 encounters per patient, against 8 to 14 MB for the files loaded so far. Load time needs a test before a full batch.
- Over-sampling conditions makes the batch unrepresentative on purpose; the profile must say so.

## Open Questions

Answered 2026-10-06: combat injuries are forced (not left to chance); the first batch includes a young woman with PTSD or military sexual trauma; ages are capped at 92; service-connected cause and percentage come first among the service data.

Still open:
- Which injuries to force and how many, within the minimums above (amputation, traumatic brain injury and burns are the ones named).
- The service-connected cause categories and rating percentages to use, and the VA source for them.
- What to do with childhood chronic conditions when trimming (drop or re-date to entry).
- Whether any Synthea module generates military sexual trauma, hearing loss, tinnitus, migraines or back injuries, or whether those need custom modules.
