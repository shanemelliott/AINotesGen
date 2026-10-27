# Design

## Context

- About 64 scripts sit in the repo root. Each does `require('./src/...')` and most build data paths from `__dirname` (`plans/`, `logs/`, `output/`, `docs/`, and the patient's `<dfn>.json` in the root). Shared code is already in `src/`.
- Scripts differ in how they preview: some preview unless `--commit` is passed (backfill, refill, finish), others write unless `--dry-run` is passed (appointments, notes).
- Patient state today is kept in `tasks.md` and in notes, not in a machine-readable place. `plans/`, `logs/`, `output/` and `docs/TestPatientsWithAnswers/` are git-ignored and hold patient data.
- Four answer-key patients went through the same fifteen steps, so the step order is known (trim, preflight, load, rename, veteran data, appointments, planted visits, labs and vitals, meds, notes, key, scoring).

## Goals / Non-Goals

**Goals:**
- A tidy root: entry point, data files, docs.
- One command to list, run and track steps; resuming a patient takes one command.
- No change to what any script does.

**Non-Goals:**
- Turning scripts into libraries, publishing a module, or changing arguments and output.
- Automating the judgment steps.
- Backwards-compatible root shims.

## Decisions

1. **Folders, not a package.** Scripts move with `git mv` to `scripts/patient/`, `scripts/appointments/`, `scripts/notes/`, `scripts/meds/`, `scripts/answer-key/` and `scripts/lighthouse/`. Proposed grouping: patient (trim, preflight, load, rename, vet data, fetch VPR, labs and vitals, history plans, problem edit), appointments (create, cancel, midnight check, extract encounters, clinics, visits), notes (generate, approve, sign, link, review, titles, summarize, test-ai), meds (add, renew, finish, fill, plan, history, backfill, check), answer-key (key files, test patient and note builders), lighthouse (all `lighthouse-*`). The grouping is confirmed against each script's header comment during the move. A node module would only pay off if other repos reused the scripts, and none do.
2. **One path helper.** `src/paths.js` exports `ROOT` (the repo root). Moved scripts replace `./src/` with `../../src/` and `__dirname` with `ROOT`, so data paths keep pointing at the repo root. A codemod does the mechanical part; each moved script is checked with `node --check` and a dry run.
3. **Entry point spawns the step.** `patient.js` reads `scripts/steps.json` (name, file, group, description, pipeline order or none, commit-gated flag), then runs the script with `node` as a child process with inherited output and the unchanged argument list. It exits with the child's code. Spawning keeps each script a standalone program, which is why behavior does not change.
4. **Registry is data.** `scripts/steps.json` is the single list of steps. `list` also compares the registry against the files on disk and reports unregistered scripts.
5. **Status file.** `plans/dfn<dfn>-status.json` holds `{dfn, steps: {<name>: {done, lastRun, preview, exitCode}}}`. It is written by the entry point, not by scripts, after a child exits. Preview is true when args contain `--dry-run`, or when the step is commit-gated and `--commit` is absent. It stays under `plans/` because that folder is git-ignored; it never holds names, ICNs or planted details.
6. **No shims.** Old root paths stop working. Keeping stubs would leave the root as messy as today. Docs and the README are updated in the same change.
7. **Skill after the CLI.** `.github/skills/answer-key-patient/SKILL.md` is written last, so the commands it names are final. It covers the steps a script cannot do and the rules found while building four patients (name digits, hand-written planted notes, scoring prompt).
8. **Carried work stays separate.** The medication loose ends and the active-condition loader fix are tasks in this change but do not touch the CLI code, so they can be done or dropped independently.

## Risks / Trade-offs

- **Broken paths.** A missed `__dirname` or `./src` breaks a script at run time. Mitigation: codemod, `node --check` on all, a dry run of each step group, and a grep for leftover `./src/` in `scripts/`.
- **Commit-gated list wrong.** If a step is mislabeled, its preview could be recorded as done. Mitigation: the flag is verified from each script's usage comment during the move, and `status` shows previews separately.
- **Habit and docs drift.** People will type old paths and old docs will name old scripts. Mitigation: update README, PROJECT-PLAN and `docs/` in the same change; archived changes keep their old names as history.
- **Large move diff.** One commit per group keeps review and revert simple.
- **Untracked scripts.** `build-test-notes.js` and `build-test-patient.js` are untracked; they are added in the answer-key group as part of the move.
