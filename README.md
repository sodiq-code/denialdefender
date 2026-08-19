<div align="center">

# DenialDefender

**Evidence-grounded insurance-appeal operations, with humans in control.**

[![Next.js](https://img.shields.io/badge/Next.js_16-000?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript_5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Google ADK](https://img.shields.io/badge/Google_ADK-Python-047857?logo=google&logoColor=white)](https://ai.google.dev/)
[![Gemini](https://img.shields.io/badge/Gemini-3.6-047857?logo=googlecloud&logoColor=white)](https://cloud.google.com/)
[![Cloud Run](https://img.shields.io/badge/Cloud_Run-3_services-047857?logo=googlecloud&logoColor=white)](https://cloud.google.com/run)

**Live demo →** https://denialdefender-web-7ffj23k2va-ew.a.run.app

</div>

---

> DenialDefender does not replace the human. It replaces the hours of work around the human — turning hours of denial triage, policy research, evidence assembly, and appeal drafting into a verified, human-approved appeal package in under 90 seconds.
>
> **Core loop:** Triage → Ground → Assemble → Draft → Verify → Approve → Track → Learn.

An eight-agent ADK fleet with enforced separation of concerns. Each agent holds scoped permissions; durable case state, asynchronous deadline workflows, evidence provenance on every citation, independent quality review, and validated outcome learning turn a one-off generation task into a governed operational system.

**Built for the Fortified Enterprise Fleet:** durable context, scoped identities, audit traces, failure tolerance, and human approval gates.

DenialDefender does not make medical treatment decisions or autonomously submit appeals. It prepares and verifies an evidence-backed appeal package; a human must approve the final output.

No real patient PHI is used. Evidence is grounded in public/authorized healthcare sources; synthetic cases are used for evaluation only.

---

## What It Does

| Step | Agent | Responsibility |
|------|-------|---------------|
| 1 | Patient Advocate | Empathetic intake, urgency assessment, deadline extraction |
| 2 | Denial Triage | Reason code classification, appealability decision, strategy selection |
| 3 | Policy Research | Payer policy contradiction retrieval from evidence corpus |
| 4 | Evidence Assembly | Clinical evidence gathering with provenance tier scoring |
| 5 | Citation Verification | Citation resolution, provenance validation, tier weighting |
| 6 | Letter Drafting | Structured appeal letter with inline `[1][2][3]` citations |
| 7 | Quality Review | Adversarial 7-point battery — refuses to pass until every claim is grounded |
| 8 | Deadline Tracker | Appeal deadline monitoring and escalation |

Two **human-in-the-loop gates**: Gate 1 confirms triage before research, Gate 2 approves the final letter before sending. No letter reaches a payer without explicit human approval.

---

## Three Measured Proofs

### 1. Grounded Evidence Corpus

31 structured files from 10 authoritative public sources: CMS (denial codes, LCD/NCD, SynPUFs, appeal procedures, X12 835 CARC/RARC/CAG/EMDR), KFF, AHA, GAO, HHS, OIG, Health Affairs, Noridian, and Medicare Appeals. Every record is SHA-256 hashed, provenance-tiered, and frozen. Patient cases are synthetic by design; the institutional knowledge grounding them is real and authoritative.

### 2. Measured Outcome Learning

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Top-3 argument accuracy | 70% | 88% | +18 |
| Citation grounding | 75% | 89% | +14 |

10 held-out cases, 50 outcome records (5 public + 45 synthetic controlled), honest delta reporting. Negative deltas are reported, not hidden.

### 3. Enforced Governance

| Mechanism | Proof |
|-----------|------|
| PHI Guard | 10-pattern classifier runs **before** model invocation. On BLOCK: `modelInvocations === 0` — verified in audit log |
| Agent Identity | Runtime RBAC with 4 enforced violations (e.g., Quality Review cannot WRITE appeals) |
| Domain Validator | 20 automated rules from CMS X12 / 42 CFR / AMA CPT — all pass |
| Citation Honesty | Classifier reports `rule-based-classifier-v1`, not a model |

---

## Architecture

```
                    DENIALDEFENDER
                         |
        +----------------+----------------+
        |                |                |
    EVIDENCE          AGENTS         GOVERNANCE
  31 files          8 ADK agents    PHI Guard
  10 sources        Bun + Gemini    Model Armor
  SHA-256           3.6             Agent Identity
  provenance-tied                    Decision Trace
        +----------------+----------------+
                         |
              Gate 1 → Ground → Draft → Verify → Gate 2
                         |
              Human-Approved Appeal + Deadline
                         |
              Outcome Learning → updates retrieval
```

**Deployment** — 2 Cloud Run services + 1 local mini-service (`europe-west1`):
- `denialdefender-web` (Next.js 16, 56 API routes, premium emerald/teal UI)
- `denialdefender-agents` (8 ADK agents, Gemini 3.6 via Vertex AI global endpoint)
- `trace-stream` (Socket.io real-time decision trace)

**GCP config:** `GCP_REGION=europe-west1`, `GEMINI_PROVIDER=vertex_ai`, `ADK_FRAMEWORK=google-adk`, `GEMINI_MODEL=gemini-3.6-flash`, `FIRESTORE_LOCATION=eur3`.

---

## How to Verify

| Claim | File or Endpoint |
|-------|-----------------|
| 31 evidence files from 10 sources | `data/corpus/raw/` + `manifest.json` |
| PHI Guard zero-invocation enforcement | `src/lib/phi-guard.ts` — `modelInvocations === 0` on BLOCK |
| 4 Agent Identity violations | `src/lib/agent-identity.ts` — `DEMONSTRATION_VIOLATIONS` |
| 20 domain rules, all pass | `src/lib/domain-validator.ts` — `/api/domain-validation` |
| Ablation experiment | `src/lib/agent-ablation.ts` — `/api/eval/ablation` |
| Before/after learning loop | `src/lib/before-after-experiment.ts` — `/api/eval/before-after` |
| 10 held-out eval cases | `data/cases/held_out/` |
| 8 Python ADK agents | `mini-services/agent-fleet/agents/` |
| HITL gates | `/api/full-pipeline/gate-test`, `/api/full-pipeline/gate2` |
| Live Gemini 3.6 | `/api/health` (mockMode: false), `/api/agents/triage` |
| Citation grounding | `/api/full-pipeline/resume` — quality review 5/5 citations verified |

---

## Getting Started

```bash
bun install && bun run db:push && bun run dev   # localhost:3000
bash mini-services/start-services.sh             # agent fleet + trace stream
```

Set `GEMINI_API_KEY` for live agents. Without it, agents run in mock mode with deterministic responses. See [`DEPLOY.md`](./DEPLOY.md) for GCP deployment.

### Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `file:./db/custom.db` | SQLite (local) / Turso (cloud) |
| `GEMINI_API_KEY` | — | Gemini API key (AI Studio fallback) |
| `AGENT_FLEET_URL` | — | Deployed agent-fleet service URL |
| `NEXT_PUBLIC_TRACE_STREAM_URL` | — | Deployed trace-stream service URL |
| `GCP_PROJECT_ID` | — | GCP project for Vertex AI |
| `GCP_REGION` | `europe-west1` | Vertex AI region |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Model id (3.x → global endpoint) |
| `GEMINI_PROVIDER` | `vertex_ai` | Provider |
| `ADK_FRAMEWORK` | `google-adk` | Agent framework |

---

## API Surface (56 routes)

- **Pipeline** — `/api/full-pipeline`, `/resume`, `/gate2`, `/gate-test`, `/api/six-agent-pipeline/*`, `/api/three-agent-pipeline/*`, `/api/vertical-slice/*`, `/api/workflow`, `/api/agents/[...path]`
- **Cases** — `/api/cases`, `/api/cases/[id]`, `/denial`, `/gates`, `/trace`, `/api/seed`
- **Evidence** — `/api/evidence`, `/corpus`, `/search`, `/embed`, `/retrieve`, `/api/test-letters`
- **Governance** — `/api/phi-guard/*`, `/api/governance/{armor,identity,observability,memory-bank,registry,platform,demo,verify}`, `/api/domain-validation`, `/api/citation-classifier`, `/api/phrase-discipline`
- **Eval & Learning** — `/api/eval`, `/snapshot`, `/determinism`, `/before-after`, `/ablation`, `/api/outcome-ingest`, `/api/outcome-learning`, `/api/demo/two-case`, `/api/execution-paths/*`, `/api/demo-dry-run`
- **NPI** — `/api/npi-lookup`, `/validate`
- **System** — `/api/health`, `/api/config`

---

## Deployment (GCP Cloud Run)

Three services in `europe-west1`:

| Service | URL | Resources |
|---------|-----|-----------|
| `denialdefender-web` | https://denialdefender-web-7ffj23k2va-ew.a.run.app | 2 vCPU / 1 GiB / 0-4 instances |
| `denialdefender-agents` | https://denialdefender-agents-7ffj23k2va-ew.a.run.app | 4 vCPU / 2 GiB / 0-10 (internal, Gemini 3.6) |
| `denialdefender-trace-stream` | https://denialdefender-trace-stream-7ffj23k2va-ew.a.run.app | 1 vCPU / 512 MiB / 0-2 |

CI/CD via Cloud Build (`cloudbuild.yaml`) + GitHub Actions (`.github/workflows/deploy.yml`). See [`DEPLOY.md`](./DEPLOY.md).

### Model selection

The deployment uses `gemini-3.6-flash` (Vertex AI **global** endpoint — 3.x models are global-only). To switch models:

```bash
gcloud run services update denialdefender-agents --region=europe-west1 \
  --update-env-vars=GEMINI_MODEL=gemini-3.6-flash
```

---

## Premium UI

- **8 tabs:** Dashboard, New Appeal, Cases, Evidence, Trace, Governance, Learning, Ablation
- **Emerald/teal defender palette** (no blue/indigo), dark mode, glass sticky header
- **Live badges:** Gemini Connected, Trace Live, GCP, 8 agents (no Mock indicators)
- **Clickable citation chips** `[1][2][3]` in the appeal letter → popover with provenance card (source, document, SHA-256 hash, claim text, tier)
- **Sticky footer** with compliance disclaimer
- **Responsive** mobile-first design

---

## Hackathon

Built for the [**All Things Agentic Hackathon**](https://allthingsagentichackathon.devpost.com/) — **Fortified Enterprise Fleet** track.

> Insurance denial appeals are healthcare-adjacent, compliance-heavy, unglamorous — precisely why they matter. The gap is not medical; it is procedural.

Eight cataloged agents with scoped identities, durable async state, ablation-justified delegation, defense-in-depth security, and event-driven failure tolerance — directly addressing every Fleet requirement.

**GEAP**: ADK · Model Armor · Agent Identity · Observability · Memory Bank

---

## License

[MIT](./LICENSE)
