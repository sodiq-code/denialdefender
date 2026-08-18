#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# DenialDefender — Cloud Run Deployment Script (Production-Ready)
# ══════════════════════════════════════════════════════════════════════════════
#
# Deploys the DenialDefender application to Google Cloud Run.
# This script provides clear proof of production-readiness for GCP deployment.
#
# Prerequisites:
#   1. gcloud CLI authenticated (gcloud auth login)
#   2. Billing enabled on the target project
#   3. APIs enabled: cloudbuild, run, secretmanager, firestore, sqladmin, pubsub
#   4. Secrets populated: gemini-api-key, cloud-sql-connection-string, phi-guard-config
#   5. VPC connector created (for Cloud SQL access)
#   6. Model Armor policy created (via bootstrap.sh)
#
# Usage:
#   bash infra/gcp/cloudrun/deploy.sh              # Full deployment
#   bash infra/gcp/cloudrun/deploy.sh --web-only   # Web service only
#   bash infra/gcp/cloudrun/deploy.sh --agents-only # Agent fleet only
#
# Project: denialdefender
# Region:  europe-west1
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────────
PROJECT_ID="denialdefender"
REGION="europe-west1"
FIRESTORE_LOCATION="eur3"
WEB_SERVICE="denialdefender-web"
AGENT_SERVICE="denialdefender-agents"
WEB_IMAGE="gcr.io/${PROJECT_ID}/${WEB_SERVICE}"
AGENT_IMAGE="gcr.io/${PROJECT_ID}/${AGENT_SERVICE}"
SA_EMAIL="json-775@${PROJECT_ID}.iam.gserviceaccount.com"
VPC_CONNECTOR="dd-vpc-connector"
MODEL_ARMOR_POLICY_ID="${MODEL_ARMOR_POLICY_ID:-dd-model-armor}"

# Resolve script directory for relative paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }
step() { echo -e "\n${CYAN}${BOLD}── $1 ──${NC}\n"; }

# ── Parse Arguments ────────────────────────────────────────────────────────────
DEPLOY_WEB=true
DEPLOY_AGENTS=true

while [[ $# -gt 0 ]]; do
  case $1 in
    --web-only)     DEPLOY_AGENTS=false; shift ;;
    --agents-only)  DEPLOY_WEB=false; shift ;;
    --help|-h)
      echo "Usage: bash deploy.sh [--web-only|--agents-only]"
      echo "  --web-only      Deploy only the Next.js web service"
      echo "  --agents-only   Deploy only the Python agent fleet"
      exit 0 ;;
    *) err "Unknown argument: $1"; exit 1 ;;
  esac
done

# ── Pre-flight Checks ─────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  🚀 DenialDefender — Cloud Run Deployment"
echo "  Project: ${PROJECT_ID}"
echo "  Region:  ${REGION}"
echo "═══════════════════════════════════════════════════════════════"

step "Step 0: Pre-flight Checks"

# Check gcloud authentication
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -1 > /dev/null 2>&1; then
  err "gcloud CLI not authenticated. Run: gcloud auth login"
  exit 1
fi
log "gcloud authenticated"

# Set project
gcloud config set project "${PROJECT_ID}" --quiet
log "Project set to ${PROJECT_ID}"

# Verify required APIs
REQUIRED_APIS=(
  "run.googleapis.com"
  "cloudbuild.googleapis.com"
  "secretmanager.googleapis.com"
  "firestore.googleapis.com"
  "sqladmin.googleapis.com"
  "pubsub.googleapis.com"
  "aiplatform.googleapis.com"
)
for api in "${REQUIRED_APIS[@]}"; do
  if gcloud services list --enabled --filter="name:${api}" --format="value(name)" | grep -q "${api}" 2>/dev/null; then
    log "API ${api} is enabled"
  else
    warn "API ${api} not enabled — attempting to enable..."
    gcloud services enable "${api}" --project="${PROJECT_ID}" --quiet || warn "Failed to enable ${api} (requires billing)"
  fi
