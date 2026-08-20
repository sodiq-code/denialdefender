# DenialDefender — GCP Architecture Diagram

> **All Things Agentic Hackathon** — Proof of Production-Readiness
> This diagram shows the full GCP deployment architecture for DenialDefender,
> a multi-agent appeals automation system with HITL governance and PHI protection.

## System Architecture

```mermaid
graph TB
    subgraph Users
        USER["Case Worker<br/>(Hospital Staff)"]
        REVIEWER_HUMAN["Human Reviewer<br/>(HITL Gate Approver)"]
    end

    subgraph "Google Cloud Run — europe-west1"
        WEB["Cloud Run<br/><b>denialdefender-web</b><br/>Next.js 16 + API<br/>Port 8080<br/>2 vCPU / 1 GiB"]
        AGENTS["Cloud Run<br/><b>denialdefender-agents</b><br/>Bun agent fleet (8 agents)<br/>Port 8080<br/>4 vCPU / 2 GiB"]
        TRACE["Cloud Run<br/><b>denialdefender-trace-stream</b><br/>Socket.io<br/>Port 8080<br/>1 vCPU / 512 MiB"]
    end

    subgraph "Agent Fleet (google-adk)"
        ORCH["Orchestrator<br/>Task Routing<br/>HITL Gate Mgmt"]
        TRIAGE["Triage Agent<br/>Denial classification"]
        CODER["Coder Agent<br/>CPT/ICD-10 validation"]
        POLICY["Policy Agent<br/>Payer policy research"]
        EVIDENCE["Evidence Agent<br/>Evidence assembly"]
        CITATION["Citation Agent<br/>Citation verification"]
        DRAFTER["Drafter Agent<br/>Appeal letter generation"]
        REVIEWER_AGENT["Reviewer Agent<br/>Quality scoring"]
    end

    subgraph "Google Cloud — Data Layer"
        FIRESTORE["Firestore<br/><b>eur3</b> Multi-Region<br/>Cases · Denials<br/>Traces · HITL Gates"]
        PUBSUB["Pub/Sub<br/>decision_trace<br/>agent_tasks<br/>case_events<br/>gate_events"]
        SECRET["Secret Manager<br/>gemini-api-key<br/>phi-guard-config"]
    end

    subgraph "Google Cloud — AI/ML"
        GEMINI["Gemini 3.6 Flash<br/>(Vertex AI provider)<br/>google-adk framework<br/>Text generation + reasoning"]
        EMBED["text-embedding-004<br/>768 Dimensions<br/>Cosine similarity"]
        ARMOR["Model Armor<br/>dd-model-armor policy<br/>Prompt injection +<br/>Jailbreak detection"]
    end

    %% User interactions
    USER -->|"Create Case<br/>View Dashboard"| WEB
    REVIEWER_HUMAN -->|"Approve/Reject<br/>HITL Gate"| WEB

    %% Web → Data + WS
    WEB -->|"Read/Write Case Data"| FIRESTORE
    WEB -->|"Publish agent_tasks"| PUBSUB
    WEB -->|"Subscribe trace events"| TRACE
    WEB -->|"POST /agents/*"| AGENTS

    %% Pub/Sub → Agents
    PUBSUB -->|"Push<br/>Subscription"| AGENTS

    %% Agent Fleet internal
    AGENTS --- ORCH
    ORCH -->|"Route Task"| TRIAGE
    ORCH -->|"Route Task"| CODER
    ORCH -->|"Route Task"| POLICY
    ORCH -->|"Route Task"| EVIDENCE
    ORCH -->|"Route Task"| CITATION
    ORCH -->|"Route Task"| DRAFTER
    ORCH -->|"Route Task"| REVIEWER_AGENT

    %% Agents → AI
    TRIAGE -->|"Classify"| GEMINI
    DRAFTER -->|"Generate<br/>Appeal Text"| GEMINI
    REVIEWER_AGENT -->|"Score<br/>Compliance"| GEMINI
    EVIDENCE -->|"Embed Query"| EMBED

    %% Safety shield
    GEMINI -.->|"Filtered by"| ARMOR
    EMBED -.->|"Filtered by"| ARMOR

    %% Agents → Pub/Sub (trace events)
    AGENTS -->|"Publish<br/>decision_trace"| PUBSUB
    AGENTS -->|"Publish<br/>gate_events"| PUBSUB

    %% Streaming
    PUBSUB -->|"Trace Events"| TRACE
    TRACE -->|"WebSocket push"| WEB

    %% Secrets
    SECRET -.->|"API Key"| GEMINI
    SECRET -.->|"Config"| ARMOR
```

