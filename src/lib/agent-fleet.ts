/**
 * DenialDefender Agent Fleet Client Library
 *
 * Server-side client for calling the agent fleet service (port 3004).
 * Used by Next.js API routes to proxy requests to the agent fleet.
 */

const AGENT_FLEET_URL = 'http://localhost:3004';

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

// ─── API Functions ────────────────────────────────────────────────

/**
 * Run the full appeal workflow for a case
 */
export async function runWorkflow(request: WorkflowRequest): Promise<WorkflowResult> {
  const res = await fetch(`${AGENT_FLEET_URL}/workflow/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Agent fleet workflow failed (${res.status}): ${errorText}`);
  }

  return res.json();
}

/**
 * Get agent fleet health status
 */
export async function getAgentFleetHealth(): Promise<AgentFleetHealth> {
  const res = await fetch(`${AGENT_FLEET_URL}/health`, {
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    throw new Error(`Agent fleet health check failed (${res.status})`);
  }

  return res.json();
}

/**
 * Run triage agent only
 */
export async function runTriage(denial: DenialInput): Promise<{ agent: string; status: string; data: TriageResult }> {
  const res = await fetch(`${AGENT_FLEET_URL}/agents/triage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(denial),
  });

  if (!res.ok) {
    throw new Error(`Triage agent failed (${res.status})`);
  }

  return res.json();
}

/**
 * Get GCP status (Firestore + Pub/Sub)
 */
export async function getGcpStatus(): Promise<GcpStatus> {
  const res = await fetch(`${AGENT_FLEET_URL}/gcp/status`, {
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`GCP status check failed (${res.status})`);
  }

  return res.json();
}

/**
 * Get workflow status for a case
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
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return null;
    }

    return res.json();
  } catch {
    return null;
  }
}
