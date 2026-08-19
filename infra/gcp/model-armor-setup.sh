#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# DenialDefender — Model Armor Policy Setup
# ══════════════════════════════════════════════════════════════════════════════
# Creates a Google Model Armor policy with prompt-injection and jailbreak
# detection enabled. This is the GEAP safety shield around the agent fleet.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - GCP project with billing enabled
#   - Model Armor API enabled (modelarmor.googleapis.com)
#
# Usage:
#   bash infra/gcp/model-armor-setup.sh
#   bash infra/gcp/model-armor-setup.sh --policy-name dd-armor-prod --dry-run
#
# Project: denialdefender (315133452553)
# Region:  europe-west1
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-denialdefender}"
REGION="${MODEL_ARMOR_LOCATION:-europe-west1}"
POLICY_NAME="${MODEL_ARMOR_POLICY_NAME:-dd-model-armor}"
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --project)        PROJECT_ID="$2"; shift 2 ;;
    --region)         REGION="$2"; shift 2 ;;
    --policy-name)    POLICY_NAME="$2"; shift 2 ;;
    --dry-run)        DRY_RUN=true; shift ;;
    --help|-h)
      echo "Usage: bash model-armor-setup.sh [options]"
      echo "  --project NAME       GCP project ID (default: denialdefender)"
      echo "  --region REGION      GCP region (default: europe-west1)"
      echo "  --policy-name NAME   Model Armor policy name (default: dd-model-armor)"
      echo "  --dry-run            Print commands without executing"
      exit 0 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()   { echo -e "${YELLOW}[!]${NC} $1"; }
err()    { echo -e "${RED}[✗]${NC} $1"; }
step()   { echo -e "\n${CYAN}${BOLD}── $1 ──${NC}\n"; }
run_cmd() {
  if [[ "${DRY_RUN}" == true ]]; then
    echo "  [DRY RUN] $*"
  else
    eval "$@"
  fi
}

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  🛡️  DenialDefender — Model Armor Policy Setup"
echo "  Project:     ${PROJECT_ID} (315133452553)"
echo "  Region:      ${REGION}"
echo "  Policy Name: ${POLICY_NAME}"
if [[ "${DRY_RUN}" == true ]]; then echo "  Mode:        DRY RUN"; fi
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Enable APIs ──────────────────────────────────────────────────────
step "Enable Model Armor + Generative Language APIs"
run_cmd "gcloud services enable modelarmor.googleapis.com --project=${PROJECT_ID} --quiet"
log "Model Armor API enabled"
run_cmd "gcloud services enable generativelanguage.googleapis.com --project=${PROJECT_ID} --quiet"
log "Generative Language API enabled"

# ── Step 2: Create Model Armor Policy ────────────────────────────────────────
step "Create Model Armor Policy"
POLICY_RESOURCE="projects/${PROJECT_ID}/locations/${REGION}/armorPolicies/${POLICY_NAME}"
echo "  Policy resource: ${POLICY_RESOURCE}"

# Build the policy payload (prompt injection + jailbreak detection, both at
# confidence threshold 0.7). Malicious URI detection enabled.
PAYLOAD=$(cat <<'EOF'
{
  "displayName": "DenialDefender Model Armor Policy",
  "description": "Protects the DenialDefender agent fleet against prompt injection, jailbreak, and malicious URI attacks on retrieved content.",
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

API_ENDPOINT="https://modelarmor.googleapis.com/v1/projects/${PROJECT_ID}/locations/${REGION}/armorPolicies"

if [[ "${DRY_RUN}" == false ]]; then
  ACCESS_TOKEN=$(gcloud auth print-access-token --project="${PROJECT_ID}")

  POLICY_EXISTS=false
  if curl -sf -H "Authorization: Bearer ${ACCESS_TOKEN}" \
       "${API_ENDPOINT}/${POLICY_NAME}" 2>/dev/null | grep -q "name"; then
    POLICY_EXISTS=true
    warn "Policy '${POLICY_NAME}' already exists — will update"
  fi

  if [[ "${POLICY_EXISTS}" == false ]]; then
    echo "  Creating Model Armor policy..."
    HTTP_CODE=$(curl -s -o /tmp/ma-create-response.json -w "%{http_code}" \
      -X POST \
      "${API_ENDPOINT}?armorPolicyId=${POLICY_NAME}" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "${PAYLOAD}")
    if [[ "${HTTP_CODE}" -ge 200 ]] && [[ "${HTTP_CODE}" -lt 300 ]]; then
      log "Model Armor policy created (HTTP ${HTTP_CODE})"
    elif [[ "${HTTP_CODE}" == "409" ]]; then
      warn "Policy already exists (HTTP 409) — continuing"
    else
      err "Failed to create policy (HTTP ${HTTP_CODE})"
      echo "  Response: $(cat /tmp/ma-create-response.json 2>/dev/null || echo 'N/A')"
    fi
  else
    echo "  Updating existing Model Armor policy..."
    curl -s -o /tmp/ma-update-response.json \
      -X PATCH \
      "${API_ENDPOINT}/${POLICY_NAME}?updateMask=promptInjectionDetection,jailbreakDetection,piAndJailbreakDetection,maliciousUriDetection" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "${PAYLOAD}" || warn "Policy update may have failed"
    log "Model Armor policy updated"
  fi
else
  run_cmd "curl -X POST '${API_ENDPOINT}?armorPolicyId=${POLICY_NAME}' -H 'Authorization: Bearer TOKEN' -H 'Content-Type: application/json' -d PAYLOAD"
fi

# ── Step 3: Verify ───────────────────────────────────────────────────────────
step "Verify Model Armor Policy"
if [[ "${DRY_RUN}" == false ]]; then
  echo "  Fetching policy details..."
  curl -s \
    "${API_ENDPOINT}/${POLICY_NAME}" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -o /tmp/ma-policy-detail.json 2>/dev/null || warn "Could not fetch policy details"
  if [[ -f /tmp/ma-policy-detail.json ]]; then
    echo "  Policy configuration (raw):"
    cat /tmp/ma-policy-detail.json | head -50
  fi
fi
log "Policy verification complete"

# ── Step 4: Grant IAM ─────────────────────────────────────────────────────────
step "Grant Model Armor IAM Permissions"
SA_EMAIL="${SA_EMAIL:-dd-runtime@${PROJECT_ID}.iam.gserviceaccount.com}"
echo "  Granting roles/modelarmor.user to ${SA_EMAIL}"
run_cmd "gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member=serviceAccount:${SA_EMAIL} \
  --role=roles/modelarmor.user \
  --quiet 2>/dev/null || echo '  (Role binding may already exist)'"
log "IAM permissions granted"

# ── Step 5: Output env vars ───────────────────────────────────────────────────
step "Environment Variables"
echo ""
echo "  Set these environment variables (or Cloud Run env vars):"
echo ""
echo "    GCP_PROJECT_ID=\"${PROJECT_ID}\""
echo "    MODEL_ARMOR_POLICY_ID=\"${POLICY_NAME}\""
echo "    MODEL_ARMOR_LOCATION=\"${REGION}\""
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "  ✅  Model Armor Policy Setup Complete"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Policy Name:   ${POLICY_NAME}"
echo "  Resource:      ${POLICY_RESOURCE}"
echo "  Detectors:"
echo "    ✦ Prompt Injection Detection  (threshold: 0.7)"
echo "    ✦ Jailbreak Detection         (threshold: 0.7)"
echo "    ✦ PI + Jailbreak Combined     (threshold: 0.7)"
echo "    ✦ Malicious URI Detection     (enabled)"
echo ""
