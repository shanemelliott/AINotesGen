# Lighthouse verification

Reviews the important test patients (roster in `src/lighthouse-patients.json`, from the team table: name, ICN, DFN, MPI,
CDW, apps, notes) and compares each VistA record with the Lighthouse clinical FHIR sandbox. Patient demographics and
problems in Lighthouse do not read from station 500; the lower environment serves its own mock data for those endpoints,
so the two can differ. Read-only on both sides.

## Run

```powershell
node lighthouse-verify.js 99935794                # one patient (by any DFN in the roster)
node lighthouse-verify.js --all                   # every roster patient
node lighthouse-verify.js --all --vista-only      # VistA part only, no Lighthouse call
node lighthouse-verify.js 99935794 --token <t>    # token for one patient from Bruno
```

A patient with no valid token still gets its VistA part saved; its Lighthouse part says "no valid token".

## Saved data (input for the final report)

One file per patient: `docs/lighthouse-review/dfn-<first DFN>.json` (tracked in git; no SSN). It holds the roster row,
a VistA summary per DFN (demographics, address, veteran summary, domain counts, first and last visit, problems, meds,
notes) and the Lighthouse part (raw Patient and Condition, the demographics comparison with `match`, `DIFF` or `info`,
and problems found in both, VistA only, Lighthouse only; ICD-10 ranges such as E08-E13 are matched).

## Authentication

The token is the Lighthouse access token Bruno gets from the collection `Lighthouse - 1` (SMART launch, PIV login), not an
Entra JWT. It is tied to one patient through the `launch` value (`node lighthouse-launch.js <icn>` makes it), so each
patient needs its own token, and it lasts about an hour.

The script does not log in itself: the registered redirect (the AVS page) fails with "No state found" for any login not
started by AVS. Give it the tokens from Bruno one of these ways:

1. `.lighthouse-token.json` (git-ignored), keyed by ICN, one entry per patient; `expiresAt` is epoch seconds or milliseconds:
   `{ "<icn>": { "accessToken": "<token>", "expiresAt": 1792104607, "patient": "<icn>" }, "<icn2>": { ... } }`
2. `--token <token>` or the `LIGHTHOUSE_TOKEN` environment variable (used for every patient in the run).
3. Experiment: a token requested in Bruno without the `launch` parameter (no patient context) may read several patients.
   Save it under the key `"*"` in `.lighthouse-token.json`; it is used for any patient without its own entry. If Lighthouse
   answers 401 or 403 for other ICNs, the token is still single-patient.

Setting: `LIGHTHOUSE_FHIR_BASE` (optional).

## Files

- `lighthouse-verify.js`: command line.
- `src/lighthouseReview.js`: VistA summary, comparison, review of one roster patient.
- `src/lighthouseClient.js`: token cache and FHIR GET with paging.
- `lighthouse-launch.js`: ICN to launch value and back.
- `lighthouse-preregistration.js`: the last step of the review, run after every other change. It records the pre-registration check as C (CONNECTED), so no demographics update check is due for a year.
- `src/lighthouse-patients.json`: the roster.

## Gotchas

- ALDIE,STANFORD has two correlations in MPI: DFN 99935794 (exists) and 99935793 (not found on dev). The Lighthouse
  comparison uses the first DFN found.
- GONZALEZ,PEDRO is DFN 99935791, the critical patient: this tool only reads, but never write to it.
- Only Patient and Condition are compared. Allergy, Observation and Medication requests are in the Bruno collection and
  can be added the same way.
