# Design

## Context

- `../VAOSAI/openaiClient.js` is the known-working client. It uses axios POST to the VA APIM deployment URL with an `api-key` header, `o3-mini` @ `2025-04-28`, and a single `user` message.
- `vista-notes/openaiClient.js` has the same shape but uses `gpt-4o` @ `2024-02-15-preview`. It's unverified.
- The patient data is the VPR JSON in `100965.json` (`payload.data.items[]`, domain taken from `uid`). Orders link to results through `results[].uid`. PSO order results point to `med` uids.
- There are no vitals on 2025-10-21, so "most recent vitals on or before" will pull from an earlier date.

## Goals / Non-Goals

**Goals:**
- A single self-contained script you can run with `node test-ai.js` and get the answer from one run.
- Keep the prompt construction and data filtering simple enough to lift into the real generator later.

**Non-Goals:**
- Reusable modules and abstractions. Those come with PROJECT-PLAN Task 2/3.
- Retries/backoff beyond reporting a 429.

## Decisions

1. **One file, no framework.** `test-ai.js` at the repo root, using `axios` + `dotenv`, which matches VAOSAI. *Alternative:* copy VAOSAI `openaiClient.js` unchanged. Rejected because it swallows error bodies (we need the content-filter details) and hardcodes one api-version.

2. **Candidates as a data array** at the top of the file: `[{ model: 'o3-mini', apiVersion: '2025-04-28' }, { model: 'gpt-4o', apiVersion: '2024-02-15-preview' }]`. You can override them from the CLI with `--model <m> --api-version <v>` for ad-hoc probes. The run is sequential, not parallel, so the output reads cleanly.

3. **Message roles per model family.** o-series models (`o1`/`o3*`) get the instructions in a `developer` message and use `max_completion_tokens`, with no `temperature`. Other models get a `system` message, `max_tokens`, and `temperature: 0.4`. This avoids known 400s on o-series. *Alternative:* put everything in one `user` message, as VAOSAI does. That's kept as the fallback if a `developer`/`system` message is rejected.

4. **Prompt framing.** The system/developer message states explicitly that this is synthetic documentation for a fictional patient in a VA test system. It lists the format rules from the spec and forbids inventing labs that aren't provided. It includes the skeleton below as the required layout. The user message is compact JSON of the encounter context. Stating the fictional/test purpose up front makes refusals less likely.

   ```
   *** SYNTHETIC TEST NOTE - FICTIONAL PATIENT - NOT FOR CLINICAL USE ***
   VISIT DATE: 10/21/2025   CLINIC: GENERAL MEDICINE   TYPE: Follow-up
   CHIEF COMPLAINT:
   SUBJECTIVE:
   OBJECTIVE:
   ASSESSMENT:
   1. ...
   PLAN:
   1. ...
   ```

   The format check uses the same heading list as a single constant, so the prompt and the check can't drift apart.

5. **Context shaping.** Each record is reduced to a few fields:
   - labs: `name`, `result`, `units`, `low`, `high`, `observed`, flag
   - orders: `name`, `service`, `status`
   - meds: `name`, `sig`, `status`
   - problems: `text`, `onset`, `status`
   - vitals: `type`, `result`, `units`, `observed`

   Age comes from `dateOfBirth`; the name, SSN, address, telecom, and ICN are never read into the payload. This keeps the token count small and meets the data-minimization requirement.

6. **Result classification.** For each candidate the outcome is one of:
   - `ok`: 200 with content
   - `content-filtered`: HTTP 400 with `error.code === 'content_filter'`, or `finish_reason === 'content_filter'`
   - `refused`: 200 but the content matches a short refusal regex such as "I can't/cannot help"
   - `http-<status>`: any other error

   The error message from `error.response.data.error.message` is printed, since it's API output rather than a secret. Request headers are never printed.

7. **Format check** runs locally on the returned text: first-line marker, required headings present in order, max line length, and a markdown regex. A candidate counts as PASS only if its outcome is `ok` and the format check passes. The script also writes the raw note to `output/smoke-note-<model>.txt` so you can review it. `output/` is added to `.gitignore`.

## Risks / Trade-offs

- [The `gpt-4o` deployment name or api-version isn't available on the APIM] → It's reported as `http-404`/`http-400`. Other candidates still run.
- [The content filter flags clinical text (for example abuse or violence problems in history)] → The filter category is reported, and the prompt or problem filtering is adjusted in a follow-up change.
- [o3-mini spends tokens on hidden reasoning and hits the limit before writing any output] → Set `max_completion_tokens` generously (4000) and report `finish_reason: length` explicitly.
- [The model invents values] → A spec scenario checks cited labs. For the smoke test this is a manual review of the saved note.
- [Loading `../VAOSAI/.env` into `process.env` also exposes its DB credentials to the process] → Only `AZURE_OPENAI_API_KEY` is read. Nothing else from `process.env` is logged.
