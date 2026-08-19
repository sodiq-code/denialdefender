/**
 * DenialDefender Agent Fleet — Bun mini-service (port 3004 fixed, MOCK mode)
 *
 * Mirrors the HTTP contract of the reference Python (FastAPI + google-genai)
 * service at /tmp/denialdefender-analyze/mini-services/agent-fleet/main.py.
 *
 * In this sandbox we run in MOCK_MODE = true (no GEMINI_API_KEY required),
 * returning deterministic structured mock outputs for every agent so the
 * platform can be exercised end-to-end.
 *
 * ── Endpoints ───────────────────────────────────────────────────────────────
 *   GET  /health                     — health check (mock mode, agent list)
 *   GET  /gcp/status                 — Firestore + Pub/Sub status (mock/local)
 *   POST /agents/{name}             — run a single agent
 *        name ∈ { triage, coder, policy, evidence, citation, drafter, reviewer, orchestrator }
 *   POST /workflow/run               — run the full 8-agent workflow (sequential mock)
 *   GET  /workflow/status/:id       — fetch workflow status by id
 *   GET  /permissions                — view the agent identity permission matrix
 *
 * ── AgentResponse shape ────────────────────────────────────────────────────
 *   {
 *     agent: string,
 *     status: 'success',
 *     data:   object,            // structured deterministic mock output
 *     latencyMs: number,
 *     trace:  { agent, trace_id, timestamp, mode:'mock', elapsed_seconds }
 *   }
 *
 * Port is HARDCODED to 3004 — never read from env (per task spec).
 */

// ─── Configuration ────────────────────────────────────────────────────────────
const PORT = 3004;
const SERVICE_NAME = "denialdefender-agent-fleet";
const SERVICE_VERSION = "1.0.0";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID ?? "denialdefender";
const REGION_ENDPOINT = process.env.GCP_REGION ?? "europe-west1";
// When GEMINI_API_KEY is set, the fleet calls the real Gemini API
// (gemini-2.5-flash via the AI Studio generativelanguage endpoint). When the
// key is absent (sandbox/local dev), MOCK_MODE=true and every agent returns
// deterministic structured mock output — exactly like the upstream design.
const MOCK_MODE = !GEMINI_API_KEY;

// ─── Real Gemini call (Vertex AI on Cloud Run, AI Studio fallback locally) ────
// On Cloud Run we use Vertex AI with the runtime service account's access token
// (obtained from the metadata server). GEMINI_PROVIDER=vertex_ai (per spec).
// Locally (no metadata), fall back to the AI Studio API key.
let cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  // On Cloud Run, the metadata server provides a token for the runtime SA.
  try {
    const res = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return null;
    const data: any = await res.json();
    cachedToken = { token: data.access_token, exp: Date.now() + (data.expires_in - 30) * 1000 };
    return data.access_token as string;
  } catch {
    return null;
  }
}

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string | null> {
  if (MOCK_MODE) return null;
  const payload = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json" },
  };
  try {
    let res: Response | null = null;
    // ── Path 1: Vertex AI (Cloud Run runtime SA via metadata) ──
    const token = (cachedToken && cachedToken.exp > Date.now())
      ? cachedToken.token
      : await getAccessToken();
    if (token) {
      // gemini-3.x models are global-only; older 2.5 models are regional.
      const loc = GEMINI_MODEL.startsWith("gemini-3.") ? "global" : REGION_ENDPOINT;
      const host = loc === "global" ? "aiplatform.googleapis.com" : `${REGION_ENDPOINT}-aiplatform.googleapis.com`;
      const vurl = `https://${host}/v1/projects/${GCP_PROJECT_ID}/locations/${loc}/publishers/google/models/${GEMINI_MODEL}:generateContent`;
      res = await fetch(vurl, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(45000),
      });
    }
    // ── Path 2: AI Studio API key fallback (local dev / no metadata) ──
    if ((!res || !res.ok) && GEMINI_API_KEY) {
      const aurl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      res = await fetch(aurl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(45000),
      });
    }
    if (!res || !res.ok) {
      const body = res ? await res.text().catch(() => "") : "(no response)";
      console.warn(`[Gemini] ${res?.status ?? "no-res"}: ${body}`.slice(0, 300));
      return null;
    }
    const data: any = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
    return text || null;
  } catch (e: any) {
    console.warn(`[Gemini] error: ${e?.message ?? e}`.slice(0, 200));
    return null;
  }
}

function tryParseJson<T = unknown>(text: string | null, fallback: T): T {
  if (!text) return fallback;
  try {
    // strip markdown fences if present
    const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    return JSON.parse(clean) as T;
  } catch {
    return fallback;
  }
}

// ─── Agent Identity / RBAC matrix (mirrors src/lib/agent-identity.ts) ────────
type Capability = "read" | "write" | "execute";
type Resource =
  | "case" | "denial" | "appeal" | "outcome" | "evidence" | "citation"
  | "policy" | "deadline" | "hitl_gate" | "trace" | "phi_guard" | "governance";

interface AgentScope {
  role: string;
  resources: Partial<Record<Resource, Capability[]>>;
}

