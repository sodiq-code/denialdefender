#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# DenialDefender — Cloud Run Manual Deployment Script
# ══════════════════════════════════════════════════════════════════════════════
# Deploys the DenialDefender application to Google Cloud Run.
#
# Usage:
#   bash infra/gcp/cloudrun/deploy.sh                # Full deployment
#   bash infra/gcp/cloudrun/deploy.sh --web-only     # Web service only
#   bash infra/gcp/cloudrun/deploy.sh --agents-only   # Agent fleet only
#   bash infra/gcp/cloudrun/deploy.sh --trace-only    # Trace stream only
#
# Project: denialdefender (315133452553)
# Region:  europe-west1
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

PROJECT_ID="denialdefender"
REGION="europe-west1"
FIRESTORE_LOCATION="eur3"
WEB_SERVICE="denialdefender-web"
AGENT_SERVICE="denialdefender-agents"
TRACE_SERVICE="denialdefender-trace-stream"
AR_HOST="${REGION}-docker.pkg.dev"
AR_REPO="denialdefender"
WEB_IMAGE="${AR_HOST}/${PROJECT_ID}/${AR_REPO}/${WEB_SERVICE}"
AGENT_IMAGE="${AR_HOST}/${PROJECT_ID}/${AR_REPO}/${AGENT_SERVICE}"
TRACE_IMAGE="${AR_HOST}/${PROJECT_ID}/${AR_REPO}/${TRACE_SERVICE}"
SA_EMAIL="dd-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
VPC_CONNECTOR="dd-vpc-connector"
MODEL_ARMOR_POLICY_ID="${MODEL_ARMOR_POLICY_ID:-dd-model-armor}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-3.6-flash}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }
step() { echo -e "\n${CYAN}${BOLD}── $1 ──${NC}\n"; }

# ── Parse Arguments ────────────────────────────────────────────────────────────
DEPLOY_WEB=true
DEPLOY_AGENTS=true
DEPLOY_TRACE=true

while [[ $# -gt 0 ]]; do
  case $1 in
    --web-only)     DEPLOY_AGENTS=false; DEPLOY_TRACE=false; shift ;;
    --agents-only)  DEPLOY_WEB=false; DEPLOY_TRACE=false; shift ;;
    --trace-only)   DEPLOY_WEB=false; DEPLOY_AGENTS=false; shift ;;
    --help|-h)
      echo "Usage: bash deploy.sh [--web-only|--agents-only|--trace-only]"
      exit 0 ;;
    *) err "Unknown argument: $1"; exit 1 ;;
  esac
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  🚀 DenialDefender — Cloud Run Deployment"
echo "  Project: ${PROJECT_ID} (315133452553)"
echo "  Region:  ${REGION}"
echo "═══════════════════════════════════════════════════════════════"

step "Step 0: Pre-flight Checks"

if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | head -1 > /dev/null; then
  err "gcloud CLI not authenticated. Run: gcloud auth login"
  exit 1
fi
log "gcloud authenticated"

gcloud config set project "${PROJECT_ID}" --quiet
log "Project set to ${PROJECT_ID}"

# ── Deploy Trace Stream ────────────────────────────────────────────────────────
if [[ "${DEPLOY_TRACE}" == true ]]; then
  step "Step 1: Build & Deploy Trace Stream Service"
  echo "  Building container via Cloud Build..."
  echo "  Context: ${PROJECT_ROOT}/mini-services/trace-stream"
  gcloud builds submit \
    --tag "${TRACE_IMAGE}:latest" \
    --project "${PROJECT_ID}" \
    "${PROJECT_ROOT}/mini-services/trace-stream"
  log "Trace stream image built"

  gcloud run deploy "${TRACE_SERVICE}" \
    --image "${TRACE_IMAGE}:latest" \
    --region "${REGION}" \
    --platform managed \
    --allow-unauthenticated \
    --port 3003 \
    --cpu 1 \
    --memory 512Mi \
    --min-instances 0 \
    --max-instances 2 \
    --concurrency 80 \
    --timeout 300 \
    --set-env-vars "NODE_ENV=production" \
    --set-env-vars "GCP_PROJECT_ID=${PROJECT_ID}" \
    --set-env-vars "GCP_REGION=${REGION}" \
    --project "${PROJECT_ID}"

  TRACE_URL=$(gcloud run services describe "${TRACE_SERVICE}" \
    --region "${REGION}" \
    --format "value(status.url)" \
    --project "${PROJECT_ID}")
  log "Trace stream deployed: ${TRACE_URL}"
fi

# ── Deploy Agent Fleet ─────────────────────────────────────────────────────────
if [[ "${DEPLOY_AGENTS}" == true ]]; then
  step "Step 2: Build & Deploy Agent Fleet Service"
  AGENT_DIR="${PROJECT_ROOT}/mini-services/agent-fleet"
  if [[ ! -d "${AGENT_DIR}" ]]; then
    err "Agent fleet directory not found: ${AGENT_DIR}"
    exit 1
  fi

  gcloud builds submit \
    --tag "${AGENT_IMAGE}:latest" \
    --project "${PROJECT_ID}" \
    "${AGENT_DIR}"
  log "Agent fleet image built"

  gcloud run deploy "${AGENT_SERVICE}" \
    --image "${AGENT_IMAGE}:latest" \
    --region "${REGION}" \
    --platform managed \
    --no-allow-unauthenticated \
    --port 3004 \
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
    --set-env-vars "LOG_LEVEL=info" \
    --set-env-vars "GEMINI_MODEL=${GEMINI_MODEL}" \
    --set-env-vars "EMBEDDING_MODEL=text-embedding-004" \
    --set-env-vars "EMBEDDING_DIMENSIONS=768" \
    --set-env-vars "GEMINI_PROVIDER=vertex_ai" \
    --set-env-vars "ADK_FRAMEWORK=google-adk" \
    --set-env-vars "FORCE_LLM_BACKEND=gemini" \
    --set-env-vars "MEMORY_BANK_STORE=vertex_ai" \
    --set-env-vars "MODEL_ARMOR_POLICY_ID=${MODEL_ARMOR_POLICY_ID}" \
    --set-env-vars "MODEL_ARMOR_LOCATION=${REGION}" \
    --set-secrets "GEMINI_API_KEY=gemini-api-key:latest" \
    --project "${PROJECT_ID}"

  AGENT_URL=$(gcloud run services describe "${AGENT_SERVICE}" \
    --region "${REGION}" \
    --format "value(status.url)" \
    --project "${PROJECT_ID}")
  log "Agent fleet deployed: ${AGENT_URL}"
