# Task 5 (write-progress-notes) — Implementation Results

Covers the generate -> review -> approve -> sign pipeline (Group 3 of
`openspec/changes/write-progress-notes/tasks.md`) run against 3 of 4 target
patients so far (100964 pending).

## Summary by patient

| DFN | Encounters | Appointments created | Generated | Flagged (peak) | Failed (peak) | Signed |
|---|---|---|---|---|---|---|
| 100965 | 38 | 7 | 38 | 12 | 0 | 38/38 |
| 100961 | 49 | 23 | 49 | 12 | 0 (after 2 truncation retries) | 49/49 |
| 100962 | 253 | 163 | 253 | 4 (peak, after retries) | 9 (peak, before retry fix) | 253/253 |
| 100964 | 104 | 42 | 104 | 1 | 0 | 104/104 |

**Total: 444/444 signed (100%)**, across one round of 2 intermittent e-sig failures (100964) resolved via `resign-notes.js`.

## Flag-check catch rate (pregnancy/eclampsia bleed-through)

The `checkPregnancyContraceptiveMismatch()` check in `src/noteFlags.js` was
purpose-built to catch the original bug report (stale Synthea "ACTIVE"
pregnancy problems bleeding into notes for patients on contraceptive-only
meds). Across 100965 and 100961 it correctly flagged **12** pregnancy/
obstetric-mismatch notes total (6 per patient) for manual review; all were
confirmed genuine stale-data cases and fixed by removing the pregnancy
references before approval. 100962 had 0 pregnancy-mismatch flags (different
clinical profile — cardiac/heart-failure workup, not obstetric).

## Failures encountered and fixes

1. **Line-length flags (80-char TIU limit)**: originally required manual
   rewrapping. Fixed by adding `src/reflow.js` (auto word-wrap during
   generation, before flagging) — eliminated this flag category entirely
   for all notes generated after the fix.
2. **Truncated LLM output** (`finish_reason=length`, empty or partial
   content, missing sections): o-series (o3-mini) reasoning tokens count
   against `max_completion_tokens`, so complex encounters (many
   problems/orders) could exhaust the 4000-token budget before producing
   visible output. Fixed in `src/noteGenerator.js` with an automatic retry
   at 8000 tokens (with a 5s backoff) whenever `finish_reason === 'length'`.
   Before the fix: 9 outright failures + 4 partially-truncated notes on
   100962 needed manual regeneration. After the fix: 0 failures on retry.
3. **Intermittent e-sig failures** ("incorrect Electronic Signature Code",
   ~1-2% of sign calls): transient VistA-side issue. `signNote()` retries
   automatically (2 extra attempts); `resign-notes.js` handles any that
   still fail after a full batch run.
4. **Appointment-time drift**: after creating past appointments,
   `output/encounters-{dfn}.json` must be regenerated from a fresh VPR fetch
   so the note's visit string matches VistA's authoritative appointment
   time exactly (otherwise VistA creates a duplicate encounter). This is
   now step 4 of the documented pipeline (see `README.md#pipeline`).

## Verification

- End-to-end create+sign verified against live VistA for individual notes
  (100965 / 2025-10-04, TIU IEN 5272) before batch runs.
- Batch runs verified via `src/notes.json` (dfn/date/tiuIen/signed) — 0
  unsigned entries remaining after retries, for all patients processed.
- **Not yet done**: visual spot-check of note content/signature in CPRS UI
  (Task 4.1) — pending.
