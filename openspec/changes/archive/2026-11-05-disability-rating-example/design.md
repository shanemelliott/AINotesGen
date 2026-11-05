# Design

## Context

See proposal.md for the motivation. Current state that shapes the approach:

- The chart tooling signs every note as the PIV user. vista-api-x runs RPCs as the DUZ in
  the URL, and with a PIV token it accepts only the token's own DUZ (403 for any other).
  With the service account (POST `/auth/token` with the API key, Bearer JWT, no `X-OCTO`
  header) it accepts any DUZ. This was verified on dev: a test note was created as another
  DUZ and signed with `TIU SIGN RECORD` as that user.
- TIU stores the signature block name encrypted (`$$ENCRYP^XUSRB1`) in node 15 piece 3 and
  `E` in piece 5. A note signed by filing plain text displays as garbage.
- The sample DBQ (`reference/VES - DBQ Audio Hearing Loss and Tinnitus...pdf`, VA Form
  10-2364) lists what a rating audiology exam holds: air-conduction thresholds at 250 to
  8000 Hz, 2-, 3- and 4-frequency averages, bone conduction, Maryland CNC word recognition,
  speech reception thresholds, immittance, diagnosis (H90.3 for sensorineural loss) and a
  functional impact in the veteran's words. It is a guide to which numbers matter, not a
  model for the chart notes.
- Nine real-style VA audiology notes (`reference/audioNote1..9`, identifiers removed,
  `reference/` is git-ignored) show how the chart reads:
  - Routine notes do NOT contain thresholds. They say "SEE AUDIOGRAM UNDER TOOLS, THEN
    AUDIOGRAM DISPLAY" and give SRT per ear, word recognition (percent at a dB level), a
    verbal description of the loss, tympanogram type, reflexes and test reliability.
  - Titles seen: AUDIO/CONSULT (AUDIOLOGY CONSULT), AUDIO/DIAGNOSTIC (AUDIOLOGY PROGRESS
    NOTE), AUDIO/HEARING AID FITTING, AUDIO/DEVICE FITTING, AUDIO/DEVICE MANAGEMENT,
    hearing aid management, and addenda. Our AUDIOLOGY clinic maps to one title (7228).
  - The consult note starts with an automatic block (PC provider, SC percent, rated
    disabilities such as impaired hearing 40% and tinnitus 10%, the consult order and
    its activity table).
  - Care is device-driven (evaluation, fitting, repair, new devices) over many years, and
    device make, model and serial numbers repeat from note to note.
  - Several notes are by technicians with an expected cosigner, and several have addenda.
  - Boilerplate is common (stress card, PHQ-2 and suicide screen, survey text, thanks for
    service).
  - A 2018-style progress note asks for an ENT consult for air-bone gaps and a walk-in
    hearing aid follow-up.
  - A 2025-style AUDIO/DIAGNOSTIC note (note 9) is one evaluation with a hearing aid
    evaluation inside it. Its sections are: CHIEF CONCERN, HISTORY OF (hearing loss, ear
    surgery or middle-ear conditions, tinnitus, hearing aid use), AUDIOMETRIC EXAM
    (otoscopy, tympanometry type, acoustic reflexes done or not and why, test reliability,
    pure-tone results as a verbal description by frequency range, word recognition per
    ear at one or two presentation levels), one line comparing with the last evaluation by
    date, HEARING AID EVALUATION (counselling, devices ordered with make, model, size and
    color), RECOMMENDATIONS/PLAN, time spent, the "to view audiogram" pointer, stress
    discussed, clinical reminders, signature. It names the word list as W-22, not
    Maryland CNC, so it is a usable example of a test that a rater may find less useful
    for rating.
- The existing answer-key method (`docs/ANSWER-KEY-PATIENTS.md`) already covers load, rename,
  veteran data, appointments, planted notes, key and scoring. This change reuses it.
- Audience and purpose: the patient demonstrates an LLM tool that helps disability raters
  gather evidence for an open claim to increase the hearing-loss percentage. The claim
  itself is not in the chart; the tool is given the claim date and the rated condition as
  inputs. A rater needs the rated baseline, evidence of worsening since it, current
  severity in the terms the rating uses (average threshold and Maryland CNC word
  recognition), functional effects, and an honest list of what the treatment record lacks
  (VA may order its own exam when treatment tests are not usable).
- Tinnitus is rated 10% at most (DC 6260). The increase has to come from hearing loss
  (DC 6100, rated from the average threshold and word recognition) or an anxiety rating
  (DC 9400).

## Goals / Non-Goals

**Goals:**
- A male answer-key patient with a believable 1982 to 2026 hearing history ending in
  evidence for a higher hearing-loss rating, scored through the normal key process.
- Notes authored and signed by synthetic providers using the existing signing path.

**Non-Goals:**
- Reproducing a DBQ or any exam form in the chart.
- Changing how the veteran rating itself is stored beyond the existing `vet-profile` step.
- Real patient data of any kind.

## Decisions

1. **New patient, not an existing one.** An existing patient (the earlier candidate with
   the same SC pattern had no hearing chart) was rejected: a new patient gets a clean key
   and keeps scored keys stable. The owner required a male patient. Alternative: extend
   the answer-key patient that already has tinnitus and hearing notes; rejected because
   its key is already scored.