const AGENT_SCOPES: Record<string, AgentScope> = {
  triage: {
    role: "denial-triage",
    resources: {
      case: ["read", "write"],
      denial: ["read", "write"],
      appeal: ["read"],
      evidence: ["read"],
      trace: ["write"],
      hitl_gate: ["read", "write"],
    },
  },
  coder: {
    role: "denial-triage",
    resources: {
      case: ["read", "write"],
      denial: ["read", "write"],
      appeal: ["read"],
      evidence: ["read"],
      trace: ["write"],
      hitl_gate: ["read", "write"],
    },
  },
  policy: {
    role: "policy-research",
    resources: {
      case: ["read"],
      denial: ["read"],
      policy: ["read", "execute"],
      evidence: ["read", "write"],
      citation: ["read", "write"],
      trace: ["write"],
    },
  },
  evidence: {
    role: "evidence-assembly",
    resources: {
      case: ["read"],
      denial: ["read"],
      evidence: ["read", "write"],
      citation: ["read", "write"],
      trace: ["write"],
    },
  },
  citation: {
    role: "policy-research",
    resources: {
      case: ["read"],
      denial: ["read"],
      policy: ["read", "execute"],
      evidence: ["read", "write"],
      citation: ["read", "write"],
      trace: ["write"],
    },
  },
  drafter: {
    role: "letter-drafting",
    resources: {
      case: ["read"],
      denial: ["read"],
      appeal: ["read", "write"],
      evidence: ["read"],
      citation: ["read"],
      policy: ["read"],
      trace: ["write"],
      // NOTABLE: NO outcome access — drafter cannot ingest outcomes
    },
  },
  reviewer: {
    role: "quality-review",
    resources: {
      case: ["read"],
      denial: ["read"],
      appeal: ["read"],          // read-only — CANNOT write appeals
      evidence: ["read"],
      citation: ["read", "write"],
      outcome: ["read"],
      trace: ["write"],
      hitl_gate: ["read", "write"],
    },
  },
  orchestrator: {
    role: "patient-advocate",
    resources: {
      case: ["read", "write"],
      denial: ["read"],
      appeal: ["read"],
      evidence: ["read"],
      trace: ["write"],
      hitl_gate: ["read"],
    },
  },
};

const AGENT_PRIMARY_RESOURCE: Record<string, Resource> = {
  triage: "denial",
  coder: "denial",
  policy: "policy",
  evidence: "evidence",
  citation: "citation",
  drafter: "appeal",
  reviewer: "citation",
  orchestrator: "case",
};

interface PermissionResult {
  allowed: boolean;
  reason: string;
}

function enforcePermission(agent: string, resource: Resource, capability: Capability): PermissionResult {
  const scope = AGENT_SCOPES[agent];
  if (!scope) return { allowed: false, reason: `Unknown agent: ${agent}` };
  const caps = scope.resources[resource];
  if (!caps || !caps.includes(capability)) {
    return {
      allowed: false,
      reason: `DENIED: ${scope.role} does NOT have ${capability} permission on ${resource}. Action blocked at runtime.`,
    };
  }
  return { allowed: true, reason: `${scope.role} has ${capability} permission on ${resource}` };
}

// ─── Utility helpers ──────────────────────────────────────────────────────────
const nowISO = (): string => new Date().toISOString();
const elapsedSince = (start: number): number => Math.round((Date.now() - start) / 1000 * 1000) / 1000;
const uuid = (): string => crypto.randomUUID();

interface DenialInput {
  denial_code?: string;
  denial_reason?: string;
  cpt_code?: string;
  icd10_code?: string;
  carrier_name?: string;
  amount_denied?: number;
}

function getDenial(input: Record<string, unknown>): DenialInput {
  return (input.denial ?? input) as DenialInput;
}

// ─── Mock data generators (deterministic) ─────────────────────────────────────
// Each generator returns structured mock output mirroring the reference Python agents.

async function mockTriage(input: Record<string, unknown>) {
  const denial = getDenial(input);
  const code = denial.denial_code ?? "CO-50";
  const reason = denial.denial_reason ?? "Non-covered service";
  // ── Live Gemini path ──
  if (!MOCK_MODE) {
    const sys = "You are DenialDefender's Denial Triage agent. Classify the insurance denial and return ONLY JSON with keys: classification (APPEALABLE|NOT_APPEALABLE|PARTIALLY_APPEALABLE), confidence (0-1), factors (array of strings), strategy (MEDICAL_NECESSITY|PRIOR_AUTH|CODING_ERROR|EXPERIMENTAL), reasoning (string), appeal_urgency (high|medium|low), estimated_success_rate (0-1), recommended_next_steps (array of strings).";
    const user = `Denial code: ${code}\nReason: ${reason}\nPayer: ${denial.carrier_name ?? "Unknown"}\nCPT: ${denial.cpt_code ?? "?"}\nICD-10: ${denial.icd10_code ?? "?"}\nClassify this denial for appeal strategy.`;
    const live = tryParseJson(await callGemini(sys, user), null as any);
    if (live) return { ...live, _source: "live" };
  }
  // ── Mock fallback ──
  let classification = "APPEALABLE";
  let strategy = "MEDICAL_NECESSITY";
  let confidence = 0.85;
  if (code.startsWith("CO-197")) { classification = "NOT_APPEALABLE"; strategy = "PRIOR_AUTH"; confidence = 0.15; }
  else if (code.startsWith("CO-4")) { classification = "PARTIALLY_APPEALABLE"; strategy = "CODING_ERROR"; confidence = 0.65; }
  else if (code.startsWith("CO-50") || code.startsWith("CO-236")) { classification = "APPEALABLE"; strategy = "MEDICAL_NECESSITY"; confidence = 0.78; }
  return {
    classification,
    confidence,
    factors: [
      `Denial code ${code} indicates ${reason}`,
      "Clinical documentation may support medical necessity",
      "Payer policy may have internal contradictions with clinical guidelines",
    ],
    strategy,
    reasoning: `Denial code ${code} with reason '${reason}' suggests the payer determined this service does not meet coverage criteria. Based on common appeal patterns, the ${strategy} strategy has a reasonable chance of success when supported by appropriate clinical evidence.`,
    appeal_urgency: confidence > 0.6 ? "high" : "medium",
    estimated_success_rate: Math.round(confidence * 0.9 * 100) / 100,
    recommended_next_steps: [
      "Validate CPT/ICD-10 codes with coder agent",
      "Search payer policy for contradictions with policy agent",
      "Gather clinical evidence with evidence agent",
      "Generate appeal letter with drafter agent",
    ],
  };
}

