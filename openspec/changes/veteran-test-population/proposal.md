# Proposal

## Why

The Synthea patients we load are lifetime records for the general population: about half women, histories that start at birth, and conditions typical of the whole US population. A VA test system needs patients who look like veterans: mostly men, mostly older, records that begin when they entered the service, and the conditions and injuries veterans actually carry (PTSD, back and joint problems, hearing loss, sleep apnea, diabetes).

## What Changes

- Define a target veteran test population (sex mix, age and service-era mix, record start, condition mix) and record its sources.
- Review the Synthea repository to find how to generate that population: veteran modules, veteran status controls, history limits, age and sex selection.
- Generate a first batch of 10 to 20 patients, trim records so none start before military entry, check the batch against the profile, then preflight, load, schedule and write notes for it with the existing pipeline.
- Record what Synthea cannot do on its own and how we close the gap (for example trimming pre-service history after generation).

## Capabilities

### New Capabilities
- `veteran-test-population`: what a generated veteran test batch must look like and how it is checked.

### Modified Capabilities

## Impact

- New generation inputs (Synthea configuration, run commands, seeds) and a post-generation trim and check script.
- Feeds the existing load path (`synthea-fhir-load`); no change to loader behavior is planned.
- Related plan item: Task 15 in `PROJECT-PLAN.md`, including the future work on veteran eligibility and service data in VistA, which stays separate from this change.