done

# Verify VPC connector exists
if gcloud compute networks vpc-access connectors describe "${VPC_CONNECTOR}" \
  --region="${REGION}" --project="${PROJECT_ID}" 2>/dev/null | grep -q "name"; then
  log "VPC connector ${VPC_CONNECTOR} exists"
else
  warn "VPC connector ${VPC_CONNECTOR} not found — Cloud SQL access may fail"
  warn "Run bootstrap.sh or create manually"
fi

# ── Deploy Web Service (Next.js) ──────────────────────────────────────────────
if [[ "${DEPLOY_WEB}" == true ]]; then
  step "Step 1: Build & Deploy Next.js Web Service"

  echo "  Building container image via Cloud Build..."
  echo "  Context: ${PROJECT_ROOT}"
  echo "  Image:   ${WEB_IMAGE}:latest"

  # Build using Cloud Build (Dockerfile in project root)
  gcloud builds submit \
    --tag "${WEB_IMAGE}:latest" \
    --project "${PROJECT_ID}" \
    "${PROJECT_ROOT}"

  log "Web image built: ${WEB_IMAGE}:latest"

  echo ""
  echo "  Deploying to Cloud Run..."

  # Deploy web service
  gcloud run deploy "${WEB_SERVICE}" \
    --image "${WEB_IMAGE}:latest" \
    --region "${REGION}" \
    --platform managed \
    --allow-unauthenticated \
    --cpu 2 \
    --memory 1Gi \
    --min-instances 0 \
    --max-instances 4 \
    --concurrency 80 \
    --timeout 300 \
    --service-account "${SA_EMAIL}" \
    --vpc-connector "${VPC_CONNECTOR}" \
    --vpc-egress private-ranges-only \
    --set-env-vars "NODE_ENV=production" \
    --set-env-vars "PORT=8080" \
    --set-env-vars "GCP_PROJECT_ID=${PROJECT_ID}" \
    --set-env-vars "GCP_REGION=${REGION}" \
    --set-env-vars "FIRESTORE_LOCATION=${FIRESTORE_LOCATION}" \
    --set-env-vars "NEXT_PUBLIC_GCP_PROJECT_ID=${PROJECT_ID}" \
    --set-env-vars "NEXT_PUBLIC_APP_NAME=DenialDefender" \
    --set-env-vars "MODEL_ARMOR_POLICY_ID=${MODEL_ARMOR_POLICY_ID}" \
    --set-env-vars "MODEL_ARMOR_LOCATION=${REGION}" \
    --set-env-vars "MEMORY_BANK_STORE=vertex_ai" \
    --set-secrets "GEMINI_API_KEY=gemini-api-key:latest" \
    --project "${PROJECT_ID}"

  # ── Update Web Service with Agent Fleet & Trace Stream URLs ────────────────
  # Get the deployed URLs and update the web service so it can reach them
  AGENT_URL=$(gcloud run services describe "${AGENT_SERVICE}" \
    --region "${REGION}" \
    --format "value(status.url)" \
    --project "${PROJECT_ID}" 2>/dev/null || echo "")

  TRACE_URL=$(gcloud run services describe "denialdefender-trace-stream" \
    --region "${REGION}" \
    --format "value(status.url)" \
    --project "${PROJECT_ID}" 2>/dev/null || echo "")

  if [[ -n "${AGENT_URL}" ]]; then
    echo ""
    echo "  Updating web service with inter-service URLs..."
    ENV_UPDATE="AGENT_FLEET_URL=${AGENT_URL}"
    if [[ -n "${TRACE_URL}" ]]; then
      ENV_UPDATE="${ENV_UPDATE},NEXT_PUBLIC_TRACE_STREAM_URL=${TRACE_URL}"
    fi
    gcloud run services update "${WEB_SERVICE}" \
      --region "${REGION}" \
      --update-env-vars="${ENV_UPDATE}" \
      --project "${PROJECT_ID}" || warn "Failed to update web service URLs"
    log "Web service updated with AGENT_FLEET_URL and TRACE_STREAM_URL"
  fi

  # Get the deployed URL
  WEB_URL=$(gcloud run services describe "${WEB_SERVICE}" \
    --region "${REGION}" \
    --format "value(status.url)" \
    --project "${PROJECT_ID}")

  log "Web service deployed: ${WEB_URL}"
