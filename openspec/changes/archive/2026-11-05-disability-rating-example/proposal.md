# Proposal

## Why

The summary and chatbot tests need a veteran whose record supports a service-connected
(SC) disability and a later claim for a higher rating, without any claim paperwork in
the chart. The patient will demonstrate an LLM tool that helps disability raters gather
evidence for an open claim: this veteran has an open claim to raise his hearing-loss
percentage because his hearing has worsened. The chart has to give the tool what a rater
needs (history of the condition, the rated baseline, the worsening since then, the
functional effects, and the gaps), and the tool's output is checked against a key. Hearing loss and
tinnitus fit: a VA audiology exam (the DBQ, VA Form 10-2364) is built from numbers that
change over time (pure-tone thresholds and word recognition). Tinnitus is capped at 10%
(DC 6260), so the increase has to come from hearing loss (DC 6100) or an anxiety
rating, not from tinnitus alone.

Notes also have to be written by someone other than the person running the tools. Today
every note is authored and signed by the PIV user. This change makes the author a
synthetic provider so charts look like real multi-provider charts.

## What Changes

- A new male answer-key patient (not an existing test patient) with SC hearing loss and
  tinnitus: historical evidence from service (1982 to 1986) through 2014, then recent
  evidence (about 2023 to 2026) that supports a higher hearing-loss rating. No C&P exam,
  DBQ or claim note is created.
- Audiology, ENT and mental health visits and hand-written notes, with audiograms in a
  fixed text layout taken from the DBQ (thresholds, averages, Maryland CNC, immittance).
- Notes created and signed as synthetic providers: the service account creates the note
  as the author's DUZ and `TIU SIGN RECORD` signs it with a shared e-signature code.
- A fallback RPC (`CDSP UTIL TIU SIGN AS`) that signs a note as its author when no
  e-signature code is available, with an optional e-signature check.
- An answer key (planted findings, distractors, scoring) written around a rater's
  questions: baseline, worsening after it, latest test results, functional effects, and
  gaps. A tool that states a rating or a verdict fails.

## Capabilities

### New Capabilities
- `disability-rating-example`: building a synthetic veteran whose chart documents an SC
  hearing loss and tinnitus over time, ending with evidence for an increased rating.

### Modified Capabilities
- `note-writing`: notes can be authored and signed by a synthetic provider other than the
  PIV user.

## Non-goals

- No C&P examination, DBQ or claim note in the chart, and no mention of a claim.
- No real patient data, names, SSNs, claim numbers or dates in any file or log. Real
  audiology notes may inform layout and wording only, with identifiers removed.
- No change to the AI summarizer. This change only builds test data for it.
- No production VistA writes. All writes target dev site 500.
- No change to existing answer-key patients or their scored keys.

## Impact

- New patient on dev site 500 (DFN assigned at load), with a key in `plans/` and
  `docs/TestPatientsWithAnswers/`.
- `src/vistaApiClient.js`, `src/notesClient.js`, `src/config.js`, `scripts/notes/sign-notes.js`
  (author and session DUZ), `scripts/notes/sign-note-as.js`, `scripts/notes/read-note.js`.
- `cds-vista-routines`: routine `CDSPTIUS` and the RPC `CDSP UTIL TIU SIGN AS`.
- `src/note-titles.json` and new audiology, ENT and mental health clinics.
- Signed test notes from the signing tests, on an unused patient, to mark entered in error.
