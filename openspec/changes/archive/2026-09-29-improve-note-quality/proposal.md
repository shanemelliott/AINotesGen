# Proposal

## Why

The initial smoke test revealed that the AI-generated notes were clinically incoherent: the prompt didn't use the encounter's structured diagnosis data (visitDiagnoses with ICD codes), care plan activities, or carefully filtered problem lists. Result: notes mentioned "normal pregnancy" instead of the actual diagnosis (left ventricular failure, ICD-10 I50.1), listed all 21 historical problems in the assessment instead of focusing on relevant ones, and omitted the care plan activities (diet education, exercise) that should be in the PLAN section. This change improves note quality by making the prompt schema-aware, grounding narrative in the encounter context, and separating clinical assessment from social history.

## What Changes

- **Prompt enhancement**: Pass visitDiagnoses (with ICD codes), carePlanActivities, and a filtered problem list (only problems relevant to today's orders/meds/labs, plus a few chronic conditions) to the LLM.
- **Problem filtering**: Generate the assessment from relevant problems only—primary diagnosis from visitDiagnoses, acute problems within 365 days, select chronic problems—not all 21 historical problems.
- **Care plan integration**: Include carePlanActivities in the PLAN section, linked to the primary diagnosis.
- **Medication narrative**: Link new meds to their clinical indication (e.g., "furosemide for volume management in heart failure").
- **Social history separation**: Move social determinants to SUBJECTIVE instead of listing them as numbered problems in ASSESSMENT.
- **Marker line handling**: Include marker line in the LLM prompt output (for audit/review in `output/`) but strip it before uploading to VistA TIU (TIU records must not contain synthetic-data markers).
- **Coherence guardrails**: Ensure note narrative is age-consistent, uses correct visit type from encounter data, and uses only data provided (no invented diagnoses/labs).

## Capabilities

### New Capabilities
- `note-quality-improvement`: Improve AI-generated note coherence, diagnostic grounding, and clinical relevance by using encounter-provided diagnosis codes, care plan activities, and problem filtering; support marker-line stripping on VistA upload.

### Modified Capabilities
<!-- None; note-quality-improvement is new -->

## Impact

- **Code modified**: `test-ai.js` (prompt builder, post-processing for marker line stripping); `src/encounters.js` (helper for filtering problems per encounter).
- **Output affected**: Notes will be clinically coherent, diagnosis-grounded, and audit-marked in output but clean for VistA upload.
- **API calls unchanged**: Still uses o3-mini via Azure OpenAI.
- **Test coverage**: Re-generate note for 2025-10-21 encounter (I50.1 + 3 new meds + care plan activities) and verify against quality criteria (6 headings, ≤80 char lines, no IDs, focused assessment, social history separated).

## Non-goals

- Appointment creation (Task 4).
- VistA TIU upload implementation (Task 5).
- Batch generation and scale-out (Task 6).
- Running history / continuity across encounters (defer to future).
- Change note title/IEN selection (use default PRIMARY CARE VISIT IEN 16).
- Template expansion to other note types (focus on progress notes only).
