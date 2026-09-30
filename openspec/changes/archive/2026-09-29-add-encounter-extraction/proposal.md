# Proposal

## Why

Every later step (appointment creation, AI note generation, TIU note writing) needs the same input: a list of encounters for a patient, each with the right clinical context. The smoke test built this context for one hardcoded date with ad-hoc filtering. It showed that Synthea's raw problem list is misleading: almost everything is `ACTIVE`, and social determinants are mixed in with diagnoses. That produced a bloated, unfocused note. We need one reliable, reviewable extraction step before building anything that writes to VistA.

## What Changes

- A new CLI, `extract-encounters.js`, reads `<dfn>.json` (or every `[0-9]*.json` found) and writes `output/encounters-<dfn>.json`.
- It creates one encounter per distinct order date, holding:
  - encounter date/time and clinic
  - patient age/gender at that date
  - the orders placed that day, with their linked lab results and meds
  - meds active that day
  - vitals, and recent lab history
  - a categorized problem list
  - the existing VistA visit/appointment on that date, if any
  - a suggested visit type
- Each encounter also gets the clinical details VistA recorded on that day's visit, found through `encounterUid`:
  - **visit diagnoses** from `pov` and the visit's `reasonName`. For example, 2025-10-04, 2025-10-21 and 2026-04-19 all have "Left ventricular failure" (I50.1), which is not on the problem list.
  - **procedures** from `cpt`, leaving out the generic "OUTPATIENT ENCOUNTER"
  - **immunizations** given
  - **care-plan activities** from Synthea `SYN ACT ...` health factors, such as low-salt diet education and exercise
- Each encounter is marked `kind: "historical"` so that future planned encounters can reuse the same layout.
- Problems are sorted into `clinical`, `acute`, `social`, and `administrative`, using an editable rules file. Old acute problems are dropped, and social determinants are moved to `socialHistory`.
- A reusable module, `src/encounters.js`, will be used by the later AI note generation and appointment changes.
- A `--summary` mode prints one line per encounter for quick human review.

## Capabilities

### New Capabilities
- `encounter-extraction`: Derive a patient's historical encounters from VPR order dates and assemble each encounter's minimized clinical context, including problem categorization, links to existing VistA visits/appointments, and identifier exclusion.

### Modified Capabilities
<!-- None. ai-note-generation will consume this output in a later change; its requirements are unchanged here. -->

## Non-goals

- No LLM calls and no note generation. Refactoring `test-ai.js` or the `ai-note-generation` spec comes in the next change.
- No VistA reads or writes. No fetching VPR JSON through vista-api-x; this change works only on local JSON files.
- No decision about which encounters get new appointments. This change only *reports* existing visits/appointments; the policy belongs to the appointment change.
- No clinical inference (for example "furosemide + carvedilol means heart failure"). That's a prompt concern for Task 3. Coded visit diagnoses are passed through as recorded.
- No future or planned encounters. A later change will produce `kind: "planned"` encounters.
- No encounters for visits that have no orders. There are 141 visits but only 38 order dates; this is recorded as an open question in PROJECT-PLAN.md.
- No unit-test framework. Verification is by CLI output against known values in `100965.json`.

## Impact

- New files: `extract-encounters.js`, `src/encounters.js`, `src/problem-rules.json`.
- Output: `output/encounters-<dfn>.json`. This contains derived patient clinical data and is git-ignored under `output/`.
- No new dependencies and no network access.
- `test-ai.js` is unchanged.
