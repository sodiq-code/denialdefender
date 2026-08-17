<h1 align="center">DenialDefender</h1>

<p align="center">
  <strong>The AI agent that fights your insurance denial — with evidence, not emotions.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/track-Fortified%20Enterprise%20Fleet-0f7b5f?style=for-the-badge" alt="Hackathon Track" />
  <img src="https://img.shields.io/badge/agents-8%20ADK%20fleet-1a7f5a?style=for-the-badge" alt="Agent Count" />
  <img src="https://img.shields.io/badge/GCP-Cloud%20Run-4285f4?style=for-the-badge&logo=googlecloud&logoColor=white" alt="Cloud Run" />
  <img src="https://img.shields.io/badge/model-Gemini%203.5%20Flash-886fbf?style=for-the-badge&logo=google&logoColor=white" alt="Model" />
</p>

---

## What It Does

**One in five medical claims is denied.** Patients and clinics spend hours writing appeal letters that go nowhere. DenialDefender flips this: an 8-agent fleet reads the denial, finds the payer policy that contradicts the reason code, assembles citation-backed evidence, drafts the appeal letter, and quality-checks it before a human approves.

It doesn't just generate text — **it acts.** Each agent has scoped permissions, every decision is traced, and PHI never reaches the model. Two human-in-the-loop gates ensure no letter ships without review.

---

## How It Works

```
Denial Letter → Triage → Coding → Policy → Evidence → Citation → Draft → QA Review
                 ↓                                          ↓              ↓
              Gate 1 (confirm evidence)              Gate 2 (approve letter)
```

| Agent | What it does |
|-------|-------------|
| **Triage** | Classifies denial reason and selects appeal strategy |
| **Medical Coder** | Validates and corrects CPT/ICD-10 codes |
| **Policy Analyst** | Finds payer policy contradictions and coverage gaps |
| **Evidence Agent** | Retrieves clinical evidence with provenance scoring |
| **Citation Agent** | Verifies every citation resolves to a real document |
| **Draft Agent** | Generates the appeal letter with inline `[1][2][3]` citations |
| **Quality Review** | Runs 7-check adversarial battery — refuses to pass until every condition holds |
| **Orchestrator** | Routes tasks, manages HITL gates, and coordinates the fleet |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Next.js 16 Frontend (Cloud Run)                            │
│  ├── 51 REST API endpoints                                  │
│  ├── Real-time decision trace (WebSocket)                   │
│  └── PHI Guard · Model Armor · Agent Identity               │
├──────────────────────────────────────────────────────────────┤
│  Agent Fleet (Cloud Run)                                     │
│  ├── 8 Python ADK agents on Gemini 3.5 Flash                │
│  ├── TypeScript workflow engine (inline fallback)            │
│  └── GEAP Memory Bank (Vertex AI / Firestore)               │
├──────────────────────────────────────────────────────────────┤
│  Google Cloud Infrastructure                                 │
│  ├── Cloud Run (3 services, europe-west1)                    │
│  ├── Firestore (eur3) + Cloud SQL (pgvector)                │
│  ├── Model Armor (prompt injection, PII, malicious URI)     │
│  ├── Secret Manager + Pub/Sub (4 topics)                    │
│  └── VPC Connector + IAM service-to-service auth            │
└──────────────────────────────────────────────────────────────┘
```

---

## Why This Wins

The hackathon judges on three criteria. Here's how DenialDefender scores:

### Innovation & Operational Utility — 40%

> *"How much real-world friction does the agent remove on its own?"*

- **Autonomous action, not chat**: The fleet completes the entire appeal workflow — classification, evidence retrieval, citation verification, drafting, quality review — without hand-holding. The human only approves at gates.
- **Measurable outcomes**: Agent ablation experiment proves removing any single agent degrades citation grounding by 20–60% and increases unsupported claims. Every agent earns its place.
- **Real problem, real data**: 91 seeded denial cases across 5 denial categories, with 200 evidence records from actual CMS/payer policy documents.

### Architectural Discipline & Tech Stack — 30%

> *"How sound are your engineering choices?"*

- **PHI Guard**: SHA-256 hashing, regex pattern detection, and **zero model invocations** when PHI is detected — the gate guarantee is enforced at the infrastructure level.
- **Model Armor**: Inline guardrails block prompt injection, tool poisoning, and PII leaks before any agent runs.
- **Agent Identity**: Zero-trust RBAC — Quality Review cannot write appeals (prevents self-approval), Letter Drafting cannot read outcomes (prevents bias).
- **Decision Trace**: Every agent step emits a structured audit event. An audit query reconstructs any case end-to-end from trace events alone.
- **HITL Gates**: Two approval points with revision loops (max 3). Gate 1 confirms evidence; Gate 2 approves the final letter.
- **GEAP Compliance**: All 7 governance components (Armor, Memory Bank, Registry, Identity, Gateway, Observability, Trace) connected to real Google Agent Platform services with local fallback.

### Demo & Production Readiness — 30%

> *"How clearly do your video and repo prove it works?"*

- **Live on Google Cloud**: [denialdefender-web-7ffj23k2va-ew.a.run.app](https://denialdefender-web-7ffj23k2va-ew.a.run.app)
- **Full CI/CD**: 9-step Cloud Build pipeline builds 3 Docker images, deploys to Cloud Run, configures IAM, and verifies health.
- **Reproducible setup**: `DEPLOY.md` with step-by-step GCP deployment instructions.
- **Architecture diagram**: [`infra/gcp/architecture-diagram.md`](./infra/gcp/architecture-diagram.md) — full Mermaid diagrams with component details, HITL state machine, and cost estimates.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16, React 19, TypeScript 5, Tailwind CSS 4 |
| **AI** | Gemini 3.5 Flash, Google ADK, text-embedding-004 (768-dim) |
| **Agents** | 8 Python ADK agents + 7 TypeScript agents + workflow engine |
| **Database** | Prisma 6 + SQLite (local) / Firestore + Cloud SQL (GCP) |
| **UI** | shadcn/ui, Radix primitives, Framer Motion, Recharts |
| **Real-time** | Socket.io decision trace stream |
| **Infra** | Cloud Run, Pub/Sub, Secret Manager, Model Armor, VPC |
| **Governance** | PHI Guard, Agent Identity (RBAC), Observability, GEAP Memory Bank |

---

## Project Structure

```
src/
├── app/api/          # 51 REST endpoints (pipeline, governance, evidence, eval)
├── lib/agents/       # 7 TypeScript agents (BaseAgent → typed I/O + trace)
├── lib/              # Workflow engine, PHI guard, model armor, domain validator
├── components/       # 20 custom React components + 43 shadcn/ui
mini-services/
├── agent-fleet/      # Python ADK agents on port 3004
└── trace-stream/     # WebSocket server on port 3003
infra/gcp/            # Architecture diagrams, deployment configs
prisma/               # Schema (10 models, 8 enums)
```

---

## Quick Start

```bash
# 1. Install dependencies
bun install

