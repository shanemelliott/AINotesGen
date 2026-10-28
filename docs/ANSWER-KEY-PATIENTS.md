# Answer-key test patients

How to build a synthetic veteran test patient with planted findings ("gotchas") and an answer key, then score an AI summary against it. This file holds the method only. Names, DFNs, ICNs, plans, keys and results are git-ignored (`plans/`, `output/`, `logs/`, `docs/TestPatientsWithAnswers/`).

## Rules

- **Name rule.** New patients get the middle initial A, for example `LAST790,FIRST742 A`. The Synthea digits stay in the name. The initial A marks a patient we created; the older Lighthouse-verified patients never get it.
- **Setting a name.** Use `node patient.js set-name --dfn <dfn> --name "LAST790,FIRST742 A" --apply`. It calls the RPC `CDSP UTIL VET SET NAME` (routine `CDSPVET` in cds-vista-routines), which files the name internally and keeps the digits. FileMan's own `.01` entry strips digits, so never rename through FileMan.
- **Appointments are never imported.** `create-appointments` books every visit through SDEC (see `docs/DECISION-LOAD-PATH.md`).
- **No patient data in tracked files.** No names, DFNs, ICNs or planted details in anything that is committed.

## Steps per patient

1. **Trim** the Synthea bundle (`trim-synthea`).
2. **Preflight** the bundle (`preflight-synthea`, `preflight-vista`). Meds listed without full structured dosing may need `MEDDEF` rows (see `docs/MED-DEFAULTS-PROPOSAL.md`); review that list for every new upload.
3. **Load** (`load-synthea`), then check problem statuses with `node patient.js reactivate-problems --dfn <dfn>` (dry run). It lists problems filed INACTIVE with no resolved date; reactivate them (`--ien`, `--apply`) unless the key needs them inactive, and record any intended oddity in the source key's `chartNotes`.
4. **Rename** with the middle initial A (`set-name`).
5. **Veteran data** and a valid address (`vet-profile --from-file --apply`, check with `vet-get`).
6. **Appointments** (`create-appointments`), then `fetch-vpr` and `check-midnight`. Visits must sit in clinic hours.
7. **Plan the planted events** in `plans/dfn<dfn>-visits.json` and `plans/dfn<dfn>-labs-vitals.json`; book the visits with `custom-visits`, import labs and vitals with `import-labs-vitals`.
8. **Medications and fills** (`add-rx`, `fill-rx`, `check-rx-vpr`, `backfill-rx-dosing`). Schedule II drugs get no refills and need pharmacist verification.
9. **Notes.** Generate (`NOTE_WORDY=1`, `generate-notes`). Rewrite every planted note by hand: generated text invents history and drops score values. Then approve (`approve-note`), sign (`sign-notes`) and link to visits (`link-note-visits`).
10. **Key and files.** Write the source key `plans/dfn<dfn>-answerkey.json`, then `node patient.js build-answer-key-files --dfn <dfn> --label <label>`.
11. **Score** the AI summary app and the chatbot with `docs/TestPatientsWithAnswers/SUMMARY-SCORING-GUIDE.md`, add the runs to the source key and regenerate.

Every name above is a step of `node patient.js` (`node patient.js list` shows them).

## Key structure

The source key holds `summaryFor`, `summaryAsOf`, `keyItems` (id, severity, date, source, finding, optional `scoringRule`), `distractors` (routine items that must not be overstated), `shouldNotSay`, `scoring` (found, partial, missed, accurate, noise, pass threshold) and `runs`.

Item families:

| Family | Meaning |
|---|---|
| A | Critical event (ED visit) |
| B | Critical specialty result |
| C | Outpatient labs with no visit |
| D | Open loop (referral or follow-up not done) |
| E | Trend across the record |
| F | Medication problem (late or missing refill, wrong dose) |

## Where files live

- Source keys and plans: `plans/` (git-ignored).
- Generated key and history pair per patient: `docs/TestPatientsWithAnswers/<label>-<first>-<last>.json` and `.md`. The generated pair is overwritten on each run, so edit the source key.
- Pipeline status for a patient: `node patient.js status --dfn <dfn>` (see the README for the entry point; run steps as `node patient.js <step> ...` or `node patient.js --patient <dfn> <step> ...`).

## Known issues (not planned for a fix)

- **Narcotic prescriptions come out non-verified.** `ADDRX` creates a Schedule II Rx with status 1 (non-verified). Verifying needs the `PSORPH` key and the Verify action in `PSO LM BACKDOOR ORDERS` (shown under `??`); the verify may hang on "Report order checks". Narcotics get no refills, so treat each one as a separate order.
- **Variable dump on dev.** A local-variable printout (a `ZW`-style dump with `%XOBWERR`, `CDS SERVER`) appears at the start of `PSO LM BACKDOOR ORDERS` and inside the CPRS Health Summary report CVP Past Clinic Visits. The report body is correct and nothing in this pipeline reads it (the summary app and chatbot read the VPR). The WEB SERVER file (#18.12) has no `CDS SERVER` entry. A search of `SDES*`, `SDAPI*` and `XOBW*` found no active `ZW`. Not searched: `GMTS*`, `ORWRP*`, `ORDV*`, `ORRP*`, `GMPL*`, `TIU*`, `ORQ*`, `PSOPTPST`, `DGENR*`, `CDSP*`, and the Health Summary component and OE/RR report definitions.
- **Wrong note title (one signed ortho note).** A signed note cannot be retitled; it must be marked entered in error and re-entered. VistA has no orthopedic or neurology title, so those clinics map to 1631 GENERIC CONSULT NOTE in `src/note-titles.json`. Left as is.
- **Wordy notes can invent trends.** Wordy mode produced an unsupported sentence about increasing alcohol use that led one summary headline. Planted notes are rewritten by hand, but routine generated notes can still add small claims. Left as noise.
