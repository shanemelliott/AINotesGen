# Tasks

## 1. Foundation

- [ ] 1.1 Add `src/paths.js` exporting `ROOT` (repo root) and use it for the scripts' data paths
- [ ] 1.2 Write the codemod that rewrites `./src/` to `../../src/` and `__dirname` to `ROOT` in a moved script, with a dry-run diff mode
- [ ] 1.3 Create `scripts/steps.json` with every script's name, group, one-line description (from its header comment), pipeline order or none, and commit-gated flag
- [ ] 1.4 Verify the commit-gated flag of each step against its usage comment and write down any script with neither a `--dry-run` nor a `--commit` flag

## 2. Move the scripts (one commit per group)

- [ ] 2.1 Move the patient group (`git mv`), run the codemod, `node --check`, dry-run `fetch-vpr` and `preflight-vista`
- [ ] 2.2 Move the appointments group, `node --check`, dry-run `create-appointments` and run `check-midnight` on one patient
- [ ] 2.3 Move the notes group, `node --check`, dry-run `generate-notes` and `link-note-visits --check`
- [ ] 2.4 Move the meds group, `node --check`, dry-run `backfill-rx-dosing` and `fill-rx`
- [ ] 2.5 Move the answer-key group (including the two untracked builders), `node --check`, regenerate one answer-key pair and compare it with the old output
- [ ] 2.6 Move the lighthouse group, `node --check`
- [ ] 2.7 Move `TASK-5-IMPLEMENTATION-RESULTS.md` into `docs/`
- [ ] 2.8 Grep `scripts/` for leftover `./src/` and bare `__dirname` data paths; confirm the root holds only `patient.js`, data files, docs and config

## 3. Entry point

- [ ] 3.1 Write `patient.js` `list` (including the unregistered-script report)
- [ ] 3.2 Write `patient.js <step>` pass-through: spawn, inherited output, same exit code, closest-name error for unknown steps
- [ ] 3.3 Write the status file update after a child exits (done, preview, failed) for runs that have `--dfn`
- [ ] 3.4 Write `patient.js status --dfn <dfn>` with ordered steps and the next step
- [ ] 3.5 Check each scenario in the `patient-pipeline-cli` spec by hand on one test patient, with a preview run and a committed run of a harmless step

## 4. Docs and skill

- [ ] 4.1 Update README, PROJECT-PLAN and `docs/*.md` to the new script paths and the entry point
- [ ] 4.2 Update `docs/ANSWER-KEY-PATIENTS.md` step list with the CLI step names
- [ ] 4.3 Write the `answer-key-patient` skill (judgment steps, rules found, scoring prompt pointer)

## 5. Carried over: medications

- [ ] 5.1 Register `CDSP UTIL FINISH RX` (tag `FINORD`) and run `finish-rx` as a dry run, then one live finish on a test patient other than the protected one
- [ ] 5.2 Run `renew-rx` then `finish-rx` end to end in one script and record the result
- [ ] 5.3 Decide on future-dated first fills after a renew and on release dates that equal the load date
- [ ] 5.4 Story 1 test: add an Rx with an issue date about a year back, then fill oldest first with one or two late fills
- [ ] 5.5 Merge the `synfmed-rx-sig` and `med-defaults-and-merge` loader fork branches so the sig lines are not duplicated
- [ ] 5.6 Ask the AI summary team how their medication table gets Last Filled and Expiration Date
- [ ] 5.7 Add a step to review the preflight "without full structured dosing" list for each new Synthea upload (in the skill or the doc)

## 6. Carried over: loader fix

- [ ] 6.1 Patch the loader so an active condition stays ACTIVE through the full-ICD path (the forced inactive when an abatement date is present, near line 217 of the problem loader)
- [ ] 6.2 Log the patch in `patches/LOADER-CHANGES.md`
- [ ] 6.3 Verify with a loaded test patient that an active condition shows active in the VPR
