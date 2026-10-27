# Design

## Context

See proposal.md (Why). The test patient is DFN 100978 on site 500, built from
`SynthiaFiles\Calder518_Rourke77_*.json`. It went through preflight, load, supplement,
veteran profile, encounters, appointments and notes. After the first staging summary,
10 problems were manually reactivated (ORQQPL EDIT SAVE). Six verbose notes were filed
on 10/19/2026 (TIU 6250-6255), each linked to its own appointment visit.

## Goals / Non-Goals

**Goals:**
- Repeatable test-patient data: generator, then the existing pipeline, then verbose notes.
- Fix data gaps at the source (generator or loader), not by hand-editing the chart.

**Non-Goals:**
- Changing the staging summarizer.

## Decisions

- **Generate from the clinical pattern, not from the record.** The generator encodes
  conditions, meds and lab trends as synthetic values with synthetic dates. Nothing is
  copied from the reference record, so no identifiers can leak.
- **Supplement plan instead of new loader maps** for eGFR, FIT and SpO2. Dev has no
  lab or sample entries the loader can map to, while the lab and vitals import already
  works. eGFR files 1 minute after the panel to avoid the loader's hidden duplicate
  entry.
- **Verbose notes are template-driven** (copy-forward blocks, full lab grids, an
  encounter log), not LLM-generated. This keeps length deterministic and maximal. A
  52 KB note was confirmed to file in a single TIU CREATE RECORD call.
- **Fix the inactive-problem bug in the loader** (`SYNFPRB` / `SYNDHP62` DHPCLNST)
  rather than reactivating after the load. Every Synthea patient is affected (100962,
  100973, 100975 and 100978).
- **Summary-window research comes before new note dates.** If staging uses "since last
  visit", every note dated on the last visit day falls in a one-day window. Find out the
  rule before changing any note dates.

## Risks / Trade-offs

- [Notes dated on the last visit day only test a one-day window] → Research the window
  rule (task group 4), then move or add notes if needed.
- [A loader patch changes behavior for all patients] → Log it in
  `patches\LOADER-CHANGES.md`, test on a new patient first, and do not retro-edit
  existing patients except 100978.
- [The wrong RxNorm code in the generator makes the notes contradict the chart] →
  Verify the code with an RxNorm lookup before regenerating.

## Staging Findings

**Run 2 (2026-10-20), with the six verbose notes on 10/19:**
- The main summary, "What's new" and the primary care visit summary all returned
  "Unable to generate summary". About 250 KB of same-day notes most likely exceeded
  the summarizer's token or time limit.
- The window was still 10/19-10/20 ("since last visit").
- Specialists are detected by clinic, not note title. Notes filed at the primary care
  clinic (GI, anticoagulation, screening) were not listed.
- One note per specialty is shown. Cardiology rendered the template-only 11:30 note.
- The dialysis section was 46 KB of shuffled fragments. It reproduced lab-grid
  pasting, leaked uncertainty tags, unreconciled eGFR values, unaddressed abnormal labs
  and partial medication fragmentation.
- Not testable because the main summary failed: redundant retelling, banner drift,
  the colonoscopy open loop, and the verbatim suicide-screen questions.

## Open Questions

- Whether staging's window is driven by appointments, visits or note dates.
