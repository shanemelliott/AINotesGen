# Spec Delta: Patient Pipeline CLI

## Purpose

Give one entry point for the steps that build a synthetic test patient, so a patient can be taken through the pipeline and resumed later without reading notes, while every step behaves exactly as its own script does.

## ADDED Requirements

### Requirement: List the pipeline steps
The system SHALL provide a `list` command that prints every available step with its group and a one-line description, in pipeline order for the steps that belong to the patient pipeline.

#### Scenario: List all steps
- **WHEN** `node patient.js list` runs
- **THEN** each step is printed once with its group and description
- **AND** the command exits 0

#### Scenario: Step missing from the registry
- **WHEN** a script exists under the scripts folder but is not in the step registry
- **THEN** `list` reports it as unregistered so it is not forgotten

---

### Requirement: Run one step with its own arguments
The system SHALL run the named step with all remaining arguments passed through unchanged, stream its output, and exit with the step's own exit code. The entry point SHALL NOT add, remove or reinterpret any argument, so preview flags and commit flags keep the meaning each script gives them.

#### Scenario: Pass-through
- **WHEN** `node patient.js fill-rx --dfn <dfn> --rx <ien> --date 2025-11-20` runs
- **THEN** the step receives exactly `--dfn <dfn> --rx <ien> --date 2025-11-20`
- **AND** the entry point exits with the step's exit code

#### Scenario: Preview stays a preview
- **WHEN** a step that previews unless `--commit` is given runs without `--commit`
- **THEN** nothing is written, exactly as when the step script is run directly

#### Scenario: Unknown step
- **WHEN** the step name is not in the registry
- **THEN** the entry point prints the closest step names and exits non-zero without running anything

---

### Requirement: Record completed steps per patient
The system SHALL, after a step exits and the run is tied to a patient, add a record to that patient's status file under `plans/` holding the step name, the time, and whether the run was a preview. A run is tied to a patient by an entry-point option `--patient <dfn>` given before the step name, or by the step's own `--dfn <dfn>` argument, or by the DFN given as the first number for steps registered as taking it positionally. A run SHALL count as a preview when it has a `--dry-run` flag, or when the step's registry entry names a preview rule that applies (a confirm flag such as `--commit`, `--apply`, `--book` or `--generate` is required and absent, or a preview flag is present). A failed run SHALL NOT be recorded as done. The status file SHALL hold only the DFN, step names, timestamps, exit codes and preview timestamps.

#### Scenario: Successful committed step
- **WHEN** a step runs with `--dfn <dfn>` and exits 0 without being a preview
- **THEN** the patient's status file lists the step as done with the time

#### Scenario: Preview run
- **WHEN** a commit-gated step runs with `--dfn <dfn>` and no `--commit`
- **THEN** the status file records a preview for the step and the step does not count as done

#### Scenario: Failed step
- **WHEN** a step exits non-zero
- **THEN** the status file records no completion for it

#### Scenario: Step without a patient
- **WHEN** a step runs with no patient tied to it
- **THEN** no status file is written

#### Scenario: Step that has no DFN argument
- **WHEN** a step such as note signing runs as `node patient.js --patient <dfn> <step> --all`
- **THEN** the run is recorded for that patient and `--patient <dfn>` is not passed to the step

---

### Requirement: Show patient status and the next step
The system SHALL provide a `status --dfn <dfn>` command that prints the pipeline steps in order, marking each as done (with its last time), preview only, or not run, and names the next step that is not done.

#### Scenario: Partly done patient
- **WHEN** a patient's first three pipeline steps are done
- **THEN** `status` shows those three as done, the rest as not run, and names the fourth as next

#### Scenario: Patient with no status file
- **WHEN** a patient has no status file
- **THEN** `status` shows every step as not run and names the first step as next

#### Scenario: Steps outside the pipeline
- **WHEN** a step is a one-off tool (for example a backfill or a Lighthouse check)
- **THEN** it can be run through the entry point but does not appear in the ordered pipeline

#### Scenario: Steps before a DFN exists
- **WHEN** a pipeline step runs before the patient has a DFN (trimming, preflight, loading)
- **THEN** `status` lists it as not tracked and does not name it as the next step

## Notes

- The pipeline order and each step's commit-gated flag live in a step registry file next to the scripts.
- Judgment steps (planted findings, hand-written planted notes, scoring) are documented in a skill, not run by the entry point.
