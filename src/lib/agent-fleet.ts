/**
 * DenialDefender Agent Fleet Client Library
 *
 * Server-side client for calling the agent fleet service (port 3004).
 * Used by Next.js API routes to proxy requests to the agent fleet.
 *
 * FALLBACK: When the external agent fleet service is unavailable
 * (connection refused, timeout, etc.), all functions fall back to
 * the inline workflow engine that runs inside Next.js itself.
 */

import { runInlineWorkflow } from "./workflow-engine";

const AGENT_FLEET_URL = process.env.AGENT_FLEET_URL || 'http://localhost:3004';
const AGENT_FLEET_TIMEOUT_MS = 5_000;

// ─── Types ────────────────────────────────────────────────────────

export interface DenialInput {
  denial_code?: string;
  denial_reason?: string;
  cpt_code?: string;
  icd10_code?: string;
  carrier_name?: string;
  amount_denied?: number;
}

export interface PatientContext {
  diagnosis?: string;
  treatment_history?: string;
  prior_authorizations?: string[];
}

export interface WorkflowRequest {
  case_id: string;
  denial: DenialInput;
  patient_context?: PatientContext;
}

export interface TriageResult {
  classification: string;
  confidence: number;
  factors: string[];
  strategy: string;
  reasoning: string;
  appeal_urgency: string;
  estimated_success_rate: number;
  recommended_next_steps: string[];
}

export interface EvidenceItem {
  id: string;
  title: string;
  description: string;
  source: string;
  provenance_tier: string;
  relevance_score: number;
  supports_appeal: boolean;
  key_findings: string[];
  year: number;
}

export interface EvidenceResult {
  clinical_question: string;
  evidence_items: EvidenceItem[];
  guideline_references: string[];
  overall_evidence_strength: string;
  evidence_summary: string;
  gaps: string[];
}

export interface ReviewCheck {
  category: string;
  status: string;
  score: number;
  details: string;
  severity: string;
}

export interface ReviewResult {
  overall_verdict: string;
  overall_score: number;
  checks: ReviewCheck[];
  critical_issues: string[];
  minor_issues: string[];
  recommendations: string[];
  revision_instructions: string | null;
}

export interface CoderResult {
  validation_result: string;
  overall_assessment: string;
  issues_found: Array<{
    category: string;
    severity: string;
    description: string;
    original_code: string;
    corrected_code: string | null;
    correction_rationale: string;
    would_reverse_denial: boolean;
  }>;
  corrected_codes: {
    cpt: string | null;
    icd10: string | null;
    modifiers: string[];
  };
  coding_action_required: boolean;
  confidence: number;
}

export interface PolicyResult {
  contradictions_found: Array<{
    id: string;
    type: string;
    strength: string;
    description: string;
    payer_position: string;
    counter_position: string;
    source: string;
    impact_on_appeal: string;
  }>;
  policy_gaps: string[];
  coverage_criteria: string[];
  patient_meets_criteria: string;
  policy_references: Array<{
    title: string;
    section: string;
    url: string | null;
  }>;
  regulatory_arguments: string[];
  overall_policy_assessment: string;
}

export interface CitationResult {
  verified_citations: Array<{
    number: number;
    id: string;
    formatted_citation: string;
    provenance_tier: string;
    tier_weight: number;
    relevance_score: number;
    combined_score: number;
    year: number;
    source_type: string;
    doi: string | null;
    pmid: string | null;
    verified: boolean;
    verification_note: string;
  }>;
  tier_distribution: Record<string, number>;
  overall_citation_quality: string;
  recommendations: string[];
}

export interface DraftResult {
  appeal_letter: string;
  sections: Array<{
    title: string;
    content: string;
  }>;
  citations_used: Array<{
    number: number;
    id: string;
    provenance_tier: string;
    short_ref: string;
  }>;
  word_count: number;
  tone: string;
  strengths: string[];
  potential_weaknesses: string[];
}

export interface HitlGateResult {
  gate_type: string;
  status: string;
  content: string;
}

export interface DecisionTrace {
  step: number;
  agent: string;
  timestamp: string;
  result_summary?: Record<string, unknown>;
  revision_loop?: number;
}

export interface WorkflowResult {
  case_id: string;
  workflow_id: string;
  status: string;
  triage: TriageResult;
  coder?: CoderResult;
  policy?: PolicyResult;
  evidence?: EvidenceResult;
  citation?: CitationResult;
  draft?: DraftResult;
  review?: ReviewResult;
  decision_traces: DecisionTrace[];
  hitl_gate: HitlGateResult;
  workflow_stopped_at?: string;
  stop_reason?: string;
  _trace: {
    agent: string;
    trace_id: string;
    elapsed_seconds: number;
    timestamp: string;
  };
}

export interface AgentFleetHealth {
  status: string;
  service: string;
  version: string;
  mock_mode: boolean;
  port: number;
  runtime: string;
  agents: string[];
  timestamp: string;
}

