/**
 * DenialDefender — Agent Identity Service (Day 11)
 *
 * The permission-scoping layer of the governance vertex. Each agent has
 * a cryptographic identity with scoped permissions that enforce the
 * principle of least privilege.
 *
 * Per the Ultimate Blueprint:
 *   "Configure Agent Identity so each agent's permissions are scoped:
 *    Quality Review cannot write appeals; Letter Drafting cannot ingest
 *    outcomes."
 *
 * This is GEAP Agent Identity — zero-trust credentials per agent.
 *
 * Permission Model:
 *   Each agent has a defined set of capabilities (read/write/execute)
 *   scoped to specific resources (cases, appeals, outcomes, evidence).
 *   Any action outside the agent's scope is DENIED and logged.
 */

import { db } from '@/lib/db';
import { emitTraceEvent } from './decision-trace-stream';

// ─── Types ────────────────────────────────────────────────────────────────

export type AgentRole =
  | 'patient-advocate'
  | 'denial-triage'
  | 'policy-research'
  | 'evidence-assembly'
  | 'letter-drafting'
  | 'quality-review'
  | 'outcome-learning'
  | 'deadline-tracker';

export type Resource =
  | 'case'           // Case state management
  | 'denial'         // Denial information
  | 'appeal'         // Appeal letter drafts
  | 'outcome'        // Outcome records (won/lost/partial)
  | 'evidence'       // Evidence corpus
  | 'citation'       // Citation verification
  | 'policy'         // Policy clauses
  | 'deadline'       // Deadline tracking
  | 'hitl_gate'      // HITL gate operations
  | 'trace'          // Decision trace events
  | 'phi_guard'      // PHI Guard audit
  | 'governance';    // Governance audit

export type Capability = 'read' | 'write' | 'execute';

export interface AgentPermission {
  role: AgentRole;
  resources: {
    resource: Resource;
    capabilities: Capability[];
  }[];
  label: string;
  description: string;
  icon: string;  // Icon name for UI
  color: string; // Tailwind color class
}

export interface PermissionCheckResult {
  allowed: boolean;
  agent: AgentRole;
  resource: Resource;
  capability: Capability;
  reason: string;
  timestamp: string;
}

export interface IdentityAuditEntry {
  id?: string;
  agentName: AgentRole;
  action: string;
  resource: Resource;
  capability: Capability;
  verdict: 'ALLOW' | 'DENY';
  reason: string;
  caseId?: string;
  timestamp: string;
}

// ─── Agent Permission Definitions ────────────────────────────────────────

/**
 * Comprehensive permission matrix for all 8 agents.
 *
 * Key design decisions (from the blueprint):
 *   - Quality Review CANNOT write appeals (prevents self-approval)
 *   - Letter Drafting CANNOT ingest outcomes (prevents bias from prior results)
 *   - Patient Advocate CANNOT execute quality review (separation of empathetic and adversarial roles)
 *   - Outcome Learning CANNOT write appeals or evidence (read-only on product data)
 *   - Deadline Tracker CANNOT write any clinical content (temporal-only authority)
 */
