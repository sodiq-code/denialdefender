# DenialDefender

**1 in 7 insured Americans get a claim denied each year. Appeals win 50–75% of the time — but most patients don't know how to write one.** DenialDefender is a 6-agent pipeline that reads your denial letter, finds the payer policy that contradicts the reason code, assembles citation-backed evidence, and drafts an appeal letter ready for human review.

> The agent that fights your insurance company for you.

---

**Live demo**: [denialdefender-web-7ffj23k2va-ew.a.run.app](https://denialdefender-web-7ffj23k2va-ew.a.run.app)

[![Next.js](https://img.shields.io/badge/Next.js_16-App_Router-000?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript_5-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_4-oklch-06b6d4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Bun](https://img.shields.io/badge/Bun-runtime-fbf1df?logo=bun&logoColor=black)](https://bun.sh/)
[![Google ADK](https://img.shields.io/badge/Google_ADK-Python-4285f4?logo=google&logoColor=white)](https://ai.google.dev/)
[![Cloud Run](https://img.shields.io/badge/GCP-Cloud_Run-4285f4?logo=googlecloud&logoColor=white)](https://cloud.google.com/run)

---

## What It Does

- **Parses denial letters** — classifies reason codes, identifies appealable denials vs. patient responsibility
- **Retrieves payer policy** — finds coverage contradictions and prior auth requirements from the evidence corpus
- **Assembles evidence** — pulls citation-backed records from 150+ provenance-tagged sources (CMS, AHA, KFF, GAO)
- **Drafts appeal letters** — generates structured letters with inline `[1][2][3]` citations and provenance tiers
- **Quality-gates the output** — adversarial review agent refuses to pass until every citation resolves and every claim is grounded

---

## How It Works

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Patient     │───▶│  Denial      │───▶│  Policy      │
│  Advocate    │    │  Triage      │    │  Research    │
└──────────────┘    └──────┬───────┘    └──────┬───────┘
                           │  Gate 1 ⚡          │
┌──────────────┐    ┌──────▼───────┐    ┌──────▼───────┐
│  Quality     │◀───│  Letter      │◀───│  Evidence    │
│  Review      │    │  Drafting    │    │  Assembly    │
└──────────────┘    └──────────────┘    └──────────────┘
        │  Gate 2 ⚡
        ▼
   Approved Letter
```

Two **human-in-the-loop gates** — Gate 1 confirms evidence before drafting, Gate 2 approves the final letter before sending. Revision loops (max 3) let clinicians request changes.

---

## Architecture

**Evidence · Agents · Governance** — the triad that makes this work.

**Evidence** — 150+ provenance-tagged records from public sources (CMS, AHA, KFF, GAO). Citation classifier scores each reference by tier (regulatory → clinical → payer). No synthetic data.

**Agents** — 8 Python ADK agents (Gemini 3.5 Flash) + 7 TypeScript agents with inline fallback. Each agent has scoped permissions via Agent Identity RBAC — Quality Review cannot write appeals (prevents self-approval). Agent ablation experiment proves removing any single agent degrades citation grounding by 20–60%.

**Governance** — PHI Guard (SHA-256 + regex, **zero model invocations** on sensitive data), Model Armor (prompt injection / PII / malicious URI), Decision Trace (every step emits a structured audit event), Phrase Discipline (prevents fabricated citations in output).

```
Next.js 16 Frontend (Cloud Run)     Agent Fleet (Cloud Run)        GCP Infra
├─ 51 REST endpoints                ├─ 8 Python ADK agents         ├─ Cloud Run (3 services)
├─ Real-time decision trace         ├─ TypeScript workflow engine   ├─ Firestore + Cloud SQL
└─ PHI Guard · Model Armor         └─ GEAP Memory Bank            └─ Model Armor · Pub/Sub · IAM
```

---

## Key Features

- 🔒 **PHI Guard** — pre-invoke classifier guarantees sensitive data never reaches the model
- 🛡️ **Model Armor** — blocks prompt injection, PII leaks, and tool poisoning before any agent runs
- 👁️ **Human-in-the-loop** — two approval gates with revision loops at critical pipeline stages
- 📊 **Agent ablation** — experiment proving each agent is necessary, not just a bigger model
- 🔄 **Outcome learning** — appeal results feed back to memory bank, improving future appeals
- 🔍 **Citation provenance** — every reference tracked to source (CMS, AHA, KFF, GAO) with tier scoring
- 🏥 **NPI Registry** — real-time provider verification via CMS NPI lookup

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui |
| Agents | Google ADK (Python) + Gemini 3.5 Flash + TypeScript workflow engine |
| Database | Prisma 6 + SQLite (local) / Firestore + Cloud SQL (GCP) |
| Infra | Cloud Run (europe-west1), Model Armor, Pub/Sub, Secret Manager |
| Governance | PHI Guard, Agent Identity (RBAC), Decision Trace, GEAP Memory Bank |

---

## Getting Started

```bash
# Install dependencies
bun install

# Set up database
bun run db:push

# Start dev server (localhost:3000)
bun run dev

# (Optional) Start agent fleet + trace stream
bash mini-services/start-services.sh
```

Set `GEMINI_API_KEY` to connect live agents. Without it, agents run in mock mode with simulated responses.

See [`DEPLOY.md`](./DEPLOY.md) for GCP Cloud Run deployment.

---

## Hackathon

Built for the [**All Things Agentic Hackathon**](https://allthingsagentichackathon.devpost.com/) — *Ready, Set, Agent!*

**Track**: Fortified Enterprise Fleet — multi-agent architecture with enterprise governance, zero-trust access control, and production compliance.

---

## License

MIT