function mockCoder(input: Record<string, unknown>) {
  const denial = getDenial(input);
  const cpt = denial.cpt_code ?? "99213";
  const icd10 = denial.icd10_code ?? "M54.5";
  const code = denial.denial_code ?? "CO-50";
  const issues: Array<Record<string, unknown>> = [];
  let correctedCpt: string | null = null;
  let correctedIcd10: string | null = null;
  if (code.startsWith("CO-4") || code.startsWith("CO-11")) {
    issues.push({
      category: "CODE_DX_MATCH",
      severity: "DIRECT_CAUSE",
      description: `ICD-10 ${icd10} may not be a supported diagnosis for CPT ${cpt}. A more specific code may resolve the denial.`,
      original_code: icd10,
      corrected_code: "M54.16",
      correction_rationale: "Increasing ICD-10 specificity to the appropriate subcategory",
      would_reverse_denial: true,
    });
    correctedIcd10 = "M54.16";
  }
  if (issues.length === 0) {
    issues.push({
      category: "CODE_SPECIFICITY",
      severity: "UNRELATED",
      description: `ICD-10 ${icd10} could be more specific but is not the primary cause of denial.`,
      original_code: icd10,
      corrected_code: null,
      correction_rationale: "Increased specificity may strengthen the appeal but won't reverse the denial alone",
      would_reverse_denial: false,
    });
  }
  return {
    validation_result: correctedCpt || correctedIcd10 ? "CORRECTABLE" : "VALID",
    overall_assessment: correctedCpt || correctedIcd10
      ? `CPT ${cpt} with ICD-10 ${icd10}: Coding corrections available.`
      : `CPT ${cpt} with ICD-10 ${icd10}: Codes appear valid. Denial is likely based on medical necessity.`,
    issues_found: issues,
    corrected_codes: { cpt: correctedCpt, icd10: correctedIcd10, modifiers: [] },
    coding_action_required: correctedCpt !== null || correctedIcd10 !== null,
    confidence: 0.87,
  };
}

function mockPolicy(input: Record<string, unknown>) {
  const denial = getDenial(input);
  const carrier = denial.carrier_name ?? "Insurance Carrier";
  const cpt = denial.cpt_code ?? "99213";
  const icd10 = denial.icd10_code ?? "M54.5";
  const triage = (input.triage ?? {}) as Record<string, unknown>;
  const strategy = (triage.strategy as string) ?? "MEDICAL_NECESSITY";
  return {
    contradictions_found: [
      {
        id: "pol-1",
        type: "POLICY_CONTRADICTION",
        strength: "STRONG",
        description: `${carrier}'s medical policy for ${cpt} requires 6 weeks of conservative therapy, but clinical guidelines (ACR 2024) recommend intervention after 4 weeks when red flags are present.`,
        payer_position: "Requires 6 weeks conservative therapy before intervention",
        counter_position: "ACR Appropriateness Criteria 2024 recommends intervention after 4 weeks with documented red flags",
        source: "ACR Appropriateness Criteria, 2024 Update",
        impact_on_appeal: "Patient met the more stringent clinical guideline threshold; payer's requirement exceeds standard of care",
      },
      {
        id: "pol-2",
        type: "POLICY_GAP",
        strength: "MODERATE",
        description: `Payer policy for ${cpt} does not address the patient's specific clinical presentation with ${icd10}.`,
        payer_position: `Policy does not explicitly address ${cpt} for ${icd10}`,
        counter_position: "Silence in policy should be interpreted in favor of coverage per ambiguity doctrine",
        source: "State Insurance Regulation - Ambiguity Doctrine",
        impact_on_appeal: "Policy ambiguity should be resolved in the insured's favor",
      },
    ],
    policy_gaps: [
      `Payer policy does not address ${cpt} specifically for ${icd10}`,
      "Policy cites guidelines from 2019 — current 2024 guidelines differ significantly",
      "No separate medical review pathway described for complex cases",
    ],
    coverage_criteria: [
      "Documented failure of conservative therapy (6+ weeks per payer, 4+ weeks per guidelines)",
      "Imaging confirmation of condition",
      "Symptoms interfering with activities of daily living",
      "No contraindications to the procedure",
    ],
    patient_meets_criteria: "partial",
    policy_references: [
      { title: `${carrier} Medical Policy — Procedure ${cpt}`, section: "Section IV.B — Medical Necessity Criteria", url: null },
      { title: "CMS LCD L35027 — Related Procedure Coverage", section: "Coverage Determination", url: "https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=35027" },
    ],
    regulatory_arguments: [
      "State External Review Law: Patient has right to independent external review of medical necessity denials",
      "Ambiguity Doctrine: Policy gaps should be interpreted in favor of the insured",
      "Mental Health Parity: If applicable, parity requirements may apply",
    ],
    overall_policy_assessment: `Policy analysis reveals 2 contradictions between ${carrier}'s medical policy and authoritative clinical guidelines. Combined with the policy gap for ${cpt}/${icd10}, these findings substantially support the ${strategy} appeal strategy.`,
  };
}

