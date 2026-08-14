#!/usr/bin/env bash
# DenialDefender GCP Infrastructure Bootstrap
# Day 1 — Provision: Firestore + Cloud SQL pgvector + Pub/Sub + Service Accounts + APIs
# Region: europe-west1, Firestore: eur3 (multi-region)
#
# Prerequisites:
#   1. gcloud CLI authenticated
#   2. Service account key file at $GOOGLE_APPLICATION_CREDENTIALS
#   3. Project ID set (denialdefender)
#
# Usage: bash infra/gcp/bootstrap.sh

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-denialdefender}"
REGION="${GCP_REGION:-europe-west1}"
FIRESTORE_LOCATION="${FIRESTORE_LOCATION:-eur3}"
SA_EMAIL="json-775@denialdefender.iam.gserviceaccount.com"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ── Step 1: Enable Required APIs ───────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  DenialDefender GCP Bootstrap — Day 1 Infrastructure"
echo "  Project: ${PROJECT_ID}  Region: ${REGION}"
echo "═══════════════════════════════════════════════════════════════"
echo ""

echo "── Step 1: Enabling Required APIs ──────────────────────────────"

APIS=(
  "cloudbuild.googleapis.com"
  "run.googleapis.com"
  "firestore.googleapis.com"
  "sqladmin.googleapis.com"
  "pubsub.googleapis.com"
  "secretmanager.googleapis.com"
  "aiplatform.googleapis.com"
  "cloudtrace.googleapis.com"
  "clouderrorreporting.googleapis.com"
  "cloudprofiler.googleapis.com"
  "iamcredentials.googleapis.com"
  "serviceusage.googleapis.com"
  "cloudresourcemanager.googleapis.com"
  "compute.googleapis.com"
  "identitytoolkit.googleapis.com"
)

for api in "${APIS[@]}"; do
  echo "  Enabling ${api}..."
  gcloud services enable "${api}" --project="${PROJECT_ID}" --quiet 2>/dev/null || warn "Failed to enable ${api} (may already be enabled)"
done
log "All APIs enabled"

# ── Step 2: Create Firestore Database ─────────────────────────────────────────
echo ""
echo "── Step 2: Creating Firestore Database ────────────────────────"
echo "  Location: ${FIRESTORE_LOCATION} (multi-region for europe-west1)"

gcloud firestore databases create \
  --location="${FIRESTORE_LOCATION}" \
  --type=firestore-native \
  --project="${PROJECT_ID}" 2>/dev/null || warn "Firestore may already exist"

log "Firestore database ready at ${FIRESTORE_LOCATION}"

# ── Step 3: Create Cloud SQL pgvector Instance ────────────────────────────────
echo ""
echo "── Step 3: Creating Cloud SQL (PostgreSQL + pgvector) ──────────"
echo "  Instance: denialdefender-pg  Region: ${REGION}"

gcloud sql instances create denialdefender-pg \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region="${REGION}" \
  --storage-type=SSD \
  --storage-size=10GB \
  --project="${PROJECT_ID}" \
  --database-flags=max_connections=200 2>/dev/null || warn "Cloud SQL instance may already exist"

# Create the evidence database
gcloud sql databases create evidence \
  --instance=denialdefender-pg \
  --project="${PROJECT_ID}" 2>/dev/null || warn "Database may already exist"

log "Cloud SQL PostgreSQL instance ready with pgvector support"

# ── Step 4: Apply pgvector Schema ─────────────────────────────────────────────
echo ""
echo "── Step 4: Applying pgvector Schema ───────────────────────────"

# The pgvector extension and schema will be applied via cloud-sql-schema.sql
warn "Run the schema in cloud-sql-schema.sql against the Cloud SQL instance"

# ── Step 5: Create Pub/Sub Topics ─────────────────────────────────────────────
echo ""
echo "── Step 5: Creating Pub/Sub Topics ────────────────────────────"

TOPICS=("decision_trace" "agent_tasks" "case_events" "gate_events")

for topic in "${TOPICS[@]}"; do
  echo "  Creating topic: ${topic}"
  gcloud pubsub topics create "${topic}" --project="${PROJECT_ID}" 2>/dev/null || warn "Topic ${topic} may already exist"
done
log "Pub/Sub topics created"

# ── Step 6: Create Service Accounts ───────────────────────────────────────────
echo ""
echo "── Step 6: Creating Service Accounts ──────────────────────────"

SAS=(
  "dd-api-sa:API Gateway service account"
  "dd-agents-sa:Agent workflow service account"
  "dd-ingest-sa:Evidence ingest service account"
  "dd-phi-guard-sa:PHI Guard service account"
  "dd-eval-sa:Evaluation harness service account"
)

for sa_def in "${SAS[@]}"; do
  IFS=':' read -r sa_name sa_desc <<< "${sa_def}"
  sa_full="${sa_name}@${PROJECT_ID}.iam.gserviceaccount.com"
  echo "  Creating: ${sa_name}"
  gcloud iam service-accounts create "${sa_name}" \
    --display-name="${sa_desc}" \
    --project="${PROJECT_ID}" 2>/dev/null || warn "SA ${sa_name} may already exist"
done
log "Service accounts created"

# ── Step 7: Assign IAM Roles ──────────────────────────────────────────────────
echo ""
echo "── Step 7: Assigning IAM Roles ────────────────────────────────"

# Main service account roles
ROLES=(
  "roles/run.admin"
  "roles/iam.serviceAccountUser"
  "roles/datastore.owner"
  "roles/cloudsql.admin"
  "roles/pubsub.admin"
  "roles/secretmanager.admin"
  "roles/aiplatform.user"
  "roles/serviceusage.serviceUsageConsumer"
  "roles/resourcemanager.projectIamAdmin"
  "roles/cloudtrace.agent"
  "roles/errorreporting.writer"
)

for role in "${ROLES[@]}"; do
  echo "  Binding ${role} to ${SA_EMAIL}"
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="${role}" \
    --quiet 2>/dev/null || warn "Role ${role} may already be bound"
done
log "IAM roles assigned"

# ── Step 8: Create Secrets ────────────────────────────────────────────────────
echo ""
echo "── Step 8: Creating Secrets ───────────────────────────────────"

SECRETS=("gemini-api-key" "npi-registry-key" "phi-guard-config")

for secret in "${SECRETS[@]}"; do
  echo "  Creating secret: ${secret}"
  echo "placeholder" | gcloud secrets create "${secret}" \
    --data-file=- \
    --project="${PROJECT_ID}" 2>/dev/null || warn "Secret ${secret} may already exist"
done
log "Secrets created (populate with real values via gcloud secrets versions add)"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅  DenialDefender GCP Bootstrap Complete"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Project:    ${PROJECT_ID}"
echo "  Region:     ${REGION}"
echo "  Firestore:  ${FIRESTORE_LOCATION}"
echo "  Cloud SQL:  denialdefender-pg (PostgreSQL 16 + pgvector)"
echo "  Pub/Sub:    decision_trace, agent_tasks, case_events, gate_events"
echo ""
echo "  Next steps:"
echo "  1. Apply cloud-sql-schema.sql to the Cloud SQL instance"
echo "  2. Populate secrets with real values"
echo "  3. Run verify_day1_gate.py to confirm the round-trip"
echo ""
