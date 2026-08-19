# DenialDefender — agent-fleet mini-service

A standalone **Bun** service that mirrors the HTTP contract of the reference
Python (FastAPI + google-genai) agent fleet, running in **MOCK mode** in the
sandbox (no `GEMINI_API_KEY` required — outputs are deterministic).

- **Port**: `3004` (hardcoded — never read from env)
- **Mode**: `MOCK_MODE = true` (set `GEMINI_API_KEY` to flag live mode, but the
  sandbox still returns deterministic outputs — the Next.js inline workflow
  engine handles any "live" Gemini calls)
- **Health**: `GET /health`
- **Agents**: `POST /agents/{triage|coder|policy|evidence|citation|drafter|reviewer|orchestrator}`
- **Workflow**: `POST /workflow/run`, `GET /workflow/status/:id`
- **Permissions**: `GET /permissions` — the agent-identity RBAC matrix
- **GCP status**: `GET /gcp/status` — probes local SQLite + trace-stream as
  Firestore/Pub/Sub equivalents

## Run

```bash
bun install   # no deps required — uses Bun built-ins
bun run dev   # bun --hot index.ts
```

## AgentResponse shape

```json
{
  "agent": "triage",
  "status": "success",
  "data": { ... },
  "latencyMs": 1,
  "trace": { "agent": "triage", "trace_id": "...", "mode": "mock", "elapsed_seconds": 0.001 }
}
```

The mock data generators mirror the reference Python agents so the platform
behaves the same end-to-end.
