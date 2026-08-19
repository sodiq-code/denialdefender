/**
 * DenialDefender — Google Agent Platform Configuration
 *
 * Platform-Accelerated, Demo-First Strategy:
 *   Adopt Agent Platform for EXACTLY 3 components (Memory, Policies, Registry)
 *   that the blueprint KEEPS/conditionally-keeps in Table 12.1.
 *   Skip all others (Deployments, Sessions, Gateways, MCP, Garden).
 *
 * Per the Ultimate Blueprint (Section 12 — Ruthless Trimming):
 *   "Ship a small, undeniably-working core; add a component only if it
 *    survives a gate that asks whether it strengthens the narrative
 *    without compromising the demo."
 *
 * Gate results:
 *   [PASS] Memory Bank   — PASSES (replaces custom wrapper with real GEAP Memory)
 *   [PASS] Policies      — PASSES (replaces regex fallback with real GEAP Policies)
 *   [PASS] Agent Registry — PASSES (replaces Map<> with real GEAP Registry)
 *   [CUT]  Deployments    — CUT (keep Cloud Run per blueprint)
 *   [CUT]  Sessions       — CUT (Firestore handles session state)
 *   [CUT]  Gateways       — CUT ("no visible demo payoff")
 *   [CUT]  MCP Servers    — CUT ("protocols without partners")
 *   [STUDY] Agent Garden   — STUDY ONLY (reference architecture, zero integration)
 *
 * The 3 adopted components each serve a NON-SUBSTITUTABLE role:
 *   - Memory:     Cross-case learning (second-case ranking change)
 *   - Policies:   Prompt-injection defense (enterprise governance)
 *   - Registry:   Agent discovery/versioning (8-agent catalog)
 *
 * Every platform call falls back to the existing local implementation
 * if the platform is unavailable. This is zero execution risk.
 */

// ─── Platform Detection ────────────────────────────────────────────────────

export interface PlatformConfig {
  /** Whether we're running in a GCP environment with Agent Platform access */
  isPlatformAvailable: boolean;
  /** GCP project ID */
  projectId: string;
  /** GCP region (default: us-central1) */
  region: string;
  /** Whether to prefer platform APIs over local implementations */
  preferPlatform: boolean;
  /** Platform component availability (checked lazily) */
  components: {
    registry: PlatformComponentStatus;
    memory: PlatformComponentStatus;
    policies: PlatformComponentStatus;
  };
}

export interface PlatformComponentStatus {
  /** Whether the platform API is reachable */
  available: boolean;
  /** Which backend was used for the last operation */
  lastBackend: 'platform' | 'local';
  /** Last error if platform call failed */
  lastError: string | null;
  /** Timestamp of last successful platform call */
  lastSuccessAt: string | null;
}

// ─── Environment Detection ─────────────────────────────────────────────────

function getGcpProjectId(): string {
  return (
    process.env.GCP_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    ''
  );
}

function getGcpRegion(): string {
  return process.env.GCP_REGION || 'us-central1';
}

/**
 * Detect whether we should use Agent Platform APIs.
 *
 * Platform is used when ALL of:
 *   1. GCP_PROJECT_ID is set
 *   2. GOOGLE_AGENT_PLATFORM_ENABLED is not "false"
 *   3. We're not in a test environment
 */
function shouldUsePlatform(): boolean {
  const projectId = getGcpProjectId();
  const explicitlyDisabled = process.env.GOOGLE_AGENT_PLATFORM_ENABLED === 'false';
  const isTest = process.env.NODE_ENV === 'test';

  return !!projectId && !explicitlyDisabled && !isTest;
}

// ─── Singleton Platform Config ─────────────────────────────────────────────

let _config: PlatformConfig | null = null;

export function getPlatformConfig(): PlatformConfig {
  if (_config) return _config;

  const isPlatformAvailable = shouldUsePlatform();

  _config = {
    isPlatformAvailable,
    projectId: getGcpProjectId(),
    region: getGcpRegion(),
    preferPlatform: isPlatformAvailable,
    components: {
      registry: {
        available: isPlatformAvailable,
        lastBackend: 'local',
        lastError: null,
        lastSuccessAt: null,
      },
      memory: {
        available: isPlatformAvailable,
        lastBackend: 'local',
        lastError: null,
        lastSuccessAt: null,
      },
      policies: {
        available: isPlatformAvailable,
        lastBackend: 'local',
        lastError: null,
        lastSuccessAt: null,
      },
    },
  };

  return _config;
}

/**
 * Update a component's status after a platform call.
 * This is used for auditability — every operation records which backend was used.
 */
export function updateComponentStatus(
  component: 'registry' | 'memory' | 'policies',
  update: Partial<PlatformComponentStatus>,
): void {
  const config = getPlatformConfig();
  Object.assign(config.components[component], update);
}

/**
 * Mark a platform call as successful.
 */
