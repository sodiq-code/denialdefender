# DenialDefender — GCP Deployment Guide

Complete step-by-step guide to deploy DenialDefender to Google Cloud Platform (Cloud Run).

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **gcloud CLI** | Latest | `curl -fsSL https://sdk.cloud.google.com \| bash` |
| **Docker** | 24+ | [docker.com/get-docker](https://docs.docker.com/get-docker/) |
| **Node.js** | 20+ | `nvm install 20` or [nodejs.org](https://nodejs.org/) |
| **Bun** | 1.1+ | `curl -fsSL https://bun.sh/install \| bash` |
| **Firebase CLI** | Latest | `npm i -g firebase-tools` |

Verify everything is installed:

```bash
gcloud --version
docker --version
node --version
bun --version
firebase --version
```

---

## Step 1: Authenticate with GCP

### Option A: Service Account Key (CI/CD, automated)

```bash
# The service account key is already at:
# infra/gcp/denialdefender-sa-key.json

gcloud auth activate-service-account \
  --key-file=infra/gcp/denialdefender-sa-key.json

gcloud config set project denialdefender
gcloud config set compute/region europe-west1
```

### Option B: Interactive Login (local development)

```bash
gcloud auth login
gcloud config set project denialdefender
gcloud config set compute/region europe-west1
```

Verify authentication:

```bash
gcloud auth list
gcloud config configurations list
```

---

## Step 2: Run the Bootstrap Script

The bootstrap script creates all required GCP infrastructure:

```bash
# Full bootstrap (takes ~15 minutes due to Cloud SQL provisioning)
bash infra/gcp/bootstrap.sh

# Or skip Cloud SQL if it already exists:
bash infra/gcp/bootstrap.sh --skip-sql

# Or skip specific steps:
bash infra/gcp/bootstrap.sh --skip-sql --skip-vpc --skip-iam

# Skip Model Armor if not needed:
bash infra/gcp/bootstrap.sh --skip-armor
```

### What the Bootstrap Creates

| Resource | Name | Details |
|----------|------|---------|
| **APIs** | 19 APIs | Cloud Run, Firestore, Cloud SQL, Pub/Sub, Secret Manager, Vertex AI, Model Armor, etc. |
| **Firestore** | (default) | Native mode, eur3 (EU multi-region) |
| **Cloud SQL** | denialdefender-pg | PostgreSQL 16, db-f1-micro, 10GB SSD |
| **VPC Connector** | dd-vpc-connector | For private Cloud SQL access from Cloud Run |
| **Pub/Sub Topics** | 4 topics | agent_tasks, decision_trace, case_events, gate_events |
| **Secrets** | 3 secrets | gemini-api-key, cloud-sql-connection-string, phi-guard-config |
| **Service Accounts** | 5 SAs | dd-api-sa, dd-agents-sa, dd-ingest-sa, dd-phi-guard-sa, dd-eval-sa |
| **IAM Roles** | 20 roles | Run admin/invoker, Firestore owner, Cloud SQL admin, Vertex AI user, Model Armor user, etc. |
| **Model Armor** | dd-model-armor | Safety shield with prompt-injection, PII/PHI, and malicious-URI filters |

### Apply the pgvector Schema

After Cloud SQL is created, apply the schema:

```bash
gcloud sql connect denialdefender-pg \
  --project=denialdefender \
  --user=postgres < infra/gcp/cloud-sql-schema.sql
```

---

## Step 3: Set Up Secrets

Secrets are created with placeholder values during bootstrap. You MUST populate them with real values.

### 3a. Gemini API Key

Get your key from [Google AI Studio](https://aistudio.google.com/apikey):

```bash
echo -n 'YOUR_ACTUAL_GEMINI_API_KEY' | \
  gcloud secrets versions add gemini-api-key \
    --data-file=- \
    --project=denialdefender
```

### 3b. Cloud SQL Connection String

First, set a password for the `denialdefender-app` database user:

```bash
# Generate a secure password
DB_PASSWORD=$(openssl rand -base64 24)

# Update the Cloud SQL user password
gcloud sql users set-password denialdefender-app \
  --instance=denialdefender-pg \
  --password="${DB_PASSWORD}" \
  --project=denialdefender

# Create the connection string and store as secret
CONNECTION_STRING="postgresql://denialdefender-app:${DB_PASSWORD}@/denialdefender?host=/cloudsql/denialdefender:europe-west1:denialdefender-pg"

echo -n "${CONNECTION_STRING}" | \
  gcloud secrets versions add cloud-sql-connection-string \
    --data-file=- \
    --project=denialdefender
```

### 3c. PHI Guard Configuration

```bash
echo -n '{"strict_mode":true,"hash_algorithm":"sha256","redaction_level":"full"}' | \
  gcloud secrets versions add phi-guard-config \
    --data-file=- \
    --project=denialdefender
```

### Verify Secrets

```bash
gcloud secrets list --project=denialdefender
gcloud secrets versions access latest --secret=gemini-api-key --project=denialdefender
```

---

## Step 4: Model Armor Setup (GEAP Safety Shield)

Model Armor provides runtime safety filtering for all LLM interactions. The bootstrap script creates the policy and filters, but you may need to adjust configuration.

### What Model Armor Protects Against

| Filter | ID | Purpose |
|--------|----|---------|
| **Prompt Injection** | pi-filter | Detects and blocks prompt injection attempts |
| **PII/PHI** | pii-filter | Filters personally identifiable and protected health info |
| **Malicious URI** | uri-filter | Blocks attempts to access malicious URLs |

### Verify Model Armor

```bash
# Check the policy exists
gcloud modelarmor policies describe dd-model-armor \
  --location=europe-west1 \
  --project=denialdefender

# List filters
gcloud modelarmor filters list \
  --policy=dd-model-armor \
  --location=europe-west1 \
  --project=denialdefender
```

### Configure Model Armor in the Console

If the gcloud CLI doesn't support Model Armor yet, configure it in the Cloud Console:

1. Navigate to [Model Armor](https://console.cloud.google.com/model-armor?project=denialdefender)
2. Find the `dd-model-armor` policy
3. Verify all three filters are enabled:
   - Prompt Injection Detection (confidence: medium-and-above)
   - PII/PHI Detection (confidence: medium-and-above)
   - Malicious URI Detection (confidence: medium-and-above)

### Model Armor Environment Variables

Both Cloud Run services reference these env vars:

```
MODEL_ARMOR_POLICY_ID=dd-model-armor
MODEL_ARMOR_LOCATION=europe-west1
```

---

## Step 5: Build and Deploy to Cloud Run

### Full Deployment (Web + Agent Fleet)

```bash
bash infra/gcp/cloudrun/deploy.sh
```

### Deploy Only the Web Service

```bash
bash infra/gcp/cloudrun/deploy.sh --web-only
```

### Deploy Only the Agent Fleet

```bash
bash infra/gcp/cloudrun/deploy.sh --agents-only
```

### What Gets Deployed

| Service | Image | CPU | Memory | Min | Max | Port | Access |
|---------|-------|-----|--------|-----|-----|------|--------|
| **denialdefender-web** | `gcr.io/denialdefender/denialdefender-web` | 2 | 1Gi | 0 | 4 | 8080 | Public |
| **denialdefender-agents** | `gcr.io/denialdefender/denialdefender-agents` | 4 | 2Gi | 0 | 10 | 8080 | Internal |

Both services are configured with:
- **PORT=8080** (Cloud Run default)
- **VPC connector** for Cloud SQL access
- **Service account** with Model Armor, Secret Manager, and Cloud SQL permissions
- **Health checks** (liveness + readiness probes)

### Alternative: Manual Build & Deploy

If you prefer to build and deploy manually:

```bash
# Set variables
PROJECT_ID="denialdefender"
REGION="europe-west1"

# Build the Next.js Docker image
gcloud builds submit \
  --tag gcr.io/${PROJECT_ID}/denialdefender-web:latest \
  --project ${PROJECT_ID} .

# Deploy to Cloud Run
gcloud run deploy denialdefender-web \
  --image gcr.io/${PROJECT_ID}/denialdefender-web:latest \
  --region ${REGION} \
  --platform managed \
  --allow-unauthenticated \
  --cpu 2 \
  --memory 1Gi \
  --min-instances 0 \
  --max-instances 4 \
  --set-env-vars "NODE_ENV=production,PORT=8080,GCP_PROJECT_ID=${PROJECT_ID}" \
  --set-secrets "GEMINI_API_KEY=gemini-api-key:latest" \
  --set-secrets "DATABASE_URL=cloud-sql-connection-string:latest" \
  --project ${PROJECT_ID}
```

---

## Step 6: GEAP Memory Bank Configuration

The DenialDefender GEAP (Governance, Evaluation, and Agent Protocol) uses a Memory Bank for long-term agent memory and cross-case learning.

### Memory Bank Store Options

| Store | Env Var | Description |
|-------|---------|-------------|
| **Vertex AI** | `MEMORY_BANK_STORE=vertex_ai` | Recommended. Uses Vertex AI Reasoning Engine for persistent memory. |
| **Firestore** | `MEMORY_BANK_STORE=firestore` | Fallback. Uses Firestore documents for memory storage. |

### Verify Memory Bank

```bash
# Test the memory bank API endpoint
WEB_URL=$(gcloud run services describe denialdefender-web \
  --region=europe-west1 \
  --format "value(status.url)" \
  --project=denialdefender)

curl -s "${WEB_URL}/api/governance/memory-bank" | jq .
```

---

## Step 7: Agent Registry Configuration

The Agent Registry tracks all 8 agents in the fleet, their capabilities, and execution history.

### Registered Agents

| Agent | Endpoint | Purpose |
|-------|----------|---------|
| **Triage** | `POST /agents/triage` | Classifies denial reason and determines workflow path |
| **Evidence** | `POST /agents/evidence` | Retrieves and embeds medical evidence |
| **Drafter** | `POST /agents/drafter` | Generates appeal letter with provenance cards |
| **Reviewer** | `POST /agents/reviewer` | Quality scoring and compliance checks |
| **Coder** | `POST /agents/coder` | Medical coding and ICD-10 lookup |
| **Policy** | `POST /agents/policy` | Policy analysis and regulatory compliance |
| **Citation** | `POST /agents/citation` | Citation verification and source validation |
| **Orchestrator** | `POST /agents/orchestrator` | Routes tasks and manages HITL gates |

### Verify Agent Registry

```bash
# Check the registry endpoint
curl -s "${WEB_URL}/api/governance/registry" | jq .

# Check agent identity
curl -s "${WEB_URL}/api/governance/identity" | jq .
```

---

## Step 8: Verify Deployment

### Check Service Status

```bash
# List Cloud Run services
gcloud run services list --region=europe-west1 --project=denialdefender

# Describe the web service
gcloud run services describe denialdefender-web \
  --region=europe-west1 \
  --project=denialdefender
```

### Health Check

```bash
# Get the service URL
WEB_URL=$(gcloud run services describe denialdefender-web \
  --region=europe-west1 \
  --format "value(status.url)" \
  --project=denialdefender)

echo "Web URL: ${WEB_URL}"

# Health check
curl -s "${WEB_URL}/api/health" | jq .

# Or just check HTTP status
curl -o /dev/null -w "%{http_code}" "${WEB_URL}/api/health"
```

### Verify All 7 GEAP Components

Run these checks to verify the full GEAP stack is operational:

```bash
# 1. Model Armor — safety shield
curl -s "${WEB_URL}/api/governance/armor" | jq .

# 2. Memory Bank — long-term memory
curl -s "${WEB_URL}/api/governance/memory-bank" | jq .

# 3. Agent Registry — agent tracking
curl -s "${WEB_URL}/api/governance/registry" | jq .

# 4. Agent Identity — identity verification
curl -s "${WEB_URL}/api/governance/identity" | jq .

# 5. Governance Verify — compliance verification
curl -s "${WEB_URL}/api/governance/verify" | jq .

# 6. Observability — trace and metrics
curl -s "${WEB_URL}/api/governance/observability" | jq .

# 7. Decision Trace — audit trail (via Pub/Sub topic)
gcloud pubsub topics describe decision_trace --project=denialdefender
```

### View Logs

```bash
# Web service logs
gcloud run services logs read denialdefender-web \
  --region=europe-west1 \
  --project=denialdefender \
  --limit=50

# Agent fleet logs
gcloud run services logs read denialdefender-agents \
  --region=europe-west1 \
  --project=denialdefender \
  --limit=50

# Live tail logs
gcloud run services logs tail denialdefender-web \
  --region=europe-west1 \
  --project=denialdefender
```

### Verify GCP Resource Connections

```bash
# Firestore — verify documents can be created
gcloud firestore databases describe --project=denialdefender

# Pub/Sub — verify topics exist
gcloud pubsub topics list --project=denialdefender

# Cloud SQL — verify instance is running
gcloud sql instances describe denialdefender-pg --project=denialdefender

# Secret Manager — verify secrets
gcloud secrets list --project=denialdefender

# Model Armor — verify policy
gcloud modelarmor policies describe dd-model-armor \
  --location=europe-west1 \
  --project=denialdefender

# VPC Connector — verify connector
gcloud compute networks vpc-access connectors describe dd-vpc-connector \
  --region=europe-west1 \
  --project=denialdefender
```

---

## Step 9: Get Your .run.app URL

```bash
# Web service URL
gcloud run services describe denialdefender-web \
  --region=europe-west1 \
  --format "value(status.url)" \
  --project=denialdefender

# Expected output:
# https://denialdefender-web-xxxxxxxx-xx.a.run.app
```

You can also find the URL in the [Cloud Run Console](https://console.cloud.google.com/run?project=denialdefender).

---

## Cost Management Tips

### Cloud Run — Scale to Zero

Both services are configured with `min-instances=0`, meaning they scale to zero when not receiving traffic. You only pay for actual request processing time.

```
Estimated cost (idle):        $0.00/month
Estimated cost (light use):   ~$5-15/month
Estimated cost (moderate):    ~$30-80/month
```

### Cloud SQL — Right-Size Your Instance

- **Development**: `db-f1-micro` (~$7/month)
- **Staging**: `db-g1-small` (~$17/month)
- **Production**: `db-custom-2-8192` (~$50+/month)

Upgrade when needed:

```bash
gcloud sql instances patch denialdefender-pg \
  --tier=db-g1-small \
  --project=denialdefender
```

### Model Armor — Free Tier

Model Armor has a free tier for low-volume usage. For production workloads:

- **Free tier**: 1,000 requests/month
- **Paid tier**: $0.001 per request after free tier
- Budget impact is minimal for typical appeal volumes

### Set Budget Alerts

```bash
# Create a budget alert at $50/month
gcloud billing budgets create \
  --display-name="DenialDefender Budget Alert" \
  --budget-amount=50USD \
  --threshold-rule=percent:50 \
  --threshold-rule=percent:90 \
  --project=denialdefender
```

Or set up budgets in the [Billing Console](https://console.cloud.google.com/billing?project=denialdefender).

### Other Cost-Saving Measures

1. **Use Firestore in Datastore mode** for structured queries (cheaper than Native mode for high-volume writes)
2. **Set Pub/Sub message retention to 1 day** (default is 7 days)
3. **Use Cloud Build free tier** (120 build-minutes/day)
4. **Preemptible VPC connector** — use minimum range (/28 = 8 IPs)

---

## Troubleshooting

### Issue: "Cloud SQL instance creation failed"

**Cause**: Billing not enabled, or too many instances in the project.

```bash
# Check billing
gcloud billing projects describe denialdefender

# List existing instances
gcloud sql instances list --project=denialdefender

# If instance exists, skip creation
bash infra/gcp/bootstrap.sh --skip-sql
```

### Issue: "API not enabled" errors

```bash
# Enable all required APIs manually
gcloud services enable \
  run.googleapis.com \
  firestore.googleapis.com \
  sqladmin.googleapis.com \
  pubsub.googleapis.com \
  secretmanager.googleapis.com \
  aiplatform.googleapis.com \
  modelarmor.googleapis.com \
  cloudbuild.googleapis.com \
  --project=denialdefender
```

### Issue: "Permission denied" on Cloud Run deploy

**Cause**: Service account missing required IAM roles.

```bash
# Verify current roles
gcloud projects get-iam-policy denialdefender \
  --filter="bindings.members:json-775@denialdefender.iam.gserviceaccount.com"

# Re-run IAM step
bash infra/gcp/bootstrap.sh --skip-sql --skip-vpc
```

### Issue: "VPC connector not found"

**Cause**: VPC connector creation failed or not in the same region.

```bash
# List existing connectors
gcloud compute networks vpc-access connectors list \
  --region=europe-west1 \
  --project=denialdefender

# Create manually if needed
gcloud compute networks vpc-access connectors create dd-vpc-connector \
  --network=default \
  --region=europe-west1 \
  --range=10.8.0.0/28 \
  --project=denialdefender
```

### Issue: Build fails with "Dockerfile not found"

**Cause**: Dockerfile must exist in the project root.

```bash
# Verify Dockerfile exists
ls -la Dockerfile

# Build locally first to test
docker build -t denialdefender-test .
docker run -p 8080:8080 denialdefender-test
```

### Issue: "Cloud Run service crashed" — check container logs

```bash
# Get detailed logs
gcloud run services logs read denialdefender-web \
  --region=europe-west1 \
  --project=denialdefender \
  --limit=100

# Key checks:
# 1. Container is listening on PORT 8080 (Cloud Run default)
# 2. next.config.ts has output: 'standalone'
# 3. Health check endpoint /api/health responds
```

### Issue: Firestore "database already exists"

This is expected — the bootstrap script warns but continues. No action needed.

### Issue: Secret "already exists"

```bash
# Add a new version instead of recreating
echo -n 'NEW_VALUE' | gcloud secrets versions add SECRET_NAME \
  --data-file=- --project=denialdefender

# Verify the latest version
gcloud secrets versions access latest --secret=SECRET_NAME --project=denialdefender
```

### Issue: Model Armor "policy not found"

```bash
# Create the policy manually
gcloud modelarmor policies create dd-model-armor \
  --location=europe-west1 \
  --project=denialdefender \
  --display-name="DenialDefender Safety Shield"

# Or create in the Cloud Console:
# https://console.cloud.google.com/model-armor?project=denialdefender
```

---

## Architecture Overview

```
                    ┌─────────────────────────────────────────┐
                    │         Cloud Run (europe-west1)        │
                    │                                         │
  Users ──────────►│  denialdefender-web (Next.js)           │
                    │    PORT 8080  │  0-4 instances          │
                    │               │                         │
                    │               ├──► Firestore (eur3)     │
                    │               ├──► Pub/Sub topics       │
                    │               ├──► Secret Manager       │
                    │               ├──► Model Armor          │
                    │               ├──► Vertex AI Memory     │
                    │               └──► Cloud SQL (pgvector) │
                    │                    via VPC Connector    │
                    │                                         │
  Pub/Sub ─────────►│  denialdefender-agents (TS/Bun+Python) │
                    │    PORT 8080  │  0-10 instances         │
                    │               │                         │
                    │               ├──► Vertex AI / Gemini   │
                    │               ├──► Model Armor          │
                    │               ├──► Firestore            │
                    │               └──► Cloud SQL (pgvector) │
                    └─────────────────────────────────────────┘

  GEAP Components:
    1. Model Armor ─── Safety shield (prompt injection, PII, URI)
    2. Memory Bank ─── Long-term agent memory (Vertex AI / Firestore)
    3. Agent Registry ── Agent tracking and capability registry
    4. Agent Identity ── Identity verification for agents
    5. Governance ──── Compliance verification and audit
    6. Observability ── Tracing, metrics, and error reporting
    7. Decision Trace ─ Audit trail via Pub/Sub
```

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `bash infra/gcp/bootstrap.sh` | Provision all GCP infrastructure |
| `bash infra/gcp/cloudrun/deploy.sh` | Build & deploy to Cloud Run |
| `bash infra/gcp/cloudrun/deploy.sh --web-only` | Deploy web service only |
| `gcloud run services list --region=europe-west1` | List Cloud Run services |
| `gcloud run services logs read denialdefender-web --region=europe-west1` | View web logs |
| `gcloud sql connect denialdefender-pg --project=denialdefender` | Connect to database |
| `gcloud secrets versions access latest --secret=gemini-api-key` | Read a secret |
| `gcloud modelarmor policies describe dd-model-armor --location=europe-west1` | Check Model Armor |