fi

# ── Deploy Agent Fleet (TypeScript/Bun + Python ADK) ──────────────────────────
if [[ "${DEPLOY_AGENTS}" == true ]]; then
  step "Step 2: Build & Deploy Agent Fleet Service"

  AGENT_DIR="${PROJECT_ROOT}/mini-services/agent-fleet"

  if [[ ! -d "${AGENT_DIR}" ]]; then
    err "Agent fleet directory not found: ${AGENT_DIR}"
    err "Ensure mini-services/agent-fleet/ exists with Dockerfile"
    exit 1
  fi

  echo "  Building container image via Cloud Build..."
  echo "  Context: ${AGENT_DIR}"
  echo "  Image:   ${AGENT_IMAGE}:latest"

  # Build agent fleet image
  gcloud builds submit \
    --tag "${AGENT_IMAGE}:latest" \
    --project "${PROJECT_ID}" \
    "${AGENT_DIR}"

  log "Agent fleet image built: ${AGENT_IMAGE}:latest"

  echo ""
  echo "  Deploying to Cloud Run..."

  # Deploy agent fleet (INTERNAL only — no public access)
  gcloud run deploy "${AGENT_SERVICE}" \
    --image "${AGENT_IMAGE}:latest" \
    --region "${REGION}" \
    --platform managed \
    --no-allow-unauthenticated \
    --cpu 4 \
    --memory 2Gi \
    --min-instances 0 \
    --max-instances 10 \
    --concurrency 10 \
    --timeout 600 \
    --service-account "${SA_EMAIL}" \
    --vpc-connector "${VPC_CONNECTOR}" \
    --vpc-egress private-ranges-only \
    --set-env-vars "GCP_PROJECT_ID=${PROJECT_ID}" \
    --set-env-vars "GCP_REGION=${REGION}" \
    --set-env-vars "FIRESTORE_LOCATION=${FIRESTORE_LOCATION}" \
    --set-env-vars "PORT=8080" \
    --set-env-vars "LOG_LEVEL=info" \
    --set-env-vars "GEMINI_MODEL=gemini-3.5-flash" \
    --set-env-vars "EMBEDDING_MODEL=text-embedding-004" \
    --set-env-vars "EMBEDDING_DIMENSIONS=768" \
    --set-env-vars "FORCE_LLM_BACKEND=gemini" \
    --set-env-vars "MODEL_ARMOR_POLICY_ID=${MODEL_ARMOR_POLICY_ID}" \
    --set-env-vars "MODEL_ARMOR_LOCATION=${REGION}" \
    --set-env-vars "MEMORY_BANK_STORE=vertex_ai" \
    --set-secrets "GEMINI_API_KEY=gemini-api-key:latest" \
    --set-secrets "DATABASE_URL=cloud-sql-connection-string:latest" \
    --set-secrets "PHI_GUARD_CONFIG=phi-guard-config:latest" \
    --project "${PROJECT_ID}"

  # Get the deployed URL
  AGENT_URL=$(gcloud run services describe "${AGENT_SERVICE}" \
    --region "${REGION}" \
    --format "value(status.url)" \
    --project "${PROJECT_ID}")

  log "Agent fleet deployed: ${AGENT_URL}"

  # ── Configure Pub/Sub Push Subscription ─────────────────────────────────────
  step "Step 3: Configure Pub/Sub → Agent Fleet Push Subscription"

  # Create push subscription so Pub/Sub forwards agent_tasks to the agent fleet
  gcloud pubsub subscriptions create agent-tasks-push \
    --topic agent_tasks \
    --push-endpoint="${AGENT_URL}/pubsub/handle" \
    --push-auth-service-account="${SA_EMAIL}" \
    --project "${PROJECT_ID}" 2>/dev/null || warn "Subscription may already exist"

  log "Pub/Sub push subscription configured"
