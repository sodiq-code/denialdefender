/**
 * DenialDefender — GEAP Agent Registry (Task 5)
 *
 * The Agent Registry is one of the 7 GEAP components required for the
 * Fortified Enterprise Fleet track. It provides:
 *   - Central registration of all 8 DenialDefender agents with full metadata
 *   - Discovery API (list, search by capability, get by name)
 *   - Versioning (each agent has a version; registry tracks compatible versions)
 *   - Health status tracking (based on last execution result)
 *   - Capability, tool, and schema tracking
 *   - Registry events emitted to the decision trace
 *
 * Per the Ultimate Blueprint:
 *   "GEAP Agent Registry — every agent must register with its capabilities,
 *    tools, input/output schemas, and version. Discovery must support
 *    capability-based lookup and version compatibility."
 *
 * The 8 DenialDefender agents:
 *   1. Patient Advocate — empathetic intake, case framing, user trust
 *   2. Denial Triage — multimodal parse of denial letter → structured JSON
 *   3. Policy Research — retrieve payer policy + clause citations
 *   4. Evidence Assembly — match clinical evidence to denial reason
 *   5. Letter Drafting — compose evidence-backed appeal draft
 *   6. Quality Review (adversarial) — attempt to break the draft; verify every citation
 *   7. Outcome Learning — ingest outcomes; update retrieval; before/after eval
 *   8. Compliance & Deadline — deadline tracking, payer-format checks, audit trail
 */

import { emitTraceEvent } from './decision-trace-stream';

// ─── Types ────────────────────────────────────────────────────────────────

export type AgentCategory = 'core' | 'governance' | 'learning';
export type HealthStatus = 'healthy' | 'degraded' | 'offline';

export interface AgentRegistration {
  name: string;           // e.g., "denial-triage"
  displayName: string;    // e.g., "Denial Triage"
  version: string;        // e.g., "1.0.0"
  description: string;
  category: AgentCategory;
  capabilities: string[]; // e.g., ["denial_classification", "code_extraction"]
  tools: string[];        // e.g., ["gemini_api", "evidence_corpus"]
  inputSchema: object;    // JSON schema for inputs
  outputSchema: object;   // JSON schema for outputs
  permissions: string[];  // e.g., ["read:cases", "write:traces"]
  healthStatus: HealthStatus;
  lastExecution?: {
    timestamp: string;
    success: boolean;
    latencyMs: number;
  };
  endpoint: string;       // e.g., "/agents/denial-triage"
  model: string;          // e.g., "gemini-3.6-flash"
}

export interface RegistrySummary {
  totalAgents: number;
  categories: Record<AgentCategory, number>;
  healthSummary: Record<HealthStatus, number>;
  agentsByVersion: Record<string, string[]>;
  registryVersion: string;
  lastUpdated: string;
}

export interface RegistryEvent {
  type: 'agent_registered' | 'health_updated' | 'agent_discovered';
  agentName: string;
  timestamp: string;
  detail: string;
}

// ─── Version Compatibility ────────────────────────────────────────────────

/**
 * Compatible version ranges for inter-agent communication.
 * If an agent at version X calls agent Y, Y must be within the
 * compatible range for X's version.
 */
const VERSION_COMPATIBILITY: Record<string, Record<string, string>> = {
  'patient-advocate': { 'denial-triage': '>=1.0.0', 'deadline-tracker': '>=1.0.0' },
  'denial-triage': { 'policy-research': '>=1.0.0', 'evidence-assembly': '>=1.0.0' },
  'policy-research': { 'evidence-assembly': '>=1.0.0', 'letter-drafting': '>=1.0.0' },
  'evidence-assembly': { 'letter-drafting': '>=1.0.0', 'quality-review': '>=1.0.0' },
  'letter-drafting': { 'quality-review': '>=1.0.0' },
  'quality-review': { 'outcome-learning': '>=1.0.0', 'deadline-tracker': '>=1.0.0' },
  'outcome-learning': { 'policy-research': '>=1.0.0' },
  'deadline-tracker': {},
};

