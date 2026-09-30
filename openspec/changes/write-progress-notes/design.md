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
2. Write `src/notesClient.js` (FileMan conversion, visit string builder, TIU CREATE RECORD/SIGN RECORD wrappers).
3. Write `test-write-note.js` smoke test for one encounter (unsigned).
4. Write `write-notes.js` batch processor with dry-run and --sign support.
5. Run smoke test, verify note appears in VistA (CPRS or TIU DOCUMENT inquiry).
6. Run batch for all 38 encounters (or a subset first), verify `src/notes.json`.

## Open Questions

1. **What note title IEN should be used?** — Needs confirmation from VistA test instance (site-specific); set via `VISTA_NOTE_TITLE_IEN` in `.env`.
2. **Should type `E` (historical, unlinked) ever be preferred over `A` even when an appointment exists?** — Deferred; default to `A` since Task 4 ensures appointments exist.
3. **Should failed note-writes retry automatically?** — Deferred to Task 1 implementation; for now, failures are logged and the batch continues (manual re-run skips already-created dates).
