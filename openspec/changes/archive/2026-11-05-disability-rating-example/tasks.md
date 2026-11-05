# Tasks

> Patient specifics (DFN, name, dates, devices, claim inputs, key) live in the git-ignored
> `plans/` and `docs/TestPatientsWithAnswers/` folders, not here.

## 1. Authors and signing

- [x] 1.1 Let `callRpc` run as another DUZ through the service account, and verify a
  note can be created as another DUZ
- [x] 1.2 Add `VISTA_AUTHOR_DUZ` and use it in `generate-notes`, `custom-visits` and
  `build-test-notes`; make `sign-notes` create and sign as the note's `duz` when it
  differs from the PIV DUZ; verify a note reads back signed as that author with
  `/es/ <name>`
- [x] 1.3 Add `read-note.js` and `sign-note-as.js`, and verify both run against dev
- [x] 1.4 Install the fallback routine `CDSPTIUS` with the `ESIG` parameter and verify a
  dry run with the right code reports `esigVerified: true` and one with a wrong code is
  refused (waived: all four providers sign through `TIU SIGN RECORD`, so the fallback is
  not needed; the routine and RPC are in `cds-vista-routines` but not installed or tested)
- [x] 1.5 Verify the fallback signs a fresh note with `/es/ <name>`, then document the
  RPC in the `cds-vista-routines` README (waived as 1.4)
- [x] 1.6 Add a `--duz` option to `resign-notes.js` (option added and syntax checked;
  no failed note was available to re-sign)
- [x] 1.7 Add the clinic-to-provider map (`src/clinic-authors.json`,
  `src/noteAuthors.js`) and make the generators fill `duz` from it; a plan visit's
  `author` overrides it
- [x] 1.8 Document the author and signing setup (service account, shared e-sig code,
  `VISTA_AUTHOR_DUZ`) in the README
- [x] 1.9 Mark the early test notes entered in error (closed without doing it: they sit
  on a patient this change no longer uses)

## 2. Inputs from the owner

- [x] 2.1 Clinics received for audiology, ENT and mental health; each verified active with
  an SDEC resource and open slots, and added to `src/clinic-lookup.json`
- [x] 2.2 Provider DUZs, shared e-signature code and keys received; a test note signed
  for each of the four providers
- [x] 2.3 Audiology note samples received, identifiers stripped, layouts recorded in
  `design.md`
- [x] 2.4 Clinics mapped to note titles in `src/note-titles.json` (audiology 7228, ENT
  1631 generic consult, mental health 7232) and all titles confirmed to exist

## 3. Patient selection and load

- [x] 3.1 Male Synthea bundle chosen (60s, hearing loss and tinnitus already in the
  record, no hospice or cancer course) and recorded in the git-ignored plans folder
- [x] 3.2 Bundle trimmed and preflighted; no unmapped medication or hearing conditions
- [x] 3.3 Bundle loaded; hearing loss and tinnitus problems already active
- [x] 3.4 Renamed with the middle initial A, veteran data and address set, verified with
  `vet-get` (rated disabilities include DC 6100 and DC 6260)

## 4. Evidence plan and key

- [x] 4.1 Claim inputs fixed and recorded in the key only; no chart plan names them
- [x] 4.2 Hearing series drafted and checked against 38 CFR 4.85 Tables VI, VIa and VII
  with a script; each later visit equal or worse than the one before
- [x] 4.3 One note template per type (consult with rating block, diagnostic, hearing aid
  fitting, device management, ENT, primary care, mental health)
- [x] 4.4 Device history written; serial numbers consistent across notes
- [x] 4.5 Visit plan written and checked (weekdays, clinic hours, clinic and author maps,
  no claim words)
- [x] 4.6 Open loop and boilerplate distractors planted in the plan and the key
- [x] 4.7 Recent diagnostic notes name the Maryland CNC list and carry the numeric line;
  one earlier diagnostic note has neither
- [x] 4.8 Source key written around a rater's questions, with distractors,
  `shouldNotSay` and scoring
- [x] 4.9 Plan and key reviewed and approved by the owner

## 5. Historical evidence

- [x] 5.1 Visits booked with `custom-visits` and verified in the VPR appointments
- [x] 5.2 In-service and early notes written by hand; numbers checked against the plan
- [x] 5.3 Later audiology, hearing aid, device management and ENT notes written by hand;
  series and device serial numbers checked against the plan
- [x] 5.4 `scripts/notes/check-no-claim.js` added (step `check-no-claim`: files, a
  folder, `--text` or `--stdin`), plus the step `import-planned-notes`; unregistered
  scripts `read-note`, `sign-note-as` and `test-author-sign` registered
- [x] 5.5 Check run on every note file before signing; clean
- [x] 5.6 Notes signed as their providers, linked to their visits, and read back with
  `read-note.js`; the check was clean on the filed text
- [x] 5.7 Hearing and tinnitus problems re-dated and marked verified with
  `problem-edit --file` (new `--file` option and `"verified": true` support)

## 6. Recent evidence

- [x] 6.1 Recent visits booked and verified in the VPR
- [x] 6.2 Recent notes written by hand with no claim, rating-request, compensation, C&P,
  DBQ or VBA wording
- [x] 6.3 Medication or problem changes: none needed
- [x] 6.4 Notes signed, linked and read back clean, as in 5.5 and 5.6

## 7. Key files and scoring

- [x] 7.1 Key files built with `build-answer-key-files` (made it tolerate plans without
  `visitDiagnoses`)
- [x] 7.2 Every key value found in the filed notes; `check-no-claim` clean on all filed
  notes
- [x] 7.3 Rater evidence-gathering tool run and scored (9 of 10 key items found, one
  partial, no stated rating); the summary app also scored (fail on the one-year window).
  The chatbot run was not done.

## 8. Wrap-up

- [x] 8.1 `docs/loaded-patients.md` regenerated, `patches/LOADER-CHANGES.md` updated and
  the repository memory notes written
- [x] 8.2 Other answer-key patients and their keys confirmed unchanged (file write times
  all earlier than this work)
