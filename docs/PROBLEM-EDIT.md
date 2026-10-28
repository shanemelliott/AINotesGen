# problem-edit.js: change VistA problems through the CPRS RPCs

Edits existing problem list entries (onset date, ICD code, status) on a **dev** VistA the way CPRS does, so the problem
audit history and the lexicon links stay intact. Dry run unless `--apply`. Written for the Lighthouse alignment
(see `LIGHTHOUSE-VERIFY.md`), but it works for any problem.

## Run

```powershell
node patient.js problem-edit                    # dry run for every entry in src/lighthouse-problem-fixes.json
node patient.js problem-edit --dfn 99935794     # one patient
node patient.js problem-edit --apply            # write
```

The dry run prints each field as `old -> new`. After a write, the script reads the problem back and reports
`verified` or `NOT VERIFIED`. Running a dry run again afterwards should show every entry as `unchanged`.
Applied changes (old and new values) are saved in `docs/lighthouse-review/problem-changes.json`.

## Fix list: `src/lighthouse-problem-fixes.json`

```json
{ "dfn": "99935794", "ien": "1992", "note": "diabetes R69 to E11.9",
  "icdFrom": { "ien": "2026", "code": "E11.9" }, "onset": "2022-11-01", "status": "A" }
```

| Key | Meaning |
|---|---|
| `dfn`, `ien` | Patient and problem IEN (file #9000011). The IEN is `localId` of the `problem` item in the VPR, or the first piece of `ORQQPL PROBLEM LIST`. |
| `onset` | `YYYY-MM-DD`, filed as a FileMan date (field `.13`). |
| `status` | `A` active or `I` inactive (field `.12`). |
| `icdFrom` | Another problem that already holds the wanted ICD code; its `.01` value (`ICD IEN^code`) is copied. The script stops if that problem does not hold `code`. |

## How it works

1. `ORQQPL EDIT LOAD` (one parameter, the problem IEN) returns the problem as `NEW|field|value` and `ORG|field|value`
   lines separated by the character `0xFE`. `NEW` is the current value, `ORG` the original, as CPRS holds them.
2. The script changes the fields it needs: `.13` onset, `.12` status, `.01` ICD code (`ICD IEN^code`), and `.08` date
   modified (set to today).
3. `ORQQPL EDIT SAVE` is called in context `OR CPRS GUI CHART` with six parameters: problem IEN, provider DUZ
   (`VISTA_DUZ`), station `500`, user type `1`, the list, and an empty search text. The list holds one string per field
   in the form `GMPORIG(.01)="value"` followed by `GMPFLD(.01)="value"` for every loaded field, with double quotes
   doubled inside the value. In `vista-api-x` the list is a `namedArray` with keys `1..n`.
   The fields `2,0` and `10,0` (service and comment nodes) are sent as `"0"`, as CPRS does.
4. The routine accepts only strings that start with `GMPFLD` or `GMPORIG` and whose value is quoted; anything else
   fails the whole call (OR*3*479 checks). It returns `1` on success.
5. The script reads the problem back with `ORQQPL EDIT LOAD` and compares the changed fields (first piece only; VistA
   rewrites the display text, for example `Nov 01 2022` becomes `11/1/22`). `.08` is not compared because VistA keeps its own.

## Fields

| Field | Meaning | Value format |
|---|---|---|
| `.01` | Diagnosis (ICD) | `ICD IEN^code`, for example `503126^E11.9` |
| `.05` | Provider narrative | `IEN^text` (not changed by this script) |
| `.08` | Date last modified | `FM date^display` |
| `.12` | Status | `A^ACTIVE` or `I^INACTIVE` |
| `.13` | Date of onset | `FM date^display`; month-only is `3150400` (April 2015), year-only `3230000` |
| `1.01` | Lexicon expression | `IEN^term` (not changed) |
| `80001`, `80002` | SNOMED CT concept and designation code | not changed |

Changing only `.01` keeps the lexicon term and SNOMED code, so the narrative can say "Diabetes mellitus without
complication" while the ICD code is E11.9. This dev lexicon returns `R69.` for every search, so new ICD codes are
copied from problems that already have them instead of being searched.

## Gotchas

- **VPR onset is misleading.** `VPR GET PATIENT DATA JSON` turns a month-only onset such as `3150400` (April 2015) into
  `20260415` (April 15 of the current year). Read onsets from `ORQQPL PROBLEM LIST` (piece 5) or `ORQQPL EDIT LOAD`.
- **No lexicon search.** `ORQQPL4 LEX` (term, count, view `GMPL`, date) works but maps to `R69.`; it only finds the
  lexicon expression, not a better ICD code.
- **Adding a problem** is `ORQQPL ADD SAVE` (DFN^name^^, DUZ, station, `GMPFLD` list, search text); it is not wrapped by
  this script. Deleting is `ORQQPL DELETE` (IEN, DUZ, station, reason). Both need the same context.
- **Dev only.** The script does not check for production. It writes real problem records, with provider `VISTA_DUZ`.
- To roll back, put the old values from `problem-changes.json` into a fix entry (`onset`, `status`, `icdFrom`).

## References

- ORQQPL1 source: https://vivian.worldvista.org/dox/Routine_ORQQPL1_source.html (`EDLOAD`, `EDSAVE`, `ADDSAVE`)
- RPC `ORQQPL ADD SAVE`: https://vivian.worldvista.org/vivian-data/8994/8994-257.html
