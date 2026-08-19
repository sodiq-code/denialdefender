# DenialDefender — GCP Deployment Guide

Complete step-by-step guide to deploy DenialDefender to Google Cloud Platform
(Cloud Run + Firestore + Pub/Sub + Vertex AI + Model Armor).

---

## ⚠️ Security Warning — Read This First

> **Never commit secrets, tokens, or service account keys to the repository.**

This project's CI/CD pipeline reads **exclusively** from GitHub Actions
secrets (`GCP_SA_KEY`, `GCP_PROJECT_ID`, `GEMINI_API_KEY`) and from Google
Cloud Secret Manager. The repository must remain free of credentials.

If you ever discover that a secret (e.g. a `gcloud` service-account key, the
`GEMINI_API_KEY`, or a Turso token) has been committed to the repository, take
these steps **immediately**:

1. **Revoke** the credential in its source console:
   - GCP service-account key: IAM & Admin → Service Accounts → Keys → Delete
   - Gemini API key: AI Studio → API Keys → Delete
   - Secret Manager version: `gcloud secrets versions destroy <version> --secret=<name>`
2. **Rotate** it: create a fresh key/secret and provision it via the secure
   path (GitHub Secret + `gcloud secrets create`, or Cloud Run secrets).
3. **Purge history** (if the secret was pushed to the remote):
   `git filter-repo --invert-paths --path <file>` or BFG Repo-Cleaner.
4. **Enable protections**: turn on GitHub Secret Scanning + Push Protection so
   future accidental commits are blocked before they reach the remote.

The `.gcloudignore` and `.dockerignore` files block the most common offenders
(`*.json` key files, `.env*`, `infra/gcp/dd-deploy-sa-key.json`) but they do
not protect against secrets already inside source files — be vigilant.

---

## Project Configuration

| Property | Value |
|----------|-------|
| **Project ID** | `denialdefender` |
| **Project Number** | `315133452553` |
| **Region** | `europe-west1` |
| **Firestore Location** | `eur3` (EU multi-region) |
| **Runtime Service Account** | `dd-runtime@denialdefender.iam.gserviceaccount.com` |
| **LLM Provider** | `GEMINI_PROVIDER=vertex_ai` |
| **ADK Framework** | `ADK_FRAMEWORK=google-adk` |
| **Gemini Model** | `gemini-2.5-flash` (see *Model selection* below) |

---

## Model selection

The user requested "Gemini 3.5 or 3.6 — nothing older". As of this writing,
Google has not released any public model id with the names `gemini-3.5-flash`
or `gemini-3.6-flash`. The closest currently-available stable model family is
**Gemini 2.5** (released Q1 2025):

- `gemini-2.5-flash` — fast, cost-effective, suitable for the agent fleet's
  classification / drafting / review tasks.
- `gemini-2.5-pro` — heavier reasoning model, suitable if higher-quality
  drafting is needed at higher cost.

We deploy with `GEMINI_MODEL=gemini-2.5-flash` throughout (web + agents) and
expose the model id in every Cloud Run service's env vars and the Knative
YAMLs so it can be flipped to a newer model id (e.g. `gemini-3.0-flash` or
`gemini-3.5-flash` if/when Google releases them) with a single env update.

