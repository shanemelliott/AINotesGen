# Proposal

## Why

The sacred fourteen work (lighthouse-verification section 4) showed that an answer key
finds what an AI summary misses: the first run on the first patient and a later MCP chatbot
run both missed key items. Only one of the fourteen has a key so far. We also need patients
with veteran-specific problems (amputation,
burn, traumatic brain injury, PTSD) whose charts hide planted "gotchas", so the
summarizer is tested on veteran care and not only on hypertension and diabetes.

## What Changes

- Load 4 new Synthea veteran patients from the standalone test runs in
  `synthea/output/test-*` (amputation, burn, TBI, PTSD female). They are not part of the
  sacred fourteen.
- Add planted events to each after load (sentinel events after the last PCP visit,
  outpatient labs with no visit, open follow-up loops, trends, refill gaps, medication
  safety conflicts) and write a hand-built answer key per patient, using the first answer key
  as the template (`plans/dfn<dfn>-answerkey.json`, scoring rules from lighthouse task 4.5b).
- Name rule: every new imported patient that has an answer key (never the sacred fourteen) gets a middle initial of A
  (VistA name `LAST,FIRST A`), so key patients are visible in any patient list.
- Clear the open work that would break a new load (midnight appointments, duplicate
  appointment check) before loading.
- Document the process for future middle-initial-A patients.

## Capabilities

### New Capabilities
- `answer-key-patients`: loading a veteran patient, planting gotchas, writing an answer
  key, and naming the patient with middle initial A.

### Modified Capabilities
- None.