export const AGENT_PERMISSIONS: AgentPermission[] = [
  {
    role: 'patient-advocate',
    label: 'Patient Advocate',
    description: 'Empathetic intake, case framing, urgency assessment. Cannot perform quality review.',
    icon: 'Heart',
    color: 'text-rose-600',
    resources: [
      { resource: 'case', capabilities: ['read', 'write'] },
      { resource: 'denial', capabilities: ['read'] },
      { resource: 'appeal', capabilities: ['read'] },  // Read only — doesn't draft
      { resource: 'evidence', capabilities: ['read'] },
      { resource: 'trace', capabilities: ['write'] },
      { resource: 'hitl_gate', capabilities: ['read'] },
    ],
  },
  {
    role: 'denial-triage',
    label: 'Denial Triage',
    description: 'Multimodal denial parse, classification, structured JSON output.',
    icon: 'Search',
    color: 'text-teal-600',
    resources: [
      { resource: 'case', capabilities: ['read', 'write'] },
      { resource: 'denial', capabilities: ['read', 'write'] },
      { resource: 'appeal', capabilities: ['read'] },
      { resource: 'evidence', capabilities: ['read'] },
      { resource: 'trace', capabilities: ['write'] },
      { resource: 'hitl_gate', capabilities: ['read', 'write'] },  // Can create Gate 1
    ],
  },
  {
    role: 'policy-research',
    label: 'Policy Research',
    description: 'Payer policy retrieval, clause selection, provenance tracking.',
    icon: 'FileText',
    color: 'text-violet-600',
    resources: [
      { resource: 'case', capabilities: ['read'] },
      { resource: 'denial', capabilities: ['read'] },
      { resource: 'policy', capabilities: ['read', 'execute'] },
      { resource: 'evidence', capabilities: ['read', 'write'] },
      { resource: 'citation', capabilities: ['read', 'write'] },
      { resource: 'trace', capabilities: ['write'] },
    ],
  },
  {
    role: 'evidence-assembly',
    label: 'Evidence Assembly',
    description: 'Clinical evidence matching, provenance scoring, evidence ranking.',
    icon: 'BookOpen',
    color: 'text-emerald-600',
    resources: [
      { resource: 'case', capabilities: ['read'] },
      { resource: 'denial', capabilities: ['read'] },
      { resource: 'evidence', capabilities: ['read', 'write'] },
      { resource: 'citation', capabilities: ['read', 'write'] },
      { resource: 'trace', capabilities: ['write'] },
    ],
  },
  {
    role: 'letter-drafting',
    label: 'Letter Drafting',
    description: 'Appeal letter composition. CANNOT ingest outcomes (prevents bias from prior results).',
    icon: 'PenTool',
    color: 'text-blue-600',
    resources: [
      { resource: 'case', capabilities: ['read'] },
      { resource: 'denial', capabilities: ['read'] },
      { resource: 'appeal', capabilities: ['read', 'write'] },  // CAN write appeals
      { resource: 'evidence', capabilities: ['read'] },
      { resource: 'citation', capabilities: ['read'] },
      { resource: 'policy', capabilities: ['read'] },
      // NOTABLE: NO outcome access — Letter Drafting cannot ingest outcomes
      { resource: 'trace', capabilities: ['write'] },
    ],
  },
  {
    role: 'quality-review',
    label: 'Quality Review (Adversarial)',
    description: 'Adversarial review, citation verification. CANNOT write appeals (prevents self-approval).',
    icon: 'CheckCircle2',
    color: 'text-purple-600',
    resources: [
      { resource: 'case', capabilities: ['read'] },
      { resource: 'denial', capabilities: ['read'] },
      { resource: 'appeal', capabilities: ['read'] },  // Read only — CANNOT write appeals
      { resource: 'evidence', capabilities: ['read'] },
      { resource: 'citation', capabilities: ['read', 'write'] },  // Can verify citations
      { resource: 'outcome', capabilities: ['read'] },
      { resource: 'trace', capabilities: ['write'] },
      { resource: 'hitl_gate', capabilities: ['read', 'write'] },  // Can create Gate 2
    ],
  },
  {
    role: 'outcome-learning',
    label: 'Outcome Learning',
    description: 'Outcome ingestion, weight update, before/after scoring. Read-only on product data.',
    icon: 'TrendingUp',
    color: 'text-amber-600',
    resources: [
      { resource: 'case', capabilities: ['read'] },
      { resource: 'outcome', capabilities: ['read', 'write'] },
      { resource: 'policy', capabilities: ['read', 'write'] },  // Can update weights
      { resource: 'trace', capabilities: ['write'] },
      // NOTABLE: NO appeal or evidence write — read-only on product data
    ],
  },
  {
    role: 'deadline-tracker',
    label: 'Deadline Tracker',
    description: 'Deadline monitoring, escalation, time-series. Temporal-only authority.',
    icon: 'Clock',
    color: 'text-orange-600',
    resources: [
      { resource: 'case', capabilities: ['read'] },
      { resource: 'deadline', capabilities: ['read', 'write', 'execute'] },
      { resource: 'trace', capabilities: ['write'] },
      { resource: 'hitl_gate', capabilities: ['read'] },
      // NOTABLE: NO clinical content write — temporal-only authority
    ],
  },
];

// ─── Permission Lookup ────────────────────────────────────────────────────

/**
 * Get the permission definition for an agent.
 */
export function getAgentPermission(role: AgentRole): AgentPermission | undefined {
  return AGENT_PERMISSIONS.find(p => p.role === role);
}

/**
 * Get all agent permission definitions.
 */
export function getAllAgentPermissions(): AgentPermission[] {
  return AGENT_PERMISSIONS;
}

/**
 * Check if an agent has a specific capability on a resource.
 */
export function hasCapability(
  role: AgentRole,
  resource: Resource,
  capability: Capability,
): boolean {
  const perm = getAgentPermission(role);
  if (!perm) return false;

  const resourcePerm = perm.resources.find(r => r.resource === resource);
  if (!resourcePerm) return false;

  return resourcePerm.capabilities.includes(capability);
}

// ─── Permission Gate ──────────────────────────────────────────────────────

/**
 * Run the Agent Identity permission gate.
 *
 * This is called before any agent attempts an action. If the action
 * is outside the agent's scope, it is DENIED, logged, and a trace
 * event is emitted.
 *
 * Returns PermissionCheckResult indicating allow/deny.
 */