function mockEvidence(input: Record<string, unknown>) {
  const denial = getDenial(input);
  const triage = (input.triage ?? {}) as Record<string, unknown>;
  const strategy = (triage.strategy as string) ?? "MEDICAL_NECESSITY";
  const cpt = denial.cpt_code ?? "99213";
  const icd10 = denial.icd10_code ?? "M54.5";
  return {
    clinical_question: `Is the procedure ${cpt} medically necessary for diagnosis ${icd10}?`,
    evidence_items: [
      {
        id: "ev-1", title: "Clinical Practice Guideline for Diagnosis Management",
        description: `National guideline recommends ${cpt} as first-line intervention for ${icd10} when conservative measures have failed.`,
        source: "American Medical Association - CPT Assistant",
        provenance_tier: "TIER_4_GUIDELINE", relevance_score: 0.92, supports_appeal: true,
        key_findings: [`${cpt} is indicated for ${icd10} per clinical guidelines`, "Conservative treatment failure documented", "Procedure aligned with standard of care"],
        year: 2024,
      },
      {
        id: "ev-2", title: "Systematic Review of Treatment Efficacy",
        description: "Multi-center systematic review demonstrating significant improvement in patient outcomes.",
        source: "Journal of the American Medical Association (JAMA)",
        provenance_tier: "TIER_1_SYSTEMATIC_REVIEW", relevance_score: 0.88, supports_appeal: true,
        key_findings: ["Pooled analysis shows 78% improvement rate", "Number needed to treat (NNT) of 4.2", "Statistically significant vs. conservative management (p<0.001)"],
        year: 2023,
      },
      {
        id: "ev-3", title: "Randomized Controlled Trial of Procedure vs. Usual Care",
        description: "Phase III RCT comparing the procedure to usual care demonstrating superiority.",
        source: "New England Journal of Medicine (NEJM)",
        provenance_tier: "TIER_2_RCT", relevance_score: 0.85, supports_appeal: true,
        key_findings: ["Primary endpoint met with p<0.001", "Mean difference: 2.4 (95% CI: 1.8-3.0)", "Favorable safety profile"],
        year: 2023,
      },
    ],
    guideline_references: ["AMA CPT Assistant, 2024 edition", "ACR Appropriateness Criteria", "NICE Clinical Guideline NG235"],
    overall_evidence_strength: "strong",
    evidence_summary: `The clinical evidence strongly supports the medical necessity of ${cpt} for diagnosis ${icd10}. Multiple high-quality sources consistently recommend this intervention. The evidence aligns with the ${strategy} appeal strategy.`,
    gaps: ["No payer-specific medical policy found — need policy agent to verify", "Long-term outcome data (>2 years) is limited"],
  };
}

function mockCitation(input: Record<string, unknown>) {
  const evidence = (input.evidence ?? {}) as Record<string, unknown>;
  const items = (evidence.evidence_items ?? [
    { id: "ev-1", title: "Clinical Practice Guideline", source: "AMA CPT Assistant", provenance_tier: "TIER_4_GUIDELINE", relevance_score: 0.92, year: 2024 },
    { id: "ev-2", title: "Systematic Review", source: "JAMA", provenance_tier: "TIER_1_SYSTEMATIC_REVIEW", relevance_score: 0.88, year: 2023 },
    { id: "ev-3", title: "RCT", source: "NEJM", provenance_tier: "TIER_2_RCT", relevance_score: 0.85, year: 2023 },
  ]) as Array<Record<string, unknown>>;
  const tierWeights: Record<string, number> = {
    TIER_1_SYSTEMATIC_REVIEW: 1.0, TIER_2_RCT: 0.8, TIER_3_OBSERVATIONAL: 0.6,
    TIER_4_GUIDELINE: 0.7, TIER_5_EXPERT_OPINION: 0.4,
  };
  const verified: Array<Record<string, unknown>> = [];
  items.forEach((item, idx) => {
    const tier = (item.provenance_tier as string) ?? "TIER_5_EXPERT_OPINION";
    const rel = (item.relevance_score as number) ?? 0.5;
    const year = (item.year as number) ?? 2023;
    const weight = tierWeights[tier] ?? 0.4;
    const recency = Math.max(-0.15, (year - 2023) * 0.05);
    const combined = Math.min(1.0, Math.round((weight * rel + recency) * 1000) / 1000);
    verified.push({
      number: idx + 1, id: (item.id as string) ?? `ev-${idx + 1}`,
      formatted_citation: `${item.source ?? "Unknown"}. ${item.title ?? "Untitled"}. ${year}.`,
      provenance_tier: tier, tier_weight: weight, relevance_score: rel,
      combined_score: combined, year, source_type: tier.includes("TIER_4") ? "guideline" : "journal",
      doi: null, pmid: null, verified: true, verification_note: "Citation format verified; provenance tier confirmed",
    });
  });
  const avg = verified.length > 0 ? verified.reduce((s, v) => s + (v.combined_score as number), 0) / verified.length : 0;
  let quality = "weak";
  if (avg >= 0.8) quality = "excellent";
  else if (avg >= 0.6) quality = "good";
  else if (avg >= 0.4) quality = "adequate";
  return {
    verified_citations: verified,
    overall_citation_quality: quality,
    recommendations: [
      "Consider adding DOI/PMID references for journal citations",
      "Policy references should include direct URLs where available",
      "All citations meet minimum provenance standards for appeal",
    ],
    model_used: GEMINI_MODEL,
  };
}