## Component Details

### Cloud Run Services

| Service | Image | Access | CPU / Memory | Concurrency | Scale |
|---------|-------|--------|--------------|-------------|-------|
| `denialdefender-web` | `europe-west1-docker.pkg.dev/.../denialdefender-web:latest` | Public (unauthenticated) | 2 vCPU / 1 GiB | 80 | 0–4 |
| `denialdefender-agents` | `europe-west1-docker.pkg.dev/.../denialdefender-agents:latest` | Internal only | 4 vCPU / 2 GiB | 10 | 0–10 |
| `denialdefender-trace-stream` | `europe-west1-docker.pkg.dev/.../trace-stream:latest` | Public (unauthenticated) | 1 vCPU / 512 MiB | 80 | 0–2 |

### Agent Fleet (Google ADK — `ADK_FRAMEWORK=google-adk`)

| Agent | Role | Primary Resource | HITL Gate |
|-------|------|------------------|-----------|
| **Orchestrator** | Routes tasks, manages workflow state | case (write) | N/A |
| **Triage** | Denial classification + strategy | denial (write) | Gate 1 (if NOT_APPEALABLE) |
| **Coder** | CPT/ICD-10 validation | denial (write) | — |
| **Policy** | Payer policy research + contradictions | policy (execute) | — |
| **Evidence** | Evidence assembly + retrieval | evidence (write) | — |
| **Citation** | Citation verification + provenance | citation (write) | — |
| **Drafter** | Appeal letter generation | appeal (write) | Gate 2 (before submission) |
| **Reviewer** | Quality scoring + compliance | citation (write) | — |

### Data Stores

| Store | Type | Location | Purpose |
|-------|------|----------|---------|
| **Firestore** | Document DB | eur3 (multi-region) | Cases, denials, decision traces, HITL gates |
| **Secret Manager** | Encrypted store | global | API keys, configs |
| **Prisma SQLite (sandbox)** | Relational | local file | Local-dev replacement for Firestore |

### Pub/Sub Topics

| Topic | Publisher | Subscriber | Purpose |
|-------|-----------|------------|---------|
| `agent_tasks` | Web Service | Agent Fleet (push) | Dispatch agent work |
| `decision_trace` | Agent Fleet | Trace Stream | Stream trace events to UI |
| `case_events` | Web Service | Agent Fleet | Case lifecycle events |
| `gate_events` | Agent Fleet | Web Service | HITL gate state changes |

## HITL Gates (Human-in-the-Loop)

```mermaid
stateDiagram-v2
    [*] --> Pending: Agent completes work
    Pending --> Approved: Human reviews & approves
    Pending --> Rejected: Human reviews & rejects
    Rejected --> Pending: Agent revises & resubmits
    Approved --> Applied: System applies decision
    Applied --> [*]

    note right of Pending: Awaiting human review
    note right of Approved: Decision ratified
    note right of Rejected: Needs revision
```

### Gate 1 — Triage Escalation
When the Triage agent classifies a denial as `NOT_APPEALABLE`, the workflow
pauses and a Gate 1 HITL review is created. A human reviewer decides whether
to override the triage classification and proceed with the appeal.

### Gate 2 — Letter Approval
Before the appeal letter is submitted to the payer, a Gate 2 HITL review
holds the letter for human approval. The reviewer can approve, reject
(request revision), or escalate.

## PHI Guard Pipeline