fi

# ── Deploy Web Service ─────────────────────────────────────────────────────────
if [[ "${DEPLOY_WEB}" == true ]]; then
  step "Step 3: Build & Deploy Next.js Web Service"
  gcloud builds submit \
    --tag "${WEB_IMAGE}:latest" \
    --project "${PROJECT_ID}" \
    "${PROJECT_ROOT}"
  log "Web image built"

  # Look up AGENT_FLEET_URL + TRACE_STREAM_URL if backends already deployed
  AGENT_URL=$(gcloud run services describe "${AGENT_SERVICE}" \
    --region "${REGION}" \
    --format "value(status.url)" \
    --project "${PROJECT_ID}" 2>/dev/null || echo "")
  TRACE_URL=$(gcloud run services describe "${TRACE_SERVICE}" \
    --region "${REGION}" \
    --format "value(status.url)" \
    --project "${PROJECT_ID}" 2>/dev/null || echo "")

  ENV_VARS="NODE_ENV=production,PORT=8080,GCP_PROJECT_ID=${PROJECT_ID},GCP_REGION=${REGION},FIRESTORE_LOCATION=${FIRESTORE_LOCATION},NEXT_PUBLIC_GCP_PROJECT_ID=${PROJECT_ID},NEXT_PUBLIC_APP_NAME=DenialDefender,MEMORY_BANK_STORE=vertex_ai,GEMINI_PROVIDER=vertex_ai,ADK_FRAMEWORK=google-adk,GEMINI_MODEL=${GEMINI_MODEL},MODEL_ARMOR_POLICY_ID=${MODEL_ARMOR_POLICY_ID},MODEL_ARMOR_LOCATION=${REGION}"
  if [[ -n "${AGENT_URL}" ]]; then
    ENV_VARS="${ENV_VARS},AGENT_FLEET_URL=${AGENT_URL}"
  fi
  if [[ -n "${TRACE_URL}" ]]; then
    ENV_VARS="${ENV_VARS},NEXT_PUBLIC_TRACE_STREAM_URL=${TRACE_URL}"
  fi

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
    --set-env-vars "${ENV_VARS}" \
    --set-secrets "GEMINI_API_KEY=gemini-api-key:latest" \
    --project "${PROJECT_ID}"

  WEB_URL=$(gcloud run services describe "${WEB_SERVICE}" \
    --region "${REGION}" \
    --format "value(status.url)" \
    --project "${PROJECT_ID}")
  log "Web service deployed: ${WEB_URL}"
fi

# ── Apply Cloud Run Service YAMLs ──────────────────────────────────────────────
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

# ── IAM: Web → Agent Fleet invoker ─────────────────────────────────────────────
if [[ "${DEPLOY_WEB}" == true ]] && [[ "${DEPLOY_AGENTS}" == true ]]; then
  step "Step 5: Configure IAM — Web → Agent Fleet invoker"
  gcloud run services add-iam-policy-binding "${AGENT_SERVICE}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/run.invoker" \
    --region "${REGION}" \
    --project "${PROJECT_ID}" 2>/dev/null || warn "IAM binding may already exist"
  log "Web → Agent fleet invoker permission configured"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅  DenialDefender Deployment Complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
if [[ "${DEPLOY_WEB}" == true ]]; then
  echo "  🌐 Web Service:        ${WEB_URL:-<pending>}"
  echo "     Port: 8080  Access: Public  CPU: 2  Memory: 1Gi  Scale: 0-4"
  echo ""
fi
if [[ "${DEPLOY_AGENTS}" == true ]]; then
  echo "  🤖 Agent Fleet:        ${AGENT_URL:-<pending>}"
  echo "     Port: 8080  Access: Internal  CPU: 4  Memory: 2Gi  Scale: 0-10"
  echo ""
fi
if [[ "${DEPLOY_TRACE}" == true ]]; then
  echo "  ⚡ Trace Stream:       ${TRACE_URL:-<pending>}"
  echo "     Port: 8080  Access: Public  CPU: 1  Memory: 512Mi  Scale: 0-2"
  echo ""
fi
echo "  📦 GCP Resources:"
echo "     Project:     ${PROJECT_ID} (315133452553)"
echo "     Region:      ${REGION}"
echo "     Firestore:   ${FIRESTORE_LOCATION}"
echo "     Pub/Sub:     decision_trace, agent_tasks, case_events, gate_events"
echo "     Model Armor: ${MODEL_ARMOR_POLICY_ID}"
echo "     Memory Bank: vertex_ai"
echo "     Gemini:      ${GEMINI_MODEL} (vertex_ai, google-adk)"
echo ""
echo "  🔗 Next steps:"
if [[ "${DEPLOY_WEB}" == true ]]; then
  echo "     1. Verify health: curl ${WEB_URL}/api/health"
  echo "     2. Test case round-trip via web UI"
fi
echo ""
