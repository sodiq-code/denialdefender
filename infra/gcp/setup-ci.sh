#!/usr/bin/env bash
# DenialDefender CI/CD One-Time Setup
# ====================================
# Sets up everything needed for auto-deployment:
#   - Artifact Registry repository
#   - Cloud Build service account permissions
#   - Service account key for GitHub Actions
#   - Cloud Build GitHub trigger
#
# Prerequisites:
#   1. gcloud CLI authenticated
#   2. Project ID known
#   3. GitHub repo: sodiq-code/denialdefender
#
# Usage: bash infra/gcp/setup-ci.sh

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-project-8a09278a-5593-4289-b2e}"
REGION="${GCP_REGION:-europe-west1}"
REPO_NAME="denialdefender-artifacts"
SERVICE_NAME="denialdefender"
GITHUB_OWNER="sodiq-code"
GITHUB_REPO="denialdefender"
SA_NAME="dd-deploy-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  DenialDefender CI/CD Setup — One-Time Configuration"
echo "  Project: ${PROJECT_ID}  Region: ${REGION}"
echo "  GitHub:  ${GITHUB_OWNER}/${GITHUB_REPO}"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Ensure APIs are enabled ───────────────────────────────────────────
echo "── Step 1: Enabling Required APIs ──────────────────────────────"

APIS=(
  "cloudbuild.googleapis.com"
  "run.googleapis.com"
  "artifactregistry.googleapis.com"
  "secretmanager.googleapis.com"
  "iamcredentials.googleapis.com"
)

for api in "${APIS[@]}"; do
  echo "  Enabling ${api}..."
  gcloud services enable "${api}" --project="${PROJECT_ID}" --quiet 2>/dev/null || warn "May already be enabled"
done
log "APIs enabled"

# ── Step 2: Create deployment service account ────────────────────────────────
echo ""
echo "── Step 2: Creating Deployment Service Account ───────────────"

gcloud iam service-accounts create "${SA_NAME}" \
  --display-name="DenialDefender CI/CD Deploy SA" \
  --project="${PROJECT_ID}" 2>/dev/null || warn "SA may already exist"

log "Service account created: ${SA_EMAIL}"

# ── Step 3: Grant IAM roles to deploy SA ─────────────────────────────────────
echo ""
echo "── Step 3: Granting IAM Roles ────────────────────────────────"

ROLES=(
  "roles/run.admin"
  "roles/iam.serviceAccountUser"
  "roles/storage.admin"
  "roles/artifactregistry.admin"
  "roles/cloudbuild.builds.editor"
  "roles/secretmanager.secretAccessor"
  "roles/serviceusage.serviceUsageConsumer"
)

for role in "${ROLES[@]}"; do
  echo "  Binding ${role}..."
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="${role}" \
    --quiet 2>/dev/null || warn "Role may already be bound"
done
log "IAM roles granted"

# ── Step 4: Create Artifact Registry repository ──────────────────────────────
echo ""
echo "── Step 4: Creating Artifact Registry Repository ─────────────"

gcloud artifacts repositories create "${REPO_NAME}" \
  --repository-format=docker \
  --location="${REGION}" \
  --project="${PROJECT_ID}" \
  --description="DenialDefender container images" 2>/dev/null || warn "Repository may already exist"

log "Artifact Registry: ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}"

# ── Step 5: Generate Service Account Key ─────────────────────────────────────
echo ""
echo "── Step 5: Generating Service Account Key ────────────────────"

KEY_FILE="dd-deploy-sa-key.json"

if [ -f "${KEY_FILE}" ]; then
  warn "Key file ${KEY_FILE} already exists — skipping generation"
  warn "To regenerate, delete the file and re-run this script"
else
  gcloud iam service-accounts keys create "${KEY_FILE}" \
    --iam-account="${SA_EMAIL}" \
    --project="${PROJECT_ID}"

  log "Key file created: ${KEY_FILE}"
fi

echo ""
echo "  ┌─────────────────────────────────────────────────────────────────┐"
echo "  │  ⚠️  IMPORTANT: Add this key to GitHub Secrets               │"
echo "  │                                                               │"
echo "  │  1. Go to: https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/settings/secrets/actions │"
echo "  │  2. Click 'New secret'                                       │"
echo "  │  3. Name: GCP_SA_KEY                                         │"
echo "  │  4. Value: paste the ENTIRE contents of ${KEY_FILE}          │"
echo "  │     (NOT the gcloud command — the actual JSON key!)           │"
echo "  │  5. Click 'Add secret'                                       │"
echo "  └─────────────────────────────────────────────────────────────────┘"

echo ""
info "Run this command to copy the key to clipboard (macOS):"
echo "  pbcopy < ${KEY_FILE}"
info "Or (Linux):"
echo "  xclip -sel clip < ${KEY_FILE}"
info "Or just cat the file and copy the output:"
echo "  cat ${KEY_FILE}"

# ── Step 6: Create GCP_PROJECT_ID secret in GitHub ──────────────────────────
echo ""
echo "── Step 6: GitHub Secrets Setup ──────────────────────────────"

echo ""
info "Add these secrets to your GitHub repository:"
echo ""
echo "  ┌──────────────────────────────────────────────────────┐"
echo "  │  Secret Name     │  Value                            │"
echo "  ├──────────────────┼───────────────────────────────────┤"
echo "  │  GCP_PROJECT_ID  │  ${PROJECT_ID}    │"
echo "  │  GCP_SA_KEY      │  (contents of ${KEY_FILE})       │"
echo "  │  GCP_REGION      │  ${REGION}              │"
echo "  └──────────────────────────────────────────────────────┘"

# ── Step 7: Create Cloud Build trigger ───────────────────────────────────────
echo ""
echo "── Step 7: Cloud Build GitHub Trigger ───────────────────────"
echo ""
echo "  Cloud Build needs to connect to your GitHub repo first."
echo "  Do this in the Cloud Console:"
echo ""
echo "    https://console.cloud.google.com/cloud-build/repositories?project=${PROJECT_ID}"
echo ""
echo "  After connecting, run:"
echo ""
echo "    gcloud builds triggers create github \\"
echo "      --repo-name=${GITHUB_REPO} \\"
echo "      --repo-owner=${GITHUB_OWNER} \\"
echo "      --branch-pattern='^main\$' \\"
echo "      --build-config=cloudbuild.yaml \\"
echo "      --project=${PROJECT_ID}"
echo ""

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅  CI/CD Setup Complete"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Deployment options:"
echo ""
echo "  Option A: GitHub Actions (recommended)"
echo "    → Push to main branch triggers .github/workflows/deploy.yml"
echo "    → Builds Docker image → pushes to Artifact Registry → deploys Cloud Run"
echo ""
echo "  Option B: Cloud Build Trigger"
echo "    → Push to main triggers cloudbuild.yaml via GCP"
echo "    → Same pipeline, managed by Cloud Build"
echo ""
echo "  Both options deploy to:"
echo "    Cloud Run: ${SERVICE_NAME} in ${REGION}"
echo "    Image:     ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}"
echo ""
echo "  Key file: ${KEY_FILE} (keep this secure! don't commit to git)"
echo ""