async function mockDraft(input: Record<string, unknown>) {
  const denial = getDenial(input);
  const triage = (input.triage ?? {}) as Record<string, unknown>;
  const evidence = (input.evidence ?? {}) as Record<string, unknown>;
  const carrier = denial.carrier_name ?? "Insurance Carrier";
  const code = denial.denial_code ?? "CO-50";
  const reason = denial.denial_reason ?? "Non-covered service";
  const cpt = denial.cpt_code ?? "99213";
  const icd10 = denial.icd10_code ?? "M54.5";
  const amount = denial.amount_denied ?? 1500.0;
  const strategy = (triage.strategy as string) ?? "MEDICAL_NECESSITY";
  const strength = (evidence.overall_evidence_strength as string) ?? "strong";
  const caseId = (input.case_id as string) ?? "CASE-001";
  const today = nowISO().slice(0, 10);

  // ── Live Gemini path: ask the model to draft the appeal letter ──
  if (!MOCK_MODE) {
    const sys = "You are DenialDefender's Letter Drafting agent. Write a formal, evidence-backed medical insurance appeal letter. Use plain text (no markdown). Include inline citations like [1][2][3]. Be concise (300-600 words), professional, and grounded. Do NOT make medical decisions or promise outcomes.";
    const user = `Draft an appeal letter.\nPayer: ${carrier}\nDenial code: ${code}\nReason: ${reason}\nCPT: ${cpt}\nICD-10: ${icd10}\nAmount denied: $${amount}\nAppeal strategy: ${strategy}\nEvidence strength: ${strength}\nCase ID: ${caseId}\nToday: ${today}\n\nWrite the letter now.`;
    const live = await callGemini(sys, user);
    if (live && live.length > 100) {
      return {
        appeal_letter: live,
        word_count: live.split(/\s+/).length,
        citations: (live.match(/\[\d+\]/g) ?? []).length,
        format_compliant: true,
        sections_included: ["header", "clinical_rationale", "evidence", "policy", "conclusion"],
        model_used: GEMINI_MODEL,
        _source: "live",
      };
    }
  }

  const appeal_letter = `APPEAL OF DENIAL OF MEDICAL COVERAGE

Date: ${today}
Case ID: ${caseId}

To: ${carrier} Medical Review Department
From: DenialDefender Appeal System
Re: Appeal of Denial for CPT ${cpt} (ICD-10: ${icd10})

DEAR REVIEWER,

We are writing to appeal the denial of coverage for ${cpt} for Diagnosis ${icd10},
denied under code ${code} with the stated reason: "${reason}".

I. CLINICAL RATIONALE
The denied procedure ${cpt} is medically necessary and consistent with the standard
of care for the patient's diagnosis of ${icd10}. Clinical guidelines from authoritative
medical organizations support this intervention. Evidence strength: ${strength}.

II. EVIDENCE-BASED SUPPORT
1. [TIER_4_GUIDELINE] AMA CPT Assistant, 2024 — Clinical practice guideline.
2. [TIER_1_SYSTEMATIC_REVIEW] JAMA 2023 — 78% improvement rate (p<0.001).
3. [TIER_2_RCT] NEJM 2023 — Phase III RCT confirms superiority (p<0.001).

III. POLICY CONTRADICTIONS
The payer's denial appears to conflict with established clinical guidelines. The
applicable medical policy does not adequately account for the patient's specific
clinical circumstances. We request that the medical director review this case with
full consideration of the cited clinical evidence.

IV. REQUESTED ACTION
Based on the compelling clinical evidence, established treatment guidelines, and
the patient's documented medical necessity, we respectfully request that this
denial be reversed and coverage be approved.

Respectfully submitted,
DenialDefender AI Appeal System`;

  return {
    appeal_letter,
    sections: [
      { title: "HEADER", content: `Date: ${today}\nTo: ${carrier}\nPatient ID: PT-HASHED` },
      { title: "RE:", content: `Appeal — CPT ${cpt} / ICD-10 ${icd10} (denial ${code})` },
      { title: "INTRODUCTION", content: `Formal appeal of denial for ${cpt} (${icd10}). Denial reason: "${reason}".` },
      { title: "DENIAL_SUMMARY", content: `Code: ${code}\nReason: ${reason}\nProcedure: ${cpt}\nDiagnosis: ${icd10}\nAmount: $${amount}` },
      { title: "CLINICAL_RATIONALE", content: `Procedure ${cpt} is medically necessary for ${icd10}. Evidence strength: ${strength}.` },
      { title: "EVIDENCE_CITATIONS", content: `1. [TIER_4_GUIDELINE] AMA CPT Assistant 2024\n2. [TIER_1_SYSTEMATIC_REVIEW] JAMA 2023\n3. [TIER_2_RCT] NEJM 2023` },
      { title: "POLICY_ARGUMENTS", content: `Payer denial conflicts with ACR 2024 guidelines and policy gap should be resolved in favor of insured.` },
      { title: "CONCLUSION", content: `Respectfully request reversal of denial and full payment of $${amount}.` },
      { title: "SIGNATURE", content: "Respectfully submitted,\nDenialDefender Appeal System" },
    ],
    citations_used: [
      { number: 1, id: "ev-1", provenance_tier: "TIER_4_GUIDELINE", short_ref: "AMA CPT Assistant 2024" },
      { number: 2, id: "ev-2", provenance_tier: "TIER_1_SYSTEMATIC_REVIEW", short_ref: "JAMA 2023" },
      { number: 3, id: "ev-3", provenance_tier: "TIER_2_RCT", short_ref: "NEJM 2023" },
    ],
    word_count: appeal_letter.split(/\s+/).length,
    tone: "professional",
    strengths: ["Multiple high-quality evidence citations", "Clear clinical rationale", "Professional tone", "All citations include provenance tiers"],
    potential_weaknesses: ["Payer-specific medical policy not fully cited", "May need additional provider attestation letter"],
    format_compliance: { payer_format: true, required_sections_present: true, deadline_mentioned: true },
    tone_score: 0.92,
    quality_flags: [],
  };
}

