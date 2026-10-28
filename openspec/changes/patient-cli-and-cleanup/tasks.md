# Tasks

## 1. Foundation

- [x] 1.1 Add `src/paths.js` exporting `ROOT` (repo root) and use it for the scripts' data paths
- [x] 1.2 Write the codemod that rewrites `./src/` to `../../src/` and `__dirname` to `ROOT` in a moved script, with a dry-run diff mode (done: one-off script kept outside the repo, not committed)
- [x] 1.3 Create `scripts/steps.json` with every script's name, group, one-line description (from its header comment), pipeline order or none, and commit-gated flag
- [x] 1.4 Verify the commit-gated flag of each step against its usage comment and write down any script with neither a `--dry-run` nor a `--commit` flag (done: three kinds of gate found: `--commit`, `--apply` and `--dry-run`; custom-visits and build-test-notes also gate on `--book`/`--generate`)

## 2. Move the scripts (one commit per group)

- [x] 2.1 Move the patient group (`git mv`), run the codemod, `node --check`, dry-run `fetch-vpr` and `preflight-vista`
- [x] 2.2 Move the appointments group, `node --check`, dry-run `create-appointments` and run `check-midnight` on one patient
- [x] 2.3 Move the notes group, `node --check`, dry-run `generate-notes` and `link-note-visits --check`
- [x] 2.4 Move the meds group, `node --check`, dry-run `backfill-rx-dosing` and `fill-rx`
- [x] 2.5 Move the answer-key group (including the two untracked builders), `node --check`, regenerate one answer-key pair and compare it with the old output
- [x] 2.6 Move the lighthouse group, `node --check`
- [x] 2.7 Move `TASK-5-IMPLEMENTATION-RESULTS.md` into `docs/`
- [x] 2.8 Grep `scripts/` for leftover `./src/` and bare `__dirname` data paths; confirm the root holds only `patient.js`, data files, docs and config

## 3. Entry point

- [x] 3.1 Write `patient.js` `list` (including the unregistered-script report)
- [x] 3.2 Write `patient.js <step>` pass-through: spawn, inherited output, same exit code, closest-name error for unknown steps
- [x] 3.3 Write the status file update after a child exits (done, preview, failed) for runs that have `--dfn`
- [x] 3.4 Write `patient.js status --dfn <dfn>` with ordered steps and the next step
- [x] 3.5 Check each scenario in the `patient-pipeline-cli` spec by hand on one test patient, with a preview run and a committed run of a harmless step (done: list, unknown step, pass-through exit codes, committed, preview, failed and no-patient runs, and status checked on a test patient; test status files removed)

## 4. Docs and skill

- [x] 4.1 Update README, PROJECT-PLAN and `docs/*.md` to the new script paths and the entry point (done: `node <script>.js` commands in README, docs and main specs now read `node patient.js <step>`; archived changes left as history)
- [x] 4.2 Update `docs/ANSWER-KEY-PATIENTS.md` step list with the CLI step names
- [x] 4.3 Write the `answer-key-patient` skill (judgment steps, rules found, scoring prompt pointer)

## 5. Carried over: medications

