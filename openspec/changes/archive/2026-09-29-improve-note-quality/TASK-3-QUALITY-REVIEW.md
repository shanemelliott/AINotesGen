# Task 3: Note Quality Improvement Issues

## Issues Found in Smoke Test Output

### 1. **Primary Diagnosis Missing or Misidentified**
The smoke note says "normal pregnancy" in CHIEF COMPLAINT and SUBJECTIVE, but the encounter is actually about **heart failure (I50.1)** with new cardiac meds (furosemide, carvedilol, lisinopril). The prompt didn't use `visitDiagnoses` which has the real diagnosis.

**Impact:** Note doesn't reflect the actual clinical picture; contradictory narrative.

---

### 2. **Incoherent Patient Description**
```
SUBJECTIVE: "The patient is a 45-year-old female veteran with a normal pregnancy. 
She reports feeling well overall with no chest pain, dyspnea, or edema."
```
- Patient is 45 years old
- "Normal pregnancy" + "prenatal care" makes no clinical sense
- "No dyspnea" contradicts heart failure diagnosis

**Needed:** Use encounter age/gender + visitDiagnoses to build coherent narrative; omit irrelevant diagnoses.

---

### 3. **Assessment Unfocused**
```
ASSESSMENT:
1. Normal pregnancy  
2. Cardiovascular management needs  
3. Chronic and psychosocial issues
```
- "Normal pregnancy" is not the diagnosis; should be "Left ventricular failure, unspecified (I50.1)"
- "Chronic and psychosocial issues" is too vague (lumps obesity, social isolation, stress)
- No link between new meds and the primary diagnosis

**Needed:** Focus assessment on problems relevant to today's orders + labs + new meds; cite ICD codes.

---

### 4. **Care Plan Not Grounded in Clinical Data**
```
PLAN:
1. Normal pregnancy: Continue routine prenatal care and labs...
2. Cardiovascular management: Initiate furosemide, carvedilol, and 
   lisinopril for blood pressure and volume status...
3. Chronic and psychosocial issues: Continue current management...
```
- Mentions new meds by name but doesn't tie them to the diagnosis
- Missing the **care plan activities** from the encounter:
  - "LOW SALT DIET EDUCATION (PROCEDURE)"
  - "PHYSICAL EXERCISES (REGIME/THERAPY)"

**Needed:** Incorporate `carePlanActivities` into the PLAN section; link meds to diagnosis.

---

### 5. **TYPE Field Format**
```
TYPE: VA OUTPATIENT
```
Should probably be a simple visit type code or be omitted; confirm format on VEHU.

---

### 6. **Social History Not Separated**
The note lists "employment" and "isolation" as numbered problems in the ASSESSMENT, not in SUBJECTIVE as social history.

**Needed:** Move social history to SUBJECTIVE; keep assessment clinical.

---

## Proposed Improvements for Task 3 Change

### A. **Update prompt to use encounter data effectively**
1. Include `visitDiagnoses` in the prompt with ICD codes as the primary diagnosis
2. Include `carePlanActivities` in the prompt for the PLAN section
3. Link new meds to their diagnosis reason (e.g., "furosemide for volume management in heart failure")
4. Use encounter's `suggestedVisitType` (not guessed from context)

### B. **Improve narrative coherence**
1. Filter problems to only those relevant to the encounter:
   - Primary diagnosis from `visitDiagnoses`
   - Acute problems (if new/active on this date)
   - Select 2-3 chronic problems affecting today's management
   - Omit old/resolved diagnoses
2. Build SUBJECTIVE using encounter age/gender + relevant history, not all problems
3. Ensure ASSESSMENT and PLAN are focused and linked

### C. **Better use of labs and meds**
1. Explain abnormal labs in OBJECTIVE (e.g., "Potassium normal, suggesting good diuretic tolerance")
2. Link all new meds to diagnosis/labs (e.g., "Started on lisinopril for blood pressure")
3. Note recent labs in context (e.g., "improved renal function from 10/04")

### D. **Implement marker line stripping**
1. Prompt includes marker line (LLM will write it)
2. When uploading to VistA, strip the first line before calling TIU CREATE RECORD
3. Output to `output/` still includes it (for review/audit)

### E. **Validate prompt structure**
1. Ensure all 6 headings present (VISIT DATE, CHIEF COMPLAINT, SUBJECTIVE, OBJECTIVE, ASSESSMENT, PLAN)
2. Ensure lines are plain text, ≤ 80 chars
3. Ensure no markdown formatting
4. Ensure no patient identifiers

---

## What Gets Built

**Change: `improve-note-quality`**

Tasks:
1. Update the note prompt in `test-ai.js` to pass `visitDiagnoses`, `carePlanActivities`, and encounter context
2. Improve prompt instructions to filter problems, link diagnosis + meds + plan, separate social history
3. Add a post-processing function to strip marker line on VistA upload (but keep in output/)
4. Generate a new test note for 2025-10-21 encounter to compare vs. smoke test
5. Verify against the quality checklist (headings, line length, no IDs, coherence)
6. Document the improvement results and decisions in the change

---
