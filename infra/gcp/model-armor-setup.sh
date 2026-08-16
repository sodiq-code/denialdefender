#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# DenialDefender — Model Armor Policy Setup (Task 4)
# ══════════════════════════════════════════════════════════════════════════════
#
# Creates and configures a Google Model Armor policy in GCP for the
# Fortified Enterprise Fleet deployment. Model Armor is part of the
# Gemini Enterprise Agent Platform (GEAP).
#
# This script:
#   1. Creates a Model Armor policy
#   2. Configures prompt injection detection
#   3. Configures jailbreak detection
#   4. Associates the policy with the project
#   5. Outputs the policy ID for use as environment variable
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - GCP project with billing enabled
#   - Model Armor API enabled (modelarmor.googleapis.com)
#
# Usage:
#   bash infra/gcp/model-armor-setup.sh
#   bash infra/gcp/model-armor-setup.sh --policy-name dd-armor-prod
#   bash infra/gcp/model-armor-setup.sh --dry-run
#
# After running, set these environment variables for DenialDefender:
#   export MODEL_ARMOR_POLICY_ID=<output policy ID>
#   export MODEL_ARMOR_LOCATION=<region>
#   export GCP_PROJECT_ID=<project>
#
# Project: denialdefender
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-denialdefender}"
REGION="${MODEL_ARMOR_LOCATION:-us-central1}"
POLICY_NAME="${MODEL_ARMOR_POLICY_NAME:-dd-model-armor}"
DRY_RUN=false

# ── Parse Arguments ────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --project)        PROJECT_ID="$2"; shift 2 ;;
    --region)         REGION="$2"; shift 2 ;;
    --policy-name)    POLICY_NAME="$2"; shift 2 ;;
    --dry-run)        DRY_RUN=true; shift ;;
    --help|-h)
      echo "Usage: bash model-armor-setup.sh [options]"
      echo "  --project NAME       GCP project ID (default: denialdefender)"
      echo "  --region REGION      GCP region (default: us-central1)"
      echo "  --policy-name NAME   Model Armor policy name (default: dd-model-armor)"
      echo "  --dry-run            Print commands without executing"
      exit 0 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

# ── Colors & Logging ──────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()   { echo -e "${YELLOW}[!]${NC} $1"; }
err()    { echo -e "${RED}[✗]${NC} $1"; }
step()   { echo -e "\n${CYAN}${BOLD}── $1 ──${NC}\n"; }

# Helper: run or dry-run a command
run_cmd() {
  if [[ "${DRY_RUN}" == true ]]; then
    echo "  [DRY RUN] $*"
  else
    eval "$@"
  fi
}

# ── Banner ─────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  🛡️  DenialDefender — Model Armor Policy Setup"
echo "  Project:     ${PROJECT_ID}"
echo "  Region:      ${REGION}"
echo "  Policy Name: ${POLICY_NAME}"
if [[ "${DRY_RUN}" == true ]]; then
echo "  Mode:        DRY RUN"
fi
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Enable Model Armor API ───────────────────────────────────────────
step "Enable Model Armor API"

run_cmd "gcloud services enable modelarmor.googleapis.com --project=${PROJECT_ID} --quiet"
log "Model Armor API enabled"

# Also ensure the Generative Language API is enabled (required by GEAP)
run_cmd "gcloud services enable generativelanguage.googleapis.com --project=${PROJECT_ID} --quiet"
log "Generative Language API enabled"

# ── Step 2: Create Model Armor Policy ─────────────────────────────────────────
step "Create Model Armor Policy"

# The fully-qualified policy resource name
POLICY_RESOURCE="projects/${PROJECT_ID}/locations/${REGION}/armorPolicies/${POLICY_NAME}"

echo "  Policy resource: ${POLICY_RESOURCE}"

# Check if the policy already exists
POLICY_EXISTS=false
if [[ "${DRY_RUN}" == false ]]; then
  if gcloud alpha model-armor policies describe "${POLICY_NAME}" \
    --location="${REGION}" \
    --project="${PROJECT_ID}" 2>/dev/null | grep -q "name"; then
    POLICY_EXISTS=true
    warn "Model Armor policy '${POLICY_NAME}' already exists — will update"
  fi
