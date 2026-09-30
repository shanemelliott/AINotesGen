# Tasks

## 1. Setup

- [x] 1.1 Create root `package.json` (name `notes-generator`, CommonJS, private) and run `pnpm add axios dotenv`. Verify: `node -e "require('axios');require('dotenv')"` exits 0.
- [x] 1.2 Add `output/` to `.gitignore`. Verify: `git check-ignore output/x.txt` prints the path.

## 2. Credentials and CLI

- [x] 2.1 In `test-ai.js`, load `../VAOSAI/.env` with dotenv, read only `AZURE_OPENAI_API_KEY`, and exit non-zero with a message naming the variable if it's missing. Verify: running with `DOTENV_CONFIG_PATH` pointed at an empty file (or with the variable temporarily unset) prints the missing-variable message and makes no request.
- [x] 2.2 Parse the optional args `--date YYYY-MM-DD` (default `2025-10-21`), `--dfn` (default `100965`), `--model`, and `--api-version`, and define the default candidate array. Verify: `node test-ai.js --help` prints usage.

## 3. Encounter context

- [x] 3.1 Load `<dfn>.json` and index `payload.data.items` by domain (from `uid`) and by `uid`. Verify: a debug `--dump-context` flag prints domain counts matching order=65, lab=157, problem=56.
- [x] 3.2 Build the minimized encounter context (demographics as age/gender only, same-day orders, linked labs with a low/high flag, active meds, problems with onset <= date deduplicated, latest vitals <= date, labs from the prior 90 days), and exit non-zero when the date has no orders. Verify: `node test-ai.js --dump-context` shows the BMP labs plus furosemide/carvedilol/lisinopril for 2025-10-21, shows the 2025-10-04 labs under recent history, and the output contains no SSN, address, telecom, ICN, or patient name. `--date 1999-01-01` exits non-zero with a "no orders" message.

## 4. LLM call and reporting

- [x] 4.1 Build the messages per model family (developer + `max_completion_tokens` for o-series; system + `max_tokens`/`temperature` otherwise) with the synthetic framing, format rules, and note skeleton from design.md, taking the headings from one shared constant. Verify: `--dump-prompt` prints the messages, including the skeleton, without calling the API.
- [x] 4.2 Call each candidate in sequence. Classify each outcome as ok / content-filtered / refused / http-<status>, and capture latency, usage, and finish_reason. Never print headers or the key. Verify: `--model does-not-exist --api-version 2025-04-28` reports `http-404` and the script continues to the summary.
- [x] 4.3 Run the local format check (first-line marker, required headings in order with missing/misordered ones named, max line length <= 80, no markdown), save each note to `output/smoke-note-<model>.txt`, print the summary table, and exit 0 only if at least one candidate passes. Verify: the summary table prints with the correct exit code.

## 5. Smoke test run

- [x] 5.1 Run `node test-ai.js` against the real endpoint and review the saved note(s) for clinical plausibility and grounding: cited lab values must match the context. Record the working model/api-version and the outcome in PROJECT-PLAN.md under Task 1. Verify: PROJECT-PLAN.md is updated and at least one candidate shows PASS.
