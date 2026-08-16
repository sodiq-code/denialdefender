# DenialDefender — GCP Architecture Diagram

> **All Things Agentic Hackathon** — Proof of Production-Readiness
> This diagram shows the full GCP deployment architecture for DenialDefender,
> a multi-agent appeals automation system with HITL governance and PHI protection.

## System Architecture

```mermaid
graph TB
    subgraph Users
        USER["👤 Case Worker<br/>(Hospital Staff)"]
        REVIEWER_HUMAN["👤 Human Reviewer<br/>(HITL Gate Approver)"]
    end

    subgraph "Google Cloud Run — europe-west1"
        WEB["🌐 Cloud Run<br/><b>denialdefender-web</b><br/>Next.js 16 + API<br/>Port 3000<br/>2 vCPU / 1 GiB"]
        AGENTS["🤖 Cloud Run<br/><b>denialdefender-agents</b><br/>Python ADK Fleet<br/>Port 3004<br/>4 vCPU / 2 GiB"]
    end

    subgraph "Agent Fleet (Google ADK)"
        ORCH["🎯 Orchestrator<br/>Task Routing<br/>HITL Gate Mgmt"]
        RESEARCHER["🔍 Researcher Agent<br/>Evidence Retrieval<br/>Citation Verification"]
        DRAFTER["✍️ Drafter Agent<br/>Appeal Letter Gen<br/>Provenance Cards"]
        REVIEWER_AGENT["📋 Reviewer Agent<br/>Quality Scoring<br/>Compliance Checks"]
        PHI_GUARD["🛡️ PHI Guard Agent<br/>PII/PHI Detection<br/>SHA-256 Hashing"]
    end

    subgraph "Google Cloud — Data Layer"
        FIRESTORE["📦 Firestore<br/><b>eur3</b> Multi-Region<br/>Cases · Denials<br/>Traces · HITL Gates"]
        PUBSUB["📨 Pub/Sub<br/>decision_trace<br/>agent_tasks<br/>case_events<br/>gate_events"]
        CLOUDSQL["🗄️ Cloud SQL<br/><b>denialdefender-pg</b><br/>PostgreSQL 16<br/>+ pgvector Extension"]
        SECRET["🔑 Secret Manager<br/>gemini-api-key<br/>phi-guard-config<br/>cloud-sql-conn-string"]
    end

    subgraph "Google Cloud — AI/ML"
        GEMINI["💎 Gemini 3.5 Flash<br/>(Gemini API Free Tier)<br/>Multimodal + 1M Context<br/>Text Generation + Reasoning"]
        EMBED["📐 text-embedding-004<br/>768 Dimensions<br/>Cosine Similarity"]
    end

    subgraph "Real-Time Streaming"
        WS["⚡ WebSocket<br/>Decision Trace<br/>Live Feed<br/>Port 3003"]
    end

    %% User interactions
    USER -->|"Create Case<br/>View Dashboard"| WEB
    REVIEWER_HUMAN -->|"Approve/Reject<br/>HITL Gate"| WEB

    %% Web → Data
    WEB -->|"Read/Write<br/>Case Data"| FIRESTORE
    WEB -->|"Publish<br/>agent_tasks"| PUBSUB
    WEB -->|"Subscribe<br/>decision_trace"| WS

    %% Pub/Sub → Agents
    PUBSUB -->|"Push<br/>Subscription"| AGENTS

    %% Agent Fleet internal
    AGENTS --- ORCH
    ORCH -->|"Route Task"| RESEARCHER
    ORCH -->|"Route Task"| DRAFTER
    ORCH -->|"Route Task"| REVIEWER_AGENT
    ORCH -->|"Route Task"| PHI_GUARD

    %% Agents → Data
    RESEARCHER -->|"Similarity Search<br/>vector(768)"| CLOUDSQL
    DRAFTER -->|"Read Evidence<br/>Citations"| CLOUDSQL
    REVIEWER_AGENT -->|"Write<br/>Quality Score"| FIRESTORE
    PHI_GUARD -->|"Hash PHI<br/>Before Storage"| FIRESTORE

    %% Agents → AI
    RESEARCHER -->|"Embed Query"| EMBED
    DRAFTER -->|"Generate<br/>Appeal Text"| GEMINI
    REVIEWER_AGENT -->|"Score<br/>Compliance"| GEMINI
    PHI_GUARD -->|"Detect PHI<br/>in Text"| GEMINI

    %% Agents → Pub/Sub (trace events)
    AGENTS -->|"Publish<br/>decision_trace"| PUBSUB
    AGENTS -->|"Publish<br/>gate_events"| PUBSUB

    %% Streaming
    PUBSUB -->|"Trace Events"| WS
    WS -->|"SSE/WebSocket"| WEB

    %% Secrets
    SECRET -.->|"API Key"| GEMINI
    SECRET -.->|"Config"| PHI_GUARD
    SECRET -.->|"Conn String"| CLOUDSQL

    %% Styling
    classDef user fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
    classDef cloudrun fill:#fff3e0,stroke:#ef6c00,color:#e65100
    classDef agent fill:#fce4ec,stroke:#c62828,color:#b71c1c
    classDef data fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
    classDef ai fill:#f3e5f5,stroke:#7b1fa2,color:#4a148c
    classDef stream fill:#e0f7fa,stroke:#00838f,color:#006064

    class USER,REVIEWER_HUMAN user
    class WEB,AGENTS cloudrun
    class ORCH,RESEARCHER,DRAFTER,REVIEWER_AGENT,PHI_GUARD agent
    class FIRESTORE,PUBSUB,CLOUDSQL,SECRET data
    class GEMINI,EMBED ai
    class WS stream
```

