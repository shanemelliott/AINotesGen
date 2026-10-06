# Tasks

## 1. Population profile

- [x] 1.1 Capture the owner's decisions: about 80% men and 20% women, mostly 60 and older with some younger, 10 to 20 patients
- [x] 1.2 Draft the profile (sex, age and era, record start, condition minimums) in design.md
- [ ] 1.3 Check the condition minimums against VA sources (prevalence among VA patients) and adjust
- [x] 1.4 Answer the open questions in design.md: combat injuries forced, a young woman with PTSD or MST in the first batch, age cap 92, service-connected cause and percentage first
- [ ] 1.5 Choose the forced injuries and counts (limb loss, traumatic brain injury, burns) and the service-connected cause categories and rating percentages, with a VA source

## 2. Review the Synthea repository

- [x] 2.1 Read `veteran.json` and list the veteran-linked modules
- [ ] 2.2 Read the veteran-linked and injury modules to see which conditions, medications and encounters they generate
- [x] 2.3 Find how to make every patient a veteran: a keep-patients module (`-k`) that requires the `veteran` attribute, instead of the override attribute
- [x] 2.4 Confirm the command-line options (`-s -r -cs -p -g -a -c -d -k -fm`, optional state and city)
- [x] 2.5 Check whether the FHIR export carries any veteran flag: it does not (no veteran marker on Patient), so veteran status is guaranteed by the generation settings, not checked in the file
- [ ] 2.6 Find where hearing loss, tinnitus, migraines, back injuries, anxiety, bipolar and schizophrenia come from, or whether they need custom modules
- [x] 2.7 Confirm that `exporter.years_of_history = 0` keeps the full record: yes, records start at birth

## 3. Generate a batch

- [x] 3.1 Set up Synthea: Java 26 (Corretto); `synthea/bin/synthea-with-dependencies.jar` from master-branch-latest, downloaded 2026-10-06, SHA-256 018AD7F04F7AACB995804D7D4781C76D5FC714F7F23257BA50DAA9EEFAE224AC (gitignored)
- [x] 3.2 Write the configuration and run commands: `synthea/batches/batch-1.json` (9 runs, seeds, age bands, modules) and `generate-batch.js` (runs Synthea, trims, records java version, jar hash and exact command lines under `generated`)
- [x] 3.2a Write keep modules and forced-injury modules, and test that each can be satisfied: `synthea/modules/{tbi,amputation,burn}` (loaded with `-d`, one injury per run) and `synthea/keep/ptsd.json` (`-k`); each produced the intended condition on a test patient (TBI at 21 with PTSD at 21, lower-limb amputation at 21, full thickness burn at 21, PTSD at 24 for a 31-year-old woman). Military sexual trauma has no module and is not forced; PTSD meets the young-woman requirement
- [x] 3.3 Write the trim step (`trim-synthea.js`): drops resources dated before the 18th birthday, re-dates conditions and medications still active at 18 (or drops them with `--childhood drop`), removes references to dropped resources; tested on 3 patients (earliest record at age 18.0 to 18.2, no dangling references)
- [x] 3.4 Write the batch check (`check-batch.js`): sex, age, era, first-record age, condition groups and forced injuries against the profile; batch 1 passes every required line (dermatitis and hernia are optional and absent: no Synthea module)
- [ ] 3.4a Write the service-connected record (cause and percentage) for each patient from a mapping table
- [x] 3.5 Generate batch 1: 16 patients (13 men, 3 women; 11 aged 60 or older, 3 under 45, oldest 88), written to `synthea/output/batch-1/trimmed/` (gitignored). First pass failed sleep apnea, hypertension and hearing loss; fixed with keep modules (`keep/hypertension.json`, `keep/sleep_apnea.json`) and a hearing loss and tinnitus module (`modules/hearing`)

## 4. Load and use

- [ ] 4.1 Run the preflight checks on each patient file and fix mapping gaps that matter. Done for 1 of 16 (Doug189, age 26): meds 2 of 4 codes map (abuse-deterrent oxycodone ER, RxNorm 1049504, and sodium fluoride gel have no VUID: 12 of 23 med resources fail), procedures 1 of 22 (dental and screening codes), conditions mostly social findings; labs and vitals mostly map
- [ ] 4.2 Load the batch, then create appointments, generate notes, review and sign. Done for 1 of 16: Doug189 loaded as DFN 100971 (22 encounters, 28 conditions, 18 labs, 54 vitals, 11 meds; ED visit placed in EMERGENCY DEPARTMENT), 11 appointments (IENs 61699 to 61709), 11 notes generated with none flagged, signed on 2026-10-06. Still to do: the other 15 patients; check the veteran flag in the patient inquiry for DFN 100971; find a replacement RxNorm code for oxycodone ER (add a translation in RXNBADDATA as done for aspirin)
- [ ] 4.3 Compare the result with the profile and record what to change for the next batch. Findings so far: the extract only lists days with orders, labs or meds, so visit-only days (for example the brain injury emergency visit at about age 21) get no note; the generated ED note reads as a veteran (status, support referral) but does not mention the brain injury; load time of the 34 MB patient is untested

## 5. Related, not part of this change

- [ ] 5.1 VistA eligibility, service connection and enrollment data for loaded veterans (Task 15 future work in PROJECT-PLAN.md)
