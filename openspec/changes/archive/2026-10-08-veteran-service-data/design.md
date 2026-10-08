# Design

## Context

See proposal.md for why. Today a loaded Synthea patient gets only `VETERAN` (#2,1901), through our `SYNFPAT` patch. Neither
SYN nor the VistA Data Loader sets anything else (checked 2026-10-08: SYN only reads `.361` in `SYNDHP62`; `ISI IMPORT PAT`
takes `VETERAN` and `TYPE` for new patients only). The VPR already exposes the result we want to see: `veteran.isVet`,
`veteran.serviceConnected`, a service-connected percentage, rated disabilities and an `exposures` list (Agent Orange,
ionizing radiation, Southwest Asia, head and neck cancer, MST, combat). The four batch-1 patients (DFN 100971 to 100974)
have problem lists that include PTSD, TBI, amputation, burns, hearing loss and back pain.

Our existing loader RPCs set the pattern: routine in `cds-vista-routines`, context `CDSP RPC UTILS`, `PRECHECK` refuses
production, JSON results, and `CDSP UTIL MAP SET` already does a dry-run-by-default write with old and new values.

## Goals / Non-Goals

**Goals:**
- Confirm on dev which fields and pointer files hold this data before any write.
- One routine and two RPCs: read (current values plus a field check) and set (dry run by default).
- A mapping table in the repo, so ratings and eras are visible and editable.
- One Node script per patient: derive, review, dry run, apply, verify.

**Non-Goals:**
- A general registration editor; only the fields listed in the proposal.
- Clinically exact ratings (see proposal Non-goals).

## Decisions

**1. Discovery before writing.** The field numbers below are believed correct but unconfirmed on this system. The read RPC
returns, for each candidate field, its label from the data dictionary and the patient's current value, and lists the
entries of the pointer files (eligibility codes #8, period of service #21, branch #23, disability conditions #31). The
first task runs it against one patient; the mapping table is then fixed to the names that exist on dev.

Candidate fields (file #2 unless noted): 1901 veteran; .301 service connected; .302 service-connected percentage; .361
primary eligibility (pointer #8); .3721 rated disabilities multiple (#2.04: .01 disability pointer #31, 2 percent, 3 service
connected); .323 period of service (#21); .325 branch (#23); .326 entry date; .327 separation date; .5291 combat indicated
with .5292 location and .5293/.5294 dates; .32102 Agent Orange; .322013 Southwest Asia; .525 POW. MST lives in its own file
(#29.11) and enrollment priority in PATIENT ENROLLMENT (#27.11) linked from #2 field 27.01.

*Confirmed from the exports (2026-10-08, `reference/`):*
- #2.04 rated disabilities is stored at `^DPT(D0,.372,`: .01 pointer to #31, 2 DISABILITY % (0 to 100, whole numbers), 3
  SERVICE CONNECTED (0/1), 4 extremity, 5 and 6 effective dates. Every field's input transform calls `EK^DGLOCK` (a DG
  security key check) and each change fires `EVENT^IVMPLOG` (enrollment event log for HEC).
- #31 has 1214 entries with DX CODE (field 2) indexed by `C`, so disabilities are looked up by diagnostic code at run time.
- #8 eligibility codes (32 entries) have VA CODE NUMBER (field 3, `C` index) and TYPE veteran/non-veteran; #21 periods
  of service (38) and #23 branches (15) are looked up by name (`B` index). Entries were not exported, so the read RPC lists them.
- #2.0361 PATIENT ELIGIBILITIES (`^DPT(D0,"E",`): the primary eligibility must also be in this multiple.
- The consistency checker (`DGRPC`) reads SC from node `.3` (pieces 1 and 2), period of service from `.32` piece 3, primary
  eligibility from `.36`, Agent Orange from `.321` (location in piece 13), POW `.52`, and military service episodes from
  subfile #2.3216. Checks to satisfy: 9 to 14 (veteran, SC, SC %, period of service, primary eligibility present), 18 to 24
  (veteran flag, SC % and period of service consistent with eligibility; eligibility status date), 60 (Agent Orange location
  when exposure is Yes), 67 to 76 (military service episode and combat dates).
- The file #2 data dictionary itself was not exported. The read RPC therefore lists every field stored on those nodes
  (`^DD(2,"GL",node,...)`) with its label, so the exact field numbers come from dev, not from this list.

*Confirmed on dev (2026-10-08, `node vet-get.js --dfn 100972 --tables`, `logs/vet-get-100972.json`):*
- Fields: 1901 VETERAN (Y/N)?; .301 SERVICE CONNECTED?; .302 SERVICE CONNECTED PERCENTAGE; .3014 EFF. DATE COMBINED SC%
  EVAL.; .323 PERIOD OF SERVICE; .324 SERVICE DISCHARGE TYPE [LAST]; .325 SERVICE BRANCH [LAST]; .326/.327 SERVICE ENTRY /
  SEPARATION DATE [LAST]; .32101 VIETNAM SERVICE INDICATED?; .32104/.32105 VIETNAM FROM/TO; .32102 AGENT ORANGE EXPOS.
  INDICATED?; .3213 AGENT ORANGE EXPOSURE LOCATION; .32103 RADIATION EXPOSURE INDICATED?; .32201 PERSIAN GULF SERVICE?
  with .322011/.322012 dates; .322013 SOUTHWEST ASIA CONDITIONS?; .361 PRIMARY ELIGIBILITY CODE; .3611/.3612 ELIGIBILITY
  STATUS and DATE; .525 POW STATUS INDICATED?; .5291 COMBAT SERVICE INDICATED? with .5292 location and .5293/.5294 dates;
  .531 CURRENT PH INDICATOR. Military service episodes are subfile #2.3216 on node `.3216`.
- Current values for DFN 100972 (as loaded): veteran Y, SC N, no rated disabilities, eligibilities or episodes, MST
  `0^U`, no enrollment, and VIETNAM SERVICE INDICATED Y although he was born in 1980 (a load default). The profile sets
  every exposure indicator explicitly, Y or N, so wrong defaults are corrected.
- Eligibility codes used: NSC (IEN 10), SC LESS THAN 50% (15), SERVICE CONNECTED 50% to 100% (16), all type veteran.
- Periods of service by the date the patient turned 18: KOREAN (11), POST-KOREAN (20), VIETNAM ERA (27, 1955-11-01 to
  1975-05-07), POST-VIETNAM (21, from 1975-05-08), PERSIAN GULF WAR (121, from 1990-08-02, no end date).
- Branches: ARMY 1, AIR FORCE 2, NAVY 3, MARINE CORPS 4, COAST GUARD 5, SPACE FORCE 15.
- Enrollment status VERIFIED is #27.15 IEN 2.
- MST and enrollment entry points exist on dev (`GETSTAT^DGMSTAPI` and `FINDCUR^DGENA` answered).
*Alternative:* hard-code the numbers from memory. Rejected: a wrong field number writes the wrong data with no error.

**2. Writes use FileMan, validated first, all or nothing.** The set RPC takes `FIELD^VALUE` lines plus rated disability
lines, checks every value and returns errors before filing anything. Values are filed in internal form (no `E` flag),
because the DG input transforms call `EK^DGLOCK`, which fails for a user without the DG keys; the routine does the
checks those transforms would have done (pointer exists, set value allowed, percent 0 to 100). Only if every value is valid,
and only when apply is set, it files with `FILE^DIE` and `UPDATE^DIE`. Rated disabilities are replaced as a set (existing
entries removed, profile entries added), so re-applying gives the same result with no duplicates. Military service goes
in a #2.3216 episode as well as the single fields, since checks 67 to 73 read the episode.
*Alternative:* call Registration (DG) option code. Rejected: `DG10` and the screen routines (`DGRP6`, `DGRP7`, `DGRP11`)
are interactive.

**3. MST and enrollment use the supported DG calls (confirmed in the exports).**
- MST: `$$NEWSTAT^DGMSTAPI(DFN,DGSTAT,DGDATE,DGPROV,DGSITE,DGXMIT)` files #29.11 (status Y, N, D or U; provider must be an
  active #200 entry). Call with `DGXMIT=0` so no HL7 message is queued to HEC. Returns the new IEN or `-1^message`.
- Enrollment: `$$EDITCUR^DGENA1(.DGENR)` creates the current enrollment if there is none (through `STORECUR`, which locks,
  files #27.11, links the prior record and sets #2 field 27.01) or overlays the current one. `DGENR` holds `APP`, `DFN`,
  `SOURCE` (1 = VAMC), `STATUS` (#27.15 pointer for VERIFIED), `PRIORITY` (1 to 8), `EFFDATE`, `PTAPPLIED` (1), and the
  `ELIG` sub-array (`CODE`, `SC`, `SCPER`, `POW`, `AO`, `EC`, `PH` and so on), copied from the profile. Enrollment status
  changes fire HEC notification cross-references; acceptable on dev. Enrollment is filed after the core fields so its
  `ELIG` values match them.
*Alternative:* write #27.11 directly with FileMan. Rejected: `STORECUR` also maintains 27.01 and the prior-record chain.

**4. Mapping table, not code.** `src/veteran-rules.json` holds: era by date turned 18 (same thresholds as
`check-batch.js`); branch weights; service length range; exposure rules by era (Vietnam: Agent Orange; Gulf War and after:
Southwest Asia); condition-to-disability rows (problem text match, diagnostic code, #31 name, percent), for example PTSD
(DC 9411) 50%, TBI residuals (8045) 40%, below-knee amputation (5165) 40%, burn scars (7801) 20%, tinnitus (6260) 10%,
hearing loss (6100) 10%, lumbosacral strain (5237) 20%, sleep apnea with CPAP (6847) 50%, and presumptive rows (Vietnam
era with type 2 diabetes, prostate cancer or ischemic heart disease). Percentages are cited to 38 CFR Part 4 in the file.
Random choices (branch, exact dates) use a generator seeded from the DFN, so the same patient always gets the same profile.

*Derivation rules settled on the four batch-1 patients (2026-10-08):* sources are active problems plus visit diagnoses
(Doug189's brain injury is only a visit diagnosis); the seed is an FNV-1a hash of the DFN (plain DFN multiples gave
correlated choices for neighbouring DFNs); injury-type rows (TBI, amputation, burn, PTSD) count only when dated inside
service or undated; other rows (including presumptive) count only when their onset is not before entry (pre-service
conditions are not service connected); a dated injury within the longest service length after entry ends service 6 to 18 months later; the
separation date is never after today; combat is set only for a dated in-service injury, with dates inside service and
the location chosen by the combat date's era; mental conditions share one rating (the highest).

**5. Combined rating by the VA method.** Sort ratings high to low; combined = 100 − product of (100 − each rating)
applied step by step, each step rounded to a whole number, final value rounded to the nearest 10 (5 rounds up).
Primary eligibility follows from it: 50% or more → SC 50% to 100%; 10% to 40% → SC less than 50%; none → NSC.
Priority group: 50%+ → 1, 30–40% → 2, 10–20% or POW → 3, NSC → 5. Rated disabilities at 0% are kept but not counted.

**6. Script and files.** `vet-profile.js --dfn <dfn> [--apply] [--from-file]`:
derive from a fresh VPR, write `output/vet-profile-<dfn>.json` (gitignored with `output/`), call the set RPC as a dry run
and print the field diff; with `--apply`, write, then re-read the VPR and the read RPC and report verified or the mismatches.
`--from-file` applies a hand-edited profile instead of re-deriving. The dry-run report keeps the old values, which is the
rollback input.

**7. Routine placement.** New routine `CDSPVET` (tags `GET`, `SET`), RPCs `CDSP UTIL VET GET` and `CDSP UTIL VET SET` in
context `CDSP RPC UTILS`, on branch `fhir-patient-import`. Reuses the `PRECHECK` / `ERRTRAP` pattern from `CDSPFHIR`.

## Risks / Trade-offs

- [Field or pointer names differ on dev] → discovery task first; the set RPC validates every value and writes nothing on error.
- [Cross-references and triggers on #2 fire side effects (eligibility, means test flags, HL7 or enrollment messages)] →
  test on one patient, check the patient inquiry and error trap afterwards; dev system only.
- [Partial write if FileMan fails mid-way] → validate all first; file core fields in one `FILE^DIE` call; report per field.
- [Enrollment and MST calls reject the data or need keys] → separate step after the core fields (task 4.4); errors are
  returned from `EDITCUR` / `NEWSTAT` as text, and the core fields still land.
- [Filing internal values skips the DG input transforms] → the routine repeats their checks; the consistency checks above
  are run against the result in task 4.3.
- [Ratings look wrong to a clinician] → table is visible and cited; profile file is reviewed before apply.

## Migration Plan

Load `CDSPVET` and the two RPC entries on dev (user). Run the read RPC on DFN 100972, fix the table, dry run, apply, verify;
then the other three batch-1 patients. Rollback: apply the old values from the saved dry-run report with `--from-file`.

## Open Questions

- Branch weights and service length ranges (test choices; can be tuned in the table without changing anything else).
- Whether women in later batches get an MST positive status (applies once MST writing works).