// ─── Agent Catalog ────────────────────────────────────────────────────────

/**
 * Full agent catalog with all 8 DenialDefender agents.
 * Each entry contains complete metadata per the AgentRegistration interface.
 */
const AGENT_CATALOG: AgentRegistration[] = [
  {
    name: 'patient-advocate',
    displayName: 'Patient Advocate',
    version: '1.0.0',
    description: 'Empathetic intake, case framing, urgency assessment. Builds user trust and frames the denial for downstream agents.',
    category: 'core',
    capabilities: [
      'empathetic_intake',
      'case_framing',
      'urgency_assessment',
      'deadline_extraction',
      'trust_building',
    ],
    tools: ['gemini_api', 'case_store'],
    inputSchema: {
      type: 'object',
      properties: {
        denialText: { type: 'string', description: 'Raw denial letter text' },
        patientInfo: { type: 'object', description: 'Patient demographics (PHI-safe)' },
        payer: { type: 'string', description: 'Insurance payer name' },
      },
      required: ['denialText', 'payer'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        caseFraming: { type: 'object', description: 'Structured case framing with urgency and deadline' },
        humanSummary: { type: 'string', description: 'Human-readable case summary' },
        confidence: { type: 'number', description: 'Intake confidence score 0-1' },
      },
    },
    permissions: ['read:cases', 'write:cases', 'read:denials', 'read:appeals', 'read:evidence', 'write:traces', 'read:hitl_gates'],
    healthStatus: 'healthy',
    endpoint: '/agents/patient-advocate',
    model: 'gemini-3.6-flash',
  },
  {
    name: 'denial-triage',
    displayName: 'Denial Triage',
    version: '1.0.0',
    description: 'Multimodal parse of denial letter into structured JSON. Classifies denial type, extracts codes, assesses appealability and strategy.',
    category: 'core',
    capabilities: [
      'denial_classification',
      'code_extraction',
      'reason_code_parsing',
      'appeal_strategy_selection',
      'confidence_assessment',
      'hitl_gate1_creation',
    ],
    tools: ['gemini_api', 'regex_parser', 'code_lookup'],
    inputSchema: {
      type: 'object',
      properties: {
        denialText: { type: 'string', description: 'Raw denial letter text' },
        payer: { type: 'string', description: 'Insurance payer name' },
        advocateResult: { type: 'object', description: 'Patient Advocate output for context' },
      },
      required: ['denialText', 'payer'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        denialJson: { type: 'object', description: 'Structured denial JSON with codes and classification' },
        classification: { type: 'object', description: 'Appealability assessment and strategy' },
        humanConfirmPrompt: { type: 'string', description: 'HITL Gate 1 confirmation prompt' },
      },
    },
    permissions: ['read:cases', 'write:cases', 'read:denials', 'write:denials', 'read:appeals', 'read:evidence', 'write:traces', 'read:hitl_gates', 'write:hitl_gates'],
    healthStatus: 'healthy',
    endpoint: '/agents/denial-triage',
    model: 'gemini-3.6-flash',
  },
  {
    name: 'policy-research',
    displayName: 'Policy Research',
    version: '1.0.0',
    description: 'Retrieve payer policy, select relevant clauses, track provenance of each citation. Matches denial reason to policy exceptions.',
    category: 'core',
    capabilities: [
      'policy_retrieval',
      'clause_selection',
      'provenance_tracking',
      'denial_reason_matching',
      'coverage_determination',
    ],
    tools: ['gemini_api', 'policy_corpus', 'vector_search'],
    inputSchema: {
      type: 'object',
      properties: {
        denialJson: { type: 'object', description: 'Structured denial from Triage' },
        payer: { type: 'string', description: 'Payer name for policy lookup' },
      },
      required: ['denialJson', 'payer'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        clauses: { type: 'array', description: 'Matched policy clauses with citations' },
        provenance: { type: 'array', description: 'Provenance records for each clause' },
        strategy: { type: 'string', description: 'Recommended appeal strategy based on policy' },
      },
    },
    permissions: ['read:cases', 'read:denials', 'read:execute:policies', 'read:evidence', 'write:evidence', 'read:citations', 'write:citations', 'write:traces'],
    healthStatus: 'healthy',
    endpoint: '/agents/policy-research',
    model: 'gemini-3.6-flash',
  },
  {
    name: 'evidence-assembly',
    displayName: 'Evidence Assembly',
    version: '1.0.0',
    description: 'Match clinical evidence to denial reason. Score and rank evidence by relevance and provenance quality.',
    category: 'core',
    capabilities: [
      'evidence_matching',
      'provenance_scoring',
      'evidence_ranking',
      'clinical_guideline_lookup',
      'citation_verification',
    ],
    tools: ['gemini_api', 'evidence_corpus', 'vector_search'],
    inputSchema: {
      type: 'object',
      properties: {
        denialJson: { type: 'object', description: 'Structured denial from Triage' },
        policyClauses: { type: 'array', description: 'Policy clauses from Policy Research' },
      },
      required: ['denialJson'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        evidence: { type: 'array', description: 'Ranked evidence items with provenance scores' },
        gaps: { type: 'array', description: 'Evidence gaps that need attention' },
        coverage: { type: 'number', description: 'Evidence coverage score 0-1' },
      },
    },
    permissions: ['read:cases', 'read:denials', 'read:evidence', 'write:evidence', 'read:citations', 'write:citations', 'write:traces'],
    healthStatus: 'healthy',
    endpoint: '/agents/evidence-assembly',
    model: 'gemini-3.6-flash',
  },
  {
    name: 'letter-drafting',
    displayName: 'Letter Drafting',
    version: '1.1.0',
    description: 'Compose evidence-backed appeal draft. Integrates policy clauses, clinical evidence, and payer-specific formatting. Cannot access outcomes (prevents bias).',
    category: 'core',
    capabilities: [
      'draft_composition',
      'evidence_integration',
      'policy_citation_inlining',
      'payer_format_compliance',
      'persuasion_structuring',
    ],
    tools: ['gemini_api', 'template_engine', 'phrase_discipline'],
    inputSchema: {
      type: 'object',
      properties: {
        denialJson: { type: 'object', description: 'Structured denial' },
        policyClauses: { type: 'array', description: 'Policy clauses' },
        evidence: { type: 'array', description: 'Assembled evidence' },
        payerFormat: { type: 'string', description: 'Payer-specific format requirements' },
      },
      required: ['denialJson', 'policyClauses', 'evidence'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        draft: { type: 'string', description: 'Appeal letter draft text' },
        citationsUsed: { type: 'array', description: 'Citations embedded in the draft' },
        wordCount: { type: 'number', description: 'Draft word count' },
        phraseDisciplineScore: { type: 'number', description: 'Compliance with phrase discipline rules' },
      },
    },
    permissions: ['read:cases', 'read:denials', 'read:appeals', 'write:appeals', 'read:evidence', 'read:citations', 'read:policies', 'write:traces'],
    healthStatus: 'healthy',
    endpoint: '/agents/letter-drafting',
    model: 'gemini-3.6-flash',
  },
  {
    name: 'quality-review',
    displayName: 'Quality Review (Adversarial)',
    version: '1.1.0',
    description: 'Adversarial review: attempt to break the draft, verify every citation, check logical consistency. Cannot write appeals (prevents self-approval).',
    category: 'governance',
    capabilities: [
      'adversarial_testing',
      'citation_verification',
      'logical_consistency_check',
      'unsupported_claim_detection',
      'hitl_gate2_creation',
      'draft_rejection',
    ],
    tools: ['gemini_api', 'citation_checker', 'adversarial_battery'],
    inputSchema: {
      type: 'object',
      properties: {
        draft: { type: 'string', description: 'Appeal letter draft from Letter Drafting' },
        citationsUsed: { type: 'array', description: 'Citations used in the draft' },
        evidence: { type: 'array', description: 'Source evidence for cross-checking' },
      },
      required: ['draft', 'citationsUsed'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        verdict: { type: 'string', enum: ['pass', 'fail', 'needs_revision'], description: 'Review verdict' },
        citationResults: { type: 'array', description: 'Per-citation verification results' },
        unsupportedClaims: { type: 'number', description: 'Count of unsupported claims found' },
        adversarialResults: { type: 'array', description: 'Adversarial test results' },
        qualityScore: { type: 'number', description: 'Overall quality score 0-1' },
      },
    },
    permissions: ['read:cases', 'read:denials', 'read:appeals', 'read:evidence', 'read:citations', 'write:citations', 'read:outcomes', 'write:traces', 'read:hitl_gates', 'write:hitl_gates'],
    healthStatus: 'healthy',
    endpoint: '/agents/quality-review',
    model: 'gemini-3.6-flash',
  },
  {
    name: 'outcome-learning',
    displayName: 'Outcome Learning',
    version: '1.0.0',
    description: 'Ingest appeal outcomes (won/lost/partial), update retrieval weights, run before/after evaluations. Read-only on product data (appeals, evidence).',
    category: 'learning',
    capabilities: [
      'outcome_ingestion',
      'weight_update',
      'before_after_evaluation',
      'strategy_effectiveness_tracking',
      'retrieval_weight_adjustment',
    ],
    tools: ['gemini_api', 'outcome_store', 'weight_engine'],
    inputSchema: {
      type: 'object',
      properties: {
        caseId: { type: 'string', description: 'Case ID for outcome recording' },
        outcome: { type: 'string', enum: ['won', 'lost', 'partial'], description: 'Appeal outcome' },
        outcomeDetail: { type: 'object', description: 'Detailed outcome metadata' },
      },
      required: ['caseId', 'outcome'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        weightUpdates: { type: 'array', description: 'Retrieval weight changes made' },
        beforeAfter: { type: 'object', description: 'Before/after evaluation metrics' },
        effectivenessDelta: { type: 'number', description: 'Change in strategy effectiveness' },
      },
    },
    permissions: ['read:cases', 'read:outcomes', 'write:outcomes', 'read:policies', 'write:policies', 'write:traces'],
    healthStatus: 'healthy',
    endpoint: '/agents/outcome-learning',
    model: 'gemini-3.6-flash',
  },
  {
    name: 'deadline-tracker',
    displayName: 'Compliance & Deadline',
    version: '1.0.0',
    description: 'Deadline tracking, payer-format compliance checks, escalation alerts, and audit trail maintenance. Temporal-only authority — cannot write clinical content.',
    category: 'governance',
    capabilities: [
      'deadline_tracking',
      'payer_format_compliance',
      'escalation_alerting',
      'audit_trail_maintenance',
      'timely_filing_verification',
      'deadline_escalation',
    ],
    tools: ['deadline_calculator', 'payer_rules', 'alert_engine'],
    inputSchema: {
      type: 'object',
      properties: {
        caseId: { type: 'string', description: 'Case ID for deadline tracking' },
        payer: { type: 'string', description: 'Payer for deadline rules lookup' },
        denialDate: { type: 'string', description: 'Denial date ISO string' },
        appealLevel: { type: 'number', description: 'Appeal level (1=redetermination, 2=reconsideration, etc.)' },
      },
      required: ['caseId', 'payer'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        deadlineDate: { type: 'string', description: 'Calculated deadline date ISO string' },
        daysRemaining: { type: 'number', description: 'Days until deadline' },
        escalationLevel: { type: 'string', enum: ['normal', 'warning', 'critical', 'expired'], description: 'Escalation level' },
        complianceChecks: { type: 'array', description: 'Payer format compliance check results' },
      },
    },
    permissions: ['read:cases', 'read:deadlines', 'write:deadlines', 'execute:deadlines', 'write:traces', 'read:hitl_gates'],
    healthStatus: 'healthy',
    endpoint: '/agents/deadline-tracker',
    model: 'gemini-3.6-flash',
  },
];