export async function checkPermission(
  role: AgentRole,
  resource: Resource,
  capability: Capability,
  caseId?: string,
  detail?: string,
): Promise<PermissionCheckResult> {
  const allowed = hasCapability(role, resource, capability);

  const reason = allowed
    ? `${role} has ${capability} permission on ${resource}`
    : `${role} does NOT have ${capability} permission on ${resource}. Action denied.`;

  const result: PermissionCheckResult = {
    allowed,
    agent: role,
    resource,
    capability,
    reason,
    timestamp: new Date().toISOString(),
  };

  // ── Persist to audit log ──
  try {
    await db.governanceAudit.create({
      data: {
        case_id: caseId || null,
        component: 'agent_identity',
        action: allowed ? 'permission_check' : 'permission_deny',
        agent_name: role,
        verdict: allowed ? 'ALLOW' : 'DENY',
        risk_score: allowed ? 0 : 80, // Permission violations are high risk
        details: JSON.stringify({
          resource,
          capability,
          reason,
          detail,
        }),
      },
    });
  } catch (error) {
    console.warn('[AgentIdentity] Failed to persist audit entry:', error);
  }

  // ── Emit trace event on DENY ──
  if (!allowed && caseId) {
    try {
      await emitTraceEvent({
        caseId,
        agent: 'agent-identity',
        step: 'permission_deny',
        status: 'blocked',
        detail: reason,
        timestamp: new Date().toISOString(),
        metadata: {
          deniedAgent: role,
          resource,
          capability,
        },
      });
    } catch (error) {
      console.warn('[AgentIdentity] Failed to emit trace event:', error);
    }
  }

  return result;
}

// ─── Permission Violation Examples (for demo) ────────────────────────────

/**
 * Example violations that prove scoping works.
 * These are the blueprint-mandated examples:
 *   1. Quality Review cannot write appeals
 *   2. Letter Drafting cannot ingest outcomes
 */
export const DEMONSTRATION_VIOLATIONS = [
  {
    agent: 'quality-review' as AgentRole,
    resource: 'appeal' as Resource,
    capability: 'write' as Capability,
    description: 'Quality Review Agent attempts to WRITE an appeal — DENIED (prevents self-approval)',
  },
  {
    agent: 'letter-drafting' as AgentRole,
    resource: 'outcome' as Resource,
    capability: 'read' as Capability,
    description: 'Letter Drafting Agent attempts to READ outcomes — DENIED (prevents bias from prior results)',
  },
  {
    agent: 'outcome-learning' as AgentRole,
    resource: 'appeal' as Resource,
    capability: 'write' as Capability,
    description: 'Outcome Learning Agent attempts to WRITE an appeal — DENIED (read-only on product data)',
  },
  {
    agent: 'deadline-tracker' as AgentRole,
    resource: 'evidence' as Resource,
    capability: 'write' as Capability,
    description: 'Deadline Tracker attempts to WRITE evidence — DENIED (temporal-only authority)',
  },
];

/**
 * Example allowed operations for contrast in the demo.
 */
export const DEMONSTRATION_ALLOWANCES = [
  {
    agent: 'letter-drafting' as AgentRole,
    resource: 'appeal' as Resource,
    capability: 'write' as Capability,
    description: 'Letter Drafting Agent WRITES appeal — ALLOWED (its core responsibility)',
  },
  {
    agent: 'quality-review' as AgentRole,
    resource: 'citation' as Resource,
    capability: 'write' as Capability,
    description: 'Quality Review Agent WRITES citation status — ALLOWED (verification is its role)',
  },
  {
    agent: 'outcome-learning' as AgentRole,
    resource: 'outcome' as Resource,
    capability: 'write' as Capability,
    description: 'Outcome Learning Agent WRITES outcome record — ALLOWED (its core responsibility)',
  },
  {
    agent: 'policy-research' as AgentRole,
    resource: 'evidence' as Resource,
    capability: 'write' as Capability,
    description: 'Policy Research Agent WRITES evidence — ALLOWED (retrieval is its role)',
  },
];

// ─── Audit Query ─────────────────────────────────────────────────────────

/**
 * Get Agent Identity audit entries.
 */
export async function getAgentIdentityAudit(caseId?: string) {
  const where = caseId
    ? { component: 'agent_identity', case_id: caseId }
    : { component: 'agent_identity' };

  return db.governanceAudit.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: 100,
  });
}

/**
 * Run the permission demonstration: test all violations and allowances.
 * Returns results for the demo moment.
 */
export async function runIdentityDemo(): Promise<{
  violations: PermissionCheckResult[];
  allowances: PermissionCheckResult[];
  allPassed: boolean;
}> {
  const violations: PermissionCheckResult[] = [];
  const allowances: PermissionCheckResult[] = [];

  // Test all violations (should all be DENIED)
  for (const v of DEMONSTRATION_VIOLATIONS) {
    const result = await checkPermission(v.agent, v.resource, v.capability);
    violations.push(result);
  }

  // Test all allowances (should all be ALLOWED)
  for (const a of DEMONSTRATION_ALLOWANCES) {
    const result = await checkPermission(a.agent, a.resource, a.capability);
    allowances.push(result);
  }

  // Gate: all violations should be denied, all allowances should be allowed
  const allPassed = violations.every(v => !v.allowed) && allowances.every(a => a.allowed);

  return { violations, allowances, allPassed };
}
