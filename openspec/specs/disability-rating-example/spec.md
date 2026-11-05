# disability-rating-example Specification

## Purpose
Defines a synthetic male veteran whose chart documents service-connected hearing loss
and tinnitus from service to today, ending with evidence that supports a higher rating,
so summaries can be tested against a known answer key.

## Requirements

### Requirement: Patient is a new male answer-key patient
The patient SHALL be a male Synthea patient loaded as a new answer-key patient, with the
middle initial A in the name, a valid address, veteran service data and an answer key.
The patient SHALL NOT be an existing test or answer-key patient.

#### Scenario: Patient created
- **WHEN** the patient is loaded and set up
- **THEN** the chart shows a male veteran with service dates in the 1980s and an SC rating that includes hearing loss (DC 6100) and tinnitus (DC 6260)

### Requirement: Historical evidence from service to 2014
The chart SHALL contain dated audiology, ENT and primary care evidence from service
through 2014: a noise-exposure history, entrance and separation audiograms, a first
tinnitus complaint, a baseline post-discharge audiology exam, and later audiology visits
with slowly worsening thresholds and tinnitus complaints.

#### Scenario: Evidence exists before the rating
- **WHEN** the record is read in date order
- **THEN** noise exposure and a first tinnitus complaint appear before the SC grant, and audiology visits follow at intervals of about 3 to 5 years

### Requirement: Recent evidence supports a higher hearing-loss rating
The chart SHALL contain audiograms for about 2023 to 2026 whose averages and word
recognition scores are worse than the earlier ones, and notes that describe the effect on
hearing, tinnitus, sleep, mood and work. The values SHALL be set so they are consistent
with a higher rating under the VA hearing-loss rating tables.

#### Scenario: Trend is visible
- **WHEN** the audiograms are listed by date
- **THEN** the 4-frequency average rises and Maryland CNC word recognition falls across the series, with the recent ones clearly worse than 2014

### Requirement: No claim or exam paperwork
No uploaded progress note SHALL refer to the claim, a request or intent to raise a rating,
compensation, a C&P examination, a DBQ, VBA or the regional office, a claim number, or
evidence being gathered for a rating. Notes SHALL read as ordinary clinical care. The
automatic SC and rated-disability block on a consult is permitted because it states the
current rating only.

#### Scenario: Chart is claim-free
- **WHEN** every note is searched for "claim", "C&P", "DBQ", "increase", "compensation", "rating", "VBA", "regional office" and "evidence for"
- **THEN** no note refers to a claim, an increase or a rating request, apart from the rated-disability block on a consult

#### Scenario: Checked before and after upload
- **WHEN** a note file is ready to upload
- **THEN** the same search is run on the file before upload and on the filed text read back from VistA after upload, and any hit is fixed before the note is used

### Requirement: Audiology notes follow real VA layouts
Audiology notes SHALL follow the layouts of real VA audiology notes: a verbal description
of the loss per ear, speech reception thresholds, word recognition (percent and level),
tympanometry, reflex findings and test reliability, with the audiogram itself not repeated
in the text. A diagnostic note SHALL also carry one compact line per ear with the
4-frequency average (1000 to 4000 Hz) and word recognition percent, in the same order in
every note.

#### Scenario: Layout is consistent
- **WHEN** two diagnostic audiology notes from different years are compared
- **THEN** the same fields appear in the same order, and the numeric line per ear is present in both

### Requirement: Consult note shows the rating block
The first audiology consult note SHALL begin with the automatic block that VA consults
carry (primary care provider, SC percent and rated disabilities with their percentages, the
consult order details and its activity table), with values that match the patient's rating
on that date.

#### Scenario: Rating block matches the record
- **WHEN** the consult note is read
- **THEN** its SC percent and rated disabilities equal the patient's veteran data as of the note date

### Requirement: Device history is continuous
Hearing aid make, model and serial numbers SHALL be the same in every note that names a
device, from fitting through repairs to replacement, and a replacement SHALL appear as a
new device with new serial numbers.