export function markPlatformSuccess(component: 'registry' | 'memory' | 'policies'): void {
  updateComponentStatus(component, {
    available: true,
    lastBackend: 'platform',
    lastError: null,
    lastSuccessAt: new Date().toISOString(),
  });
}

/**
 * Mark a platform call as failed (will trigger fallback).
 */
export function markPlatformFailure(
  component: 'registry' | 'memory' | 'policies',
  error: string,
): void {
  updateComponentStatus(component, {
    available: false,
    lastBackend: 'local',
    lastError: error,
  });
}

// ─── Platform API Client ───────────────────────────────────────────────────

/**
 * Base URL for the Google Agent Platform API.
 *
 * The Agent Platform (console.cloud.google.com/ai) exposes these APIs:
 *   - Registry:  /v1/projects/{p}/locations/{l}/agents
 *   - Memory:    /v1/projects/{p}/locations/{l}/memories
 *   - Policies:  Model Armor API at modelarmor.googleapis.com
 *
 * We use the aiplatform.googleapis.com endpoint which is the
 * underlying API for the Agent Platform.
 */
export function getPlatformBaseUrl(): string {
  const config = getPlatformConfig();
  return `https://aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${config.region}`;
}

/**
 * Model Armor API base URL (separate service endpoint).
 */
export function getModelArmorBaseUrl(): string {
  const config = getPlatformConfig();
  return `https://modelarmor.googleapis.com/v1/projects/${config.projectId}/locations/${config.region}`;
}

/**
 * Make an authenticated request to the Agent Platform API.
 *
 * In production (Cloud Run), uses the instance's service account token.
 * Falls back to the GOOGLE_APPLICATION_CREDENTIALS environment variable
 * for local development with a service account key.
 *
 * Returns null if the request fails (triggers fallback).
 */
export async function platformFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response | null> {
  try {
    const config = getPlatformConfig();
    if (!config.isPlatformAvailable) return null;

    // Get auth token
    const token = await getAccessToken();
    if (!token) return null;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      console.warn(
        `[GEAP Platform] API call failed: ${response.status} ${response.statusText} for ${url}`,
      );
      return null;
    }

    return response;
  } catch (error) {
    console.warn('[GEAP Platform] Request error:', error);
    return null;
  }
}

/**
 * Get an access token for GCP API calls.
 *
 * In Cloud Run: uses the metadata server to get the instance token.
 * Locally: uses GOOGLE_APPLICATION_CREDENTIALS if set.
 */
async function getAccessToken(): Promise<string | null> {
  try {
    // In Cloud Run / GKE, use the metadata server
    const metadataUrl =
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
    const metaResponse = await fetch(metadataUrl, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(2000), // 2s timeout
    });

    if (metaResponse.ok) {
      const data = await metaResponse.json();
      return data.access_token;
    }
  } catch {
    // Not running on GCP — try local credentials
  }

  // Local development: check for explicit token
  const localToken = process.env.GCP_ACCESS_TOKEN;
  if (localToken) return localToken;

  // No token available — platform calls will fail gracefully
  return null;
}

// ─── Status Reporting ──────────────────────────────────────────────────────

/**
 * Get a comprehensive status report for all 3 platform components.
 * Used by the governance panel UI to show platform vs local status.
 */
export function getPlatformStatus(): {
  strategy: string;
  platformAvailable: boolean;
  projectId: string;
  region: string;
  components: {
    registry: PlatformComponentStatus & { role: string; gateResult: string };
    memory: PlatformComponentStatus & { role: string; gateResult: string };
    policies: PlatformComponentStatus & { role: string; gateResult: string };
  };
  skipped: { name: string; reason: string }[];
} {
  const config = getPlatformConfig();

  return {
    strategy: 'Platform-Accelerated, Demo-First',
    platformAvailable: config.isPlatformAvailable,
    projectId: config.projectId || '(not configured)',
    region: config.region,
    components: {
      registry: {
        ...config.components.registry,
        role: 'Agent discovery, versioning, 8-agent catalog',
        gateResult: 'PASSES — replaces custom Map<> with real GEAP Registry',
      },
      memory: {
        ...config.components.memory,
        role: 'Cross-case learning, outcome weights',
        gateResult: 'PASSES — replaces custom Firestore wrapper with real GEAP Memory',
      },
      policies: {
        ...config.components.policies,
        role: 'Prompt-injection defense, enterprise governance',
        gateResult: 'PASSES — replaces regex fallback with real GEAP Policies',
      },
    },
    skipped: [
      { name: 'Deployments', reason: 'Keep Cloud Run per blueprint Table 12.1' },
      { name: 'Sessions', reason: 'Firestore handles session state' },
      { name: 'Gateways', reason: 'No visible demo payoff (Table 12.1: CUT)' },
      { name: 'MCP Servers', reason: 'Protocols without partners (Table 12.1: CUT)' },
      { name: 'Agent Garden', reason: 'Study only (reference architecture, zero integration)' },
    ],
  };
}