// ─── Registry State ───────────────────────────────────────────────────────

/** Internal registry store — maps agent name to registration */
const registry = new Map<string, AgentRegistration>();

/** Registry event log for trace emission */
const registryEvents: RegistryEvent[] = [];

/** Registry version — bumped when agents are added/updated */
let REGISTRY_VERSION = '1.0.0';

/** Flag to ensure auto-registration happens only once */
let autoRegistered = false;

// ─── Auto-Registration ────────────────────────────────────────────────────

/**
 * Auto-register all 8 agents on module import.
 * This ensures the registry is populated when the app starts.
 */
function autoRegister(): void {
  if (autoRegistered) return;
  autoRegistered = true;

  for (const agent of AGENT_CATALOG) {
    registry.set(agent.name, { ...agent });
    registryEvents.push({
      type: 'agent_registered',
      agentName: agent.name,
      timestamp: new Date().toISOString(),
      detail: `${agent.displayName} v${agent.version} registered [${agent.category}]`,
    });
  }

  REGISTRY_VERSION = '1.0.0';
  console.log(`[AgentRegistry] Auto-registered ${AGENT_CATALOG.length} agents (registry v${REGISTRY_VERSION})`);
}

// Execute auto-registration on import
autoRegister();

// ─── Registration API ─────────────────────────────────────────────────────