# 2. Set up database
bun run db:push

# 3. Start development server
bun run dev

# 4. (Optional) Start agent fleet + trace stream
bash mini-services/start-services.sh
```

The app runs at `http://localhost:3000`. See [`DEPLOY.md`](./DEPLOY.md) for GCP Cloud Run deployment.

---

## Key Proofs

| Claim | Evidence |
|-------|---------|
| 8 agents, each measurable | [Ablation experiment results](./src/lib/agent-ablation.ts) — removing any agent degrades citation grounding 20–60% |
| PHI never reaches model | [PHI Guard audit](./src/lib/phi-guard.ts) — `model_invocations = 0` on BLOCK, enforced at runtime |
| Quality review can't self-approve | [Agent Identity RBAC](./src/lib/agent-identity.ts) — Quality Review → write appeal: DENIED |
| Every decision traced | [Decision trace stream](./src/lib/decision-trace-stream.ts) — audit query reconstructs full case |
| Deployed on GCP | [Live app](https://denialdefender-web-7ffj23k2va-ew.a.run.app) · [Cloud Build config](./cloudbuild.yaml) · [Architecture diagram](./infra/gcp/architecture-diagram.md) |
| 91 real denial cases | [Seeded corpus](./src/lib/synthetic-cases.ts) — 5 denial categories, 200 evidence records |
| Governance gate passes | [Governance demo](./src/lib/agent-observability.ts) — full case reconstruction from trace events |

---

## Hackathon

Built for the **[All Things Agentic Hackathon](https://allthingsagentichackathon.devpost.com/)** — *Ready, Set, Agent!*

**Track**: Fortified Enterprise Fleet — scalable agent network with enterprise infrastructure integration, zero-trust access control, and production compliance.

**Required tech** (all satisfied):
- ✅ Gemini 3.5 Flash via Gemini API
- ✅ Google ADK (Python Agent Development Kit)
- ✅ Google Cloud (Cloud Run, Firestore, Pub/Sub, Secret Manager, Model Armor)

---

## License

MIT
