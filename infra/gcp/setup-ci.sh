#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# DenialDefender CI/CD One-Time Setup
# ══════════════════════════════════════════════════════════════════════════════
# Sets up everything needed for auto-deployment via GitHub Actions:
#   - Artifact Registry repository
#   - Cloud Build service account + permissions
#   - Service account key for GitHub Actions (GCP_SA_KEY)
#   - GitHub Actions secrets instructions
#
# Prerequisites:
#   1. gcloud CLI authenticated
#   2. Project: denialdefender (315133452553)
#   3. GitHub repo: denialdefender (placeholder — replace with your org)
#
# Usage: bash infra/gcp/setup-ci.sh
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-denialdefender}"
REGION="${GCP_REGION:-europe-west1}"
REPO_NAME="denialdefender"
GITHUB_OWNER="${GITHUB_OWNER:-your-org}"
GITHUB_REPO="${GITHUB_REPO:-denialdefender}"
SA_NAME="dd-deploy-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  DenialDefender CI/CD Setup — One-Time Configuration"
echo "  Project:  ${PROJECT_ID} (315133452553)"
echo "  Region:   ${REGION}"
echo "  GitHub:   ${GITHUB_OWNER}/${GITHUB_REPO}"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Ensure APIs ─────────────────────────────────────────────────────────
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

# ── Step 2: Create deployment service account ─────────────────────────────────
echo ""
echo "── Step 2: Creating Deployment Service Account ────────────────"
gcloud iam service-accounts create "${SA_NAME}" \
  --display-name="DenialDefender CI/CD Deploy SA" \
  --project="${PROJECT_ID}" 2>/dev/null || warn "SA may already exist"
log "Service account: ${SA_EMAIL}"

# ── Step 3: Grant IAM roles ────────────────────────────────────────────────────
echo ""
echo "── Step 3: Granting IAM Roles ──────────────────────────────────"
ROLES=(
  "roles/run.admin"
  "roles/iam.serviceAccountUser"
  "roles/storage.admin"
  "roles/artifactregistry.admin"
  "roles/cloudbuild.builds.editor"
  "roles/secretmanager.admin"
  "roles/serviceusage.serviceUsageConsumer"
  "roles/resourcemanager.projectIamAdmin"
)
for role in "${ROLES[@]}"; do
  echo "  Binding ${role}..."
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="${role}" \
    --quiet 2>/dev/null || warn "Role may already be bound"
done
log "IAM roles granted"

# ── Step 4: Create Artifact Registry repository ────────────────────────────────
echo ""
echo "── Step 4: Creating Artifact Registry Repository ─────────────"
gcloud artifacts repositories create "${REPO_NAME}" \
  --repository-format=docker \
  --location="${REGION}" \
  --project="${PROJECT_ID}" \
  --description="DenialDefender container images" 2>/dev/null || warn "Repository may already exist"
log "Artifact Registry: ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}"

# ── Step 5: Generate Service Account Key for GitHub Actions ───────────────────
echo ""
echo "── Step 5: Generating Service Account Key ─────────────────────"
KEY_FILE="dd-deploy-sa-key.json"
if [ -f "${KEY_FILE}" ]; then
  warn "Key file ${KEY_FILE} already exists — skipping generation"
else
  gcloud iam service-accounts keys create "${KEY_FILE}" \
    --iam-account="${SA_EMAIL}" \
    --project="${PROJECT_ID}"
  log "Key file: ${KEY_FILE}"
fi

echo ""
echo "  ┌─────────────────────────────────────────────────────────────────┐"
echo "  │  ⚠️  Add this key to GitHub Secrets                            │"
echo "  │                                                               │"
echo "  │  1. https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/settings/secrets/actions │"
echo "  │  2. New secret: GCP_SA_KEY                                    │"
echo "  │  3. Value: paste ENTIRE contents of ${KEY_FILE}               │"
echo "  │  4. Add secret: GCP_PROJECT_ID = ${PROJECT_ID}                │"
echo "  │  5. Add secret: GEMINI_API_KEY = your Gemini API key           │"
echo "  └─────────────────────────────────────────────────────────────────┘"

# ── Step 6: Summary ───────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅  CI/CD Setup Complete"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Deployment options:"
echo "    A. GitHub Actions (recommended) — push to main → .github/workflows/deploy.yml"
echo "    B. Cloud Build trigger — push to main → cloudbuild.yaml"
echo ""
echo "  Both deploy 3 services to Cloud Run in ${REGION}:"
echo "    • denialdefender-web           (public, 2 vCPU/1GiB, 0-4)"
echo "    • denialdefender-agents        (internal, 4 vCPU/2GiB, 0-10)"
echo "    • denialdefender-trace-stream  (public, 1 vCPU/512Mi, 0-2)"
echo ""
echo "  Key file: ${KEY_FILE} (keep secure! do NOT commit to git)"
echo ""