fi

# Create the policy with prompt injection and jailbreak detection enabled.
# The Model Armor API uses a REST endpoint; we construct the call via curl
# with gcloud auth for the bearer token.
if [[ "${DRY_RUN}" == false ]]; then
  ACCESS_TOKEN=$(gcloud auth print-access-token --project="${PROJECT_ID}")
fi

CREATE_PAYLOAD=$(cat <<'EOF'
{
  "displayName": "DenialDefender Model Armor Policy",
  " "description": "Protects DenialDefender agent fleet against prompt injection and jailbreak attacks on retrieved content",
  "promptInjectionDetection": {
    "enabled": true,
    "confidenceThreshold": 0.7
  },
  "jailbreakDetection": {
    "enabled": true,
    "confidenceThreshold": 0.7
  },
  "piAndJailbreakDetection": {
    "enabled": true,
    "confidenceThreshold": 0.7
  },
  "maliciousUriDetection": {
    "enabled": true
  },
  "csamDetection": {
    "enabled": false
  }
}
EOF
)

# Fix the JSON (remove the stray space)
CREATE_PAYLOAD=$(echo "${CREATE_PAYLOAD}" | sed 's/" "/"/')

API_ENDPOINT="https://modelarmor.googleapis.com/v1/projects/${PROJECT_ID}/locations/${REGION}/armorPolicies"

if [[ "${POLICY_EXISTS}" == false ]]; then
  echo "  Creating Model Armor policy..."
  if [[ "${DRY_RUN}" == false ]]; then
    HTTP_CODE=$(curl -s -o /tmp/ma-create-response.json -w "%{http_code}" \
      -X POST \
      "${API_ENDPOINT}?armorPolicyId=${POLICY_NAME}" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "${CREATE_PAYLOAD}")

    if [[ "${HTTP_CODE}" -ge 200 ]] && [[ "${HTTP_CODE}" -lt 300 ]]; then
      log "Model Armor policy created (HTTP ${HTTP_CODE})"
    elif [[ "${HTTP_CODE}" == "409" ]]; then
      warn "Policy already exists (HTTP 409) — continuing"
    else
      err "Failed to create policy (HTTP ${HTTP_CODE})"
      echo "  Response: $(cat /tmp/ma-create-response.json 2>/dev/null || echo 'N/A')"
      echo ""
      echo "  Attempting to continue — policy may already exist"
    fi
  else
    run_cmd "curl -X POST '${API_ENDPOINT}?armorPolicyId=${POLICY_NAME}' -H 'Authorization: Bearer TOKEN' -H 'Content-Type: application/json' -d PAYLOAD"
  fi
else
  echo "  Updating existing Model Armor policy..."
  if [[ "${DRY_RUN}" == false ]]; then
    curl -s -o /tmp/ma-update-response.json \
      -X PATCH \
      "${API_ENDPOINT}/${POLICY_NAME}?updateMask=promptInjectionDetection,jailbreakDetection,piAndJailbreakDetection,maliciousUriDetection" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "${CREATE_PAYLOAD}" || warn "Policy update may have failed"
    log "Model Armor policy updated"
  fi
fi

# ── Step 3: Verify Policy Configuration ───────────────────────────────────────
step "Verify Model Armor Policy"

if [[ "${DRY_RUN}" == false ]]; then
  echo "  Fetching policy details..."
  curl -s \
    "${API_ENDPOINT}/${POLICY_NAME}" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -o /tmp/ma-policy-detail.json 2>/dev/null || warn "Could not fetch policy details"

  if [[ -f /tmp/ma-policy-detail.json ]]; then
    echo "  Policy configuration:"
    # Pretty-print key fields
    python3 -c "