#### Scenario: Serial numbers agree
- **WHEN** all notes naming a hearing device are compared
- **THEN** each device keeps one set of serial numbers across its notes

### Requirement: Open loop is planted
The chart SHALL contain an audiology note that requests an ENT consult for air-bone gaps
and a walk-in hearing aid follow-up, with at least one of them not completed in the record.

#### Scenario: Request without completion
- **WHEN** the record after that note is read
- **THEN** no ENT visit or completed consult follows, and the key lists the item as an open loop

### Requirement: Routine boilerplate appears as distractors
Several notes SHALL carry routine boilerplate (stress card, PHQ-2 screen, survey text), and
the key SHALL list it as distractors the summary must not overstate.

#### Scenario: Distractors listed
- **WHEN** the key is built
- **THEN** each boilerplate item appears under distractors and none appears as a key finding

### Requirement: Answer key with planted findings
The patient SHALL have a source answer key with key items, distractors, items the summary
should not say and a scoring rule, and generated key files for scoring a summary or
chatbot run.

#### Scenario: Key generated
- **WHEN** the key files are built
- **THEN** each planted finding has a date, a source and a scoring rule, and the key states the patient's target rating question

### Requirement: Chart supports an open claim for an increase in hearing loss
The patient SHALL be a veteran with an open claim to increase the hearing-loss percentage
because his hearing has worsened. The chart SHALL show the rated baseline (the last rated
state of his hearing), dated evidence of worsening after it, and at least one audiology
note dated in the year before the claim date. The claim date and the rated condition SHALL
be recorded in the key as inputs to the tool, not in any chart note.

#### Scenario: Worsening is provable
- **WHEN** the audiology notes after the baseline are listed by date
- **THEN** each later note shows equal or worse hearing than the one before, and the most recent is clearly worse than the baseline

#### Scenario: Claim is not in the chart
- **WHEN** the chart is searched for the claim or its date
- **THEN** no note mentions it, and only the key holds the claim date

### Requirement: Key is organized around a rater's questions
The key SHALL list, as key items, what a disability rater needs: the rated condition and
current percentage, the baseline, the evidence of worsening dated after it, the most recent
test results (average threshold and Maryland CNC percent per ear and whether the Maryland
CNC list was named), the functional effects in the veteran's words, the tinnitus facts
(documented, rated 10%, no increase available), and the gaps (the uncompleted ENT request
and any test that does not name its word list or give its numbers). The key SHALL count a
stated rating percentage or an eligibility verdict by the tool as a failure.

#### Scenario: Key covers the rater's questions
- **WHEN** the key is built
- **THEN** each rater question has a key item with the dates and sources that answer it

#### Scenario: Verdict is a failure
- **WHEN** a tool run states the percentage the veteran should receive
- **THEN** the scoring marks it as a failure, since raters decide

### Requirement: Rating-usable and less usable tests are both present
Most recent audiology notes SHALL name the word list (Maryland CNC) and carry the numeric
line, and at least one earlier diagnostic note SHALL omit the word list name or the numeric
line, so the tool's evidence can be graded by usability.

#### Scenario: Usability differs
- **WHEN** the diagnostic audiology notes are compared
- **THEN** the recent ones name the word list and give numbers, and one earlier note does not

### Requirement: Evidence is authored by synthetic providers
Each historical and recent note SHALL be authored and signed by a synthetic provider
suited to its clinic (audiology, ENT, primary care, mental health), not by the PIV user.

#### Scenario: Author check
- **WHEN** a signed note is read back
- **THEN** its author and signature block are the clinic's synthetic provider

### Requirement: Planted notes are written by hand
Planted notes SHALL be written by hand with the exact values the key needs, because
generated notes invent history and drop values.

#### Scenario: Values match the key
- **WHEN** a planted note is compared with the key
- **THEN** every number in the key appears in the note text
