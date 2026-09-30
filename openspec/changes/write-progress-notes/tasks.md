# Tasks

## Group 1: Setup & Refactor (2 tasks) — DONE

### [x] Task 1.1: Export reusable functions from test-ai.js
- Add `module.exports` to `test-ai.js` for: `buildContext`, `buildInstructions`, `callCandidate`, `stripMarkerLine`, `validateNote`, `checkFormat`, `loadPatient`, `getEncounter`
- Guard `main()` with `if (require.main === module)` so requiring test-ai.js doesn't auto-run the CLI
- **Success Criteria**: `node -e "const ai = require('./test-ai'); console.log(typeof ai.validateNote)"` prints `function` ✓

### [x] Task 1.2: Add FileMan date conversion + visit string builder to src/notesClient.js
- `filemanDateTime(dateStr, timeStr)`: converts `YYYY-MM-DD`/`HH:MM` to `YYYMMDD.HHMM` (years since 1700), trailing zeros stripped to match VistA's format
- `filemanFromVprDateTime(vprDateTime)`: converts VPR `YYYYMMDDHHmm` directly to FileMan format
- `buildVisitString({ clinicIen, filemanDateTime, type })`: returns `<clinicIen>;<filemanDateTime>;<type>`
- `resolveAppointment(encounter, dfn, date)`: prefers the encounter's own linked appointment (`existing.appointments[0]`, authoritative VPR data) over `src/appointments.json`
- `buildEncryptedSigString(code)`: XWB broker substitution cipher for e-sig codes (required by TIU SIGN RECORD)
- **Success Criteria**: `filemanDateTime('2025-10-21', '10:00')` returns `3251021.1` ✓

---

## Group 2: Smoke Test (2 tasks) — DONE

### [x] Task 2.1: Write test-write-note.js smoke test
- CLI args: `--dfn 100965 --date 2025-10-21 --dry-run --sign`
- Generates note text via Task 3's pipeline, validates, builds visit string via `resolveAppointment()`, calls `TIU CREATE RECORD` (context `OR CPRS GUI CHART`, `namedArray` params), optional `TIU SIGN RECORD` via `--sign`
- **Success Criteria**: verified end-to-end against live VistA (create + sign both succeeded) ✓

### [x] Task 2.2: Verify note appears correctly in VistA
- Confirmed via CPRS screenshot: note content populated, correct visit link (10/21/25@10:00), correct clinic/title
- Confirmed signing succeeds with encrypted e-sig code (`TIU SIGN RECORD` returns `"0"` on success, not `"1"`)

---

## Group 3: Generate → Review → Sign Pipeline (6 tasks)

Replaces the original single `write-notes.js` batch script with a 3-stage, file-based pipeline (see design.md Decision 6): generate all notes to disk, auto-flag questionable ones, human reviews/approves at their own pace, then batch-sign everything approved in one command.

### [x] Task 3.1: Write src/noteFlags.js (deterministic + fallback LLM flag check)
- `flagNote(noteText, ctx)` returns `{ flagged: boolean, reasons: string[] }`
- Deterministic checks (run first, always):
  - Obstetric/pregnancy terms (pregnancy, eclampsia, antepartum, prenatal) appearing while active meds are contraceptive-only (e.g. medroxyprogesterone with no other pregnancy-related order)
  - Any ASSESSMENT item not traceable to `ctx.relevantProblems` or `ctx.visitDiagnoses`
  - Any of Task 3's existing `validateNote()` problems
- Fallback (only if deterministic checks pass but note looks borderline, e.g. hedging language like "unclear if" or "may be"): one small LLM call requesting `{flagged, reason}` JSON only (not a full note regeneration)
- **Success Criteria**: given the known 2025-10-04 pregnancy/eclampsia case (pre-fix data), `flagNote()` returns `flagged: true` with a reason mentioning pregnancy/contraceptive mismatch

### [x] Task 3.2: Write generate-notes.js
- CLI: `node generate-notes.js --dfn 100965 [--dry-run]`
- Loop all encounters in `output/encounters-{dfn}.json`; skip any already present in `output/review/`, `output/ready/`, or `output/signed/` (by id)
- For each: generate note text (Task 3 pipeline), validate, resolve appointment/visit string, run `flagNote()`
- Write one JSON file per note: `{dfn}-{date}.json` to `output/review/` (if flagged or validation failed) or `output/ready/` (if clean), containing `{ dfn, date, noteText, visitString, noteTitleIen, locationIen, flagged, flagReasons, generatedAt }`
- Print summary: generated, flagged (needs review), ready, skipped (already exists)
- **Success Criteria**: `node generate-notes.js --dfn 100965` produces 38 files split between `output/review/` and `output/ready/`

