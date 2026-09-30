# Tasks

## 1. Problem Filtering Helper

- [x] 1.1 Add `filterProblemsForEncounter(encounter, rules)` to src/encounters.js that selects (1) primary diagnosis from visitDiagnoses, (2) acute problems within 365 days, (3) up to 3 chronic problems relevant to today's orders/meds/labs; verify the function exports correctly and returns a filtered problem array with no social/administrative problems for a test encounter (e.g., DFN 100965, 2025-10-21)

## 2. Enhanced Prompt Builder

- [x] 2.1 Update `buildInstructions()` in test-ai.js to include visitDiagnoses (name + ICD code), carePlanActivities (cleaned), and filtered problems from step 1.1; verify the prompt text includes the diagnosis code, at least one care plan activity, and no more than 5 problems

- [x] 2.2 Add instruction to prompt: "Do not include problems outside the provided problem list in your assessment" and "Link all new medications to their clinical indication in the PLAN section"; verify the prompt text contains both instructions

- [x] 2.3 Update VISIT DATE line to use encounter's `suggestedVisitType` ("New patient" / "Follow-up") instead of generic "VA OUTPATIENT"; verify the prompt requests the correct TYPE based on encounter sequence

## 3. Marker Line and Validation

- [x] 3.1 Add `stripMarkerLine(note)` function to test-ai.js that removes the first line if it begins with `*** SYNTHETIC`; verify the function strips the marker from smoke-note output and returns a clean note starting with VISIT DATE:

- [x] 3.2 Add `validateNote(note)` function to test-ai.js that checks: (1) exactly 6 headings in correct order, (2) all lines ≤ 80 chars, (3) no patient identifiers (SSN, ICN, name, address), (4) no markdown, (5) focused assessment (≤5 items); verify the function validates smoke-note-o3-mini.txt and reports all 6 quality issues from TASK-3-QUALITY-REVIEW.md

- [x] 3.3 Update `callCandidate()` in test-ai.js to log the marker-stripped version to a new file `output/note-<dfn>-<seq>-clean.txt` for upload comparison; verify the file is created and contains the note without the marker line

## 4. Test Note Generation

- [x] 4.1 Run test-ai.js against the 2025-10-21 encounter (DFN 100965, has I50.1, carePlanActivities, new meds) and save output to `output/note-100965-oct21-improved.txt`; verify the note completes in ≤ 20 seconds (same as smoke test baseline)

- [x] 4.2 Verify the 2025-10-21 note includes: (1) primary diagnosis "Left ventricular failure, unspecified (I50.1)" in CHIEF COMPLAINT and ASSESSMENT, (2) care plan activities (diet, exercise) in PLAN, (3) focused assessment with ≤5 items, (4) social history in SUBJECTIVE (not assessment), (5) all 3 new meds linked to their indications; if any criterion fails, debug the prompt or LLM behavior

## 5. Quality Comparison

- [x] 5.1 Run validateNote() on both smoke-note-o3-mini.txt and note-100965-oct21-improved.txt; document the results (which issues resolved, which remain, new issues introduced); verify at least 4 of the 6 quality issues from TASK-3-QUALITY-REVIEW.md are resolved in the improved note

- [x] 5.2 If validateNote() reports unfixed or new issues (e.g., assessment still includes 10+ problems, marker line not stripped), debug and iterate: update prompt, re-run test, re-validate; repeat until at least 4 issues pass; document the iteration steps

## 6. Documentation and Archive

- [x] 6.1 Create a comparison file `TASK-3-IMPLEMENTATION-RESULTS.md` documenting: (1) quality issues fixed (with before/after excerpts), (2) issues unresolved and why, (3) new issues introduced (if any), (4) lessons learned (e.g., LLM compliance with problem filtering, token costs, best prompt phrasing); verify the file includes concrete examples from both notes

- [x] 6.2 Update PROJECT-PLAN.md Task 3 status to "DONE" with a summary: "Enhanced prompts to use visitDiagnoses, carePlanActivities, and filtered problems; tested on 2025-10-21 encounter; 4+ quality issues resolved; ready for Task 4"; verify the plan reflects completion status and next steps (Task 4: Appointment Creation)

- [x] 6.3 Run `openspec archive improve-note-quality` to archive the change; verify the change is moved to archived-changes and specs/note-quality-improvement/spec.md is created at the repo root; confirm no errors during archive
