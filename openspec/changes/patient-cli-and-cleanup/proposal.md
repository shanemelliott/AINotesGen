# Proposal

## Why

Taking one synthetic patient from a Synthea file to a loaded, noted and scored test patient is about fifteen manual steps spread over roughly sixty scripts in the repo root. Progress lives in `tasks.md` and in the head of whoever ran the last step, so resuming means re-reading notes. Four answer-key patients have now been built this way; the friction is clear and the steps are stable enough to organize.

## What Changes

- Move the root scripts into `scripts/<group>/` (patient, appointments, notes, meds, answer-key, lighthouse) with a shared repo-root path helper; the root keeps only the entry point, data files and docs.
- Add one entry point, `patient.js`, with three commands: `list` (all steps), `<step> [args]` (run one step) and `status --dfn <dfn>` (what is done and what is next).
- Record each successful, non-preview step run in a per-patient status file under `plans/` (git-ignored), so a patient can be resumed without reading notes.
- Add a skill that holds the judgment steps the scripts cannot do (designing planted findings and the answer key, rewriting planted notes by hand, scoring), and points at the CLI for everything mechanical.
- Carry in the open items from the archived medication and summarization changes: the live `FINORD` test, renew then finish in one script, the future-dated first fill decision, the year-old prescription test, merging the two loader fork branches, asking the AI summary team about Last Filled and Expiration Date, reviewing preflight dosing output per upload, and the loader fix so active conditions stay ACTIVE.
- Update the README, `docs/ANSWER-KEY-PATIENTS.md` and PROJECT-PLAN references to the new script paths.

**BREAKING:** script paths change (`node fetch-vpr.js` becomes `node patient.js fetch-vpr`, or `node scripts/patient/fetch-vpr.js`). Old root paths stop working; there are no shims.

## Capabilities

### New Capabilities
- `patient-pipeline-cli`: a single entry point that lists, runs and tracks the pipeline steps for a test patient without changing what any step does.

### Modified Capabilities

None. The loader fix for active conditions is already specified in the parked `summarization-test-patient` delta; this change only does the work.

## Non-goals

- Publishing a node module or changing the package layout beyond the folders.
- Changing the behavior, arguments or output of any existing script.
- Rewriting scripts as library functions or merging them.
- Automating the judgment steps (planted findings, hand-written planted notes, scoring); the skill only documents them.
- Changing the VistA routines, RPCs or the patient data files.

## Impact

- About 64 scripts move; each needs its `require('./src/...')` paths and its `__dirname`-based data paths (`plans/`, `logs/`, `output/`, `docs/`, root `<dfn>.json`) updated.
- Docs that name scripts: `README.md`, `PROJECT-PLAN.md`, `docs/*.md`, answer-key guides and archived-change references (archived files are left as history).
- New files: `patient.js`, `scripts/steps.json`, `src/paths.js`, `.github/skills/answer-key-patient/SKILL.md`.
- No change to VistA, the cds-vista-routines repo or the loader fork, except the loader fix and branch merges listed above.
