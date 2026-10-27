# Spec Delta

## ADDED Requirements

### Requirement: Loaded problems keep their clinical status
The load SHALL file each condition with the clinical status from the bundle. An active
condition SHALL be filed ACTIVE whichever ICD path the loader uses: full ICD map,
partial map or fallback.

#### Scenario: Active condition filed through the full-ICD path
- **WHEN** a bundle condition with clinicalStatus active is filed through the full-ICD
  path
- **THEN** the patient's problem list shows it as ACTIVE

#### Scenario: Resolved condition
- **WHEN** a bundle condition has clinicalStatus resolved
- **THEN** the problem is filed INACTIVE