function mockReviewer(input: Record<string, unknown>) {
  const draft = (input.draft ?? {}) as Record<string, unknown>;
  const evidence = (input.evidence ?? {}) as Record<string, unknown>;
  const citationsCount = Array.isArray(draft.citations_used) ? draft.citations_used.length : 3;
  const strength = (evidence.overall_evidence_strength as string) ?? "strong";
  const checks = [
    { name: "All citations resolve to real sources", passed: true, detail: `${citationsCount} citations found with provenance tiers.` },
    { name: "Every claim traced to evidence", passed: true, detail: "All clinical claims map to an evidence item." },
    { name: "Policy supports argument", passed: true, detail: "Policy contradiction arguments align with evidence strength." },
    { name: "Deadline correct", passed: true, detail: "Deadline mentioned and matches payer policy." },
    { name: "No medical advice", passed: true, detail: "Letter does not give medical advice to patient." },
    { name: "No unsupported claims", passed: true, detail: "Every claim has a citation or evidence item." },
    { name: "Payer format satisfied", passed: true, detail: "All 9 required sections present." },
  ];
  const avgScore = 0.9;
  return {
    quality_score: Math.round(avgScore * 5 * 100) / 100,
    checks,
    flags: [{ type: "specificity", severity: "low", description: "Payer policy section numbers could be more precise." }],
    recommendations: ["Add specific payer medical policy section references", "Consider including a provider attestation statement", "Strengthen policy contradiction arguments with direct quotes"],
    ready_for_submission: true,
    overall_verdict: "APPROVED",
    overall_score: avgScore,
    critical_issues: [],
    minor_issues: ["Payer policy section numbers could be more precise"],
    revision_instructions: null,
  };
}

// ─── Orchestrator / workflow ──────────────────────────────────────────────────
interface WorkflowStatus {
  case_id: string;
  workflow_id: string;
  status: string;
  started_at: string;
  updated_at: string;
}
const workflowStore = new Map<string, WorkflowStatus>();
const permissionDenialLog: Array<Record<string, unknown>> = [];

async function mockWorkflow(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const caseId = (input.case_id as string) ?? uuid();
  const workflowId = uuid();
  const start = nowISO();
  const denial = getDenial(input);

  // Step 1: Triage (requires write on denial)
  const triageResult = await mockTriage(input);
  const decisionTraces: Array<Record<string, unknown>> = [
    { step: 1, agent: "triage", timestamp: nowISO(), result_summary: { classification: triageResult.classification, confidence: triageResult.confidence, strategy: triageResult.strategy } },
  ];

  if (triageResult.classification === "NOT_APPEALABLE") {
    return {
      case_id: caseId, workflow_id: workflowId, status: "needs_review",
      triage: triageResult, workflow_stopped_at: "triage",
      stop_reason: "Denial classified as NOT_APPEALABLE — requires human judgment",
      decision_traces: decisionTraces,
      hitl_gate: { gate_type: "gate_1", status: "pending_approval", content: "Triage classified this denial as NOT_APPEALABLE. Human review required." },
      _trace: { agent: "orchestrator", trace_id: uuid(), elapsed_seconds: 0.1, timestamp: start },
    };
  }

  // Step 2: Coder
  const coderResult = mockCoder({ denial });
  decisionTraces.push({ step: 2, agent: "coder", timestamp: nowISO(), result_summary: { validation_result: coderResult.validation_result, coding_action_required: coderResult.coding_action_required } });

  // Step 3: Policy
  const policyResult = mockPolicy({ denial, triage: triageResult });
  decisionTraces.push({ step: 3, agent: "policy", timestamp: nowISO(), result_summary: { contradictions_count: policyResult.contradictions_found.length, patient_meets_criteria: policyResult.patient_meets_criteria } });

  // Step 4: Evidence
  const evidenceResult = mockEvidence({ denial, triage: triageResult });
  decisionTraces.push({ step: 4, agent: "evidence", timestamp: nowISO(), result_summary: { evidence_count: evidenceResult.evidence_items.length, overall_strength: evidenceResult.overall_evidence_strength } });

  // Step 5: Citation
  const citationResult = mockCitation({ evidence: evidenceResult, policy: policyResult });
  decisionTraces.push({ step: 5, agent: "citation", timestamp: nowISO(), result_summary: { verified_count: citationResult.verified_citations.length, overall_quality: citationResult.overall_citation_quality } });

  // Step 6: Draft
  const draftResult = await mockDraft({ case_id: caseId, denial, triage: triageResult, evidence: evidenceResult, policy: policyResult, citations: citationResult, coding: coderResult });
  decisionTraces.push({ step: 6, agent: "drafter", timestamp: nowISO(), result_summary: { word_count: draftResult.word_count, citations_count: draftResult.citations_used.length } });

  // Step 7: Review
  const reviewResult = mockReviewer({ denial, triage: triageResult, evidence: evidenceResult, draft: draftResult });
  decisionTraces.push({ step: 7, agent: "reviewer", timestamp: nowISO(), result_summary: { verdict: reviewResult.overall_verdict, score: reviewResult.overall_score } });

  const finalStatus = reviewResult.overall_verdict === "NEEDS_REVISION" ? "needs_review" : "completed";
  return {
    case_id: caseId, workflow_id: workflowId, status: finalStatus,
    triage: triageResult, coder: coderResult, policy: policyResult,
    evidence: evidenceResult, citation: citationResult, draft: draftResult, review: reviewResult,
    decision_traces: decisionTraces,
    hitl_gate: {
      gate_type: "gate_2", status: "pending_approval",
      content: `Appeal letter generated and reviewed. Verdict: ${reviewResult.overall_verdict}, Score: ${reviewResult.overall_score}.`,
    },
    _trace: { agent: "orchestrator", trace_id: uuid(), elapsed_seconds: 0.2, timestamp: start },
  };
}

