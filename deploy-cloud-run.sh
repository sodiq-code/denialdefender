#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# DenialDefender — Cloud Run Deployment Script
# ══════════════════════════════════════════════════════════════════════════════
# Deploys both mini-services (trace-stream, agent-fleet) to Google Cloud Run.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - Docker installed and running
#   - GCP Artifact Registry repository created
#   - Required env vars: GEMINI_API_KEY
#
# Usage:
#   chmod +x deploy-cloud-run.sh
#   ./deploy-cloud-run.sh
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Configuration ──────────────────────────────────────────────────────────
GCP_PROJECT_ID="denialdefender"
REGION="us-central1"
ARTIFACT_REPO="denialdefender"
MIN_INSTANCES=0
MAX_INSTANCES=1
MEMORY="512Mi"
CPU=1

# Service names
TRACE_STREAM_SERVICE="trace-stream"
AGENT_FLEET_SERVICE="agent-fleet"

# Image tags (will include commit SHA for traceability)
COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "latest")
TRACE_STREAM_IMAGE="trace-stream:${COMMIT_SHA}"
AGENT_FLEET_IMAGE="agent-fleet:${COMMIT_SHA}"

# Artifact Registry image paths
AR_BASE="${REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${ARTIFACT_REPO}"
AR_TRACE_STREAM="${AR_BASE}/${TRACE_STREAM_SERVICE}"
AR_AGENT_FLEET="${AR_BASE}/${AGENT_FLEET_SERVICE}"

# ─── Colors ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }

# ─── Pre-flight Checks ─────────────────────────────────────────────────────
info "Running pre-flight checks..."

# Check gcloud
if ! command -v gcloud &>/dev/null; then
  fail "gcloud CLI not found. Install from https://cloud.google.com/sdk/docs/install"
fi
ok "gcloud CLI found"

# Check Docker
if ! command -v docker &>/dev/null; then
  fail "Docker not found. Install from https://docs.docker.com/get-docker/"
fi
ok "Docker found"

# Check authentication
info "Checking gcloud authentication..."
if ! gcloud auth print-access-token &>/dev/null; then
  warn "Not authenticated. Launching gcloud auth login..."
  gcloud auth login
fi

# Verify the account
ACCOUNT=$(gcloud config get-value account 2>/dev/null || echo "unknown")
ok "Authenticated as: ${ACCOUNT}"

# Set the project
gcloud config set project "${GCP_PROJECT_ID}" --quiet
ok "GCP project set to: ${GCP_PROJECT_ID}"

# Check required env vars
if [ -z "${GEMINI_API_KEY:-}" ]; then
  warn "GEMINI_API_KEY not set. Agent fleet will run in MOCK_MODE."
  warn "Set it with: export GEMINI_API_KEY=your-key"
fi

# ─── Enable Required APIs ──────────────────────────────────────────────────
info "Enabling required GCP APIs..."
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  --project="${GCP_PROJECT_ID}" \
  --quiet
ok "Required APIs enabled"

# ─── Create Artifact Registry Repository ───────────────────────────────────
info "Ensuring Artifact Registry repository exists..."
if ! gcloud artifacts repositories describe "${ARTIFACT_REPO}" \
  --location="${REGION}" \
  --project="${GCP_PROJECT_ID}" &>/dev/null; then
  gcloud artifacts repositories create "${ARTIFACT_REPO}" \
    --repository-format=docker \
    --location="${REGION}" \
    --project="${GCP_PROJECT_ID}" \
    --description="DenialDefender Docker images"
  ok "Created Artifact Registry repository: ${ARTIFACT_REPO}"
else
  ok "Artifact Registry repository exists: ${ARTIFACT_REPO}"
fi

# Configure Docker for Artifact Registry
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
ok "Docker configured for Artifact Registry"

# ─── Build & Push: trace-stream ─────────────────────────────────────────────
info "Building trace-stream Docker image..."
docker build \
  -t "${TRACE_STREAM_IMAGE}" \
  -t "${AR_TRACE_STREAM}:${COMMIT_SHA}" \
  -t "${AR_TRACE_STREAM}:latest" \
  ./mini-services/trace-stream/
ok "Built trace-stream image"

info "Pushing trace-stream to Artifact Registry..."
docker push "${AR_TRACE_STREAM}:${COMMIT_SHA}"
docker push "${AR_TRACE_STREAM}:latest"
ok "Pushed trace-stream image"