## Component Details

### Cloud Run Services

| Service | Image | Access | CPU / Memory | Concurrency | Scale |
|---------|-------|--------|--------------|-------------|-------|
| `denialdefender-web` | `gcr.io/.../denialdefender-web:latest` | Public (unauthenticated) | 2 vCPU / 1 GiB | 80 | 0–4 |
| `denialdefender-agents` | `gcr.io/.../denialdefender-agents:latest` | Internal only | 4 vCPU / 2 GiB | 10 | 0–10 |

### Agent Fleet (Google ADK)

| Agent | Role | Gemini Model | HITL Gate |
|-------|------|--------------|-----------|
| **Orchestrator** | Routes tasks, manages workflow state | gemini-3.5-flash | N/A |
| **Researcher** | Evidence retrieval, citation verification | gemini-3.5-flash + text-embedding-004 | Before evidence use |
| **Drafter** | Appeal letter generation with provenance cards | gemini-3.5-flash | Before letter finalization |
| **Reviewer** | Quality scoring, compliance checks | gemini-3.5-flash | Before case submission |
| **PHI Guard** | PII/PHI detection and SHA-256 hashing | gemini-3.5-flash + Presidio | Before any data storage |

### Data Stores

| Store | Type | Location | Purpose |
|-------|------|----------|---------|
| **Firestore** | Document DB | eur3 (multi-region) | Cases, denials, decision traces, HITL gates |
| **Cloud SQL** | PostgreSQL 16 + pgvector | europe-west1 | Evidence embeddings (768-dim), similarity search |
| **Secret Manager** | Encrypted store | global | API keys, connection strings, PHI guard config |

### Pub/Sub Topics

| Topic | Publisher | Subscriber | Purpose |
|-------|-----------|------------|---------|
| `agent_tasks` | Web Service | Agent Fleet (push) | Dispatch agent work |
| `decision_trace` | Agent Fleet | WebSocket Service | Stream trace events to UI |
| `case_events` | Web Service | Agent Fleet | Case lifecycle events |
| `gate_events` | Agent Fleet | Web Service | HITL gate state changes |

### HITL Gates (Human-in-the-Loop)

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

### PHI Guard Pipeline

```mermaid
flowchart LR
    INPUT["Raw Text<br/>(contains PHI)"] --> DETECT["Presidio + Gemini<br/>PHI Detection"]
    DETECT --> HASH["SHA-256 Hashing<br/>of PII/PHI spans"]
    HASH --> REPLACE["Replace PHI<br/>with hash tokens"]
    REPLACE --> STORE["Store Safe Text<br/>in Firestore/CloudSQL"]
    STORE --> MAP["PHI→Hash Mapping<br/>(encrypted, in-memory only)"]

    style INPUT fill:#ffcdd2,stroke:#c62828
    style DETECT fill:#fff9c4,stroke:#f9a825
    style HASH fill:#fff9c4,stroke:#f9a825
    style REPLACE fill:#c8e6c9,stroke:#2e7d32
    style STORE fill:#c8e6c9,stroke:#2e7d32
    style MAP fill:#e1f5fe,stroke:#0277bd
```

### Decision Trace Streaming

```mermaid
sequenceDiagram
    participant User as 👤 Case Worker
    participant Web as 🌐 Cloud Run Web
    participant PS as 📨 Pub/Sub
    participant Agent as 🤖 Agent Fleet
    participant WS as ⚡ WebSocket
    participant FS as 📦 Firestore

    User->>Web: Create Case
    Web->>FS: Write Case (PHI-hashed)
    Web->>PS: Publish agent_tasks
    PS->>Agent: Push subscription

    loop Agent Processing
        Agent->>Agent: Execute step (Research/Draft/Review)
        Agent->>PS: Publish decision_trace event
        PS->>WS: Forward trace event
        WS->>Web: WebSocket push
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
| **Region** | `europe-west1` |
| **Firestore Location** | `eur3` (multi-region) |
| **Service Account** | `json-775@denialdefender.iam.gserviceaccount.com` |
| **VPC Connector** | `dd-vpc-connector` (Cloud SQL access) |

## Deployment Commands

```bash
# Full deployment
bash infra/gcp/cloudrun/deploy.sh

# Web service only
bash infra/gcp/cloudrun/deploy.sh --web-only

# Agent fleet only
bash infra/gcp/cloudrun/deploy.sh --agents-only

# Apply YAML service definitions
gcloud run services replace infra/gcp/cloudrun/nextjs-service.yaml --region europe-west1
gcloud run services replace infra/gcp/cloudrun/agent-fleet-service.yaml --region europe-west1
```

## Cost Estimate (Hackathon / Free Tier)

| Resource | Tier | Monthly Cost |
|----------|------|--------------|
| Cloud Run (web) | 2 vCPU, 1GiB, 0-4 instances | ~$0 (free tier covers 2M requests) |
| Cloud Run (agents) | 4 vCPU, 2GiB, 0-10 instances | ~$0 (scale-to-zero when idle) |
| Firestore | eur3, <1GB reads/writes | ~$0 (free tier) |
| Cloud SQL | db-f1-micro, 10GB SSD | ~$7-15/mo (smallest tier) |
| Pub/Sub | 4 topics, low volume | ~$0 (free tier: 10GB/month) |
| Gemini 3.5 Flash | Gemini API Free Tier | $0 (rate-limited) — $1.50/$9 per 1M tokens (paid) |
| Secret Manager | 3 secrets | ~$0 (free tier: 6 versions) |
| **Total** | | **~$7-15/mo** |
