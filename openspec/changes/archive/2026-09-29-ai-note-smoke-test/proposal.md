# Proposal

## Why

The whole NotesGenerator pipeline (encounters, then appointments, then notes) depends on the VA Azure OpenAI endpoint being willing and able to write a plausible synthetic progress note from structured VPR data. We have to prove that first, before spending effort on encounter extraction or VistA writes. Two AI configs exist in the reference code with different models and api-versions (`o3-mini` @ `2025-04-28` in VAOSAI, `gpt-4o` @ `2024-02-15-preview` in vista-notes), and we don't yet know which one works or produces usable notes.

## What Changes

- Add a standalone Node script, `test-ai.js` at the repo root, that:
  - loads `AZURE_OPENAI_API_KEY` from `../VAOSAI/.env` without logging it
  - reads `100965.json` and builds one encounter's clinical context (orders, linked labs, active meds, problems, recent vitals) for a fixed date
  - sends a system + user prompt asking for a SYNTHETIC SOAP-format outpatient progress note in TIU-safe plain text
  - tries a list of model/api-version candidates and reports status, latency, token usage, and refusal/content-filter results for each
  - prints the generated note and checks it against the TIU format rules
- Add a root `package.json` (pnpm) with `axios` and `dotenv`.

## Capabilities

### New Capabilities
- `ai-note-generation`: Generate a synthetic clinical progress note from structured encounter data using the VA Azure OpenAI endpoint, including credential handling, data minimization, output-format rules, and model fallback reporting. This change delivers only the smoke-test slice; later changes will extend this capability for batch generation.

### Modified Capabilities
<!-- None: no existing specs. -->

## Non-goals

- No VistA connection. The script creates no appointments and writes no TIU notes.
- No general encounter-extraction module (PROJECT-PLAN Task 2). The one test encounter is assembled with simple, fixed filtering.
- No prompt tuning, running patient history, or batch generation across encounters or patients.
- No UI or server.
- No handling for patients other than DFN 100965.

## Impact

- New files: `test-ai.js`, `package.json`, `pnpm-lock.yaml` at the repo root.
- Reads `../VAOSAI/.env` (outside the repo, read-only) and `100965.json`.
- Makes outbound HTTPS calls to `spd-prod-openai-va-apim.azure-api.us`, which consume a small number of tokens.
- Produces no changes to VistA or to the reference projects.