# ─── Build & Push: agent-fleet ──────────────────────────────────────────────
info "Building agent-fleet Docker image..."
docker build \
  -t "${AGENT_FLEET_IMAGE}" \
  -t "${AR_AGENT_FLEET}:${COMMIT_SHA}" \
  -t "${AR_AGENT_FLEET}:latest" \
  ./mini-services/agent-fleet/
ok "Built agent-fleet image"

info "Pushing agent-fleet to Artifact Registry..."
docker push "${AR_AGENT_FLEET}:${COMMIT_SHA}"
docker push "${AR_AGENT_FLEET}:latest"
ok "Pushed agent-fleet image"

# ─── Deploy: trace-stream ──────────────────────────────────────────────────
info "Deploying trace-stream to Cloud Run..."
gcloud run deploy "${TRACE_STREAM_SERVICE}" \
  --image="${AR_TRACE_STREAM}:${COMMIT_SHA}" \
  --region="${REGION}" \
  --project="${GCP_PROJECT_ID}" \
  --platform=managed \
  --min-instances=${MIN_INSTANCES} \
  --max-instances=${MAX_INSTANCES} \
  --memory="${MEMORY}" \
  --cpu="${CPU} \
  --port=8080 \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production" \
  --quiet

TRACE_STREAM_URL=$(gcloud run services describe "${TRACE_STREAM_SERVICE}" \
  --region="${REGION}" \
  --project="${GCP_PROJECT_ID}" \
  --format='value(status.url)')
ok "Deployed trace-stream → ${TRACE_STREAM_URL}"

# ─── Deploy: agent-fleet ───────────────────────────────────────────────────
info "Deploying agent-fleet to Cloud Run..."

# Build env vars string for agent-fleet
AGENT_ENV_VARS="NODE_ENV=production,GCP_PROJECT_ID=${GCP_PROJECT_ID}"

if [ -n "${GEMINI_API_KEY:-}" ]; then
  AGENT_ENV_VARS="${AGENT_ENV_VARS},GEMINI_API_KEY=${GEMINI_API_KEY}"
fi

if [ -n "${TURSO_DATABASE_URL:-}" ]; then
  AGENT_ENV_VARS="${AGENT_ENV_VARS},TURSO_DATABASE_URL=${TURSO_DATABASE_URL}"
fi

if [ -n "${TURSO_AUTH_TOKEN:-}" ]; then
  AGENT_ENV_VARS="${AGENT_ENV_VARS},TURSO_AUTH_TOKEN=${TURSO_AUTH_TOKEN}"
fi

gcloud run deploy "${AGENT_FLEET_SERVICE}" \
  --image="${AR_AGENT_FLEET}:${COMMIT_SHA}" \
  --region="${REGION}" \
  --project="${GCP_PROJECT_ID}" \
  --platform=managed \
  --min-instances=${MIN_INSTANCES} \
  --max-instances=${MAX_INSTANCES} \
  --memory="${MEMORY}" \
  --cpu="${CPU} \
  --port=8080 \
  --allow-unauthenticated \
  --set-env-vars="${AGENT_ENV_VARS}" \
  --quiet

AGENT_FLEET_URL=$(gcloud run services describe "${AGENT_FLEET_SERVICE}" \
  --region="${REGION}" \
  --project="${GCP_PROJECT_ID}" \
  --format='value(status.url)')
ok "Deployed agent-fleet → ${AGENT_FLEET_URL}"

# ─── Summary ───────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  DenialDefender Cloud Run Deployment Complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Services:"
echo "    trace-stream : ${TRACE_STREAM_URL}"
echo "    agent-fleet  : ${AGENT_FLEET_URL}"
echo ""
echo "  Configuration:"
echo "    Project      : ${GCP_PROJECT_ID}"
echo "    Region       : ${REGION}"
echo "    Min/Max      : ${MIN_INSTANCES} / ${MAX_INSTANCES}"
echo "    Memory/CPU   : ${MEMORY} / ${CPU}"
echo "    Image Tag    : ${COMMIT_SHA}"
echo ""
echo "  Next steps:"
echo "    1. Update your Next.js .env.local with:"
echo "       NEXT_PUBLIC_TRACE_STREAM_URL=${TRACE_STREAM_URL}"
echo "       AGENT_FLEET_URL=${AGENT_FLEET_URL}"
echo ""
echo "    2. Redeploy your Next.js frontend to pick up the new URLs"
echo ""
echo "  Cleanup (if needed):"
echo "    gcloud run services delete ${TRACE_STREAM_SERVICE} --region=${REGION} --quiet"
echo "    gcloud run services delete ${AGENT_FLEET_SERVICE} --region=${REGION} --quiet"
echo ""
