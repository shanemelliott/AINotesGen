# Tasks

## 1. Module foundation

- [x] 1.1 Create `src/encounters.js` with `indexVpr(items)` (by domain from `uid`, and by uid) and the VPR date helpers (`day`, ISO date, `HH:mm`, FileMan `YYYMMDD.HHMM`, `ageOn`). Verify: `node -e` against `100965.json` prints order=65, lab=157, problem=56, and `fm('202510211317')` returns `3251021.1317`.
- [x] 1.2 Create `src/problem-rules.json` with the categories and `acuteWindowDays` from design.md, and a `categorizeProblem(text, rules)` function (first match social → administrative → acute, else clinical). Verify: `node -e` shows "Full-time employment"→social, "Medication review due"→administrative, "Acute viral pharyngitis"→acute, "Body mass index 30+ - obesity"→clinical.

## 2. Encounter extraction

- [x] 2.1 Implement `extractEncounters(index, { rules })`: group orders by day, take the earliest time and clinic (falling back to the visit location, then `UNKNOWN CLINIC`), assign seq, set `suggestedVisitType`, add age/gender, and exit with an error when there are no orders. Verify: against `100965.json`, 38 encounters from 1980-06-20 to 2026-07-03; seq 1 is "New patient" and seq 2 is "Follow-up".
- [x] 2.2 Add order linking: `labsToday` from LR `results[].uid` (fallback to same-day `observed` labs), `newMeds` from PSO results, `activeMeds` excluding new meds, and lab flags. Verify: the 2025-10-21 encounter has 8 BMP labs and newMeds FUROSEMIDE/CARVEDILOL/LISINOPRIL; the 2025-10-04 encounter has its 16 orders in one encounter.
- [x] 2.3 Add `latestVitals` (latest day ≤ encounter, each with its observed date) and `recentLabHistory` (prior 90 days, excluding `labsToday`). Verify: 2025-10-21 shows WEIGHT from 10/04/2025 and includes the 2025-10-04 labs in history.
- [x] 2.4 Add problem categorization per encounter: dedupe by text (keeping the latest onset), filter to onset ≤ date, put social into `socialHistory`, drop administrative, and keep acute only within `acuteWindowDays`. Verify: for 2025-10-21, employment/criminal record/social isolation are in `socialHistory`, pharyngitis and forearm fracture are absent from `problems`, and Normal pregnancy is present. Adding a pattern to the rules file changes the categorization without code edits.
- [x] 2.5 Add `existing.visits`, `existing.appointments`, and `hasAppointment` by matching the same day. Verify: 2025-10-21 references `urn:va:visit:84F0:100965:14410` with `hasAppointment` false, and exactly 7 encounters have `hasAppointment` false (the dates listed in the spec).
- [x] 2.6 Add `kind: "historical"` and the visit-linked details (`visitDiagnoses` from pov + visit reasonName deduplicated by ICD code, `procedures` excluding OUTPATIENT ENCOUNTER, `immunizations`, `carePlanActivities` from cleaned `SYN ACT` factors), using an `encounterUid` index. Every list is always present. Verify: 2025-10-21 has I50.1 once plus low-salt diet and exercise activities; 2025-10-04 has PLAIN CHEST X-RAY; 2022-07-01 has the 3 immunizations; 1980-06-20 has all four lists empty.

## 3. CLI and safety

- [x] 3.1 Move the identifier guard into `findIdentifierLeaks(text, index)` in `src/encounters.js`. Verify: `node -e` shows the guard returns 0 leaks for the real output and more than 0 when a patient's `fullName` is injected into the text.
- [x] 3.2 Create `extract-encounters.js`: `--dfn`, discovery of `[0-9]*.json` when there's no `--dfn`, `--summary`, `--help`; write `output/encounters-<dfn>.json` only after the identifier check passes; a missing-file error; and a non-zero exit when there are no orders. Verify: `node extract-encounters.js --dfn 100965 --summary` prints 38 lines and writes the file; `--dfn 999999` exits non-zero naming `999999.json`.

## 4. Integration check

- [x] 4.1 Run `node extract-encounters.js --summary` with no args, check that the output is deterministic (running twice gives identical JSON apart from `extractedAt`), and confirm `git status` shows no new tracked files under `output/`. Update PROJECT-PLAN.md Task 2 with a status line.
