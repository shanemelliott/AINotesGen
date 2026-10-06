## ADDED Requirements

### Requirement: Veteran test batch has a defined sex mix
A generated veteran batch SHALL be predominantly men, with women making up about one in five patients. For a batch of 10 to 20 patients the number of women SHALL be within one of 20 percent.

#### Scenario: Batch of 16
- **WHEN** a batch of 16 patients is generated
- **THEN** it contains 12 to 14 men and 2 to 4 women

### Requirement: Veteran test batch has a defined age and service-era mix
A batch SHALL be mostly patients aged 60 or older, with the remainder younger adults, and every patient SHALL be a veteran. Each patient's service era SHALL follow from their age: Vietnam era, the period between Vietnam and the Gulf War, the Gulf War, or after 2001.

#### Scenario: Older majority
- **WHEN** a batch of 16 is generated
- **THEN** at least 10 patients are 60 or older and at least 2 are under 45

#### Scenario: Every patient is a veteran
- **WHEN** a patient file is checked
- **THEN** it identifies the patient as a veteran, or the patient is rejected from the batch

### Requirement: Records begin at military entry
No clinical resource in a veteran patient's record SHALL be dated before the patient's 18th birthday, and the patient's earliest record SHALL fall at about age 18 to 20. Conditions and medications active at entry SHALL NOT be backdated into childhood.

#### Scenario: Pre-service history removed
- **WHEN** a generated bundle contains an encounter dated before the patient's 18th birthday
- **THEN** the trimmed bundle contains no resource dated before that birthday

#### Scenario: Youngest record
- **WHEN** a trimmed bundle is checked
- **THEN** its earliest dated resource is between age 18 and age 20

### Requirement: Veteran-typical conditions and injuries are represented
A batch SHALL include patients with the conditions veterans commonly carry, with target shares set in the population profile: PTSD, depression and anxiety, substance use disorders, traumatic brain injury, spine and orthopedic conditions, chronic pain, sleep apnea, hypertension, diabetes, hearing loss and tinnitus, and, among older patients, cancers linked to exposure and kidney disease.

#### Scenario: Batch check
- **WHEN** a batch is generated
- **THEN** a report lists, for each target condition group, how many patients have it and whether the profile's target is met

### Requirement: A batch is reproducible
Each batch SHALL record the Synthea version, configuration, command lines and seeds used, so the same batch can be regenerated.

#### Scenario: Regenerate
- **WHEN** the recorded command lines and seeds are run with the recorded Synthea version
- **THEN** the same patients are produced
