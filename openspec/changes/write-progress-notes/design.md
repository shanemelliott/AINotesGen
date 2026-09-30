# Design

## Context

- Task 3 produces validated, marker-stripped AI note text for a given encounter (`test-ai.js`: `buildContext`, `buildInstructions`, `stripMarkerLine`, `validateNote`).
- Task 4 created appointments for all 38 historical encounters and logged them in `src/appointments.json` (dfn, date, requestIen, appointmentIen, clinicIen, resourceIen).
- `vista-notes/index.js` has a working reference for `TIU CREATE RECORD` param structure and FileMan date conversion (`convertToFileManDateTime`), plus an optional `TIU SIGN RECORD` call.
- Transport (`src/vistaApiClient.js`, `src/tokenService.js`, `src/config.js`) is already in place from Task 4 and reusable as-is.

## Goals

1. Write a TIU note for each of the 38 historical encounters for DFN 100965.
2. Tie each note to its corresponding appointment (visit string type `A`) using data from `src/appointments.json`.
3. Support idempotent re-runs via `src/notes.json`.
4. Support dry-run mode to preview note text and RPC params before writing.
5. Leave notes unsigned by default; support optional signing via `--sign`.
6. Fully separate note *generation* from VistA *writing*, with a review gate in between: generate all notes to disk first, flag questionable ones automatically, let a human review/edit/approve at their own pace, then batch-write and sign everything approved in one command.

## Non-Goals

- Multi-patient orchestration (Task 6).
- Co-signature or addenda workflows.
- Per-encounter note title selection (single title IEN for all notes in this change).

## Decisions

### Decision 1: Reuse test-ai.js functions directly (require, not copy)
**Choice**: `require('./test-ai.js')` (after exporting the needed functions) rather than duplicating prompt-building logic.

**Rationale**: Task 3's prompt/validation logic is already tested and tuned; duplicating it risks drift. `test-ai.js` needs a small change to `module.exports` the functions used by `write-notes.js`.

**Alternatives Considered**:
- Copy prompt logic into notesClient.js. Rejected: duplicates maintenance burden.

### Decision 2: FileMan date conversion as a small utility, ported from vista-notes/index.js
**Choice**: Add `filemanDateTime(dateStr, timeStr)` to `src/notesClient.js`, adapted from `vista-notes/index.js`'s `convertToFileManDateTime` (which used `moment`; we avoid adding a new dependency and compute directly from date parts since we already parse `YYYY-MM-DD`/`HH:MM` elsewhere in `src/appointmentCreator.js`).

**Rationale**: No need for `moment`; the conversion is simple arithmetic (year - 1700, then MMDD.HHMM).

### Decision 3: Visit string sourced from src/appointments.json
**Choice**: Look up the encounter's date in `src/appointments.json` to get `clinicIen`; build visit string `<clinicIen>;<FMdatetime>;A`. Fall back to `E` type with default clinic IEN if no appointment record exists for that date.

**Rationale**: Task 4 guarantees an appointment exists for every encounter going forward, but the fallback keeps the script robust if run against a different patient/dataset where some appointments are missing.

### Decision 4: Unsigned by default, explicit --sign flag
**Choice**: Default behavior creates notes unsigned (matches `vista-notes/index.js` pattern where `TIU SIGN RECORD` is a separate, optional call). `--sign` triggers `TIU SIGN RECORD` with the esig code from config.

**Rationale**: Safer default for synthetic/test data — avoids accidentally signing notes with a real provider's e-signature until explicitly requested.

### Decision 5: Idempotence via src/notes.json (same pattern as src/appointments.json)
**Choice**: Track (dfn, date) -> tiuIen in `src/notes.json`; skip already-created dates on re-run.

**Rationale**: Consistent with Task 4's `appointments.json` pattern; easy to reason about and audit.

### Decision 6: Generate-review-sign pipeline, file-based (not a web UI)
**Choice**: Three-stage, file-based pipeline instead of a custom review UI:
1. `generate-notes.js` generates note text for every encounter and writes one JSON file per note, keyed by a short id `<dfn>-<date>` (e.g. `100965-2025-10-04.json`), to `output/review/` (if flagged) or `output/ready/` (if clean).
2. `approve-note.js` moves a reviewed/edited file from `output/review/` to `output/ready/`. Supports `--all` (approve everything currently in `output/review/`), a specific id (`approve-note.js 100965-2025-10-04`), or a real file path (shell-tab-completable).
3. `sign-notes.js --dir output/ready [--sign]` batch-processes every file in `output/ready/`: calls `TIU CREATE RECORD` (+ `TIU SIGN RECORD` if `--sign`), logs to `src/notes.json`, and moves the file to `output/signed/`.

