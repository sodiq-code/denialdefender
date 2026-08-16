/**
 * DenialDefender Two-Agent Pipeline: Triage → Policy Research
 * Day 2 Core Deliverable
 *
 * This pipeline wires together:
 * 1. Triage Agent — classifies a denial using Gemini via agent fleet (port 3004)
 * 2. Policy Research Agent — retrieves relevant evidence from the corpus
 *
 * The combined result flows back through the API with latency measurements.
 */

import { retrievePolicyClauses, type PolicyQuery, type PolicyRetrievalResponse } from './policy-research';

// ─── Agent Fleet Configuration ────────────────────────────────────────────

const AGENT_FLEET_URL = 'http://localhost:3004';

// ─── Types ────────────────────────────────────────────────────────────────

export interface TriageResult {
  denial_type: string;           // e.g., "medical_necessity", "prior_auth", "coding", "experimental", "out_of_network"
  denial_type_label: string;     // Human-readable label, e.g., "Medical Necessity"
  payer: string;                 // e.g., "UnitedHealthcare"
  reason_codes: string[];        // e.g., ["CO16", "CO15"]
  cpt_codes: string[];           // e.g., ["99213", "43239"]
  icd_codes: string[];           // e.g., ["K21.0", "R12"]
  category: string;              // High-level category
  confidence: number;            // 0-1
  summary: string;               // Brief summary of the denial
  appeal_strategy: string;       // Suggested appeal strategy
}

export interface TwoAgentPipelineResult {
  triage: TriageResult;
  evidence: PolicyRetrievalResponse;
  latency: {
    triageMs: number;
    researchMs: number;
    totalMs: number;
  };
  success: boolean;
  errors: string[];
}

// ─── Denial Type Mapping ──────────────────────────────────────────────────

const DENIAL_TYPE_MAP: Record<string, string> = {
  'medical_necessity': 'Medical Necessity',
  'medical necessity': 'Medical Necessity',
  'not medically necessary': 'Medical Necessity',
  'prior_auth': 'Prior Authorization',
  'prior authorization': 'Prior Authorization',
  'precertification': 'Prior Authorization',
  'preauthorization': 'Prior Authorization',
  'coding': 'Coding/Billing',
  'coding/billing': 'Coding/Billing',
  'coding error': 'Coding/Billing',
  'bundling': 'Coding/Billing',
  'experimental': 'Experimental/Investigational',
  'experimental/investigational': 'Experimental/Investigational',
  'investigational': 'Experimental/Investigational',
  'out_of_network': 'Out-of-Network',
  'out-of-network': 'Out-of-Network',
  'non-participating': 'Out-of-Network',
};