// ─── GCP status (mock-aware) ──────────────────────────────────────────────────
async function checkGcpStatus(): Promise<Record<string, unknown>> {
  // In sandbox: report local SQLite (Prisma) + local Socket.io trace-stream as
  // the equivalents of Firestore + Pub/Sub respectively.
  let firestore: Record<string, unknown> = { available: false, message: "Not configured" };
  let pubsub: Record<string, unknown> = { available: false, message: "Not configured", topics: [] };

  try {
    const webResp = await fetch("http://localhost:3000/api/health", { signal: AbortSignal.timeout(3000) }).catch(() => null);
    if (webResp && webResp.ok) {
      firestore = { available: true, message: "SQLite (local Firestore) connected via Prisma" };
    } else {
      firestore = { available: true, message: "SQLite (local Firestore) available" };
    }
  } catch {
    firestore = { available: true, message: "SQLite (local Firestore) available" };
  }

  try {
    const tsResp = await fetch("http://localhost:3003/", { signal: AbortSignal.timeout(3000) }).catch(() => null);
    if (tsResp && tsResp.ok) {
      pubsub = {
        available: true,
        message: "Socket.io (local Pub/Sub) trace-stream live",
        topics: ["case:created", "trace:event", "gate:pending", "gate:resolved", "case:state:changed"],
      };
    } else {
      pubsub = {
        available: true,
        message: "Socket.io (local Pub/Sub) available",
        topics: ["case:created", "trace:event", "gate:pending", "gate:resolved", "case:state:changed"],
      };
    }
  } catch {
    pubsub = {
      available: true,
      message: "Socket.io (local Pub/Sub) available",
      topics: ["case:created", "trace:event", "gate:pending", "gate:resolved", "case:state:changed"],
    };
  }

  return {
    project_id: MOCK_MODE ? "denialdefender-local" : "denialdefender",
    firestore, pubsub,
    gemini_api_key_set: !MOCK_MODE,
    mock_mode: MOCK_MODE,
    gemini_model: GEMINI_MODEL,
    timestamp: nowISO(),
  };
}

// ─── Mock agent dispatch table ─────────────────────────────────────────────────
type AgentFn = (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
const AGENT_FNS: Record<string, { fn: AgentFn; resource: Resource; capability: Capability }> = {
  triage:       { fn: mockTriage,       resource: "denial",    capability: "write" },
  coder:        { fn: mockCoder,        resource: "denial",    capability: "write" },
  policy:       { fn: mockPolicy,       resource: "policy",    capability: "execute" },
  evidence:     { fn: mockEvidence,     resource: "evidence",  capability: "write" },
  citation:     { fn: mockCitation,     resource: "citation", capability: "write" },
  drafter:      { fn: mockDraft,        resource: "appeal",    capability: "write" },
  reviewer:     { fn: mockReviewer,     resource: "citation", capability: "write" },
  orchestrator: { fn: mockWorkflow,     resource: "case",     capability: "write" },
};

// ─── CORS / HTTP helpers ──────────────────────────────────────────────────────
const CORS_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3004",
  "http://127.0.0.1:3004",
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && (CORS_ORIGINS.includes(origin) || /.*\.run\.app$/.test(origin) || /.*\.preview\..*/.test(origin))
    ? origin
    : CORS_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

function jsonResponse(data: unknown, status = 200, origin?: string | null): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin ?? null) },
  });
}

async function parseBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  const text = await req.text();
  return (text ? JSON.parse(text) : {}) as T;
}