export interface GcpStatus {
  project_id: string;
  firestore: {
    available: boolean;
    message: string;
  };
  pubsub: {
    available: boolean;
    message: string;
    topics: string[];
  };
  gemini_api_key_set: boolean;
  timestamp: string;
}

// ─── Helper: Check if external service is reachable ────────────────

/**
 * Returns true if the external agent fleet service on port 3004
 * is reachable within the timeout window.
 */
async function isServiceReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${AGENT_FLEET_URL}/health`, {
      signal: AbortSignal.timeout(AGENT_FLEET_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── API Functions ────────────────────────────────────────────────

/**
 * Run the full appeal workflow for a case.
 *
 * First tries the external agent fleet service on port 3004.
 * If that fails (connection refused, timeout, etc.), falls back
 * to the inline workflow engine that runs inside Next.js.
 */
export async function runWorkflow(request: WorkflowRequest): Promise<WorkflowResult> {
  try {
    const res = await fetch(`${AGENT_FLEET_URL}/workflow/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    });

    if (res.ok) {
      return res.json();
    }

    // External service returned an error — fall back to inline
    const errorText = await res.text().catch(() => 'Unknown error');
    console.warn(
      `[agent-fleet] External service returned ${res.status}: ${errorText}. Falling back to inline workflow engine.`
    );
  } catch (err) {
    // Connection refused, timeout, DNS error, etc. — fall back to inline
    console.warn(
      `[agent-fleet] External service unreachable: ${err instanceof Error ? err.message : String(err)}. Falling back to inline workflow engine.`
    );
  }

  // ── Fallback: run inline workflow ────────────────────────────────
  return runInlineWorkflow(request);
}

/**
 * Get agent fleet health status.
 *
 * If the external service is down, returns a synthetic health
 * response indicating the inline engine is available as fallback.
 */
export async function getAgentFleetHealth(): Promise<AgentFleetHealth> {
  try {
    const res = await fetch(`${AGENT_FLEET_URL}/health`, {
      signal: AbortSignal.timeout(AGENT_FLEET_TIMEOUT_MS),
    });

    if (res.ok) {
      return res.json();
    }
  } catch {
    // Service unreachable — return inline fallback health
  }

  return {
    status: "degraded",
    service: "denialdefender-agent-fleet",
    version: "1.0.0-inline",
    mock_mode: true,
    port: 0,
    runtime: "inline",
    agents: [
      "triage",
      "coder",
      "policy",
      "evidence",
      "citation",
      "drafter",
      "reviewer",
      "orchestrator",
    ],
    timestamp: new Date().toISOString(),
  };
}

/**
 * Run triage agent only.
 *
 * Falls back to inline workflow engine (triage step) if the
 * external service is unavailable.
 */
export async function runTriage(denial: DenialInput): Promise<{ agent: string; status: string; data: TriageResult }> {
  try {
    const res = await fetch(`${AGENT_FLEET_URL}/agents/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(denial),
      signal: AbortSignal.timeout(AGENT_FLEET_TIMEOUT_MS),
    });

    if (res.ok) {
      return res.json();
    }
  } catch {
    // Service unreachable — fall back to inline
  }

  // Inline fallback: run the full inline workflow but only return triage
  const request: WorkflowRequest = {
    case_id: `inline-triage-${Date.now()}`,
    denial,
  };
  const result = await runInlineWorkflow(request);
  return {
    agent: "triage",
    status: "success",
    data: result.triage,
  };
}

/**
 * Get GCP status (Firestore + Pub/Sub).
 *
 * First tries the external agent fleet service. If that fails,
 * returns a local status response showing SQLite and Socket.io
 * as the local replacements for Firestore and Pub/Sub.
 */
export async function getGcpStatus(): Promise<GcpStatus> {
  try {
    const res = await fetch(`${AGENT_FLEET_URL}/gcp/status`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      return res.json();
    }
  } catch {
    // Service unreachable — report local infrastructure
  }

  return {
    project_id: "denialdefender-local",
    firestore: { available: true, message: "SQLite (local Firestore) connected via Prisma" },
    pubsub: {
      available: true,
      message: "Socket.io (local Pub/Sub) available",
      topics: ["case:created", "trace:event", "gate:pending", "gate:resolved", "case:state:changed"],
    },
    gemini_api_key_set: false,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get workflow status for a case.
 *
 * Returns null when the external service is unavailable
 * (the inline engine doesn't maintain a workflow status store).
 */
export async function getWorkflowStatus(caseId: string): Promise<{
  case_id: string;
  workflow_id: string;
  status: string;
  started_at: string;
  updated_at: string;
} | null> {
  try {
    const res = await fetch(`${AGENT_FLEET_URL}/workflow/status/${caseId}`, {
      signal: AbortSignal.timeout(AGENT_FLEET_TIMEOUT_MS),
    });

    if (res.ok) {
      return res.json();
    }

    return null;
  } catch {
    return null;
  }
}
