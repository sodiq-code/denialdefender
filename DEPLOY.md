# DenialDefender — GCP Deployment Guide

Step-by-step guide to deploy DenialDefender to Google Cloud Platform
(Cloud Run + Firestore + Pub/Sub + Vertex AI + Model Armor).

---

## Gemini 3.6 Flash — the reasoning engine (required)

DenialDefender's agent fleet is powered by **`gemini-3.6-flash`** via the
**Vertex AI global endpoint**. Two of the eight agents call the model directly:

| Agent | What it asks Gemini 3.6 Flash | Why it matters |
|-------|-------------------------------|----------------|
| **Denial Triage** | Classify the denial code, estimate appeal success rate, recommend a strategy | Drives the Gate 1 confirmation prompt the human reviews |
| **Letter Drafting** | Generate the formal, evidence-grounded appeal letter with inline `[1]–[5]` citations | This is the document submitted to the payer — quality depends on the model |

### How the call works (backend)

```
denialdefender-web (Next.js API route)
   └── POST {denialText, payer} → runFullPipeline()
        └── DenialTriageAgent.execute() / LetterDraftingAgent.execute()
             └── fetch(`${AGENT_FLEET_URL}/agents/{triage|drafter}`, {…})
                  └── denialdefender-agents (Bun, Cloud Run)
                       └── callGemini(systemPrompt, userPrompt)
                            └── POST https://aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/global/publishers/google/models/gemini-3.6-flash:generateContent
                                 Authorization: Bearer <metadata-server token>
                                 (runtime SA, roles/aiplatform.user)
```

- The web service's inline agents (`src/lib/agents/*.ts`) call the deployed
  agent-fleet over HTTP when `AGENT_FLEET_URL` is set.
- The agent-fleet (`mini-services/agent-fleet/index.ts`) obtains a Vertex AI
  access token from the Cloud Run **metadata server** (`http://metadata.google.internal/…/token`) and calls `gemini-3.6-flash` on the **global** endpoint.
- `gemini-3.6-flash` is a global-only model — it is not available on any
  single regional endpoint. The fleet routes any `gemini-3.x` model id to
  `https://aiplatform.googleapis.com/…/locations/global/…`.

### What happens if Gemini 3.6 Flash is not connected

**`gemini-3.6-flash` is required for the appeal pipeline to function.** The
Denial Triage agent cannot classify a denial and the Letter Drafting agent
cannot generate an appeal letter without a reachable `gemini-3.6-flash`
endpoint. If the model is unreachable — because `GEMINI_API_KEY` is absent,
the runtime service account lacks `roles/aiplatform.user`, or the agent-fleet
service is down — the pipeline stops producing Gemini-backed output:

- Triage falls back to a deterministic code-based classification (no model reasoning).
- Letter drafting falls back to a fixed template (no Gemini-generated letter).
- The `/api/health` endpoint reports `mockMode: true`.
- The UI badge shows "Mock" instead of "Live (Gemini)".

These fallbacks exist only so the case-record and audit infrastructure remains
operational during an outage; **they are not a functioning appeal pipeline.**
A real, submittable appeal requires `gemini-3.6-flash` to be reachable —
either via `GEMINI_API_KEY` (local) or the runtime service account with
`roles/aiplatform.user` calling the Vertex AI global endpoint (Cloud Run).

Verify live mode:
```bash
curl -s https://denialdefender-web-*.run.app/api/health | jq .mockMode   # false
curl -s https://denialdefender-agents-*.run.app/health    | jq .mock_mode # false
```

---

## ⚠️ Security Warning — Read This First

> **Never commit secrets, tokens, or service account keys to the repository.**

This project's CI/CD pipeline reads exclusively from GitHub Actions
secrets (`GCP_SA_KEY`, `GCP_PROJECT_ID`, `GEMINI_API_KEY`) and from Google
Cloud Secret Manager. The repository must remain free of credentials.

If you discover that a secret (a `gcloud` service-account key, the
`GEMINI_API_KEY`, or a Turso token) has been committed to the repository:

1. **Revoke** the credential in its source console:
   - GCP service-account key: IAM & Admin → Service Accounts → Keys → Delete
   - Gemini API key: AI Studio → API Keys → Delete
   - Secret Manager version: `gcloud secrets versions destroy <version> --secret=<name>`
2. **Rotate** it: create a fresh key/secret and provision it via the secure
   path (GitHub Secret + `gcloud secrets create`, or Cloud Run secrets).
3. **Purge history**: `git filter-repo --invert-paths --path <file>` or BFG.
4. **Enable protections**: turn on GitHub Secret Scanning + Push Protection.

