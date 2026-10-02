# Synthea FHIR Bundle Structure (Task 1 findings)

Source analyzed: `Lawana430_Temple691_Ernser583_11e07460-885c-1b50-05e8-506b66edacdc.json`
(repo root), Synthea version embedded in `Patient.text.div`: `v3.4.0-18-ga07a65555`.

## Resource counts (this patient)

| resourceType | Count | In scope for loader v1? |
|---|---|---|
| Patient | 1 | Yes |
| Encounter | 141 | Yes (drives appointment creation via `src/appointmentCreator.js`) |
| Condition | 61 | Yes (→ problems) |
| Observation | 624 | Yes, split by `category`: vital-signs (334), laboratory (190); skip social-history (47), survey (47), exam (6) for v1 |
| DiagnosticReport | 201 | Yes — lab panel grouping (see "Lab panel gap" below) |
| MedicationRequest | 30 | Yes (→ medication orders) |
| Medication | 4 | Referenced by `MedicationAdministration`, not `MedicationRequest` (see below) |
| MedicationAdministration | 4 | Skip v1 (inpatient-style administration records, uncommon in this dataset) |
| Immunization | 52 | Candidate for later, not v1 |
| Procedure | 328 | Skip v1 (no VistA target RPC identified yet) |
| DocumentReference | 141 | Skip — one per Encounter, references Synthea's own generated C-CDA/note text, not used (we generate our own notes in Task 3/5) |
| Claim / ExplanationOfBenefit | 171 / 171 | Skip — billing, not clinical |
| CareTeam / CarePlan | 7 / 7 | Skip v1 |
| ImagingStudy | 4 | Skip v1 |
| Provenance | 1 | Skip |

**File size**: 6.7MB raw JSON for this patient (1948 total entries). Confirms chunking is required
(exceeds any single RPC string param) but fits under vista-api-x's 10MB WildFly default — other,
larger patients should be checked once the loader exists.

**No `Appointment` resources exist in Synthea's output** — only `Encounter`. **CORRECTED (see
design.md "Real Appointment Root Cause"): this does not mean appointments are avoided.** A live
VistA load-log inspection showed `importEncounters^SYNFENC` itself unconditionally attempts a
broken direct-file-write appointment (`APPTADD^SYNDHP62`) for every `Encounter` loaded, regardless
of whether any `Appointment` resources are present — there's no flag to skip it. See design.md for
the full mechanism and the recommended fix (patch `ENCTUPD^SYNDHP61` to make that block optional).


## Corrections to design.md's resource mapping

### 1. Medication resource is `MedicationRequest`, not `MedicationStatement`
Synthea emits **`MedicationRequest`** (not `MedicationStatement` as design.md originally assumed).
Key fields:
- `medicationCodeableConcept.coding[0]` — **RxNorm** system (`http://www.nlm.nih.gov/research/umls/rxnorm`), `code`, `display`
- `dosageInstruction[0].text` — free text (e.g. `"Take as needed."`) — **not** a structured SIG
- `authoredOn` — order date
- `requester.display` — provider name (NPI-based reference)
- `status` — e.g. `completed`
- `dispenseRequest` (quantity/supply/refills) — **absent** on at least this sample (PRN/OTC-style
  order); may be present on other orders — needs more sampling before assuming it's always there

**Impact on design**: since `wsPostFHIR` routes meds through `SYNFMED2.m`'s full RxNorm→VUID→VA
Product→Drug File pipeline (not the simpler `ISI IMPORT MED` exact-name-match path), the DRUG/SIG
dictionary-matching risk flagged in the original design.md is **much lower when going through
wsPostFHIR** — RxNorm codes are directly usable, and `SYNFMED.m` can even auto-create a missing
drug in file #50. The SIG-matching risk only applies if we ever fall back to the standalone
`ISI IMPORT MED` RPC path instead of `wsPostFHIR`.