```mermaid
flowchart LR
    INPUT["Raw Text<br/>(contains PHI)"] --> DETECT["Pattern + Model<br/>PHI Detection"]
    DETECT --> HASH["SHA-256 Hashing<br/>of PII/PHI spans"]
    HASH --> REPLACE["Replace PHI<br/>with hash tokens"]
    REPLACE --> STORE["Store Safe Text<br/>in Firestore/SQLite"]
    STORE --> MAP["PHI → Hash mapping<br/>(encrypted, in-memory only)"]

    style INPUT fill:#ffcdd2,stroke:#c62828
    style DETECT fill:#fff9c4,stroke:#f9a825
    style HASH fill:#fff9c4,stroke:#f9a825
    style REPLACE fill:#c8e6c9,stroke:#2e7d32
    style STORE fill:#c8e6c9,stroke:#2e7d32
    style MAP fill:#e1f5fe,stroke:#0277bd
```

## Decision Trace Sequence

```mermaid
sequenceDiagram
    participant User as Case Worker
    participant Web as Cloud Run Web
    participant PS as Pub/Sub
    participant Agent as Agent Fleet
    participant TS as Trace Stream
    participant FS as Firestore

    User->>Web: Create Case
    Web->>FS: Write Case (PHI-hashed)
    Web->>PS: Publish agent_tasks
    PS->>Agent: Push subscription

    loop Agent Processing
        Agent->>Agent: Execute step (Triage / Draft / Review)
        Agent->>PS: Publish decision_trace event
        PS->>TS: Forward trace event
        TS->>Web: WebSocket push
        Web->>User: Live trace feed update
    end

    Agent->>PS: Publish gate_events (HITL required)
    PS->>Web: Gate event
    Web->>User: Show HITL gate for approval

    User->>Web: Approve gate
    Web->>FS: Update gate status → approved
    Web->>PS: Publish case_events (proceed)
```

## GCP Project Configuration

| Property | Value |
|----------|-------|
| **Project ID** | `denialdefender` |
| **Project Number** | `315133452553` |
| **Region** | `europe-west1` |
| **Firestore Location** | `eur3` (multi-region) |
| **Runtime Service Account** | `dd-runtime@denialdefender.iam.gserviceaccount.com` |
| **VPC Connector** | `dd-vpc-connector` |
| **LLM Provider** | `GEMINI_PROVIDER=vertex_ai` |
| **ADK Framework** | `ADK_FRAMEWORK=google-adk` |
| **Gemini Model** | `gemini-3.6-flash` |

## Deployment Commands

```bash
# Full deployment (all 3 services)
bash infra/gcp/cloudrun/deploy.sh

# Individual service deployment
bash infra/gcp/cloudrun/deploy.sh --web-only
bash infra/gcp/cloudrun/deploy.sh --agents-only
bash infra/gcp/cloudrun/deploy.sh --trace-only

# Apply Knative Service YAMLs
gcloud run services replace infra/gcp/cloudrun/nextjs-service.yaml --region europe-west1
gcloud run services replace infra/gcp/cloudrun/agent-fleet-service.yaml --region europe-west1

# CI/CD (auto on push to main)
# .github/workflows/deploy.yml
```

## Cost Estimate (Hackathon / Free Tier)

| Resource | Tier | Monthly Cost |
|----------|------|--------------|
| Cloud Run (web) | 2 vCPU, 1 GiB, 0-4 instances | ~$0 (free tier covers 2M requests) |
| Cloud Run (agents) | 4 vCPU, 2 GiB, 0-10 instances | ~$0 (scale-to-zero when idle) |
| Cloud Run (trace-stream) | 1 vCPU, 512 MiB, 0-2 instances | ~$0 (scale-to-zero when idle) |
| Firestore | eur3, <1 GB reads/writes | ~$0 (free tier) |
| Pub/Sub | 4 topics, low volume | ~$0 (free tier: 10 GB/month) |
| Gemini 3.6 Flash | Vertex AI | ~$0 (free tier) — paid: per Vertex AI pricing per 1M tokens |
| Secret Manager | 2 secrets | ~$0 (free tier: 6 versions) |
| Model Armor | dd-model-armor policy | ~$0 (free tier: 1,000 requests/month) |
| **Total** | | **~$0-15/mo** |