/**
 * Register an agent in the registry.
 * If an agent with the same name already exists, it will be updated.
 * Emits a registry event to the decision trace.
 */
export function registerAgent(agent: AgentRegistration): void {
  const existing = registry.get(agent.name);
  const isUpdate = !!existing;

  registry.set(agent.name, { ...agent });

  const event: RegistryEvent = {
    type: 'agent_registered',
    agentName: agent.name,
    timestamp: new Date().toISOString(),
    detail: isUpdate
      ? `${agent.displayName} updated from v${existing.version} to v${agent.version}`
      : `${agent.displayName} v${agent.version} registered [${agent.category}]`,
  };
  registryEvents.push(event);

  // Emit trace event (fire and forget)
  emitRegistryTraceEvent(event).catch(() => {
    // Non-critical — trace emission is best-effort
  });

  console.log(`[AgentRegistry] ${event.detail}`);
}

// ─── Discovery API ────────────────────────────────────────────────────────

/**
 * Get a specific agent by name.
 */
export function getAgent(name: string): AgentRegistration | undefined {
  return registry.get(name);
}

/**
 * List agents with optional filtering.
 * Supports filtering by category and/or capability.
 */
export function listAgents(filter?: {
  category?: string;
  capability?: string;
}): AgentRegistration[] {
  let agents = Array.from(registry.values());

  if (filter?.category) {
    agents = agents.filter(a => a.category === filter.category);
  }

  if (filter?.capability) {
    agents = agents.filter(a => a.capabilities.includes(filter.capability!));
  }

  return agents;
}

