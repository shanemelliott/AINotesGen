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
- [ ] 3.2 Write the configuration and run commands for the men and the women (age range up to 92), with recorded seeds
- [ ] 3.2a Write keep modules for veterans and for each forced injury group, and test that each can be satisfied
- [x] 3.3 Write the trim step (`trim-synthea.js`): drops resources dated before the 18th birthday, re-dates conditions and medications still active at 18 (or drops them with `--childhood drop`), removes references to dropped resources; tested on 3 patients (earliest record at age 18.0 to 18.2, no dangling references)
- [ ] 3.4 Write the batch check that reports sex, age, era, condition and forced-injury counts against the profile
- [ ] 3.4a Write the service-connected record (cause and percentage) for each patient from a mapping table
- [ ] 3.5 Generate a larger pool, pick the first batch of 10 to 20 that fits, and record seeds

## 4. Load and use

- [ ] 4.1 Run the preflight checks on each patient file and fix mapping gaps that matter
- [ ] 4.2 Load the batch, then create appointments, generate notes, review and sign
- [ ] 4.3 Compare the result with the profile and record what to change for the next batch

## 5. Related, not part of this change

- [ ] 5.1 VistA eligibility, service connection and enrollment data for loaded veterans (Task 15 future work in PROJECT-PLAN.md)
