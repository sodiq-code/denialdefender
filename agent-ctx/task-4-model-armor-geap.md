# Task 4 — Wire Model Armor to Google's Model Armor API (GEAP) with regex fallback

## Agent: Code Agent
## Status: ✅ Complete

## Summary

Wired DenialDefender's Model Armor to Google's Model Armor API (GEAP) while preserving regex-based scanning as the local-dev fallback. All audit entries now record which scanner was used.

## Files Modified

### 1. `/home/z/my-project/src/lib/model-armor.ts`
**Changes:**
- Added `scanner: 'geap' | 'regex'` and `policyId?: string` fields to `ArmorScanResult` and `ArmorAuditEntry` interfaces
- Added GEAP Model Armor API types: `GEAPSanitizeRequest`, `GEAPSanitizeResponse`, `GEAPFinding`, `GEAPRawApiResponse`
- Added `getGEAPConfig()` — reads env vars `GCP_PROJECT_ID`, `MODEL_ARMOR_POLICY_ID`, `MODEL_ARMOR_LOCATION` and builds the API endpoint
- Added `isGEAPAvailable()` — returns whether GEAP is configured
- Added `scanContentWithGEAP()` — calls the Google Model Armor sanitize endpoint (`https://modelarmor.googleapis.com/v1/projects/{project}/locations/{location}/armorPolicies/{policyId}:sanitize`) with proper auth headers, 10s timeout, and response normalisation
- Added `normalizeGEAPResponse()` — handles both nested (`sanitizeResult.*`) and flat GEAP API response shapes
- Added `geapResponseToScanResult()` — converts GEAP response to `ArmorScanResult` format with findings→threats mapping
- Updated `runModelArmor()` — now checks `isGEAPAvailable()`, tries GEAP first, falls back to regex on any failure, records `scanner`, `policyId`, and `usedFallback` in audit details and trace events
- Updated `scanContent()` — now returns `scanner: 'regex'` in result

### 2. `/home/z/my-project/src/app/api/governance/armor/route.ts`
**Changes:**
- Added `scanner` and `policyId` fields to the POST response
- Added `?config=true` GET endpoint that returns GEAP availability and configuration
- Removed unused `scanContent` import, added `isGEAPAvailable` and `getGEAPConfig` imports

### 3. `/home/z/my-project/infra/gcp/model-armor-setup.sh` (NEW)
**A shell script that:**
- Enables the Model Armor API (`modelarmor.googleapis.com`)
- Creates a Model Armor policy with prompt injection detection, jailbreak detection, PI+Jailbreak combined detection, and malicious URI detection
- Supports `--dry-run` mode
- Verifies policy configuration after creation
- Grants IAM `roles/modelarmor.user` to the service account
- Outputs environment variables for deployment

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GCP_PROJECT_ID` | Yes (for GEAP) | — | GCP project identifier |
| `MODEL_ARMOR_POLICY_ID` | Yes (for GEAP) | — | Model Armor policy resource ID |
| `MODEL_ARMOR_LOCATION` | No | `us-central1` | GCP region for Model Armor |
| `MODEL_ARMOR_API_KEY` | No | — | Explicit API key (Bearer token) |
| `GOOGLE_OAUTH_ACCESS_TOKEN` | No | — | Auto-provided in Cloud Run/GKE |

## Scanner Selection Logic

```
GCP_PROJECT_ID + MODEL_ARMOR_POLICY_ID set?
  ├─ YES → Try scanContentWithGEAP()
  │         ├─ Success → Return GEAP result (scanner: "geap")
  │         └─ Failure → Fall back to scanContent() (scanner: "regex", usedFallback: true)
  └─ NO → Use scanContent() directly (scanner: "regex", local dev mode)
```

## Verification

- ✅ ESLint: No errors
- ✅ Dev server: Running successfully on port 3000
- ✅ Regex fallback intact: `scanContent()` unchanged in logic, just adds `scanner: 'regex'` to result
- ✅ All audit entries record `scanner` field
- ✅ All trace events include `scanner`, `policyId`, `usedFallback` metadata