2. **Hearing loss carries the increase.** Tinnitus is capped, so the recent evidence
   centres on worse thresholds and word recognition. Anxiety and sleep effects are
   supporting context only. Alternative: target the anxiety rating; kept as optional
   scope if the owner wants it.
3. **Real-style notes with a short numeric line.** VistA has no audiogram type, and real
   notes keep thresholds in a separate audiogram display, not in the text. Our notes follow
   the real layouts (verbal description of the loss, SRT, word recognition with level,
   tympanometry, reflexes, reliability, plan). Because a summary can only compare what is
   in the text, diagnostic notes also carry one compact line per ear with the 4-frequency
   average (1000 to 4000 Hz) and the word recognition percent. This line is a deliberate
   departure from real notes, so a reviewer can drop it. Alternatives: the full DBQ
   threshold table in every note (rejected: it does not look like VA notes) or structured
   results through a custom TIU object (rejected as out of proportion).
4. **No exam or claim content.** Recent notes read as routine audiology, ENT, primary
   care and mental health visits. The DBQ is only a guide to which numbers and phrases a
   rating exam would find; its admin parts (claim number, examiner certification,
   referral reason) are not copied.
   - The consult note carries the automatic rating block (SC percent and rated
     disabilities as of its date), so the rating history can be read from the chart.
   - Device history is continuous: one make, model and serial number per device from
     fitting through repairs to replacement, and the same values wherever a note names
     them.
   - The chart plants an open loop (family D): an audiology note asks for an ENT consult
     for air-bone gaps and a walk-in follow-up, and one of them is never completed.
   - Routine boilerplate (stress card, PHQ-2, survey text) appears in several notes as
     distractors the summary must not overstate.
   - Technician notes with an expected cosigner and addenda are left out of the first
     pass (the pipeline has no cosign or addendum path); every note has one author.
5. **Authors through the service account, real signing.** Notes are created as the author
   DUZ through the service account and signed with `TIU SIGN RECORD`, with all synthetic
   providers sharing the e-signature code in `VISTA_ESIG_CODE`. This uses the real TIU
   sign path and gives a correct signature block. Alternative: a custom RPC that files the
   signature directly; kept only as a fallback (`CDSP UTIL TIU SIGN AS`) for providers
   without a code, and it must reproduce TIU's stored format.
6. **Author per clinic.** A small clinic-to-provider map (audiology, ENT, primary care,
   mental health) sets each note's `duz`, with `VISTA_AUTHOR_DUZ` as the default. The map
   holds DUZs only; no codes.
7. **Hand-written planted notes.** Generated notes invent history and drop values, so the
   planted notes are written by hand, and routine filler may use wordy generated notes.
8. **Hearing-rating values are checked, not guessed.** Target averages and word
   recognition percentages are checked against the VA hearing-loss rating tables
   (38 CFR 4.85, Tables VI and VII) before they are locked into the key.
9. **The key is written for a rater's questions.** Key items are what a rater needs to
   answer: What is the rated condition and its current percentage? What is the baseline
   (the last rated state)? What evidence of worsening is dated after it? What do the most
   recent tests show (average threshold and Maryland CNC percent per ear), and was the
   Maryland CNC list used? What are the functional effects, in the veteran's words? Is
   tinnitus documented (rated 10%, no increase available)? What is missing or not
   completed (for example the open ENT consult, or a test that does not name its word
   list)? A claim date and an evidence window (the year before the claim date, plus the
   history back to the baseline) are fixed in the key, not in the chart.
10. **Worsening must be provable in dated notes.** The baseline rating exam values are
    stated in the earlier audiology notes, and each later note moves the numbers in the
    same direction, with recent ones clearly worse and at least one dated in the year
    before the claim date. One mid-series audiology note is left without the word list
    name or the numeric line, so the tool should note it as less usable.

## Risks / Trade-offs

- [The tool may state a rating or a conclusion] -> The key treats a stated percentage or
  an eligibility verdict as a failure: raters decide, the tool gathers evidence with
  sources.
- [Provider setup: each synthetic provider needs the shared e-signature code, the ORES key
  and TIU authorization] -> A preflight read of the provider with `ORWU USERINFO` and a
  test note, before any bulk run.
- [Note files already in `output/ready/` carry the old author] -> Regenerate them or edit
  their `duz` before signing.
- [`resign-notes` still signs as the PIV user] -> Add a `--duz` option before relying on it
  for non-PIV authors.
- [The fallback RPC's e-signature check rests on the stored hash location in the user
  record] -> Verify on dev with a dry run and a deliberately wrong code before using it.
- [Signed test notes from the signing tests sit on an unused patient] -> Mark them entered in error in
  CPRS; they cannot be deleted through the API.
- [Audiogram text can look unnatural] -> Use the real-style layouts from the reference
  notes, and keep the numeric line short.
- [Real VA audiology contact often starts decades after service, so a 1987 baseline may be
  less realistic] -> The plan keeps a first visit near the 1987 SC grant; the owner can move
  it later, which only changes the visit plan and thins the early evidence.
- [Reference notes came from a real chart] -> Identifiers were stripped (name, address,
  phone, tracking and serial numbers, note numbers) and `reference/` stays git-ignored; no
  text from them is copied into specs, plans or generated notes.
- [The service account key is a credential] -> It stays in `.env` and is never logged or
  committed.
