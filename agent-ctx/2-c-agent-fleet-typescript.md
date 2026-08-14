# Task 2-c: TypeScript/Bun Agent Fleet Mini-Service

## Summary
Created a TypeScript/Bun replacement for the Python uvicorn agent fleet service on port 3004. This is more robust because Bun is the primary runtime in this sandbox environment.

## Files Created/Modified
- `mini-services/agent-fleet/package.json` — Updated to use `bun --hot index.ts` instead of Python uvicorn
- `mini-services/agent-fleet/index.ts` — Full Bun HTTP server (~580 lines)

## Key Design Decisions
1. **Mock data first**: All 8 agents return structured mock data instantly without any Python dependency
2. **Python subprocess fallback**: When GEMINI_API_KEY is set, workflow requests spawn a Python subprocess to run the real orchestrator with 60-second timeout
3. **Exact API parity**: All mock data structures match the Python agents' output exactly for seamless frontend compatibility
4. **CORS support**: All responses include CORS headers for localhost:3000 and localhost:3004
5. **In-memory workflow store**: Track workflow status per case_id

## Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Service health check (shows runtime: "bun") |
| POST | /agents/triage | Triage agent (mock) |
| POST | /agents/evidence | Evidence agent (mock) |
| POST | /agents/drafter | Draft agent (mock) |
| POST | /agents/reviewer | Reviewer agent (mock) |
| POST | /agents/coder | Medical coder agent (mock) |
| POST | /agents/policy | Policy analyst agent (mock) |
| POST | /agents/citation | Citation agent (mock) |
| POST | /agents/orchestrator | Orchestrator (delegates to workflow) |
| POST | /workflow/run | Full 8-agent workflow |
| GET | /workflow/status/:case_id | Stored workflow status |
| GET | /gcp/status | GCP Firestore + Pub/Sub status |

## Test Results
All 13 endpoints tested and working correctly:
- Health, 7 individual agents, orchestrator, workflow run, workflow status, GCP status, 404
- NOT_APPEALABLE path: stops at triage with HITL gate_1
- APPEALABLE path: full pipeline with HITL gate_2