### [x] Task 3.3: Write approve-note.js
- CLI: `node approve-note.js --all` (approve everything in `output/review/`) or `node approve-note.js <id-or-path>` (approve one, e.g. `100965-2025-10-04` or `output/review/100965-2025-10-04.json`)
- Moves the file(s) from `output/review/` to `output/ready/`
- **Success Criteria**: `node approve-note.js --all` moves every file from `output/review/` to `output/ready/`; `node approve-note.js 100965-2025-10-04` moves just that one

### [x] Task 3.4: Write sign-notes.js batch processor
- CLI: `node sign-notes.js --all [--sign] [--dry-run]` (or a specific id)
- Loop every file in `output/ready/`: call `TIU CREATE RECORD` (+ `TIU SIGN RECORD` if `--sign`)
- On success: append `{dfn, date, tiuIen, appointmentIen, signed, createdAt}` to `src/notes.json`; move file to `output/signed/`
- On error: log with date/reason, leave file in `output/ready/` for retry, continue to next
- Print summary: created, signed, failed
- **Success Criteria**: `node sign-notes.js --all --sign` processes every file in `output/ready/`, logs to `src/notes.json`, archives to `output/signed/`; re-run is a no-op (nothing left in `output/ready/`)

### [x] Task 3.5: End-to-end test with review step
- Run `generate-notes.js` for DFN 100965
- Review/edit at least one flagged note in `output/review/`, approve it
- Run `approve-note.js --all` for the rest
- Run `sign-notes.js --all --sign`
- Verify `src/notes.json` has all 38 entries and `output/ready/`/`output/review/` are empty
- **Done**: 100965 (38/38 signed) and 100961 (49/49 signed) completed end-to-end; 2 intermittent e-sig failures caught and fixed via `resign-notes.js` + retry logic in `signNote()`.

### [ ] Task 3.6: Document results
- Document counts (generated, flagged, approved, signed), any failures, and the pregnancy/eclampsia flag-check catch rate in TASK-5-IMPLEMENTATION-RESULTS.md
- **Pending**: finish once 100962/100964 are processed so the doc covers all 4 patients in one pass.

---

## Group 4: Validation & Documentation (2 tasks)

### [ ] Task 4.1: Verify notes in VistA (spot-check several dates)
- Spot-check 3-5 notes across different dates (oldest, newest, a couple in between) for correct content, visit linkage, and title
- Confirm unsigned notes show as such; signed notes show signature
- Log findings in TASK-5-IMPLEMENTATION-RESULTS.md

### [ ] Task 4.2: Update PROJECT-PLAN.md and document Task 5 as DONE
- Update PROJECT-PLAN.md: Task 5 status to DONE with summary (notes created, signing behavior, idempotence, review pipeline)

---

## Group 5: Code Quality & Testing (2 tasks)

### [x] Task 5.1: Add error handling and logging to test-write-note.js
- Catch RPC failures, note-generation failures, missing config; clear error messages
- **Success Criteria**: Incomplete config produces a clear error message naming the missing variable ✓

### [x] Task 5.2: Add error handling and logging to generate-notes.js / sign-notes.js
- Log progress per encounter/file (start/complete)
- On failure: log with date, reason, continue; final summary includes counts and list of failures
- **Success Criteria**: A single failure doesn't halt the batch; summary accurately reflects outcomes ✓ (verified: truncated-LLM-output failures and intermittent e-sig failures both logged without halting the batch)

---

## Summary

- **Group 1 (Setup)**: 2 tasks → DONE
- **Group 2 (Smoke Test)**: 2 tasks → DONE
- **Group 3 (Pipeline)**: 6 tasks → Flag check, generate, approve, sign, end-to-end test, docs
- **Group 4 (Validation)**: 2 tasks → Spot-check + documentation
- **Group 5 (Quality)**: 2 tasks → Error handling + logging (1 done)

**Total: 14 tasks**
