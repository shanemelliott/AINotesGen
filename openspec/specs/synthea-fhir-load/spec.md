# synthea-fhir-load Specification

## Purpose
Load Synthea FHIR patient bundles into a VistA test system through custom RPCs on top of the WorldVistA SYN loader, and give callers tools to predict, inspect and repair that load. Development and test systems only.

## Requirements

### Requirement: Load a Synthea bundle through an RPC
The system SHALL provide an RPC (`CDSP UTIL LOAD FHIR`, broker context `CDSP RPC UTILS`) that accepts a Synthea FHIR bundle as sequential text chunks and returns a JSON load summary, with per-domain loaded and error counts, the new patient's DFN and ICN, or a JSON error message.

#### Scenario: Load a bundle
- **WHEN** a client sends a valid bundle as chunks 1..n
- **THEN** the patient and the supported resource types (encounters, conditions, labs, vitals, meds, immunizations, procedures, care plans, allergies) are filed in VistA
- **AND** the response reports the DFN, ICN and a status per domain

#### Scenario: Missing chunks
- **WHEN** the first chunk is absent
- **THEN** the response is a JSON error and nothing is filed

### Requirement: Refuse to run on production
The load, log, preflight and map-edit RPCs SHALL refuse to run on a production system or when the SYN loader routines are not installed, returning a JSON error naming the problem.

#### Scenario: Production account
- **WHEN** any of these RPCs is called on a production system
- **THEN** the response is a JSON error and no data is read or written

### Requirement: Loading never creates appointments
The load SHALL file visits and clinical data only; it SHALL NOT create, check in or check out appointments, so appointments can be created separately.

#### Scenario: Visits without appointments
- **WHEN** a bundle with 100 encounters is loaded
- **THEN** visits are filed for the encounters that load
- **AND** the patient has no appointments from the load

### Requirement: Place each visit in a clinic by encounter class, type and reason
The load SHALL choose each visit's hospital location from the Synthea encounter class, then its encounter type code, then its reason code. Emergency-class encounters SHALL go to the emergency department. Encounters with a mapped type or reason SHALL go to the matching specialty clinic. Anything else, or any mapped clinic that does not exist in the hospital location file, SHALL use the default outpatient clinic.

#### Scenario: Emergency visit
- **WHEN** an encounter has class EMER
- **THEN** the visit is filed at EMERGENCY DEPARTMENT

#### Scenario: Specialty visit by reason
- **WHEN** an ambulatory encounter has the reason code for chronic congestive heart failure
- **THEN** the visit is filed at CARDIOLOGY

#### Scenario: No match
- **WHEN** an encounter has no mapped class, type or reason
- **THEN** the visit is filed at the default outpatient clinic

### Requirement: Report the load result per resource
The system SHALL keep a load log per patient that records, for each resource, its category, whether it loaded, and the loader's messages, and SHALL provide an RPC (`CDSP UTIL LOAD LOG`) that returns it as JSON, optionally for one category.

#### Scenario: Read the log
- **WHEN** the log RPC is called with a DFN
- **THEN** it returns every entry with category, resource id, load status and log lines

#### Scenario: No load for the patient
- **WHEN** the DFN has no load log
- **THEN** the response is a JSON error stating that

### Requirement: Predict load failures without writing
The system SHALL provide an RPC (`CDSP UTIL LOAD PREFLIGHT`) that takes a list of typed codes (procedure, vital, lab, condition, medication) and reports for each whether the loader can map it, using the same lookups as the load and writing nothing.

#### Scenario: Lab code with a missing target
- **WHEN** a lab LOINC code maps to a test name that is not in the laboratory test file
- **THEN** its status is `target-missing`

#### Scenario: Medication that cannot be resolved
- **WHEN** an RxNorm code cannot be converted to a drug
- **THEN** its status is one of `not-valid-rxnorm`, `no-vuid` or `no-va-product`, with the reason in the target

#### Scenario: Medication that will load
- **WHEN** a medication resolves to an existing drug, or to a VA product the load would add as a drug
- **THEN** its status is `mapped` or `will-create`

### Requirement: Read and correct lab map entries
The system SHALL provide RPCs to read (`CDSP UTIL MAP GET`) and to set or add (`CDSP UTIL MAP SET`) entries in the LOINC to laboratory-test map. A set SHALL support a dry run that writes nothing, SHALL only accept names that exist in the laboratory test file, and SHALL report the old and new value of each entry.

#### Scenario: Dry run
- **WHEN** a set is sent with the dry-run flag
- **THEN** the response shows what would change and nothing is written

#### Scenario: Unknown test name
- **WHEN** an entry names a laboratory test that does not exist
- **THEN** that entry returns an error status and is not written

### Requirement: Translate RxNorm codes the loader cannot resolve
Medication codes that RxNorm marks valid but that the VA drug files cannot resolve SHALL be translatable to a usable RxNorm code through a maintained translation table, so those prescriptions load.

#### Scenario: Translated medication
- **WHEN** a bundle contains a code with a translation entry
- **THEN** the prescription loads using the translated code

### Requirement: Provide a client that loads a bundle in chunks
The system SHALL provide a command-line client that reads a bundle file, sends it in chunks to the load RPC, writes the response to a result file, and supports a dry run that sends nothing, skipping chosen resource types, and loading a limited number of resources per type.

#### Scenario: Dry run
- **WHEN** the client is run with `--dry-run`
- **THEN** it reports what it would send and calls no RPC

#### Scenario: Re-loading a loaded patient
- **WHEN** the same patient is loaded a second time
- **THEN** the load fails because the patient already exists and no second patient is created
