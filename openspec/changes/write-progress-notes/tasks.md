# Tasks

## Group 1: Setup & Refactor (2 tasks)

### [ ] Task 1.1: Export reusable functions from test-ai.js
- Add `module.exports` to `test-ai.js` for: `buildContext`, `buildInstructions` (or the note-generation call wrapper), `stripMarkerLine`, `validateNote`
- Verify `require('./test-ai.js')` from a new script can call these functions without side effects (i.e., test-ai.js's CLI/main logic must be guarded so requiring it doesn't auto-run)
- **Success Criteria**: `node -e "const ai = require('./test-ai'); console.log(typeof ai.validateNote)"` prints `function`

### [ ] Task 1.2: Add FileMan date conversion + visit string builder to src/notesClient.js
- `filemanDateTime(dateStr, timeStr)`: converts `YYYY-MM-DD`/`HH:MM` to `YYYMMDD.HHMM` (years since 1700)
- `buildVisitString({ clinicIen, filemanDateTime, type })`: returns `<clinicIen>;<filemanDateTime>;<type>`
- `lookupAppointment(dfn, date)`: reads `src/appointments.json`, returns matching record or null
- **Success Criteria**: `filemanDateTime('2025-10-21', '10:00')` returns `3251021.1000`

---

## Group 2: Smoke Test (2 tasks)

### [ ] Task 2.1: Write test-write-note.js smoke test
**Purpose**: Verify TIU CREATE RECORD works for one encounter (2025-10-21, DFN 100965), unsigned.

**Implementation**:
- Accept CLI args: `--dfn 100965 --date 2025-10-21 --dry-run` (optional)
- Generate note text using Task 3's pipeline (via test-ai.js exports)
- Look up appointment via `lookupAppointment()`; build visit string (type `A` if found, else `E`)
- Call `callRpc('TIU CREATE RECORD', [...params...])` with DFN, note title IEN, location IEN, TEXT lines, visit string
- Parse response for TIU document IEN
- Log: latency, TIU IEN, visit string used
- If `--dry-run`: show generated note text and params without calling RPC
- Exit 0 on success, exit 1 on failure

**Success Criteria**:
- `node test-write-note.js --date 2025-10-21 --dry-run` shows note text + TIU CREATE RECORD params
- `node test-write-note.js --date 2025-10-21` (valid .env) creates a TIU document, prints IEN + latency

### [ ] Task 2.2: Verify note appears correctly in VistA
- Confirm note is visible via CPRS or TIU DOCUMENT inquiry for DFN 100965
- Verify TEXT lines match generated note content exactly (no truncation, correct line breaks)
- Verify visit is linked correctly (appointment date/clinic matches)
- Document findings: TIU IEN, note title, visit string used, any formatting issues

---

## Group 3: Batch Note Writing (3 tasks)

### [ ] Task 3.1: Write write-notes.js batch processor
**Purpose**: Loop over all 38 encounters for a patient; generate + write a note for each; log to src/notes.json.

**Implementation**:
- Accept CLI args: `--dfn 100965 --dry-run --sign`
- Load `output/encounters-{dfn}.json`; load `src/notes.json` for dedup
- Loop over each encounter:
  - If date already in notes.json: skip
  - Else: generate note text (Task 3 pipeline) → validate → build visit string → call TIU CREATE RECORD
  - On success: append {dfn, date, tiuIen, appointmentIen, signed: false, createdAt} to array
  - If `--sign`: call TIU SIGN RECORD, update signed: true on success
  - On error: log, add to failures, continue
- Write updated array to src/notes.json (atomic write)
- Print summary: created, skipped, failed
- **Success Criteria**: `node write-notes.js --dfn 100965` creates notes for all encounters not already logged; idempotent on re-run

### [ ] Task 3.2: Add --dry-run and --sign flags to write-notes.js
- `--dry-run`: preview note text + params for all encounters without calling RPC or writing notes.json
- `--sign`: after each successful TIU CREATE RECORD, call TIU SIGN RECORD with esig code from config
- **Success Criteria**: dry-run shows all 38 encounters' note previews; --sign results in signed: true in notes.json

### [ ] Task 3.3: Test batch run on actual VistA (subset first, then full)
- Run on 1-2 encounters first to confirm end-to-end flow before running all 38
- Run full batch for DFN 100965; verify src/notes.json has entries for all encounters
- Re-run and verify idempotence
- Document results: count created, latency per note, any failures and root cause

---

## Group 4: Validation & Documentation (2 tasks)

### [ ] Task 4.1: Verify notes in VistA (spot-check several dates)
- Spot-check 3-5 notes across different dates (oldest, newest, a couple in between) for correct content, visit linkage, and title
- Confirm unsigned notes show as such; signed notes (if --sign used) show signature
- Log findings in TASK-5-IMPLEMENTATION-RESULTS.md

### [ ] Task 4.2: Update PROJECT-PLAN.md and document Task 5 as DONE
- Update PROJECT-PLAN.md: Task 5 status to DONE with summary (notes created, signing behavior, idempotence)
- Create TASK-5-IMPLEMENTATION-RESULTS.md with detailed results

---

## Group 5: Code Quality & Testing (2 tasks)

### [ ] Task 5.1: Add error handling and logging to test-write-note.js
- Catch RPC failures, note-generation failures, missing config
- Provide clear error messages (missing VISTA_NOTE_TITLE_IEN, TIU CREATE RECORD failure reason, etc.)
- **Success Criteria**: Incomplete config produces a clear error message naming the missing variable

### [ ] Task 5.2: Add error handling and logging to write-notes.js
- Log progress per encounter (start/complete)
- On failure: log with date, reason, continue to next encounter
- Final summary includes created/skipped/failed counts and list of failed dates
- **Success Criteria**: A single encounter failure doesn't halt the batch; summary accurately reflects outcomes

---

## Summary

- **Group 1 (Setup)**: 2 tasks → Export test-ai.js functions, FileMan/visit-string utilities
- **Group 2 (Smoke Test)**: 2 tasks → Single-note smoke test + VistA verification
- **Group 3 (Batch)**: 3 tasks → Batch processor + dry-run/sign flags + full VistA test
- **Group 4 (Validation)**: 2 tasks → Spot-check + documentation
- **Group 5 (Quality)**: 2 tasks → Error handling + logging for both scripts

**Total: 11 tasks**
