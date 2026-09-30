# Proposal

## Why

Task 4 created past appointments for all 38 historical encounters (7 newly created + 31 pre-existing). The patient now has a full appointment history, but no clinical notes are attached to any of the visits. Task 3 already produces high-quality AI-generated progress notes (via `test-ai.js`) for a given encounter. This change wires those two pieces together: write each encounter's AI-generated note to VistA as a TIU document via `TIU CREATE RECORD`, tied to the appointment/visit created in Task 4.

## What Changes

- **Note-writing module** (`src/notesClient.js`): Wraps `TIU CREATE RECORD` (and optionally `TIU SIGN RECORD`) via the existing `vistaApiClient.js`/`tokenService.js` transport from Task 4.
- **FileMan date conversion**: Convert encounter date/time to FileMan format (`YYYMMDD.HHMM`) for the visit string.
- **Visit string construction**: `<locationIEN>;<FMdatetime>;<type>` — type `A` when tied to an appointment (all encounters now have one after Task 4), using the appointment's clinic/resource IEN from `src/appointments.json` when available.
- **CLI pipeline** (`generate-notes.js`, `approve-note.js`, `sign-notes.js`): Separates note *generation* from VistA *writing* with a review gate in between. `generate-notes.js` writes one JSON file per note to `output/ready/` (clean) or `output/review/` (auto-flagged as questionable); `approve-note.js` moves reviewed/edited files from `review/` to `ready/` (supports `--all` or a specific note id); `sign-notes.js --all --sign` batch-creates and signs everything in `ready/`, archiving to `output/signed/`.
- **Automated flag check** (`src/noteFlags.js`): Deterministic rules (e.g. obstetric terms alongside contraceptive-only meds, ASSESSMENT items not grounded in the provided problem list) catch questionable notes before they reach VistA, with an optional cheap LLM fallback classification for borderline cases.
- **Idempotent logging**: `src/notes.json` tracks created TIU document IENs per (dfn, date) to support safe re-runs.
- **Unsigned by default**: Notes are created unsigned; `--sign` flag calls `TIU SIGN RECORD` with an XWB-broker-encrypted electronic signature code from config.
- **Dry-run mode**: Preview note text and TIU CREATE RECORD params without writing to VistA.

## Capabilities

### New Capabilities
- `note-writing`: Write AI-generated progress notes to VistA via `TIU CREATE RECORD`, tied to the patient's appointment/visit, with idempotent re-run support and optional signing.

### Modified Capabilities
<!-- None -->

## Impact

- **Code added**: `src/notesClient.js`, `src/noteFlags.js`, `test-write-note.js`, `generate-notes.js`, `approve-note.js`, `sign-notes.js`, `src/notes.json` (tracking log)
- **Dependencies**: Reuses `src/vistaApiClient.js`, `src/tokenService.js`, `src/config.js` from Task 4; reuses `test-ai.js` prompt/validation functions from Task 3
- **New config**: `VISTA_NOTE_TITLE_IEN` (already scaffolded in `.env.sample` from Task 4)
- **Output**: `output/review/`, `output/ready/`, `output/signed/` (one JSON file per note, moved between stages); `src/notes.json` with created TIU document records (dfn, date, tiuIen, appointmentIen, signed)

## Non-goals

- Generate notes for patients other than the one currently in scope (100965) — multi-patient orchestration is Task 6
- Support co-signature workflows or addenda
- Support note title selection per encounter type — a single note title is used for all notes in this change
