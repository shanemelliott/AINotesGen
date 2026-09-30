# note-quality-improvement Specification

## Purpose
Improve the coherence, diagnostic grounding, and clinical relevance of AI-generated progress notes by using encounter-provided diagnosis codes, care plan activities, and focused problem filtering; support marker-line stripping for VistA upload while retaining it in output for audit.

## Requirements

### Requirement: Use encounter diagnosis codes in note narrative
The system SHALL include the primary diagnosis from `visitDiagnoses[0]` (name and ICD code) in the CHIEF COMPLAINT and ASSESSMENT sections, grounding the clinical narrative in structured data rather than inferring diagnosis from meds alone.

#### Scenario: Heart failure diagnosis surfaces
- **WHEN** an encounter has `visitDiagnoses: [{name: "Left ventricular failure, unspecified", icd: "I50.1", primary: true}]` and new meds furosemide, carvedilol, lisinopril
- **THEN** CHIEF COMPLAINT mentions heart failure by name; ASSESSMENT item 1 is "Left ventricular failure, unspecified (I50.1)"; PLAN links all three meds to volume/BP management for heart failure

#### Scenario: Viral infection without meds
- **WHEN** an encounter has `visitDiagnoses: [{name: "Viral infection, unspecified", icd: "B34.9", primary: true}]` and no new cardiac meds
- **THEN** CHIEF COMPLAINT and ASSESSMENT reflect the viral diagnosis; PLAN recommends supportive care appropriate to viral infection

### Requirement: Filter problems to encounter-relevant subset
The system SHALL limit ASSESSMENT problems to: (1) primary diagnosis from `visitDiagnoses`, (2) acute problems (onset ≥ 365 days before encounter date), (3) up to 3 selected chronic problems affecting today's management, excluding social determinants, administrative, and unrelated historical problems.

#### Scenario: Focused assessment
- **WHEN** the patient has 21 historical problems but today's encounter involves heart failure (new meds, abnormal BMP) and a history of obesity and stress
- **THEN** ASSESSMENT contains ≤ 5 items: heart failure (primary), obesity (chronic), stress (chronic), and 1-2 others clinically relevant to today
- **AND** "Full-time employment", "Has a criminal record", "Social isolation" do not appear in ASSESSMENT

#### Scenario: Acute problem within window
- **WHEN** an encounter on 2025-10-21 has a problem "Normal pregnancy" with onset 2025-10-10 (11 days prior)
- **THEN** "Normal pregnancy" appears in ASSESSMENT (within 365-day window)

#### Scenario: Acute problem outside window
- **WHEN** an encounter on 2025-10-21 has a problem "Acute viral pharyngitis" with onset 1991-07-05
- **THEN** "Acute viral pharyngitis" does NOT appear in ASSESSMENT (outside 365-day window)

### Requirement: Include care plan activities in PLAN section
The system SHALL include encounter `carePlanActivities` (cleaned of SNOMED codes and prefixes) as concrete action items in the PLAN section, linked to the primary diagnosis.

#### Scenario: Diet and exercise plan
- **WHEN** encounter has `carePlanActivities: ["LOW SALT DIET EDUCATION (PROCEDURE)", "PHYSICAL EXERCISES (REGIME/THERAPY)"]` for a heart failure diagnosis
- **THEN** PLAN includes items like "Low-salt diet education per cardiology" and "Encourage physical exercises per rehabilitation plan"

#### Scenario: Empty care plan
- **WHEN** encounter has `carePlanActivities: []`
- **THEN** PLAN does not reference care plan activities; focus remains on medications and clinical recommendations

### Requirement: Link new medications to clinical indication
The system SHALL describe each new medication (meds ordered on the encounter date) with its clinical indication derived from the primary diagnosis, orders, or labs, not as a bare list.

#### Scenario: Cardiac meds tied to diagnosis
- **WHEN** encounter has diagnosis "Left ventricular failure (I50.1)" and new meds furosemide, carvedilol, lisinopril
- **THEN** PLAN reads: "Initiated furosemide for diuresis and volume reduction in heart failure; carvedilol for rate and contractility control; lisinopril for blood pressure and afterload reduction"