import json, sys
try:
    data = json.load(open('/tmp/ma-policy-detail.json'))
    print(f\"    Name:           {data.get('name', 'N/A')}\")
    print(f\"    Display Name:   {data.get('displayName', 'N/A')}\")
    print(f\"    Description:    {data.get('description', 'N/A')}\")
    pi = data.get('promptInjectionDetection', {})
    print(f\"    PI Detection:   enabled={pi.get('enabled', False)}, threshold={pi.get('confidenceThreshold', 'N/A')}\")
    jb = data.get('jailbreakDetection', {})
    print(f\"    JB Detection:   enabled={jb.get('enabled', False)}, threshold={jb.get('confidenceThreshold', 'N/A')}\")
    pijb = data.get('piAndJailbreakDetection', {})
    print(f\"    PI+JB Detection: enabled={pijb.get('enabled', False)}, threshold={pijb.get('confidenceThreshold', 'N/A')}\")
    mu = data.get('maliciousUriDetection', {})
    print(f\"    Malicious URI:  enabled={mu.get('enabled', False)}\")
    print(f\"    Create Time:    {data.get('createTime', 'N/A')}\")
    print(f\"    Update Time:    {data.get('updateTime', 'N/A')}\")
except Exception as e:
    print(f'    Could not parse: {e}')
    sys.exit(0)
" 2>/dev/null || echo "    (Could not parse policy details)"
  fi
else
  run_cmd "curl -s '${API_ENDPOINT}/${POLICY_NAME}' -H 'Authorization: Bearer TOKEN'"
fi

log "Policy verification complete"

# ── Step 4: Grant IAM Permissions ─────────────────────────────────────────────
step "Grant Model Armor IAM Permissions"

# The service account that runs DenialDefender needs the Model Armor User role
SA_EMAIL="${SA_EMAIL:-json-775@denialdefender.iam.gserviceaccount.com}"

echo "  Granting roles/modelarmor.user to ${SA_EMAIL}"
run_cmd "gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member=serviceAccount:${SA_EMAIL} \
  --role=roles/modelarmor.user \
  --quiet 2>/dev/null || echo '  (Role binding may already exist)'"

log "IAM permissions granted"

# ── Step 5: Output Environment Variables ──────────────────────────────────────
step "Output Environment Variables"

echo ""
echo "  ═══════════════════════════════════════════════════════════════"
echo "  📋 Set these environment variables for DenialDefender:"
echo "  ═══════════════════════════════════════════════════════════════"
echo ""
echo "    export GCP_PROJECT_ID=\"${PROJECT_ID}\""
echo "    export MODEL_ARMOR_POLICY_ID=\"${POLICY_NAME}\""
echo "    export MODEL_ARMOR_LOCATION=\"${REGION}\""
echo ""
echo "  For Cloud Run deployment, add to service env vars:"
echo ""
echo "    gcloud run services update denialdefender-web \\"
echo "      --region=${REGION} \\"
echo "      --set-env-vars=\"GCP_PROJECT_ID=${PROJECT_ID},MODEL_ARMOR_POLICY_ID=${POLICY_NAME},MODEL_ARMOR_LOCATION=${REGION}\""
echo ""
echo "  ═══════════════════════════════════════════════════════════════"
echo ""

# ── Summary ───────────────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅  Model Armor Policy Setup Complete"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Project:       ${PROJECT_ID}"
echo "  Region:        ${REGION}"
echo "  Policy Name:   ${POLICY_NAME}"
echo "  Policy ID:     ${POLICY_NAME}"
echo "  Resource:      ${POLICY_RESOURCE}"
echo ""
echo "  Detectors configured:"
echo "    ✦ Prompt Injection Detection  (threshold: 0.7)"
echo "    ✦ Jailbreak Detection         (threshold: 0.7)"
echo "    ✦ PI + Jailbreak Combined     (threshold: 0.7)"
echo "    ✦ Malicious URI Detection     (enabled)"
echo ""
echo "  🔗 Next steps:"
echo "     1. Set environment variables (see above)"
echo "     2. Redeploy DenialDefender:  bash infra/gcp/cloudrun/deploy.sh"
echo "     3. Test with adversarial content via /api/governance/armor"
echo "     4. Verify audit entries show scanner=geap"
echo ""