**Rationale**: Matches the project's existing CLI/JSON-file conventions (no new server/frontend to build or maintain). VS Code is already a perfectly good JSON editor for the human review step. The user's workflow is "review everything, then sign everything" - the two-directory (`review/` vs `ready/`) split plus `--all` flags on both `approve-note.js` and `sign-notes.js` support that directly with minimal typing.

**Alternatives Considered**:
- Small web UI for review + bulk sign. Rejected: meaningfully more code (server + frontend) for a single-operator workflow that VS Code's file explorer/editor already serves well.
- Second full LLM pass to re-validate every note before signing. Rejected as the primary mechanism: doubles LLM cost/latency for ~150 notes and doesn't reliably catch what deterministic checks already catch cheaper (see flag-check design below). Kept as an optional cheap fallback classification, not a full regeneration.

### Decision 7: Flag check combines deterministic rules first, cheap LLM classification as fallback
**Choice**: `flagNote(note, ctx)` in `src/noteFlags.js` runs fast, free, deterministic checks first (e.g. obstetric/pregnancy terms appearing alongside contraceptive-only active meds; ASSESSMENT items not present in `ctx.relevantProblems`). Only if no deterministic rule fires but the note is borderline (e.g. long PLAN section, or explicit uncertainty language) does it optionally make one small LLM call asking for `{flagged: bool, reason: string}` - not a note regeneration.

**Rationale**: Catches the concrete Task 5 pregnancy/eclampsia bug class for free. LLM fallback is opt-in per note only when deterministic checks are inconclusive, keeping average cost close to zero across a full batch.

### Decision 8: Note id scheme `<dfn>-<date>`
**Choice**: Every generated note file is named `<dfn>-<date>.json` (e.g. `100965-2025-10-04.json`) in whichever stage directory it currently lives in (`review/`, `ready/`, `signed/`).

**Rationale**: Short, unique per patient+encounter, naturally shell-tab-completable as a real filename, and directly greppable/sortable. `approve-note.js` accepts either the bare id or the full path.

## Risks / Trade-offs

**Risk**: TIU CREATE RECORD param order/format may differ slightly from the `vista-notes/index.js` reference (older RPC broker context vs vista-api-x).
- *Mitigation*: Smoke test on one encounter first (parallels Task 4's smoke-test-before-batch approach).

**Risk**: Long note text (near 80-char/line limit x many lines) could hit TIU field-length limits.
- *Mitigation*: `validateNote()` from Task 3 already enforces line-length and heading structure before writing.

**Risk**: Visit string type `A` requires the appointment to exist in VistA at write time; if Task 4's batch is re-run or partially failed, some dates may lack appointments.
- *Mitigation*: Fallback to type `E` with a logged warning (see Decision 3).

**Risk**: Signing notes accidentally with wrong esig code could cause a bad state in VistA (hard to un-sign a note).
- *Mitigation*: Unsigned by default (Decision 4); dry-run mode lets users preview before writing.

## Migration Plan

No migration needed: notes are new records.

**Deployment steps**:
1. Export needed functions from `test-ai.js` (buildContext, buildInstructions/generate, stripMarkerLine, validateNote).
2. Write `src/notesClient.js` (FileMan conversion, visit string builder, TIU CREATE RECORD/SIGN RECORD wrappers). ✓ Done.
3. Write `test-write-note.js` smoke test for one encounter (unsigned). ✓ Done, verified end-to-end including signing.
4. Write `src/noteFlags.js` (deterministic + fallback LLM flag check).
5. Write `generate-notes.js`: loop all encounters, generate + flag, write to `output/review/` or `output/ready/`.
6. Write `approve-note.js`: move file(s) from `output/review/` to `output/ready/` (by id, path, or `--all`).
7. Write `sign-notes.js --dir output/ready [--sign]`: batch create (+ sign) everything in `output/ready/`, log to `src/notes.json`, archive to `output/signed/`.
8. Run `generate-notes.js` for DFN 100965, review flagged notes, approve, then `sign-notes.js --all --sign`.

## Open Questions

1. **What note title IEN should be used?** — Needs confirmation from VistA test instance (site-specific); set via `VISTA_NOTE_TITLE_IEN` in `.env`.
2. **Should type `E` (historical, unlinked) ever be preferred over `A` even when an appointment exists?** — Deferred; default to `A` since Task 4 ensures appointments exist.
3. **Should failed note-writes retry automatically?** — Deferred to Task 1 implementation; for now, failures are logged and the batch continues (manual re-run skips already-created dates).