/**
 * Search for agents that have a specific capability.
 * Returns agents sorted by health status (healthy first).
 */
export function searchByCapability(capability: string): AgentRegistration[] {
  const agents = Array.from(registry.values())
    .filter(a => a.capabilities.includes(capability));

  // Sort by health status: healthy > degraded > offline
  const healthOrder: Record<HealthStatus, number> = {
    healthy: 0,
    degraded: 1,
    offline: 2,
  };

  agents.sort((a, b) => healthOrder[a.healthStatus] - healthOrder[b.healthStatus]);

  return agents;
}

/**
 * Search for agents that have a specific tool.
 */
export function searchByTool(tool: string): AgentRegistration[] {
  return Array.from(registry.values())
    .filter(a => a.tools.includes(tool));
}

/**
 * Search for agents that have a specific permission.
 */
export function searchByPermission(permission: string): AgentRegistration[] {
  return Array.from(registry.values())
    .filter(a => a.permissions.includes(permission));
}

// ─── Health Status ────────────────────────────────────────────────────────

/**
 * Update an agent's health status and last execution info.
 * Emits a health_updated registry event.
 */
export function updateHealthStatus(
  name: string,
  status: HealthStatus,
  execution: {
    timestamp: string;
    success: boolean;
    latencyMs: number;
  },
): void {
  const agent = registry.get(name);
  if (!agent) {
    console.warn(`[AgentRegistry] Cannot update health for unknown agent: ${name}`);
    return;
  }

  agent.healthStatus = status;
  agent.lastExecution = execution;

  const event: RegistryEvent = {
    type: 'health_updated',
    agentName: name,
    timestamp: new Date().toISOString(),
    detail: `${agent.displayName} health: ${status} (last exec: ${execution.success ? 'success' : 'failure'}, ${execution.latencyMs}ms)`,
  };
  registryEvents.push(event);

  // Emit trace event (fire and forget)
  emitRegistryTraceEvent(event).catch(() => {
    // Non-critical
  });
}