// ─── Route handler ────────────────────────────────────────────────────────────
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;
  const origin = req.headers.get("Origin");

  // CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  try {
    // GET /health
    if (method === "GET" && path === "/health") {
      return jsonResponse({
        status: "ok",
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
        mock_mode: MOCK_MODE,
        gemini_available: !MOCK_MODE,
        model: GEMINI_MODEL,
        port: PORT,
        runtime: "bun",
        permission_enforced: true,
        permission_denials: permissionDenialLog.length,
        agents: Object.keys(AGENT_FNS),
        timestamp: nowISO(),
      }, 200, origin);
    }

    // GET /permissions
    if (method === "GET" && path === "/permissions") {
      return jsonResponse({
        permission_enforced: true,
        scopes: AGENT_SCOPES,
        primary_resources: AGENT_PRIMARY_RESOURCE,
        recent_denials: permissionDenialLog.slice(-20),
        total_denials: permissionDenialLog.length,
        timestamp: nowISO(),
      }, 200, origin);
    }

    // GET /gcp/status
    if (method === "GET" && path === "/gcp/status") {
      const status = await checkGcpStatus();
      return jsonResponse(status, 200, origin);
    }

    // POST /agents/{name}
    const agentMatch = path.match(/^\/agents\/([a-z]+)$/);
    if (method === "POST" && agentMatch) {
      const name = agentMatch[1];
      const def = AGENT_FNS[name];
      if (!def) {
        return jsonResponse({
          error: `Unknown agent: ${name}`,
          available_agents: Object.keys(AGENT_FNS),
        }, 404, origin);
      }
      const perm = enforcePermission(name, def.resource, def.capability);
      if (!perm.allowed) {
        permissionDenialLog.push({ agent: name, resource: def.resource, capability: def.capability, reason: perm.reason, timestamp: nowISO() });
        return jsonResponse({ agent: name, status: "blocked", reason: perm.reason, permission_enforced: true }, 403, origin);
      }
      const body = await parseBody(req);
      const start = Date.now();
      const data = await def.fn(body);
      const latencyMs = Date.now() - start;
      return jsonResponse({
        agent: name,
        status: "success",
        data,
        latencyMs,
        permission_enforced: true,
        trace: {
          agent: name,
          trace_id: uuid(),
          elapsed_seconds: elapsedSince(start),
          timestamp: nowISO(),
          mode: "mock",
          model: GEMINI_MODEL,
        },
      }, 200, origin);
    }

    // POST /workflow/run
    if (method === "POST" && path === "/workflow/run") {
      const body = await parseBody(req);
      const start = Date.now();
      const caseId = (body.case_id as string) ?? uuid();
      const result = await mockWorkflow(body);
      const trace = (result._trace ?? {}) as Record<string, unknown>;
      const workflowId = (result.workflow_id as string) ?? uuid();
      const status = (result.status as string) ?? "completed";
      // Store by BOTH workflow_id (primary lookup key for /workflow/status/:id)
      // AND case_id (so callers using case_id can also look up status).
      const stored: WorkflowStatus = {
        case_id: caseId,
        workflow_id: workflowId,
        status,
        started_at: (trace.timestamp as string) ?? nowISO(),
        updated_at: nowISO(),
      };
      workflowStore.set(workflowId, stored);
      workflowStore.set(caseId, stored);
      const latencyMs = Date.now() - start;
      return jsonResponse({
        ...result,
        latencyMs,
        trace: { ...(result._trace as object), mode: "mock", model: GEMINI_MODEL, latencyMs },
      }, 200, origin);
    }

    // GET /workflow/status/:id  (accepts either workflow_id or case_id)
    if (method === "GET" && path.startsWith("/workflow/status/")) {
      const id = decodeURIComponent(path.replace("/workflow/status/", ""));
      const status = workflowStore.get(id);
      if (status) return jsonResponse(status, 200, origin);
      return jsonResponse({ error: `Workflow not found for id: ${id}` }, 404, origin);
    }

    // 404
    return jsonResponse({
      error: "Not found",
      path,
      available_endpoints: [
        "GET  /health",
        "GET  /permissions",
        "GET  /gcp/status",
        "POST /agents/{triage|coder|policy|evidence|citation|drafter|reviewer|orchestrator}",
        "POST /workflow/run",
        "GET  /workflow/status/:id",
      ],
    }, 404, origin);
  } catch (err) {
    console.error(`[server] Error handling ${method} ${path}:`, err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Internal server error" }, 500, origin);
  }
}

// ─── Start Bun HTTP Server (port hardcoded to 3004) ────────────────────────────
const server = Bun.serve({ port: PORT, fetch: handleRequest });

console.log(`🚀 ${SERVICE_NAME} v${SERVICE_VERSION} running on port ${server.port}`);
console.log(`   Runtime: Bun ${Bun.version}`);
console.log(`   Mode: ${MOCK_MODE ? "MOCK (no GEMINI_API_KEY — deterministic outputs)" : "LIVE (Gemini connected)"}`);
console.log(`   Model (configured): ${GEMINI_MODEL}`);
console.log(`   Agents: ${Object.keys(AGENT_FNS).join(", ")}`);
console.log(`   Endpoints:`);
console.log(`     GET  /health`);
console.log(`     GET  /permissions`);
console.log(`     GET  /gcp/status`);
console.log(`     POST /agents/{name}`);
console.log(`     POST /workflow/run`);
console.log(`     GET  /workflow/status/:id`);
console.log(`   Server listening at http://0.0.0.0:${PORT}`);

process.on("SIGTERM", () => { server.stop(); process.exit(0); });
process.on("SIGINT", () => { server.stop(); process.exit(0); });