When a 3.x stable model id becomes publicly available, set:
```bash
gcloud run services update denialdefender-web \
  --region=europe-west1 \
  --update-env-vars=GEMINI_MODEL=gemini-3.5-flash
gcloud run services update denialdefender-agents \
  --region=europe-west1 \
  --update-env-vars=GEMINI_MODEL=gemini-3.5-flash
```

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **gcloud CLI** | Latest | `curl -fsSL https://sdk.cloud.google.com \| bash` |
| **Docker** | 24+ | [docker.com/get-docker](https://docs.docker.com/get-docker/) |
| **Node.js** | 20+ | `nvm install 20` or [nodejs.org](https://nodejs.org/) |
| **Bun** | 1.1+ | `curl -fsSL https://bun.sh/install \| bash` |
| **Firebase CLI** | Latest (optional) | `npm i -g firebase-tools` |

Verify:
```bash
gcloud --version
docker --version
node --version
bun --version
```

---

## Step 1: Authenticate with GCP

### Option A — Service Account Key (CI/CD)

```bash
gcloud auth activate-service-account --key-file=infra/gcp/dd-deploy-sa-key.json
gcloud config set project denialdefender
gcloud config set compute/region europe-west1
```

### Option B — Interactive Login (local dev)

```bash
gcloud auth login
gcloud config set project denialdefender
gcloud config set compute/region europe-west1
```

Verify:
```bash
gcloud auth list
gcloud config configurations list
gcloud billing projects describe denialdefender
#   billingEnabled: true  ← must be true
```

---

## Step 2: Run the Bootstrap Script

```bash
bash infra/gcp/bootstrap.sh
# Skip Model Armor if not needed:
bash infra/gcp/bootstrap.sh --skip-armor
```

### What Bootstrap Creates

| Resource | Name | Details |
|----------|------|---------|
| **APIs** | 16 APIs | Cloud Run, Firestore, Pub/Sub, Secret Manager, Vertex AI, Model Armor, Artifact Registry, etc. |
| **Firestore** | (default) | Native mode, eur3 (EU multi-region) |
| **Pub/Sub Topics** | 4 | `agent_tasks`, `decision_trace`, `case_events`, `gate_events` |
| **Service Account** | `dd-runtime` | Runtime SA for Cloud Run services |
| **Secrets** | 2 | `gemini-api-key`, `phi-guard-config` (placeholder values) |
| **Artifact Registry** | `denialdefender` | Docker repo in europe-west1 |
| **IAM Roles** | 13 | Run admin, datastore owner, AI platform user, Model Armor user, etc. |

---

## Step 3: Set Up Secrets

```bash
# Gemini API key (get from https://aistudio.google.com/apikey)
echo -n 'YOUR_GEMINI_API_KEY' | \
  gcloud secrets versions add gemini-api-key \
    --data-file=- \
    --project=denialdefender

# PHI Guard config
echo -n '{"strict_mode":true,"hash_algorithm":"sha256","redaction_level":"full"}' | \
  gcloud secrets versions add phi-guard-config \
    --data-file=- \
    --project=denialdefender

# Verify
gcloud secrets list --project=denialdefender
gcloud secrets versions access latest --secret=gemini-api-key --project=denialdefender
```

---

## Step 4: Model Armor Setup (GEAP Safety Shield)

Model Armor filters every LLM call against prompt-injection, jailbreak, and
malicious-URI attacks. Run the dedicated setup script:

```bash
bash infra/gcp/model-armor-setup.sh
```

This creates policy `dd-model-armor` in `europe-west1` with:
- Prompt Injection Detection (threshold: 0.7)
- Jailbreak Detection (threshold: 0.7)
- PI + Jailbreak Combined (threshold: 0.7)
- Malicious URI Detection (enabled)

Verify:
```bash
ACCESS_TOKEN=$(gcloud auth print-access-token)
curl -s \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  "https://modelarmor.googleapis.com/v1/projects/denialdefender/locations/europe-west1/armorPolicies/dd-model-armor" \
  | jq .
```

---

## Step 5: Build and Deploy to Cloud Run

### Deploy order (CRITICAL)

> **Deploy the backend services (agents + trace-stream) FIRST**, look up
> their URLs, then deploy the web service with `AGENT_FLEET_URL` and
> `NEXT_PUBLIC_TRACE_STREAM_URL` baked in.

### Full deployment

```bash
bash infra/gcp/cloudrun/deploy.sh
```

### Individual services

```bash
bash infra/gcp/cloudrun/deploy.sh --web-only
bash infra/gcp/cloudrun/deploy.sh --agents-only
bash infra/gcp/cloudrun/deploy.sh --trace-only
```

### Service specifications

| Service | CPU | Memory | Scale | Concurrency | Access | Port |
|---------|-----|--------|-------|--------------|--------|------|
| `denialdefender-web` | 2 | 1 GiB | 0–4 | 80 | Public (unauthenticated) | 8080 |
| `denialdefender-agents` | 4 | 2 GiB | 0–10 | 10 | Internal only | 8080 |
| `denialdefender-trace-stream` | 1 | 512 MiB | 0–2 | 80 | Public (unauthenticated) | 8080 |

### Cloud Build pipeline (alternative)

```bash
gcloud builds submit --config=cloudbuild.yaml --project=denialdefender
```

The `cloudbuild.yaml` runs 10 steps:
1–3. Build the 3 Docker images (web, agents, trace-stream) in parallel.
4. Push all 3 images to Artifact Registry.
5. Deploy `denialdefender-agents` (internal, with `gemini-api-key` secret).
6. Deploy `denialdefender-trace-stream` (public).
7. Deploy `denialdefender-web` (public).
8. Update `denialdefender-web` env with `AGENT_FLEET_URL` + `NEXT_PUBLIC_TRACE_STREAM_URL`.
9. Grant `roles/run.invoker` on the agents service to the runtime SA.
10. Verify `curl https://denialdefender-web-*.run.app/api/health`.

---

## Step 6: CI/CD via GitHub Actions

### One-time setup

```bash
bash infra/gcp/setup-ci.sh
```

This creates:
- Artifact Registry repo `denialdefender` (europe-west1)
- Service account `dd-deploy-sa` with the required IAM roles
- Service account key file `dd-deploy-sa-key.json`

### Required GitHub secrets

| Secret | Value |
|--------|-------|
| `GCP_SA_KEY` | The full JSON contents of `dd-deploy-sa-key.json` |
| `GCP_PROJECT_ID` | `denialdefender` |
| `GEMINI_API_KEY` | Your Gemini API key (added to Secret Manager on first run) |

Add them at: `https://github.com/<your-org>/denialdefender/settings/secrets/actions`

### Push-to-main deploy

On every push to `main`:
1. Workflow authenticates with GCP using `GCP_SA_KEY`.
2. Enables 20 GCP APIs (idempotent).
3. Creates the Artifact Registry repo if missing.
4. Builds and pushes 3 Docker images.
5. Ensures `gemini-api-key` secret exists in Secret Manager.
6. Deploys `denialdefender-agents` + `denialdefender-trace-stream` first.
7. Looks up their URLs.
8. Grants the web runtime SA `roles/run.invoker` on the agents service.
9. Deploys `denialdefender-web` with `AGENT_FLEET_URL` and `NEXT_PUBLIC_TRACE_STREAM_URL` baked in.
10. Verifies `/api/health` returns 200.

---

## Step 7: Verify the Deployment

```bash
WEB_URL=$(gcloud run services describe denialdefender-web \
  --region=europe-west1 \
  --format "value(status.url)" \
  --project=denialdefender)
echo "Web URL: ${WEB_URL}"

# Health check
curl -sf "${WEB_URL}/api/health" | jq .

# Verify all GEAP components
curl -s "${WEB_URL}/api/governance/armor"        | jq . # Model Armor
curl -s "${WEB_URL}/api/governance/memory-bank"  | jq . # Memory Bank
curl -s "${WEB_URL}/api/governance/registry"     | jq . # Agent Registry
curl -s "${WEB_URL}/api/governance/identity"     | jq . # Agent Identity

# Day 1 gate: empty case round-trips
python3 infra/seed/verify_day1_gate.py --api-url "${WEB_URL}"
```

### Verify GCP resources

```bash
gcloud run services list --region=europe-west1 --project=denialdefender
gcloud firestore databases describe --project=denialdefender
gcloud pubsub topics list --project=denialdefender
gcloud secrets list --project=denialdefender
gcloud modelarmor policies describe dd-model-armor --location=europe-west1 --project=denialdefender
```

### View logs

```bash
gcloud run services logs read denialdefender-web \
  --region=europe-west1 --project=denialdefender --limit=50

gcloud run services logs tail denialdefender-web \
  --region=europe-west1 --project=denialdefender
```

---

## Step 8: Get Your `.run.app` URL

```bash
gcloud run services describe denialdefender-web \
  --region=europe-west1 \
  --format "value(status.url)" \
  --project=denialdefender
# → https://denialdefender-web-315133452553.europe-west1.run.app
```

You can also find the URL in the [Cloud Run Console](https://console.cloud.google.com/run?project=denialdefender).

---

## Local Mini-Services (Sandbox)

In the sandbox, two mini-services run alongside the Next.js app:

| Service | Port | Purpose | Start |
|---------|------|---------|-------|
| `trace-stream` | 3003 | Socket.io trace-stream server | `cd mini-services/trace-stream && bun install && bun run dev` |
| `agent-fleet` | 3004 | 8-agent fleet (mock mode) | `cd mini-services/agent-fleet && bun install && bun run dev` |

Or start both with the watchdog:
```bash
bash mini-services/start-services.sh
bash mini-services/start-services.sh --stop
```

The Caddy gateway routes `/?XTransformPort=3003` → port 3003 and
`/?XTransformPort=3004` → port 3004. The frontend connects to trace-stream via
`io("/?XTransformPort=3003")` and the Next.js backend calls the agent fleet
directly via `http://localhost:3004`.

---

## Rollback

```bash
# List recent revisions
gcloud run services revisions list denialdefender-web \
  --region=europe-west1 --project=denialdefender

# Roll back to a specific revision
gcloud run services update-traffic denialdefender-web \
  --to-revisions=<REVISION_ID>=100 \
  --region=europe-west1 --project=denialdefender

# Or roll back to the previous image tag
gcloud run deploy denialdefender-web \
  --image=europe-west1-docker.pkg.dev/denialdefender/denialdefender/web:<PREVIOUS_SHA> \
  --region=europe-west1 --project=denialdefender
```

---

## Troubleshooting

### Issue: "Cloud Run service crashed" — container logs

```bash
gcloud run services logs read denialdefender-web \
  --region=europe-west1 --project=denialdefender --limit=100
```
Key checks:
1. Container listening on PORT 8080 (Cloud Run default).
2. `next.config.ts` is configured for production.
3. `/api/health` returns 200.

### Issue: "Permission denied" on Cloud Run deploy

The runtime SA `dd-runtime@denialdefender.iam.gserviceaccount.com` is missing
roles. Re-run:
```bash
bash infra/gcp/bootstrap.sh --skip-armor
```

### Issue: "API not enabled" errors

```bash
gcloud services enable \
  run.googleapis.com \
  firestore.googleapis.com \
  pubsub.googleapis.com \
  secretmanager.googleapis.com \
  aiplatform.googleapis.com \
  modelarmor.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project=denialdefender
```

### Issue: "Cloud SQL instance creation failed"

```bash
gcloud billing projects describe denialdefender    # billing must be true
gcloud sql instances list --project=denialdefender  # existing instances?
```

### Issue: Secret "already exists"

```bash
echo -n 'NEW_VALUE' | gcloud secrets versions add gemini-api-key \
  --data-file=- --project=denialdefender
```

### Issue: Gemini call fails with 403 / "location not supported"

Set the model to one available in your project's region:
```bash
gcloud run services update denialdefender-agents \
  --region=europe-west1 \
  --update-env-vars=GEMINI_MODEL=gemini-2.5-flash
```

### Issue: trace-stream not reachable from web

Verify the env var `NEXT_PUBLIC_TRACE_STREAM_URL` is set on the web service:
```bash
gcloud run services describe denialdefender-web \
  --region=europe-west1 --project=denialdefender \
  --format="value(spec.template.spec.containers[0].env)"
```

---

## Architecture Overview

```
                    ┌─────────────────────────────────────────────────┐
                    │         Cloud Run (europe-west1)                │
                    │                                                 │
  Users ──────────►│  denialdefender-web (Next.js)                   │
                    │    PORT 8080  │  0-4 instances                 │
                    │               │                                 │
                    │               ├──► Firestore (eur3)            │
                    │               ├──► Pub/Sub topics              │
                    │               ├──► Secret Manager              │
                    │               ├──► Model Armor                 │
                    │               ├──► Vertex AI Memory Bank       │
                    │               ├──► Agent Fleet (internal)      │
                    │               └──► Trace Stream (websocket)     │
                    │                                                 │
  Pub/Sub ─────────►│  denialdefender-agents (Bun 8-agent fleet)    │
                    │    PORT 8080  │  0-10 instances                │
                    │               │                                 │
                    │               ├──► Vertex AI / Gemini 2.5     │
                    │               ├──► Model Armor                  │
                    │               └──► Firestore                   │
                    │                                                 │
  WS push ─────────►│  denialdefender-trace-stream (Socket.io)       │
                    │    PORT 8080  │  0-2 instances                 │
                    └─────────────────────────────────────────────────┘
```

---

## Cost Estimate

| Resource | Tier | Monthly Cost |
|----------|------|--------------|
| Cloud Run (web) | 2 vCPU, 1 GiB, 0-4 | ~$0 (free tier: 2M req/mo) |
| Cloud Run (agents) | 4 vCPU, 2 GiB, 0-10 | ~$0 (scale-to-zero when idle) |
| Cloud Run (trace-stream) | 1 vCPU, 512 MiB, 0-2 | ~$0 (scale-to-zero when idle) |
| Firestore | eur3, <1 GB | ~$0 (free tier) |
| Pub/Sub | 4 topics, low volume | ~$0 (free tier: 10 GB/mo) |
| Gemini 2.5 Flash | Vertex AI | ~$0 (free tier) — paid: $0.30/$2.50 per 1M tokens |
| Secret Manager | 2 secrets | ~$0 (free tier: 6 versions) |
| Model Armor | dd-model-armor policy | ~$0 (free tier: 1,000 req/mo) |
| **Total** | | **~$0–15/mo** |

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `bash infra/gcp/bootstrap.sh` | Provision all GCP infrastructure |
| `bash infra/gcp/setup-ci.sh` | One-time CI/CD setup (SA key + AR repo) |
| `bash infra/gcp/model-armor-setup.sh` | Create Model Armor policy |
| `bash infra/gcp/cloudrun/deploy.sh` | Build & deploy all 3 Cloud Run services |
| `bash infra/gcp/cloudrun/deploy.sh --web-only` | Deploy web service only |
| `bash mini-services/start-services.sh` | Start local trace-stream + agent-fleet (sandbox) |
| `gcloud run services list --region=europe-west1` | List Cloud Run services |
| `gcloud run services logs read denialdefender-web --region=europe-west1` | View web logs |
| `gcloud secrets versions access latest --secret=gemini-api-key` | Read a secret |
| `python3 infra/seed/verify_day1_gate.py --api-url <URL>` | Day 1 gate verification |
| `gcloud builds submit --config=cloudbuild.yaml --project=denialdefender` | Run Cloud Build pipeline |