/**
 * Bulk health status update from pipeline results.
 * Updates all agents based on their execution results.
 */
export function bulkHealthUpdate(results: Array<{
  agentName: string;
  success: boolean;
  latencyMs: number;
}>): void {
  const now = new Date().toISOString();

  for (const result of results) {
    const status: HealthStatus = result.success
      ? (result.latencyMs < 5000 ? 'healthy' : 'degraded')  // High latency = degraded
      : 'offline';

    updateHealthStatus(result.agentName, status, {
      timestamp: now,
      success: result.success,
      latencyMs: result.latencyMs,
    });
  }
}

// ─── Version Compatibility ────────────────────────────────────────────────

/**
 * Check if two agents are version-compatible for communication.
 */
export function areVersionCompatible(
  agentA: string,
  agentB: string,
): { compatible: boolean; requiredRange: string | null } {
  const compatMap = VERSION_COMPATIBILITY[agentA];
  if (!compatMap || !compatMap[agentB]) {
    // No explicit compatibility requirement = compatible by default
    return { compatible: true, requiredRange: null };
  }

  const requiredRange = compatMap[agentB];
  const agentBReg = registry.get(agentB);
  if (!agentBReg) {
    return { compatible: false, requiredRange };
  }

  // Simple semver check: ">=X.Y.Z" means agentB version must be >= X.Y.Z
  const match = requiredRange.match(/^>=(\d+\.\d+\.\d+)$/);
  if (match) {
    const minVersion = match[1];
    const compatible = compareSemver(agentBReg.version, minVersion) >= 0;
    return { compatible, requiredRange };
  }

  // If we can't parse the range, assume compatible
  return { compatible: true, requiredRange };
}

/**
 * Get all version compatibility relationships for an agent.
 */
export function getVersionCompatibility(agentName: string): Record<string, string> {
  return VERSION_COMPATIBILITY[agentName] || {};
}

// ─── Registry Summary ─────────────────────────────────────────────────────

/**
 * Get a summary of the registry state.
 */
export function getRegistrySummary(): RegistrySummary {
  const agents = Array.from(registry.values());

  const categories: Record<AgentCategory, number> = {
    core: 0,
    governance: 0,
    learning: 0,
  };

  const healthSummary: Record<HealthStatus, number> = {
    healthy: 0,
    degraded: 0,
    offline: 0,
  };

  const agentsByVersion: Record<string, string[]> = {};

  for (const agent of agents) {
    categories[agent.category]++;
    healthSummary[agent.healthStatus]++;

    if (!agentsByVersion[agent.version]) {
      agentsByVersion[agent.version] = [];
    }
    agentsByVersion[agent.version].push(agent.displayName);
  }

  return {
    totalAgents: agents.length,
    categories,
    healthSummary,
    agentsByVersion,
    registryVersion: REGISTRY_VERSION,
    lastUpdated: new Date().toISOString(),
  };
}

// ─── Registry Events ──────────────────────────────────────────────────────