### 2. Blood pressure is a single Observation with `component[]`, not two separate Observations
Contrary to the original design.md assumption ("Synthea reports systolic/diastolic as separate
Observations... must combine"), Synthea actually emits **one** Observation
(`code.coding[0].code = "85354-9"`, "Blood pressure panel with all children optional") containing
a `component[]` array with both readings already grouped:
```json
"component": [
  { "code": {...8462-4 Diastolic...}, "valueQuantity": { "value": 84, "unit": "mm[Hg]" } },
  { "code": {...8480-6 Systolic...},  "valueQuantity": { "value": 100, "unit": "mm[Hg]" } }
]
```
No cross-Observation matching/combination needed — just read both `component[]` entries from the
same resource. Simpler than originally designed.

### 3. Lab panel gap: `SYNFPAN.m` scans `Observation`, but Synthea groups panels via `DiagnosticReport`
`SYNFPAN.m`'s panel-detection logic looks for an **`Observation`** entry whose own `code` matches a
known panel LOINC (e.g. `58410-2` CBC). In this Synthea output, **no such Observation exists** —
panels are represented only as a `DiagnosticReport` (`code.coding[0].code = "58410-2"`) whose
`result[]` array references the individual member `Observation` resources:
```json
{
  "resourceType": "DiagnosticReport",
  "code": { "coding": [{ "code": "58410-2", "display": "CBC panel..." }] },
  "result": [
    { "reference": "urn:uuid:...", "display": "Leukocytes..." },
    { "reference": "urn:uuid:...", "display": "Erythrocytes..." },
    ... (12 members total for this CBC)
  ]
}
```
**Consequence**: as currently written, `SYNFPAN.m` will likely **not fire** for this Synthea
version's bundles (it never finds a matching panel-coded Observation to trigger on) — all 190 lab
Observations will instead load individually via `SYNFLAB.m`'s `LABADD^SYNDHP63` path. This is
functionally fine (every lab result still loads) but means the VistA **LAB PANEL** file grouping
the DataLoader devs built specifically for this won't be populated from this Synthea version's
output without either:
  (a) accepting individual-lab loading for v1 (no panel grouping in VistA), or
  (b) a VistA-side patch to `SYNFPAN.m`/`SYNFLAB.m` to also scan `DiagnosticReport.result[]` for
      panel membership, or
  (c) a client-side (Node) pre-processing step that synthesizes a panel-coded `Observation` entry
      from each `DiagnosticReport` before sending the bundle to `wsPostFHIR`, so `SYNFPAN.m`'s
      existing scan logic finds what it expects without any M-side changes

**Recommendation**: flag this finding to whoever manages the `VistA-FHIR-Data-Loader` package
(the user funded this feature) — option (c) is lowest-effort for us and requires no VistA-side
code changes, but confirm with them which approach they'd prefer before implementing.

## Patient field mapping (confirmed)
| Synthea field | Notes |
|---|---|
| `name[0].family`, `name[0].given[]` | `use: "official"` entry (there's also a `"maiden"` entry — skip) |
| `gender` | lowercase full word (`"female"`/`"male"`) — map to `F`/`M`; `us-core-birthsex` extension (`valueCode`) is a more direct `F`/`M` source if present |
| `birthDate` | `YYYY-MM-DD` |
| `identifier[]` | array of 5 typed identifiers; SSN is the entry where `type.coding[0].code === "SS"` (value has dashes, e.g. `"999-22-2037"` — strip to 9 digits) |
| `address[0]` | `line[]`, `city`, `state` (2-letter), `postalCode` |
| `maritalStatus.text` | e.g. `"Divorced"` |

## Condition field mapping (confirmed)
| Synthea field | Notes |
|---|---|
| `clinicalStatus.coding[0].code` | **3 observed values**: `active`, `inactive`, `resolved` — not just active/inactive as design.md assumed. Map `resolved`→`I` same as `inactive`. |
| `code.coding[0].code` / `.display` | SNOMED code + text; `code.text` also present (redundant with display here) |
| `onsetDateTime`, `abatementDateTime` | ISO 8601 with offset, e.g. `1980-06-20T11:57:46+00:00` |
| `encounter.reference` | `urn:uuid:<encounter-id>` — resolve against `Encounter.id` |

## Observation field mapping (confirmed)
Same shape for both vitals and labs — distinguish via `category[0].coding[0].code`
(`vital-signs` vs `laboratory`):
| Synthea field | Notes |
|---|---|
| `code.coding[0].code` / `.display` | LOINC code + display text |
| `valueQuantity.value` / `.unit` | numeric result |
| `effectiveDateTime` | ISO 8601 with offset |
| `encounter.reference` | links to Encounter for location/provider lookup |
| `component[]` | present on BP only (so far observed) — see correction #2 above |

## Encounter field mapping (confirmed)
| Synthea field | Notes |
|---|---|
| `class.code` | e.g. `AMB` (ambulatory) |
| `type[0].coding[0].code/.display` | SNOMED visit-reason code + text |
| `period.start` / `.end` | ISO 8601 with offset |
| `participant[0].individual.display` | provider name (reference is an NPI-based search URL, not a VistA-resolvable ID directly) |
| `location[0].location.display` | facility/clinic name text |
| `serviceProvider.display` | organization name |

## Open items carried forward
1. **DRUG/SIG dictionary match-rate check** (original Task 1 step 5) — now **lower priority**
   given `wsPostFHIR` routes meds through the RxNorm pipeline rather than requiring exact
   `ISI IMPORT MED` dictionary matches. Still worth a smoke test (Task 1.5/Task 7) to confirm
   RxNorm codes from this Synthea version resolve against the target VistA's VA PRODUCT file
   (#50.68) acceptably, and to see the `SYNFMED.m` auto-drug-creation path in action at least once.
2. **Lab panel gap** (see above) — needs a decision from the VistA-FHIR-Data-Loader maintainers
   (or a Node-side `DiagnosticReport`→synthetic-panel-Observation shim) before panels will
   populate VistA's LAB PANEL file as originally funded/intended.
3. **`dispenseRequest` presence on other medication orders** — only sampled one `MedicationRequest`
   (a PRN/OTC order with no `dispenseRequest`); need to check a chronic/refillable medication
   example to confirm supply/refill fields are present when relevant.