#### Scenario: Single antibiotic for infection
- **WHEN** encounter has diagnosis "Bacterial infection" and one new order for amoxicillin
- **THEN** PLAN describes the antibiotic with its indication, not as part of a generic medication review

### Requirement: Separate social history from clinical assessment
The system SHALL place social determinants (from `socialHistory`) in the SUBJECTIVE section, not as numbered problems in the ASSESSMENT, and mark them as historical context.

#### Scenario: Social determinants in SUBJECTIVE
- **WHEN** encounter context includes social problems "Full-time employment", "Has a criminal record", "Social isolation"
- **THEN** SUBJECTIVE contains a line like "Social history: Full-time employment; no criminal record; some social isolation"
- **AND** these items do NOT appear as numbered assessment items

#### Scenario: No social history
- **WHEN** encounter has `socialHistory: []`
- **THEN** SUBJECTIVE does not include a social history line

### Requirement: Strip synthetic-data marker on VistA upload
The system SHALL include the marker line `*** SYNTHETIC TEST NOTE - FICTIONAL PATIENT - NOT FOR CLINICAL USE ***` in the note passed to the LLM (so it always appears) and in the output file for audit, but SHALL remove the line before uploading to VistA TIU CREATE RECORD.

#### Scenario: Marker in LLM output
- **WHEN** the system calls the LLM with a prompt requesting the marker line
- **THEN** the returned note begins with the marker line

#### Scenario: Marker in output/
- **WHEN** the system writes a note to `output/note-<dfn>-<seq>.txt`
- **THEN** the first line is the marker line

#### Scenario: Marker stripped on VistA upload
- **WHEN** the system calls TIU CREATE RECORD with a note
- **THEN** the TEXT array does NOT include the marker line (first line is VISIT DATE:)
- **AND** the audit log records that the marker was present in the LLM output before stripping

### Requirement: Maintain note format guardrails
The system SHALL ensure every note has exactly 6 headings (VISIT DATE, CHIEF COMPLAINT, SUBJECTIVE, OBJECTIVE, ASSESSMENT, PLAN) in that order, uses plain text only (no markdown), limits lines to 80 characters, and contains no patient identifiers (SSN, ICN, name, address).

#### Scenario: Valid format
- **WHEN** the system generates a note for an encounter
- **THEN** the note contains exactly 6 headings; all lines are ≤ 80 chars; no markdown formatting; no identifiers

#### Scenario: Identifier detection
- **WHEN** the prompt builder detects a risk of sending SSN or full name to the LLM
- **THEN** the system logs a warning and raises an error before calling the LLM

#### Scenario: Long lines caught
- **WHEN** an LLM output line exceeds 80 characters
- **THEN** the format check reports the line number and character count; the note is marked as invalid for upload

### Requirement: Use encounter's visit type in note
The system SHALL use the encounter's `suggestedVisitType` ("New patient", "Follow-up") in the VISIT DATE line, not inferred from patient history or context.

#### Scenario: First encounter
- **WHEN** encounter seq=1 (first in date order)
- **THEN** VISIT DATE line includes "TYPE: New patient visit"

#### Scenario: Later encounter
- **WHEN** encounter seq > 1
- **THEN** VISIT DATE line includes "TYPE: Follow-up visit"

### Requirement: Grade note quality against checklist
The system SHALL evaluate generated notes against a quality checklist: coherent narrative (diagnosis grounded in data, meds linked to diagnosis, assessment focused), appropriate problem scope (relevant to today's visit), care plan integration, social history placement, and format compliance (headings, line length, no IDs).

#### Scenario: Quality pass
- **WHEN** a note has coherent diagnosis-grounded narrative, focused assessment (≤5 items), care plan activities in PLAN, social history in SUBJECTIVE, all 6 headings, ≤ 80 char lines, no IDs
- **THEN** the note passes quality review

#### Scenario: Quality fail - unfocused assessment
- **WHEN** a note lists 15 historical problems in ASSESSMENT
- **THEN** the note fails quality review; reason: "Assessment includes unrelated historical problems"

#### Scenario: Quality fail - missing care plan
- **WHEN** encounter has `carePlanActivities: ["LOW SALT DIET EDUCATION (PROCEDURE)"]` but the note PLAN does not mention diet
- **THEN** the note fails quality review; reason: "Care plan activities not integrated"