/**
 * Get the registry event log.
 */
export function getRegistryEvents(limit?: number): RegistryEvent[] {
  const events = [...registryEvents];
  return limit ? events.slice(-limit) : events;
}

// ─── All Capabilities ─────────────────────────────────────────────────────

/**
 * Get a dedicated list of all unique capabilities across all agents.
 */
export function getAllCapabilities(): string[] {
  const caps = new Set<string>();
  for (const agent of registry.values()) {
    for (const cap of agent.capabilities) {
      caps.add(cap);
    }
  }
  return Array.from(caps).sort();
}

/**
 * Get all unique tools across all agents.
 */
export function getAllTools(): string[] {
  const tools = new Set<string>();
  for (const agent of registry.values()) {
    for (const tool of agent.tools) {
      tools.add(tool);
    }
  }
  return Array.from(tools).sort();
}

// ─── Helper: Semver Comparison ────────────────────────────────────────────

/**
 * Compare two semver strings.
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
function compareSemver(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const pA = partsA[i] || 0;
    const pB = partsB[i] || 0;
    if (pA > pB) return 1;
    if (pA < pB) return -1;
  }

  return 0;
}

// ─── Helper: Emit Registry Trace Event ────────────────────────────────────

/**
 * Emit a registry event as a decision trace event.
 * Uses a synthetic case ID since registry events are system-level.
 */
async function emitRegistryTraceEvent(event: RegistryEvent): Promise<void> {
  try {
    await emitTraceEvent({
      caseId: 'system:agent-registry',
      agent: 'agent-registry',
      step: event.type,
      status: 'completed',
      detail: event.detail,
      timestamp: event.timestamp,
      metadata: {
        registryEvent: event.type,
        agentName: event.agentName,
      },
    });
  } catch (error) {
    // Non-critical — trace emission is best-effort
    console.warn('[AgentRegistry] Failed to emit trace event:', error);
  }
}

// ─── Demo Function ────────────────────────────────────────────────────────

/**
 * Run the Agent Registry demo moment.
 * Demonstrates discovery, version compatibility, and health tracking.
 */
export async function runRegistryDemo(): Promise<{
  summary: RegistrySummary;
  discoveryExamples: {
    coreAgents: AgentRegistration[];
    agentsWithCitationCapability: AgentRegistration[];
    agentsUsingGemini: AgentRegistration[];
  };
  versionCompatibility: Array<{
    agentA: string;
    agentB: string;
    compatible: boolean;
    requiredRange: string | null;
  }>;
  allCapabilities: string[];
  allTools: string[];
}> {
  // Summary
  const summary = getRegistrySummary();

  // Discovery examples
  const coreAgents = listAgents({ category: 'core' });
  const agentsWithCitationCapability = searchByCapability('citation_verification');
  const agentsUsingGemini = searchByTool('gemini_api');

  // Version compatibility checks (sample key relationships)
  const compatibilityChecks = [
    areVersionCompatible('denial-triage', 'policy-research'),
    areVersionCompatible('evidence-assembly', 'letter-drafting'),
    areVersionCompatible('letter-drafting', 'quality-review'),
    areVersionCompatible('quality-review', 'outcome-learning'),
    areVersionCompatible('patient-advocate', 'deadline-tracker'),
  ];

  const agentPairs = [
    ['denial-triage', 'policy-research'],
    ['evidence-assembly', 'letter-drafting'],
    ['letter-drafting', 'quality-review'],
    ['quality-review', 'outcome-learning'],
    ['patient-advocate', 'deadline-tracker'],
  ];

  const versionCompatibility = compatibilityChecks.map((check, i) => ({
    agentA: agentPairs[i][0],
    agentB: agentPairs[i][1],
    ...check,
  }));

  return {
    summary,
    discoveryExamples: {
      coreAgents,
      agentsWithCitationCapability,
      agentsUsingGemini,
    },
    versionCompatibility,
    allCapabilities: getAllCapabilities(),
    allTools: getAllTools(),
  };
}
