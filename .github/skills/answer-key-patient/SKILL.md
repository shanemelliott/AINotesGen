---
name: answer-key-patient
description: Build a synthetic veteran test patient with planted findings and an answer key on dev VistA, then score an AI summary against it. Use when the user wants a new answer-key (gotcha) patient, wants to resume one, or asks how to plant findings, rewrite planted notes, or score a summary or chatbot run.
---

Build and score an answer-key test patient. The mechanical steps are scripts run through `node patient.js`; this skill covers the judgment steps a script cannot do. Full method and rules: `docs/ANSWER-KEY-PATIENTS.md`. Scoring: `docs/TestPatientsWithAnswers/SUMMARY-SCORING-GUIDE.md`.

## Before you start

- Dev VistA only. Never write to the protected critical test patient (the backfill refuses it; do not bypass).
- No patient names, DFNs, ICNs or planted details in tracked files. Plans, keys, outputs and logs are git-ignored (`plans/`, `output/`, `logs/`, `docs/TestPatientsWithAnswers/`).
- Resume a patient with `node patient.js status --dfn <dfn>`; it names the next step. `node patient.js list` shows every step.
- Writes preview by default for most steps (`--commit` or `--apply`); appointments, notes and loading write unless `--dry-run`. Run the preview first.

## Mechanical steps (scripts)

Run in this order, each as `node patient.js <step> ...` (use `--patient <dfn>` when a step has no `--dfn`, for example `sign-notes --all`):
`trim-synthea`, `preflight-synthea`, `preflight-vista` (review the "without full structured dosing" list), `load-synthea`, `set-name` (digits kept, middle initial A), `vet-profile`, `fetch-vpr`, `extract-encounters`, `create-appointments`, `check-midnight`, `custom-visits`, `import-labs-vitals`, `add-rx`, `backfill-rx-dosing`, `generate-notes`, `approve-note`, `sign-notes`, `link-note-visits`, `build-answer-key-files`.

## Judgment steps (you do these)

1. **Design the planted findings.** Pick items from the six families: A critical event (ED), B critical specialty result, C outpatient labs with no visit, D open loop, E trend, F medication problem. Give each a severity, a date, a source, what the summary must surface, a scoring rule, distractors (routine items that must not be overstated) and `shouldNotSay` lines. Write the source key to `plans/dfn<dfn>-answerkey.json` and the visits and labs to `plans/dfn<dfn>-visits.json` and `-labs-vitals.json`.
2. **Rewrite every planted note by hand.** Generated notes invent history (durations, past diagnoses, pregnancy) and drop score values. Delete the generated `.txt` under `output/review/` and write the note yourself, with the exact values the key needs. Use wordy mode (`NOTE_WORDY=1`) for routine notes only.
3. **Check clinics and titles.** A clinic needs its own SDEC resource to take appointments; note titles come from `src/note-titles.json` (a signed note cannot be retitled).
4. **Medications.** Schedule II drugs come out non-verified and take no refills; plan around that. Late or missing refills are item family F, so plan the fills deliberately (`fill-rx`, `fill-plan`).
5. **Score.** Run the AI summary app and the chatbot, score the pasted output with the scoring prompt, add each run to the source key's `runs`, then regenerate with `build-answer-key-files`. Borderline `shouldNotSay` headings are the owner's call; record them, do not decide.

## Pitfalls seen

- FileMan strips digits from names; always rename with `set-name`, never through FileMan.
- `generate-notes --dry-run` still calls the LLM for each note.
- `fetch-clinics <ien>` overwrites `logs/clinics.json`; back it up first.
- JSON edits: plain quotes for structure and `\"` only inside strings; validate with `node -e "JSON.parse(...)"`.
- Do not edit a script's output pair; edit the source key and regenerate.