- [x] 5.1 Register `CDSP UTIL FINISH RX` (tag `FINORD`) and run `finish-rx` as a dry run, then one live finish on a test patient other than the protected one (done 2026-10-28: RPC registered in `CDSP RPC UTILS`, dry run works; the first live finish used the new-order path and left the Rx unlinked, so `FINORD` now finishes a pending renewal through the renewal code, see 5.2)
- [x] 5.2 Run `renew-rx` then `finish-rx` end to end in one script and record the result (done 2026-10-28 on a test patient: renew created pending order 51008, finish created renewal Rx 407714 linked to that order, removed the pending entry and discontinued the old Rx; VPR shows the new Rx ACTIVE with 3 refills left and one fill dated the finish day; a single combined script is not written, the two steps run as `renew-rx` then `finish-rx --ord <pending IEN>`; the pending IEN comes from file #52.41 and is not returned by `renew-rx`)
- [x] 5.3 Decide on future-dated first fills after a renew and on release dates that equal the load date (done 2026-10-28 on a test patient: renewing an Rx filled the same day and finishing with `--fill-date` unset gave the next possible fill date, 2027-01-16; the new Rx is ACTIVE (status 0, not suspended) and the VPR shows one fill dated 2027-01-16 with an empty release date, 3 refills left; the old Rx shows not active with a successor link. Decision: leave `--fill-date` unset only to test a future-dated first fill; for a normal renewal pass `--fill-date` of today or earlier, which also releases the fill (release date then equals the fill date, the same as for fills from `fill-rx`). The finish hit `<UNDEFINED> *PSOBILL` in `PSORN52` after filing, because `COPAY^PSOCPB` kills it; `FINRNW` now skips that lookup; verified on dev the same day: renewing again and finishing with `--fill-date` of today completed with no error, the new Rx is ACTIVE with a fill and release date of today, 3 refills left, linked to its predecessor, and the pending entry is gone)
- [x] 5.4 Story 1 test: add an Rx with an issue date about a year back, then fill oldest first with one or two late fills (done 2026-10-28 on a test patient: metformin 500 MG Rx issued 2025-10-29 with 3 refills of 90 days, then fills on 2026-01-30 (3 days late), 2026-05-10 (10 days late) and 2026-08-25 (a long gap); VPR shows 4 fill dates, route PO, schedule BID, 0 refills left)
- [ ] 5.5 Merge the `synfmed-rx-sig` and `med-defaults-and-merge` loader fork branches so the sig lines are not duplicated (parked 2026-10-28 until the talk with the loader owner: `synfmed-rx-sig` is not an ancestor of `med-defaults-and-merge`, both merge cleanly with upstream master, and `CDSPRX`/`CDSPFHIR` need `med-defaults-and-merge` for `DOSING`, `MEDDEF` and `ROUTESCH` in `SYNFMED`; without it they report dosing as not available)
- [x] 5.6 Ask the AI summary team how their medication table gets Last Filled and Expiration Date (closed 2026-10-28 without asking: the VPR carries `lastFilled`, `fills[]`, `stopped` and `overallStop`, and the question is not blocking)
- [x] 5.7 Add a step to review the preflight "without full structured dosing" list for each new Synthea upload (in the skill or the doc) (done: in the skill and in `docs/ANSWER-KEY-PATIENTS.md` step 2)

## 6. Carried over: loader fix

- [x] 6.1 Patch the loader so an active condition stays ACTIVE through the full-ICD path (the forced inactive when an abatement date is present, near line 217 of the problem loader) (done 2026-10-28 in the fork branch `fix-problem-active-status`: the cause was a case mismatch, `"active"` from the bundle compared with `"Active"`, not the full-ICD path or the abatement rule; `SYNFPRB.m` only)
- [x] 6.2 Log the patch in `patches/LOADER-CHANGES.md` (done: new row in the table)
- [x] 6.3 Verify with a loaded test patient that an active condition shows active in the VPR (done 2026-10-28 with upstream `SYNFPRB.m` and `SYNDHP61.m` (commit `86e0085`) on dev and a fresh Synthea load: the bundle had 93 conditions, 20 active with no abatement and 73 resolved; dev filed 77 problems (16 load errors), 15 ACTIVE with no resolved date and 62 INACTIVE each with a resolved date after or equal to onset, none before; both the ICD-mapped (ICD-9 and ICD-10) and the unmapped SNOMED problems came out right. The fork branch `fix-problem-active-status` is superseded by the upstream fix and will not go up as a PR)
- [x] 6.4 Reactivate the problems the loader filed INACTIVE by mistake on already loaded patients with `node patient.js reactivate-problems --dfn <dfn>[,<dfn>] [--ien <ien>] [--apply]` (done 2026-10-28: 10 problems reactivated and verified on the four newest patients; the six diabetes entries on P1 and P2 were left inactive on purpose because their answer keys depend on it, recorded in each key's `chartNotes`)

## 7. Later

- [ ] 7.1 Send the upstream PR to Sam and George from the fork branch `synfmed-fixes` (one commit in `SYNFMED.m`: multi-product VUID loop in `MATCHV1`, `VAP2MED` guards the ND node with `$G`, four RxNorm CUIs in `RXNBADDATA`; no dependency on `cds-vista-routines`). Use the talk to decide the rest: `med-defaults-and-merge` (needed by `CDSPRX` and `CDSPFHIR` for `DOSING`, `MEDDEF` and `ROUTESCH`) and `synfmed-rx-sig` (overlaps it); this reopens 5.5

