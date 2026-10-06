# Tasks

## 1. Population profile

- [x] 1.1 Capture the owner's decisions: about 80% men and 20% women, mostly 60 and older with some younger, 10 to 20 patients
- [x] 1.2 Draft the profile (sex, age and era, record start, condition minimums) in design.md
- [ ] 1.3 Check the condition minimums against VA sources (prevalence among VA patients) and adjust
- [ ] 1.4 Answer the open questions in design.md (forced combat injuries, a young woman with PTSD or MST, age cap)

## 2. Review the Synthea repository

- [x] 2.1 Read `veteran.json` and list the veteran-linked modules
- [ ] 2.2 Read the veteran-linked and injury modules to see which conditions, medications and encounters they generate
- [ ] 2.3 Find how to set `veteran_population_override` (command line, configuration or a keep-patients module) so every patient is a veteran
- [ ] 2.4 Confirm the exact command-line options for population, sex, age range, seed, configuration and module selection
- [ ] 2.5 Check whether the FHIR export carries any veteran flag
- [ ] 2.6 Find where hearing loss, tinnitus, migraines, back injuries, anxiety, bipolar and schizophrenia come from, or whether they need custom modules
- [ ] 2.7 Confirm that `exporter.years_of_history = 0` keeps the full record and what the exporter does with childhood conditions

## 3. Generate a batch

- [ ] 3.1 Set up Synthea (Java and the jar or a source build) and record the version
- [ ] 3.2 Write the configuration and run commands for the men and the women, with recorded seeds
- [ ] 3.3 Write the trim step that drops resources dated before each patient's 18th birthday; decide how to treat childhood chronic conditions
- [ ] 3.4 Write the batch check that reports sex, age, era and condition counts against the profile
- [ ] 3.5 Generate a larger pool, pick the first batch of 10 to 20 that fits, and record seeds

## 4. Load and use

- [ ] 4.1 Run the preflight checks on each patient file and fix mapping gaps that matter
- [ ] 4.2 Load the batch, then create appointments, generate notes, review and sign
- [ ] 4.3 Compare the result with the profile and record what to change for the next batch

## 5. Related, not part of this change

- [ ] 5.1 VistA eligibility, service connection and enrollment data for loaded veterans (Task 15 future work in PROJECT-PLAN.md)
