# Task 8: Finalize Cloud Run Deployment Configs for Production

## Summary
All deployment configs have been reviewed and updated for production readiness on GCP project "denialdefender" in europe-west1.

## Changes Made

### 1. Dockerfile (Root)
- **Fixed**: Stage 1 (deps) now uses `bun install --frozen-lockfile` instead of `npm ci` (project uses bun, no package-lock.json)
- **Fixed**: PORT changed from 3000 → 8080 (Cloud Run default)
- **Fixed**: EXPOSE 8080
- **Fixed**: HEALTHCHECK uses `${PORT:-8080}` instead of hardcoded 3000
- **Added**: Comment noting agent-fleet has its own Dockerfile
- **Verified**: Multi-stage build (deps → builder → runner), standalone output, non-root user

### 2. next.config.ts
- **Added**: `Strict-Transport-Security` header (max-age=63072000; includeSubDomains; preload)
- **Added**: `Permissions-Policy` header (camera=(), microphone=(), geolocation=())
- **Verified**: `output: 'standalone'` is set, images unoptimized for Cloud Run

### 3. /api/health Route (NEW)
- Created `src/app/api/health/route.ts` — returns `{status, service, timestamp, version}`
- Required for Dockerfile HEALTHCHECK and Cloud Run probes

### 4. .dockerignore (NEW)
- Created to exclude node_modules, .next, mini-services, infra, .env.*, tests, docs

### 5. nextjs-service.yaml
- **Fixed**: containerPort 3000 → 8080
- **Fixed**: PORT env "3000" → "8080"
- **Fixed**: Health check ports 3000 → 8080
- **Added**: MODEL_ARMOR_POLICY_ID env var
- **Added**: MODEL_ARMOR_LOCATION env var
- **Added**: MEMORY_BANK_STORE env var

### 6. agent-fleet-service.yaml
- **Fixed**: containerPort 3004 → 8080
- **Added**: PORT=8080 env var
- **Added**: FORCE_LLM_BACKEND=gemini env var
- **Added**: MODEL_ARMOR_POLICY_ID env var
- **Added**: MODEL_ARMOR_LOCATION env var
- **Added**: MEMORY_BANK_STORE env var
- **Fixed**: Health check ports 3004 → 8080

### 7. agent-fleet/Dockerfile
- **Fixed**: GCP_REGION us-central1 → europe-west1

### 8. deploy.sh
- **Fixed**: PORT 3000 → 8080 for web service
- **Fixed**: AGENT_FLEET_PORT → PORT=8080 for agent fleet
- **Added**: `--service-account` flag for both deployments
- **Added**: `--vpc-connector` and `--vpc-egress` flags
- **Added**: MODEL_ARMOR_POLICY_ID, MODEL_ARMOR_LOCATION, MEMORY_BANK_STORE env vars
- **Added**: FORCE_LLM_BACKEND=gemini for agent fleet
- **Added**: Step 5 — IAM for inter-service communication (run.invoker)
- **Added**: VPC connector pre-flight check
- **Added**: More API pre-flight checks
- **Removed**: Hardcoded GCP_PROJECT_NUMBER from agent fleet deploy

### 9. bootstrap.sh
- **Added**: `--skip-armor` argument
- **Added**: 4 new APIs: modelarmor.googleapis.com, logging.googleapis.com, monitoring.googleapis.com, iamcredentials.googleapis.com (19 total)
- **Added**: Step 11 — Model Armor policy creation (dd-model-armor) with 3 filters:
  - pi-filter (prompt injection detection)
  - pii-filter (PII/PHI detection)
  - uri-filter (malicious URI detection)
- **Added**: `roles/run.invoker` and `roles/modelarmor.user` IAM roles (20 total)
- **Added**: Model Armor user role for micro-service SAs
- **Fixed**: Cloud SQL database name "evidence" → "denialdefender"
- **Fixed**: Cloud SQL user "dd_app" → "denialdefender-app"
- **Fixed**: Connection string uses correct database/user names

### 10. .env.gcp.production (NEW)
- Created comprehensive template with all production env vars
- Sections: GCP Core, Application, Firestore, Cloud SQL, Gemini, Model Armor, Memory Bank, Agent Fleet, Pub/Sub, PHI Guard, Observability

### 11. DEPLOY.md
- **Added**: Step 4 — Model Armor Setup (GEAP Safety Shield)
- **Added**: Step 6 — GEAP Memory Bank Configuration
- **Added**: Step 7 — Agent Registry Configuration
- **Added**: Step 8 — Verify All 7 GEAP Components (curl commands for each)
- **Added**: Model Armor troubleshooting section
- **Updated**: Architecture diagram with PORT 8080, Model Armor, Vertex AI Memory
- **Updated**: All references from PORT 3000 → 8080
- **Updated**: Database user dd_app → denialdefender-app
- **Updated**: Database name evidence → denialdefender

## Verification
- ✅ Health endpoint responds: `GET /api/health` → 200
- ✅ ESLint passes
- ✅ Dev server running on port 3000
