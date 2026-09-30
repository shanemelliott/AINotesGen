# NotesGenerator

Generates synthetic AI-authored progress notes for VistA test patients: derives historical encounter dates from orders/labs, builds clinical context, creates past appointments, and writes notes to VistA via RPC.

## Planning

This project uses [OpenSpec](openspec/) for spec-driven development. Proposed and in-progress changes live under `openspec/changes/`; completed changes are archived under `openspec/changes/archive/`.

See [PROJECT-PLAN.md](PROJECT-PLAN.md) for the full plan, task breakdown, and current status.

## Setup

```
pnpm install
cp .env.sample .env   # fill in VistA/OpenAI config values
```

See `.env.sample` for required configuration (Vista-API-X, PIV auth via `sts-token/`, clinic/resource IENs, note title IEN).