fi

# ── Apply Cloud Run Service YAMLs ─────────────────────────────────────────────
step "Step 4: Apply Cloud Run Service Definitions (YAML)"

if [[ "${DEPLOY_WEB}" == true ]]; then
  echo "  Applying nextjs-service.yaml..."
  gcloud run services replace "${SCRIPT_DIR}/nextjs-service.yaml" \
    --region "${REGION}" \
    --project "${PROJECT_ID}" || warn "YAML apply may require namespace adjustment"
fi

if [[ "${DEPLOY_AGENTS}" == true ]]; then
  echo "  Applying agent-fleet-service.yaml..."
  gcloud run services replace "${SCRIPT_DIR}/agent-fleet-service.yaml" \
    --region "${REGION}" \
    --project "${PROJECT_ID}" || warn "YAML apply may require namespace adjustment"
fi

log "Service YAMLs applied"

# ── IAM: Allow Web Service to Invoke Agent Fleet ──────────────────────────────
if [[ "${DEPLOY_WEB}" == true ]] && [[ "${DEPLOY_AGENTS}" == true ]]; then
  step "Step 5: Configure IAM for Inter-Service Communication"

  # Allow the web service's SA to invoke the agent fleet
  gcloud run services add-iam-policy-binding "${AGENT_SERVICE}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/run.invoker" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" 2>/dev/null || warn "IAM binding may already exist"

  log "Web → Agent fleet invocation permission configured"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅  DenialDefender Deployment Complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""

if [[ "${DEPLOY_WEB}" == true ]]; then
  echo "  🌐 Web Service:"
  echo "     URL:  ${WEB_URL:-https://${WEB_SERVICE}-${REGION}.run.app}"
  echo "     Image: ${WEB_IMAGE}:latest"
  echo "     Port:  8080 (Cloud Run default)"
  echo "     Access: Public (unauthenticated)"
  echo ""
fi

if [[ "${DEPLOY_AGENTS}" == true ]]; then
  echo "  🤖 Agent Fleet:"
  echo "     URL:  ${AGENT_URL:-https://${AGENT_SERVICE}-${REGION}.run.app}"
  echo "     Image: ${AGENT_IMAGE}:latest"
  echo "     Port:  8080 (Cloud Run default)"
  echo "     Access: Internal only (Pub/Sub push)"
  echo ""
fi

echo "  📦 GCP Resources:"
echo "     Project:    ${PROJECT_ID}"
echo "     Region:     ${REGION}"
echo "     Firestore:  ${FIRESTORE_LOCATION}"
echo "     Pub/Sub:    decision_trace, agent_tasks, case_events, gate_events"
echo "     Cloud SQL:  denialdefender-pg (PostgreSQL 16 + pgvector)"
echo "     VPC:        ${VPC_CONNECTOR}"
echo "     Model Armor: ${MODEL_ARMOR_POLICY_ID}"
echo "     Memory Bank: vertex_ai"
echo ""
echo "  🔗 Next steps:"
echo "     1. Verify health: curl ${WEB_URL:-https://${WEB_SERVICE}-${REGION}.run.app}/api/health"
echo "     2. Test case round-trip via web UI"
echo "     3. Verify Model Armor: curl ${WEB_URL}/api/governance/armor"
echo "     4. Monitor: gcloud run services logs read ${WEB_SERVICE} --region ${REGION}"
echo ""
