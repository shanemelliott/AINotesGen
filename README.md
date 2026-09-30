# NotesGenerator

Generates synthetic AI-authored progress notes for VistA test patients: derives historical encounter dates from orders/labs, builds clinical context, creates past appointments, and writes notes to VistA via RPC.

## Planning

This project uses [OpenSpec](openspec/) for spec-driven development. Proposed and in-progress changes live under `openspec/changes/`; completed changes are archived under `openspec/changes/archive/`.

See [PROJECT-PLAN.md](PROJECT-PLAN.md) for the full plan, task breakdown, and current status.

## Setup

```
pnpm install
cp .env.sample .env   # fill in VistA/OpenAI config values
```

See `.env.sample` for required configuration (Vista-API-X, PIV auth via `sts-token/`, clinic/resource IENs, note title IEN).

## Pipeline

Per patient DFN, run these steps in order. Each step is idempotent (safe to
re-run; already-processed items are skipped or logged).

1. **Fetch VPR data**: `node fetch-vpr.js <dfn> [<dfn> ...]`
   Downloads the patient's full VPR JSON via vista-api-x (`VPR GET PATIENT
   DATA JSON`, context `CDSP RPC CONTEXT`) and saves it to `<dfn>.json`.

2. **Extract encounters**: `node extract-encounters.js --dfn <dfn> [--summary]`
   Groups orders by date into `output/encounters-<dfn>.json`. Use
   `--summary` to preview one line per encounter (orders/labs/meds/problems
   counts, whether an appointment already exists).

3. **Create missing appointments**: `node create-appointments.js --dfn <dfn> [--dry-run]`
   Creates a past VistA appointment for every encounter date that doesn't
   already have one (via SDEC ARSET/APPADD). Logs to `src/appointments.json`.
   Always `--dry-run` first to preview.

4. **Re-fetch + re-extract**: repeat steps 1-2.
   VistA is the source of truth for the appointment's actual date/time — the
   note-signing visit string must match it exactly, or VistA creates a
   duplicate encounter instead of linking to the appointment. Re-fetching
   after appointment creation keeps `encounters-<dfn>.json` authoritative.

5. **Generate notes**: `node generate-notes.js --dfn <dfn> [--dry-run]`
   Calls the LLM for every encounter, auto-flags questionable notes
   (pregnancy/contraceptive mismatch, ungrounded assessment items,
   structural issues like lines over 80 chars), and writes each note as a
   `.txt` (plain body, directly editable) + `.json` (metadata sidecar) pair
   to `output/ready/` (clean) or `output/review/` (needs a look).

6. **Review flagged notes**: manually edit files in `output/review/*.txt`
   to fix content issues (e.g. stale pregnancy problems bleeding through)
   or reformat overlong lines. A `.vscode/settings.json` with
   `"editor.rulers": [80]` helps eyeball the 80-char TIU line limit.

7. **Approve**: `node approve-note.js --all` (or a specific id)
   Moves reviewed notes from `output/review/` to `output/ready/`.

8. **Create + sign in VistA**: `node sign-notes.js --all --sign [--dry-run]`
   Creates each note via `TIU CREATE RECORD`, signs it via `TIU SIGN
   RECORD` (e-sig code is encrypted client-side per the XWB broker cipher),
   archives to `output/signed/`, and logs `{dfn, date, tiuIen, signed}` to
   `src/notes.json`.

9. **Re-sign any failures**: signing intermittently fails with "incorrect
   Electronic Signature Code" (~5% of calls, transient). Notes still get
   created (and archived) even if signing fails; find them with:
   ```
   node -e "require('./src/notes.json').filter(r => !r.signed).forEach(r => console.log(r.date, r.tiuIen))"
   ```
   then re-sign with `node resign-notes.js <tiuIen> <id> [<tiuIen> <id> ...]`.

### Monitoring a long-running batch step

Steps 5 and 8 can take a while (12-19s per note for the LLM call). Redirect
output to a log file and tail it, rather than piping through
`Select-Object` (which buffers everything until the command finishes):

```powershell
node generate-notes.js --dfn <dfn> *> generate-<dfn>.log
```

In another terminal, check progress:

```powershell
Get-Content generate-<dfn>.log -Tail 20          # snapshot
Get-Content generate-<dfn>.log -Wait -Tail 20    # live tail (Ctrl+C to stop watching)
```

## Gotchas / lessons learned

- **Appointment scope varies wildly by patient.** Always check `--summary` /
  `--dry-run` output before committing to a patient — encounter counts have
  ranged from 38 to 253 across the 4 test patients, meaning very different
  amounts of LLM generation, RPC calls, and review time.
- **VistA is the source of truth for appointment times.** After
  `create-appointments.js`, always re-fetch + re-extract (step 4) before
  generating notes — the visit string's FileMan datetime must match the
  appointment's actual time exactly, or VistA creates a duplicate encounter
  instead of linking to the note.
- **Line-length is auto-fixed at generation time.** `generate-notes.js` runs
  `src/reflow.js` on the LLM output before flagging, so lines over 80 chars
  get word-wrapped automatically (preserving list-item indentation). Only
  genuine content issues (pregnancy/contraceptive mismatch, ungrounded
  assessment items, truncated LLM output) should still land in
  `output/review/`.
- **Truncated LLM output looks like a missing-section flag**
  (`structural validation failed: missing ASSESSMENT:; missing PLAN:`) with
  the note text literally cutting off mid-word/mid-sentence. This is a
  transient LLM issue, not a formatting one — delete the `.txt`/`.json` pair
  and re-run `generate-notes.js` (already-generated notes are skipped, so
  only the missing one regenerates).
- **Signing fails intermittently (~5% of calls)** with "incorrect Electronic
  Signature Code" — a transient VistA-side issue, not something in our
  control. `signNote()` retries automatically (2 extra attempts); for
  failures that persist after a full run, use `resign-notes.js`.
- **Never commit patient data.** `.gitignore` excludes `[0-9]*.json` (VPR
  dumps), `patients.txt`, `output/` (generated notes), and `*.log`. Verify
  with `git status --short` before committing — only code, docs, and
  non-PII metadata logs (`src/notes.json`, `src/appointments.json`, which
  hold only dfn/date/IEN, no note text or demographics) should be tracked.


