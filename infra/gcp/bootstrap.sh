#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# DenialDefender GCP Infrastructure Bootstrap
# ══════════════════════════════════════════════════════════════════════════════
# Day 1 — Provision: Firestore + Pub/Sub + Service Accounts + APIs
# Region: europe-west1, Firestore: eur3 (EU multi-region)
#
# Project:    denialdefender (number 315133452553)
# Provider:   GEMINI_PROVIDER=vertex_ai
# Framework:  ADK_FRAMEWORK=google-adk
# Model:      gemini-3.6-flash (see DEPLOY.md "Model selection")
#
# Prerequisites:
#   1. gcloud CLI authenticated
#   2. Billing enabled on the project
#
# Usage:
#   bash infra/gcp/bootstrap.sh
#   bash infra/gcp/bootstrap.sh --skip-armor
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-denialdefender}"
REGION="${GCP_REGION:-europe-west1}"
FIRESTORE_LOCATION="${FIRESTORE_LOCATION:-eur3}"
SA_EMAIL="dd-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
SKIP_ARMOR=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-armor) SKIP_ARMOR=true; shift ;;
    --project)    PROJECT_ID="$2"; shift 2 ;;
    --region)     REGION="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  DenialDefender GCP Bootstrap — Day 1 Infrastructure"
echo "  Project:    ${PROJECT_ID} (315133452553)"
echo "  Region:     ${REGION}"
echo "  Firestore:  ${FIRESTORE_LOCATION}"
echo "  Provider:   GEMINI_PROVIDER=vertex_ai, ADK_FRAMEWORK=google-adk"
echo "  Model:      gemini-3.6-flash"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Enable Required APIs ──────────────────────────────────────────────
echo "── Step 1: Enabling Required APIs ──────────────────────────────"
APIS=(
  "cloudbuild.googleapis.com"
  "run.googleapis.com"
  "firestore.googleapis.com"
  "pubsub.googleapis.com"
  "secretmanager.googleapis.com"
  "aiplatform.googleapis.com"
  "generativelanguage.googleapis.com"
  "modelarmor.googleapis.com"
  "cloudtrace.googleapis.com"
  "clouderrorreporting.googleapis.com"
  "iamcredentials.googleapis.com"
  "serviceusage.googleapis.com"
  "cloudresourcemanager.googleapis.com"
  "compute.googleapis.com"
  "artifactregistry.googleapis.com"
  "sourcerepo.googleapis.com"
)
for api in "${APIS[@]}"; do
  echo "  Enabling ${api}..."
  gcloud services enable "${api}" --project="${PROJECT_ID}" --quiet 2>/dev/null || warn "Failed to enable ${api} (may already be enabled)"
done
log "All APIs enabled"

# ── Step 2: Create Firestore Database ─────────────────────────────────────────
echo ""
echo "── Step 2: Creating Firestore Database ───────────────────────────"
echo "  Location: ${FIRESTORE_LOCATION} (EU multi-region for europe-west1)"
gcloud firestore databases create \
  --location="${FIRESTORE_LOCATION}" \
  --type=firestore-native \
  --project="${PROJECT_ID}" 2>/dev/null || warn "Firestore may already exist"
log "Firestore database ready at ${FIRESTORE_LOCATION}"

# ── Step 3: Create Pub/Sub Topics ─────────────────────────────────────────────
echo ""
echo "── Step 3: Creating Pub/Sub Topics ──────────────────────────────"
TOPICS=("decision_trace" "agent_tasks" "case_events" "gate_events")
for topic in "${TOPICS[@]}"; do
  echo "  Creating topic: ${topic}"
  gcloud pubsub topics create "${topic}" --project="${PROJECT_ID}" 2>/dev/null || warn "Topic ${topic} may already exist"
done
log "Pub/Sub topics created"

# ── Step 4: Create Service Account ────────────────────────────────────────────
echo ""
echo "── Step 4: Creating Runtime Service Account ────────────────────"
gcloud iam service-accounts create dd-runtime \
  --display-name="DenialDefender Runtime SA" \
  --project="${PROJECT_ID}" 2>/dev/null || warn "SA dd-runtime may already exist"
log "Service account: ${SA_EMAIL}"

# ── Step 5: Assign IAM Roles ───────────────────────────────────────────────────
echo ""
echo "── Step 5: Assigning IAM Roles ─────────────────────────────────"
ROLES=(
  "roles/run.admin"
  "roles/iam.serviceAccountUser"
  "roles/datastore.owner"
  "roles/pubsub.admin"
  "roles/secretmanager.secretAccessor"
  "roles/secretmanager.admin"
  "roles/aiplatform.user"
  "roles/serviceusage.serviceUsageConsumer"
  "roles/cloudtrace.agent"
  "roles/errorreporting.writer"
  "roles/logging.logWriter"
  "roles/monitoring.metricWriter"
  "roles/modelarmor.user"
)
for role in "${ROLES[@]}"; do
  echo "  Binding ${role}..."
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="${role}" \
    --quiet 2>/dev/null || warn "Role ${role} may already be bound"
done
log "IAM roles assigned"

# ── Step 6: Create Secrets (placeholder values) ───────────────────────────────
echo ""
echo "── Step 6: Creating Secrets ────────────────────────────────────"
SECRETS=("gemini-api-key" "phi-guard-config")
for secret in "${SECRETS[@]}"; do
  echo "  Creating secret: ${secret}"
  echo "placeholder" | gcloud secrets create "${secret}" \
    --data-file=- \
    --project="${PROJECT_ID}" 2>/dev/null || warn "Secret ${secret} may already exist"
done
log "Secrets created — populate with real values via: gcloud secrets versions add"

# ── Step 7: Create Artifact Registry Repository ──────────────────────────────
echo ""
echo "── Step 7: Creating Artifact Registry Repository ──────────────"
gcloud artifacts repositories create "${AR_REPO:-denialdefender}" \
  --repository-format=docker \
  --location="${REGION}" \
  --project="${PROJECT_ID}" \
  --description="DenialDefender container images" 2>/dev/null || warn "Artifact registry may already exist"
log "Artifact Registry: ${REGION}-docker.pkg.dev/${PROJECT_ID}/denialdefender"

# ── Step 8: Model Armor setup (optional) ──────────────────────────────────────
echo ""
echo "── Step 8: Model Armor ─────────────────────────────────────────"
if [[ "${SKIP_ARMOR}" == true ]]; then
  warn "Skipping Model Armor (--skip-armor)"
else
  echo "  See infra/gcp/model-armor-setup.sh for full Model Armor configuration."
  echo "  Running quick policy create..."
  bash "$(dirname "${BASH_SOURCE[0]}")/model-armor-setup.sh" --project "${PROJECT_ID}" --region "${REGION}" 2>/dev/null || warn "Model Armor setup did not complete — run model-armor-setup.sh manually"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅  DenialDefender GCP Bootstrap Complete"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Project:    ${PROJECT_ID} (315133452553)"
echo "  Region:     ${REGION}"
echo "  Firestore:  ${FIRESTORE_LOCATION}"
echo "  Pub/Sub:    decision_trace, agent_tasks, case_events, gate_events"
echo "  SA:         ${SA_EMAIL}"
echo ""
echo "  Next steps:"
echo "  1. Populate gemini-api-key secret with your Gemini API key"
echo "  2. Run: bash infra/gcp/setup-ci.sh   (one-time CI/CD setup)"
echo "  3. Deploy: bash infra/gcp/cloudrun/deploy.sh"
echo "  4. Verify: bash infra/seed/verify_day1_gate.py --api-url <web-url>"
echo ""