The `.gcloudignore` and `.dockerignore` files block the common offenders
(`*.json` key files, `.env*`) but cannot protect against secrets already
inside source files.

---

## Project Configuration

| Property | Value |
|----------|-------|
| **Project ID** | `denialdefender` |
| **Project Number** | `315133452553` |
| **Region** | `europe-west1` |
| **Firestore Location** | `eur3` (EU multi-region) |
| **Runtime Service Account** | `315133452553-compute@developer.gserviceaccount.com` |
| **LLM Provider** | `GEMINI_PROVIDER=vertex_ai` |
| **ADK Framework** | `ADK_FRAMEWORK=google-adk` |
| **Gemini Model** | `gemini-3.6-flash` (Vertex AI global endpoint) |

---

## Model selection

`gemini-3.6-flash` is the deployed model. It is a **global** model — available
only at `https://aiplatform.googleapis.com/…/locations/global/…`, not on any
single regional endpoint. The agent-fleet detects any `gemini-3.x` model id
and routes it to the global host automatically.

To use a different model, set `GEMINI_MODEL` on the agents service:
```bash
gcloud run services update denialdefender-agents \
  --region=europe-west1 \
  --update-env-vars=GEMINI_MODEL=gemini-3.6-flash
```

> Note: older 2.5-family models are regional and were deprecated for new
> projects. If you need a regional model, set `GEMINI_MODEL` to a 2.5 id and
> the fleet will use `europe-west1-aiplatform.googleapis.com` instead of the
> global host.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **gcloud CLI** | Latest | `curl -fsSL https://sdk.cloud.google.com \| bash` |
| **Docker** | 24+ | [docker.com/get-docker](https://docs.docker.com/get-docker/) |
| **Node.js** | 20+ | `nvm install 20` or [nodejs.org](https://nodejs.org/) |
| **Bun** | 1.1+ | `curl -fsSL https://bun.sh/install \| bash` |

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
| **Service Account** | runtime SA | Used by Cloud Run services; granted `roles/aiplatform.user` for Vertex AI |
| **Secrets** | 2 | `gemini-api-key`, `phi-guard-config` |
| **Artifact Registry** | `denialdefender` | Docker repo in europe-west1 |

---

## Step 3: Set Up Secrets

```bash
# Gemini API key (https://aistudio.google.com/apikey)
# Used as the AI Studio fallback locally; on Cloud Run the runtime SA
# calls Vertex AI directly (no key needed).
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
```

### Grant the runtime SA Vertex AI access

The agent-fleet calls `gemini-3.6-flash` as the runtime service account:
```bash
PROJECT_NUMBER=315133452553
gcloud projects add-iam-policy-binding denialdefender \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

Without `roles/aiplatform.user`, the fleet cannot reach Vertex AI and falls
back to mock mode (see *What happens if Gemini 3.6 Flash is not connected*).

---

## Step 4: Model Armor Setup (GEAP Safety Shield)

Model Armor filters every LLM call against prompt-injection, jailbreak, and
malicious-URI attacks.

```bash
bash infra/gcp/model-armor-setup.sh
```

This creates policy `dd-model-armor` in `europe-west1` with:
- Prompt Injection Detection (threshold: 0.7)
- Jailbreak Detection (threshold: 0.7)
- Malicious URI Detection (enabled)

---

## Step 5: Build and Deploy to Cloud Run

### Deploy order (required)

> Deploy the backend services (agents + trace-stream) **first**, look up their
> URLs, then deploy the web service with `AGENT_FLEET_URL` and
> `NEXT_PUBLIC_TRACE_STREAM_URL` set.

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

| Service | CPU | Memory | Scale | Concurrency | Access | Port | Gemini |
|---------|-----|--------|-------|--------------|--------|------|--------|
| `denialdefender-web` | 2 | 1 GiB | 0–4 | 80 | Public | 8080 | calls fleet |
| `denialdefender-agents` | 4 | 2 GiB | 0–10 | 10 | Internal | 8080 | calls `gemini-3.6-flash` (Vertex AI) |
| `denialdefender-trace-stream` | 1 | 512 MiB | 0–2 | 80 | Public | 8080 | — |

### Cloud Build pipeline (alternative)

```bash
gcloud builds submit --config=cloudbuild.yaml --project=denialdefender
```

The `cloudbuild.yaml` runs 10 steps:
1–3. Build the 3 Docker images (web, agents, trace-stream).
4. Push all 3 images to Artifact Registry.
5. Deploy `denialdefender-agents` (internal, with `gemini-api-key` secret + `GEMINI_MODEL=gemini-3.6-flash`).
6. Deploy `denialdefender-trace-stream` (public).
7. Deploy `denialdefender-web` (public).
8. Update `denialdefender-web` env with `AGENT_FLEET_URL` + `NEXT_PUBLIC_TRACE_STREAM_URL`.
9. Grant `roles/run.invoker` on the agents service to the runtime SA.
10. Verify `curl https://denialdefender-web-*.run.app/api/health`.

---

## Step 6: CI/CD via GitHub Actions

### Required GitHub secrets

| Secret | Value |
|--------|-------|
| `GCP_SA_KEY` | Full JSON of the deploy service-account key |
| `GCP_PROJECT_ID` | `denialdefender` |
| `GEMINI_API_KEY` | Gemini API key (added to Secret Manager on first run) |

Add them at: `https://github.com/<your-org>/denialdefender/settings/secrets/actions`

### Push-to-main deploy

On every push to `main`, the workflow:
1. Authenticates with GCP using `GCP_SA_KEY`.
2. Enables 20 GCP APIs (idempotent).
3. Creates the Artifact Registry repo if missing.
4. Builds and pushes 3 Docker images.
5. Deploys `denialdefender-agents` (with `GEMINI_MODEL=gemini-3.6-flash`) + `denialdefender-trace-stream`.
6. Looks up their URLs.
7. Grants the web runtime SA `roles/run.invoker` on the agents service.
8. Deploys `denialdefender-web` with `AGENT_FLEET_URL` and `NEXT_PUBLIC_TRACE_STREAM_URL`.
9. Verifies `/api/health` returns 200.

---

## Step 7: Verify the Deployment

```bash
WEB_URL=$(gcloud run services describe denialdefender-web \
  --region=europe-west1 \
  --format "value(status.url)" \
  --project=denialdefender)
echo "Web URL: ${WEB_URL}"

# Health — check mockMode is false (Gemini 3.6 Flash is live)
curl -sf "${WEB_URL}/api/health" | jq .
#   { "mockMode": false, "geminiModel": "gemini-3.6-flash", ... }

# Agent fleet health — must show mock_mode: false
curl -sf "$(gcloud run services describe denialdefender-agents \
  --region=europe-west1 --format 'value(status.url)' --project=denialdefender)/health" | jq .
#   { "mock_mode": false, "gemini_available": true, "model": "gemini-3.6-flash", ... }

# Run a live pipeline and confirm the letter is Gemini-generated (wordCount > 100)
CASE=$(curl -sf -X POST "${WEB_URL}/api/full-pipeline" \
  -H 'Content-Type: application/json' \
  -d '{"denialText":"Denying CPT 27447 TKA for ICD M17.11. Not medically necessary. CO50. UnitedHealthcare. Appeal within 90 days.","payer":"UnitedHealthcare"}' \
  | jq -r .caseId)
curl -sf -X POST "${WEB_URL}/api/full-pipeline/resume" \
  -H 'Content-Type: application/json' \
  -d "{\"caseId\":\"${CASE}\",\"gateStatus\":\"approved\"}" \
  | jq '{status: .pipelineStatus, words: .letterDrafting.wordCount, quality: .qualityReview.overallVerdict}'
#   { "status": "awaiting_gate2", "words": 213, "quality": "PASS" }
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

gcloud run services logs tail denialdefender-agents \
  --region=europe-west1 --project=denialdefender
```

---

## Step 8: Get Your `.run.app` URL

```bash
gcloud run services describe denialdefender-web \
  --region=europe-west1 \
  --format "value(status.url)" \
  --project=denialdefender
```

You can also find the URL in the
[Cloud Run Console](https://console.cloud.google.com/run?project=denialdefender).

---

## Local Mini-Services (Sandbox)

Two mini-services run alongside the Next.js app for local development:

| Service | Port | Purpose | Start |
|---------|------|---------|-------|
| `trace-stream` | 3003 | Socket.io trace-stream server | `cd mini-services/trace-stream && bun install && bun run dev` |
| `agent-fleet` | 3004 | 8-agent fleet (mock mode without `GEMINI_API_KEY`) | `cd mini-services/agent-fleet && bun install && bun run dev` |

Start both with the watchdog:
```bash
bash mini-services/start-services.sh
bash mini-services/start-services.sh --stop
```

The Caddy gateway routes `/?XTransformPort=3003` → port 3003 and
`/?XTransformPort=3004` → port 3004. The frontend connects to trace-stream via
`io("/?XTransformPort=3003")` and the Next.js backend calls the agent fleet at
`http://localhost:3004`.

> Locally, set `GEMINI_API_KEY` in `mini-services/agent-fleet` to call the
> AI Studio API. Without it, the fleet runs in mock mode (deterministic
> outputs) — useful for development but the triage and letter are not
> Gemini-generated.

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

# Or redeploy the previous image tag
gcloud run deploy denialdefender-web \
  --image=europe-west1-docker.pkg.dev/denialdefender/denialdefender/web:<PREVIOUS_SHA> \
  --region=europe-west1 --project=denialdefender
```

---

## Troubleshooting

### "Cloud Run service crashed" — container logs

```bash
gcloud run services logs read denialdefender-web \
  --region=europe-west1 --project=denialdefender --limit=100
```
Key checks:
1. Container listening on PORT 8080.
2. `next.config.ts` is configured for production.
3. `/api/health` returns 200.

### "Permission denied" on Cloud Run deploy

The runtime service account is missing roles. Re-run:
```bash
bash infra/gcp/bootstrap.sh --skip-armor
```

### "API not enabled" errors

```bash
gcloud services enable \
  run.googleapis.com firestore.googleapis.com pubsub.googleapis.com \
  secretmanager.googleapis.com aiplatform.googleapis.com \
  modelarmor.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com --project=denialdefender
```

### Gemini calls fail / `mockMode: true` on Cloud Run

This means the agent-fleet cannot reach `gemini-3.6-flash`. Check:

1. The runtime SA has `roles/aiplatform.user`:
   ```bash
   gcloud projects get-iam-policy denialdefender \
     --flatten="bindings[].members" \
     --filter="bindings.members:315133452553-compute@developer.gserviceaccount.com" \
     --format="value(bindings.role)"
   ```
2. `GEMINI_MODEL=gemini-3.6-flash` is set on the agents service.
3. The agents service logs for `[Gemini]` warnings:
   ```bash
   gcloud run services logs read denialdefender-agents \
     --region=europe-west1 --project=denialdefender --limit=50 | grep Gemini
   ```
4. The Vertex AI API is enabled (`aiplatform.googleapis.com`).

Without these, the fleet falls back to mock mode — the pipeline runs but the
triage and letter are template-based, not Gemini-generated.

### trace-stream not reachable from web

Verify `NEXT_PUBLIC_TRACE_STREAM_URL` is set on the web service:
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
                    │               ├──► Agent Fleet (internal)      │
                    │               └──► Trace Stream (websocket)    │
                    │                                                 │
                    │  denialdefender-agents (Bun 8-agent fleet)      │
                    │    PORT 8080  │  0-10 instances                │
                    │               │                                 │
                    │               └──► Vertex AI / Gemini 3.6     │
                    │                    (global endpoint)            │
                    │                                                 │
  WS push ─────────►│  denialdefender-trace-stream (Socket.io)       │
                    │    PORT 8080  │  0-2 instances                 │
                    └─────────────────────────────────────────────────┘
```

A full image diagram is at [`docs/architecture.png`](./docs/architecture.png).

---

## Cost Estimate

| Resource | Tier | Monthly Cost |
|----------|------|--------------|
| Cloud Run (web) | 2 vCPU, 1 GiB, 0-4 | ~$0 (free tier: 2M req/mo) |
| Cloud Run (agents) | 4 vCPU, 2 GiB, 0-10 | ~$0 (scale-to-zero when idle) |
| Cloud Run (trace-stream) | 1 vCPU, 512 MiB, 0-2 | ~$0 (scale-to-zero when idle) |
| Firestore | eur3, <1 GB | ~$0 (free tier) |
| Pub/Sub | 4 topics, low volume | ~$0 (free tier: 10 GB/mo) |
| **Gemini 3.6 Flash** | **Vertex AI** | ~$0 (free tier) — paid: per 1M tokens |
| Secret Manager | 2 secrets | ~$0 (free tier: 6 versions) |
| Model Armor | dd-model-armor policy | ~$0 (free tier: 1,000 req/mo) |
| **Total** | | **~$0–15/mo** |

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `bash infra/gcp/bootstrap.sh` | Provision all GCP infrastructure |
| `bash infra/gcp/cloudrun/deploy.sh` | Build & deploy all 3 Cloud Run services |
| `bash infra/gcp/cloudrun/deploy.sh --web-only` | Deploy web service only |
| `bash mini-services/start-services.sh` | Start local trace-stream + agent-fleet |
| `gcloud run services list --region=europe-west1` | List Cloud Run services |
| `gcloud run services logs read denialdefender-web --region=europe-west1` | View web logs |
| `gcloud secrets versions access latest --secret=gemini-api-key` | Read a secret |
| `gcloud builds submit --config=cloudbuild.yaml --project=denialdefender` | Run Cloud Build pipeline |