function normalizeDenialType(raw: string): string {
  const lower = raw.toLowerCase().trim();
  for (const [key, label] of Object.entries(DENIAL_TYPE_MAP)) {
    if (lower.includes(key) || key.includes(lower)) {
      return key.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    }
  }
  // Default: convert to lowercase underscored
  return lower.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function denialTypeLabel(normalized: string): string {
  return DENIAL_TYPE_MAP[normalized] || normalized.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Step 1: Triage — Classify the Denial ─────────────────────────────────

/**
 * Use the Gemini agent fleet (port 3004) to classify a denial letter.
 * Extracts: denial_type, payer, reason_codes, cpt_codes, icd_codes, category.
 *
 * Falls back to rule-based extraction if the agent fleet is unavailable.
 */
export async function triageDenial(denialLetter: string, payer: string): Promise<TriageResult> {
  // Try Gemini agent fleet triage
  try {
    const fleetPayload = {
      denial: {
        denial_code: '',
        denial_reason: denialLetter,
        cpt_code: '',
        icd10_code: '',
        carrier_name: payer,
        amount_denied: 0,
      },
      patient_context: {
        diagnosis: '',
        treatment_history: '',
        prior_authorizations: '',
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    const response = await fetch(`${AGENT_FLEET_URL}/agents/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fleetPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Agent fleet returned HTTP ${response.status}`);
    }

    const data = await response.json();

    // The agent fleet returns a triage result with the expected structure
    // Extract the result — the fleet may wrap it in { result: ... } or return it directly
    const parsed = data.result || data;

    if (parsed && parsed.denial_type) {
      const normalizedType = normalizeDenialType(parsed.denial_type);
      return {
        denial_type: normalizedType,
        denial_type_label: denialTypeLabel(normalizedType),
        payer,
        reason_codes: parsed.reason_codes || [],
        cpt_codes: parsed.cpt_codes || [],
        icd_codes: parsed.icd_codes || [],
        category: parsed.category || normalizedType,
        confidence: parsed.confidence || 0.7,
        summary: parsed.summary || 'Denial classified by Gemini triage agent',
        appeal_strategy: parsed.appeal_strategy || 'Review payer policy and submit appeal with supporting evidence',
      };
    }
  } catch (error: any) {
    console.warn(`[two-agent-pipeline] Gemini agent fleet triage failed: ${error.message}. Falling back to rule-based triage.`);
  }

  // Fallback: rule-based triage
  return ruleBasedTriage(denialLetter, payer);
}

// ─── Rule-Based Triage Fallback ───────────────────────────────────────────

function ruleBasedTriage(denialLetter: string, payer: string): TriageResult {
  const lower = denialLetter.toLowerCase();

  // Classify denial type by keywords
  let denialType = 'medical_necessity';
  if (lower.includes('prior auth') || lower.includes('preauth') || lower.includes('precert') || lower.includes('authorization required')) {
    denialType = 'prior_auth';
  } else if (lower.includes('coding') || lower.includes('bundl') || lower.includes('modifier') || lower.includes('code error') || lower.includes('unbundl')) {
    denialType = 'coding';
  } else if (lower.includes('experimental') || lower.includes('investigational') || lower.includes('not proven') || lower.includes('insufficient evidence')) {
    denialType = 'experimental';
  } else if (lower.includes('out-of-network') || lower.includes('out of network') || lower.includes('non-participating') || lower.includes('non-network')) {
    denialType = 'out_of_network';
  } else if (lower.includes('not medically necessary') || lower.includes('medical necessity') || lower.includes('not reasonable')) {
    denialType = 'medical_necessity';
  }

  // Extract reason codes (CARC/RARC patterns)
  const reasonCodes: string[] = [];
  const codePatterns = [
    /\b(CO|PR|OA|PI|CR)(\d{2,5})\b/g,
    /\b(RARC)\s*[:\-]?\s*([A-Z0-9]+)/g,
  ];
  for (const pattern of codePatterns) {
    let match;
    while ((match = pattern.exec(denialLetter)) !== null) {
      reasonCodes.push(`${match[1]}${match[2]}`);
    }
  }

  // Extract CPT codes
  const cptCodes: string[] = [];
  const cptPattern = /\b(\d{4,5}[A-Z]?)\b/g;
  let cptMatch;
  while ((cptMatch = cptPattern.exec(denialLetter)) !== null) {
    const code = cptMatch[1];
    // CPT codes are 5 digits (or 4 + modifier), range 00100-99499
    if (/^\d{5}$/.test(code) && parseInt(code) >= 100 && parseInt(code) <= 99499) {
      cptCodes.push(code);
    }
  }

  // Extract ICD-10 codes
  const icdCodes: string[] = [];
  const icdPattern = /\b([A-Z]\d{2}(\.\d{1,4})?)\b/g;
  let icdMatch;
  while ((icdMatch = icdPattern.exec(denialLetter)) !== null) {
    const code = icdMatch[1];
    if (code.length >= 3 && code.length <= 8) {
      icdCodes.push(code);
    }
  }

  return {
    denial_type: denialType,
    denial_type_label: denialTypeLabel(denialType),
    payer,
    reason_codes: [...new Set(reasonCodes)],
    cpt_codes: [...new Set(cptCodes)],
    icd_codes: [...new Set(icdCodes)],
    category: denialType,
    confidence: 0.6,
    summary: `Denial classified as ${denialTypeLabel(denialType)} by rule-based triage`,
    appeal_strategy: `Review ${payer} policy for ${denialTypeLabel(denialType)} and gather supporting documentation`,
  };
}

// ─── Step 2: Policy Research — Retrieve Relevant Evidence ─────────────────

/**
 * Use the Policy Research Agent to find top-K relevant clauses
 * based on the triage result.
 *
 * Returns evidence with provenance cards.
 */
export async function researchPolicy(triageResult: TriageResult): Promise<PolicyRetrievalResponse> {
  const query: PolicyQuery = {
    denialReason: triageResult.summary || triResultToReason(triageResult),
    payer: triageResult.payer,
    denialType: triageResult.denial_type,
    cptCodes: triageResult.cpt_codes.length > 0 ? triageResult.cpt_codes : undefined,
    icdCodes: triageResult.icd_codes.length > 0 ? triageResult.icd_codes : undefined,
    mode: 'policy',
    topK: 5,
  };

  return retrievePolicyClauses(query);
}

function triResultToReason(t: TriageResult): string {
  const parts: string[] = [];
  parts.push(t.denial_type_label);
  if (t.payer) parts.push(`by ${t.payer}`);
  if (t.reason_codes.length > 0) parts.push(`codes: ${t.reason_codes.join(', ')}`);
  return parts.join(' ');
}

// ─── Combined Pipeline ────────────────────────────────────────────────────

/**
 * Run the two-agent pipeline: Triage → Policy Research
 *
 * 1. Triage Agent classifies the denial via Gemini agent fleet (denial type, payer, codes)
 * 2. Policy Research Agent uses the triage output to retrieve relevant evidence
 * 3. Combined result flows back with latency measurements
 */
export async function runTwoAgentPipeline(
  denialLetter: string,
  payer: string,
): Promise<TwoAgentPipelineResult> {
  const errors: string[] = [];
  const totalStart = Date.now();

  // Step 1: Triage
  const triageStart = Date.now();
  let triage: TriageResult;
  try {
    triage = await triageDenial(denialLetter, payer);
  } catch (error: any) {
    errors.push(`Triage failed: ${error.message}`);
    // Create minimal triage result
    triage = {
      denial_type: 'medical_necessity',
      denial_type_label: 'Medical Necessity',
      payer,
      reason_codes: [],
      cpt_codes: [],
      icd_codes: [],
      category: 'unknown',
      confidence: 0,
      summary: 'Triage failed — using default classification',
      appeal_strategy: 'Review denial and gather supporting documentation',
    };
  }
  const triageMs = Date.now() - triageStart;

  // Step 2: Policy Research
  const researchStart = Date.now();
  let evidence: PolicyRetrievalResponse;
  try {
    evidence = await researchPolicy(triage);
  } catch (error: any) {
    errors.push(`Policy research failed: ${error.message}`);
    evidence = {
      query: {
        denialReason: triage.summary,
        payer: triage.payer,
        denialType: triage.denial_type,
      },
      results: [],
      totalCandidates: 0,
      latencyMs: 0,
      withinSla: false,
      mode: 'policy',
      topK: 5,
    };
  }
  const researchMs = Date.now() - researchStart;

  const totalMs = Date.now() - totalStart;

  return {
    triage,
    evidence,
    latency: {
      triageMs,
      researchMs,
      totalMs,
    },
    success: errors.length === 0,
    errors,
  };
}
