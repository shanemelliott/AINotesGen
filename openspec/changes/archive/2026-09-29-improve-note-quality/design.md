# Design

## Context

Current state (from proposal):
- Smoke test (`test-ai.js`) builds note context from problem list only; does not use `visitDiagnoses`, `carePlanActivities`, or filtered problem subset.
- Result: notes mention irrelevant diagnoses (e.g., "normal pregnancy" instead of "heart failure"), list all 21 historical problems in ASSESSMENT, and omit care plan actions.
- Encounter structure (from `src/encounters.js`) includes `visitDiagnoses`, `carePlanActivities`, and a full problem list per encounter; these are available but unused.

Technical constraints:
- Node.js CommonJS (no TypeScript or build step).
- LLM is o3-mini (12-19 seconds per note, ~5-7k tokens); prompt structure matters for quality.
- Output must be plain text, ≤ 80 chars per line, no markdown.
- VistA TIU CREATE RECORD expects TEXT array; synthetic marker must be stripped before upload.

## Goals

1. Use encounter-provided structured data (visitDiagnoses, carePlanActivities, filtered problems) to ground note narrative in clinical reality.
2. Build a focused clinical assessment (≤5 items) instead of listing all historical problems.
3. Link medications to their clinical indication derived from diagnosis and labs.
4. Separate social determinants (history) from clinical assessment.
5. Implement marker-line stripping for VistA upload while preserving it in output for review.
6. Validate note structure (6 headings, ≤80 char lines, no IDs) before upload.

## Non-Goals (design-level)

- Refactor VPR indexing or encounter extraction (already works).
- Add appointment creation or TIU upload integration in this change (defer to Tasks 4 & 5).
- Support multiple note templates or visit types beyond progress notes.
- Change diagnosis/problem sourcing (use what encounters already extract).

## Decisions

### Decision 1: Prompt-driven problem filtering (not code-driven filtering)
**Choice**: Include a filtered problem list in the prompt; let the LLM respect it in narrative.

**Rationale**: 
- LLM should see constraints (e.g., "Focus on problems from the list below") and naturally produce focused output.
- Reduces complexity of hardcoding selection logic and is easier to adjust by changing prompt text.
- Avoids a two-pass approach (code filters, then LLM rewrites).

**Alternatives Considered**:
- Code-driven filtering: Pre-filter problems to top 3-5 before sending to LLM. Simpler to validate but less flexible; LLM often tries to add more problems anyway.
- Post-generation filtering: Let LLM write, then remove problems from output. Fragile (breaks numbering, structure).

### Decision 2: Marker line always in LLM output, strip on upload
**Choice**: Request marker line in prompt; always strip before VistA upload; log stripping.

**Rationale**:
- Prompt consistency: LLM always knows it's writing synthetic data.
- Audit trail: Output files retain the marker for review; VistA records never contain it (compliance).
- Easier testing: one code path, no conditional marker generation.

**Alternatives Considered**:
- Omit marker from LLM entirely: Simpler, but loses audit signal in output files.
- Keep marker in VistA: Non-compliant; conflates synthetic and real data.

### Decision 3: Problem filtering via prompt context, not new schema fields
**Choice**: Pass `relevantProblems[]` and `excludedProblems[]` as arrays in the prompt context (alongside existing `problems[]`).

**Rationale**:
- Backward-compatible: doesn't change encounter schema (stays in prompt scope).
- Easy to adjust rules later (just change prompt builder logic, not encounter extraction).
- Reduces data duplication (problems already in encounter; filtered list is a view).

**Alternatives Considered**:
- Add `filteredProblems: []` to encounter schema. More explicit but requires schema migration; complicates `extract-encounters.js`.

### Decision 4: No validation API; inline validation in test-ai.js
**Choice**: Add a `validateNote()` function in `test-ai.js` that checks headings, line length, IDs, etc.; report results but don't block note if invalid (log and flag for manual review).

**Rationale**:
- Keeps logic local to note generation (no new modules).
- Supports dry-run / audit logs without external dependencies.
- Can be integrated into Tasks 4-5 (appointment/TIU upload) to enforce validation on production runs.

**Alternatives Considered**:
- New `src/noteValidator.js` module. Overkill for now; fold into test-ai.js, refactor later if needed for scale.

### Decision 5: Problem filtering helper in src/encounters.js
**Choice**: Add a `filterProblemsForEncounter(encounter, rules)` function that selects problems based on: (1) visitDiagnoses, (2) acute window, (3) chronic relevance to today's orders/labs/meds.

**Rationale**:
- Reusable across test-ai.js and future Tasks 4-5.
- Centralizes filtering logic away from prompt builder.
- Testable in isolation.

**Alternatives Considered**:
- Embed filtering in test-ai.js prompt builder. Couples filtering to test code; harder to reuse.

## Risks / Trade-offs

**Risk**: Prompt length and token cost.
- *Mitigation*: Filtered problem list + care plan activities are ~200 tokens; acceptable within o3-mini 5-7k per note. Monitor token usage during testing.

**Risk**: LLM ignores filtered problem list and adds all historical problems anyway.
- *Mitigation*: Add instruction to prompt: "Do not include problems outside the provided list in your assessment." Test against known encounters (e.g., 2025-10-21 has I50.1, should not mention pregnancy). Include validation check.

**Risk**: Care plan activity extraction from SNOMED codes is fragile if format changes.
- *Mitigation*: Regex already in `src/encounters.js` (`/^SYN ACT\s+/` and `/\s*\(SCT:[^)]*\)\s*$/`). If format changes, update regex and test against sample data. Document in code.

**Risk**: Marker line stripping logic is easy to forget on upload.
- *Mitigation*: Encapsulate in a `stripMarkerLine(note)` function; always use it in Tasks 4-5 TIU code. Validation check should warn if marker is present in upload payload.

**Risk**: Encounter visit type code (new patient vs. follow-up) may not be accurate for historical data.
- *Mitigation*: Use sequence order (seq=1 → new patient) as fallback if `suggestedVisitType` is missing. Verify with sample data.

## Migration Plan

No migration needed: this is an enhancement to test-ai.js and src/encounters.js, both internal tools. No production impact until Tasks 4-5 (appointment/TIU upload).

**Deployment steps** (for this change only):
1. Implement updated test-ai.js prompt and post-processing (Task 1-2).
2. Add `filterProblemsForEncounter()` to src/encounters.js (Task 1).
3. Add `stripMarkerLine()` function to test-ai.js (Task 3).
4. Generate test note for 2025-10-21 encounter (Task 4).
5. Run quality validation (Task 5).
6. Document findings and archive change (Task 6).

**Rollback** (if needed): Revert test-ai.js and src/encounters.js to prior commit; re-run smoke test with o3-mini on same encounter. No data migration needed.

## Open Questions

1. **Diagnosis code format in note**: Should ICD code appear inline in narrative (e.g., "Left ventricular failure, unspecified (I50.1)") or only in structured fields? 
   - *Answer deferred to Task 1 implementation*; assume inline for readability.

2. **Chronic problem selection criteria**: How to choose which 3 chronic problems to include if > 3 are relevant?
   - *Answer deferred to Task 1*; rule: those mentioned in today's order names or affecting medication choice (e.g., obesity affects diuretic dosing).

3. **Visit type field format**: Should note include "TYPE: New patient visit" or "TYPE: NP" or omit entirely?
   - *Answer deferred to Task 1*; assume "New patient visit" / "Follow-up visit" for clarity. Verify via VEHU schema if available.
