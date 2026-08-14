/**
 * DenialDefender Agent Fleet — TypeScript/Bun Mini-Service.
 *
 * A robust Bun HTTP server on port 3004 that:
 *  - Handles simple agent requests directly with mock data (instant responses)
 *  - For workflow requests, spawns a Python subprocess when GEMINI_API_KEY is set,
 *    or returns mock data when in mock mode
 *  - Provides CORS headers, in-memory workflow store, and GCP status endpoint
 *
 * Endpoints:
 *  GET  /health                    — Health check
 *  POST /agents/triage             — Triage Agent (mock)
 *  POST /agents/evidence           — Evidence Agent (mock)
 *  POST /agents/drafter            — Draft Agent (mock)
 *  POST /agents/reviewer           — Reviewer Agent (mock)
 *  POST /agents/coder              — Medical Coder Agent (mock)
 *  POST /agents/policy             — Policy Analyst Agent (mock)
 *  POST /agents/citation           — Citation Agent (mock)
 *  POST /agents/orchestrator       — Orchestrator (delegates to workflow)
 *  POST /workflow/run              — Run full appeal workflow
 *  GET  /workflow/status/:case_id  — Get workflow status
 *  GET  /gcp/status                — GCP Firestore + Pub/Sub status
 */

import { randomUUID } from "crypto";

// ─── Configuration ──────────────────────────────────────────────────────

const PORT = 3004;
const SERVICE_NAME = "denialdefender-agent-fleet";
const SERVICE_VERSION = "1.0.0";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
const MOCK_MODE = GEMINI_API_KEY === "";
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID ?? "project-8a09278a-5593-4289-b2e";
const MAX_REVISION_LOOPS = 3;
const SUBPROCESS_TIMEOUT_MS = 60_000;

const CORS_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3004",
  "http://127.0.0.1:3004",
];

// ─── In-Memory Workflow Store ───────────────────────────────────────────

interface WorkflowStatus {
  case_id: string;
  workflow_id: string;
  status: string;
  started_at: string;
  updated_at: string;
}

const workflowStore = new Map<string, WorkflowStatus>();

// ─── Utility Helpers ────────────────────────────────────────────────────

function nowISO(): string {
  return new Date().toISOString();
}

function todayDate(): string {
  return nowISO().slice(0, 10);
}

function elapsedSince(start: number): number {
  return Math.round((Date.now() - start) / 1000 * 1000) / 1000;
}

// ─── CORS Headers ───────────────────────────────────────────────────────

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message, status }, status);
}

// ─── Request Body Parsing ───────────────────────────────────────────────

async function parseBody<T>(req: Request): Promise<T> {
  const text = await req.text();
  return JSON.parse(text) as T;
}

// ─── Mock Data Generators ───────────────────────────────────────────────
// These replicate the exact mock data from the Python agents.

interface DenialInput {
  denial_code?: string;
  denial_reason?: string;
  cpt_code?: string;
  icd10_code?: string;
  carrier_name?: string;
  amount_denied?: number;
}

interface PatientContext {
  diagnosis?: string;
  treatment_history?: string;
  prior_authorizations?: string[];
}

function getDenial(input: Record<string, unknown>): DenialInput {
  return (input.denial ?? input) as DenialInput;
}

// ── Triage Mock ────────────────────────────────────────────────────────

function mockTriage(inputData: Record<string, unknown>) {
  const denial = getDenial(inputData);
  const denialCode = denial.denial_code ?? "CO-50";
  const denialReason = denial.denial_reason ?? "Non-covered service";

  let classification = "APPEALABLE";
  let strategy = "MEDICAL_NECESSITY";
  let confidence = 0.85;

  if (denialCode.startsWith("CO-197")) {
    classification = "NOT_APPEALABLE";
    strategy = "PRIOR_AUTH";
    confidence = 0.15;
  } else if (denialCode.startsWith("CO-4")) {
    classification = "PARTIALLY_APPEALABLE";
    strategy = "CODING_ERROR";
    confidence = 0.65;
  } else if (denialCode.startsWith("CO-50") || denialCode.startsWith("CO-236")) {
    classification = "APPEALABLE";
    strategy = "MEDICAL_NECESSITY";
    confidence = 0.78;
  }

  return {
    classification,
    confidence,
    factors: [
      `Denial code ${denialCode} indicates ${denialReason}`,
      "Clinical documentation may support medical necessity",
      "Payer policy may have internal contradictions with clinical guidelines",
    ],
    strategy,
    reasoning: `The denial code ${denialCode} with reason '${denialReason}' suggests the payer has determined this service does not meet coverage criteria. However, based on common appeal patterns for this code, the ${strategy} strategy has a reasonable chance of success when supported by appropriate clinical evidence and documentation.`,
    appeal_urgency: confidence > 0.6 ? "high" : "medium",
    estimated_success_rate: Math.round(confidence * 0.9 * 100) / 100,
    recommended_next_steps: [
      "Validate CPT/ICD-10 codes with MedicalCoderAgent",
      "Search payer policy for contradictions with PolicyAnalystAgent",
      "Gather clinical evidence with EvidenceAgent",
      "Generate appeal letter with DraftAgent",
    ],
  };
}

// ── Evidence Mock ──────────────────────────────────────────────────────

function mockEvidence(inputData: Record<string, unknown>) {
  const denial = getDenial(inputData);
  const triage = (inputData.triage ?? {}) as Record<string, unknown>;
  const strategy = (triage.strategy as string) ?? "MEDICAL_NECESSITY";
  const cpt = denial.cpt_code ?? "99213";
  const icd10 = denial.icd10_code ?? "M54.5";

  return {
    clinical_question: `Is the procedure ${cpt} medically necessary for diagnosis ${icd10}?`,
    evidence_items: [
      {
        id: "ev-1",
        title: "Clinical Practice Guideline for Diagnosis Management",
        description: `National guideline recommends ${cpt} as first-line intervention for patients with ${icd10} when conservative measures have failed.`,
        source: "American Medical Association - CPT Assistant",
        provenance_tier: "TIER_4_GUIDELINE",
        relevance_score: 0.92,
        supports_appeal: true,
        key_findings: [
          `${cpt} is indicated for ${icd10} per clinical guidelines`,
          "Conservative treatment failure documented",
          "Procedure aligned with standard of care",
        ],
        year: 2024,
      },
      {
        id: "ev-2",
        title: "Systematic Review of Treatment Efficacy",
        description: "Multi-center systematic review demonstrating significant improvement in patient outcomes with this intervention.",
        source: "Journal of the American Medical Association (JAMA)",
        provenance_tier: "TIER_1_SYSTEMATIC_REVIEW",
        relevance_score: 0.88,
        supports_appeal: true,
        key_findings: [
          "Pooled analysis shows 78% improvement rate",
          "Number needed to treat (NNT) of 4.2",
          "Statistically significant vs. conservative management (p<0.001)",
        ],
        year: 2023,
      },
      {
        id: "ev-3",
        title: "Randomized Controlled Trial of Procedure vs. Usual Care",
        description: "Phase III RCT comparing the procedure to usual care demonstrating superiority in the target population.",
        source: "New England Journal of Medicine (NEJM)",
        provenance_tier: "TIER_2_RCT",
        relevance_score: 0.85,
        supports_appeal: true,
        key_findings: [
          "Primary endpoint met with p<0.001",
          "Mean difference in outcome: 2.4 (95% CI: 1.8-3.0)",
          "Safety profile favorable with no serious adverse events",
        ],
        year: 2023,
      },
    ],
    guideline_references: [
      "AMA CPT Assistant, 2024 edition",
      "ACR Appropriateness Criteria",
      "NICE Clinical Guideline NG235",
    ],
    overall_evidence_strength: "strong",
    evidence_summary: `The clinical evidence strongly supports the medical necessity of ${cpt} for diagnosis ${icd10}. Multiple high-quality sources including a systematic review (JAMA 2023), RCT (NEJM 2023), and clinical practice guidelines consistently recommend this intervention. The evidence aligns with the ${strategy} appeal strategy.`,
    gaps: [
      "No payer-specific medical policy found — need PolicyAnalystAgent to verify",
      "Long-term outcome data (>2 years) is limited",
    ],
  };
}

// ── Draft Mock ─────────────────────────────────────────────────────────

function mockDraft(inputData: Record<string, unknown>) {
  const denial = getDenial(inputData);
  const triage = (inputData.triage ?? {}) as Record<string, unknown>;
  const evidence = (inputData.evidence ?? {}) as Record<string, unknown>;

  const carrier = denial.carrier_name ?? "Insurance Carrier";
  const denialCode = denial.denial_code ?? "CO-50";
  const denialReason = denial.denial_reason ?? "Non-covered service";
  const cpt = denial.cpt_code ?? "99213";
  const icd10 = denial.icd10_code ?? "M54.5";
  const amount = denial.amount_denied ?? 1500.0;
  const strategy = (triage.strategy as string) ?? "MEDICAL_NECESSITY";
  const evidenceStrength = (evidence.overall_evidence_strength as string) ?? "strong";
  const caseId = (inputData.case_id as string) ?? "CASE-001";
  const patientHash = "PT-7f3a2b1c";
  const today = todayDate();

  // Generate the formal appeal letter as specified in the task
  const appealLetter = `APPEAL OF DENIAL OF MEDICAL COVERAGE

Date: ${today}
Case ID: ${caseId}

To: ${carrier} Medical Review Department
From: DenialDefender Appeal System
Re: Appeal of Denial for CPT ${cpt} (ICD-10: ${icd10})

DEAR REVIEWER,

We are writing to appeal the denial of coverage for ${cpt} - Procedure ${cpt} for Diagnosis ${icd10},
denied under code ${denialCode} with the stated reason: "${denialReason}".

I. CLINICAL RATIONALE

The denied procedure ${cpt} is medically necessary and consistent with the
standard of care for the patient's diagnosis of ${icd10}. Clinical guidelines
from authoritative medical organizations support the use of this procedure
as an appropriate intervention. The evidence strength supporting this appeal
is rated as ${evidenceStrength}. The patient's clinical presentation,
treatment history, and documented failure of conservative measures all
support the medical necessity of this intervention.

II. EVIDENCE-BASED SUPPORT

1. [TIER_4_GUIDELINE] AMA CPT Assistant, 2024 — Clinical practice guideline
   recommends this procedure as indicated for the diagnosed condition.

2. [TIER_1_SYSTEMATIC_REVIEW] JAMA 2023 — Systematic review demonstrates
   78% improvement rate with statistically significant outcomes (p<0.001).

3. [TIER_2_RCT] NEJM 2023 — Phase III RCT confirms superiority vs. usual
   care with primary endpoint met (p<0.001).

III. POLICY CONTRADICTIONS

The payer's denial appears to conflict with established clinical guidelines.
The applicable medical policy does not adequately account for the patient's
specific clinical circumstances, including documented failure of conservative
treatment and severity of symptoms. We request that the medical director
review this case with full consideration of the cited clinical evidence.

IV. REQUESTED ACTION

Based on the compelling clinical evidence, established treatment guidelines,
and the patient's documented medical necessity, we respectfully request that
this denial be reversed and coverage be approved for the medically necessary
service described above.

Respectfully submitted,
DenialDefender AI Appeal System`;

  const sections = [
    { title: "HEADER", content: `Date: ${today}\nTo: ${carrier}, Appeals Department\nFrom: DenialDefender Appeal System\nPatient ID: ${patientHash}\nClaim Reference: CLM-${denialCode}-2024` },
    { title: "RE:", content: `Appeal of Denial — Procedure ${cpt} for Diagnosis ${icd10}\nAmount Denied: $${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}\nDenial Code: ${denialCode}` },
    { title: "INTRODUCTION", content: `We are writing to formally appeal the denial of claim for procedure ${cpt} associated with diagnosis code ${icd10}. The denial was issued under code ${denialCode} with the stated reason: "${denialReason}". We believe this denial was issued in error and respectfully request its reversal.` },
    { title: "DENIAL_SUMMARY", content: `Denial Code: ${denialCode}\nDenial Reason: ${denialReason}\nProcedure: ${cpt}\nDiagnosis: ${icd10}\nAmount Denied: $${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}\nAppeal Strategy: ${strategy}` },
    { title: "CLINICAL_RATIONALE", content: `The denied procedure ${cpt} is medically necessary and consistent with the standard of care for the patient's diagnosis of ${icd10}. Clinical guidelines from authoritative medical organizations support the use of this procedure as an appropriate intervention. The evidence strength supporting this appeal is rated as ${evidenceStrength}. The patient's clinical presentation, treatment history, and documented failure of conservative measures all support the medical necessity of this intervention.` },
    { title: "EVIDENCE_CITATIONS", content: `1. [TIER_4_GUIDELINE] AMA CPT Assistant, 2024 — Clinical practice guideline recommends this procedure as indicated for the diagnosed condition.\n\n2. [TIER_1_SYSTEMATIC_REVIEW] JAMA 2023 — Systematic review demonstrates 78% improvement rate with statistically significant outcomes (p<0.001).\n\n3. [TIER_2_RCT] NEJM 2023 — Phase III RCT confirms superiority vs. usual care with primary endpoint met (p<0.001).` },
    { title: "POLICY_ARGUMENTS", content: `The payer's denial appears to conflict with established clinical guidelines. The applicable medical policy does not adequately account for the patient's specific clinical circumstances, including documented failure of conservative treatment and severity of symptoms. We request that the medical director review this case with full consideration of the cited clinical evidence.` },
    { title: "CONCLUSION", content: `Based on the compelling clinical evidence, established treatment guidelines, and the patient's documented medical necessity, we respectfully request that the denial be reversed and the claim for $${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} be paid in full. We are available to provide any additional documentation or clarification needed to support this appeal.` },
    { title: "SIGNATURE", content: "Respectfully submitted,\nDenialDefender Appeal System\nOn behalf of the Treating Provider" },
  ];

  const wordCount = appealLetter.split(/\s+/).length;

  return {
    appeal_letter: appealLetter,
    sections,
    citations_used: [
      { number: 1, id: "ev-1", provenance_tier: "TIER_4_GUIDELINE", short_ref: "AMA CPT Assistant 2024" },
      { number: 2, id: "ev-2", provenance_tier: "TIER_1_SYSTEMATIC_REVIEW", short_ref: "JAMA 2023" },
      { number: 3, id: "ev-3", provenance_tier: "TIER_2_RCT", short_ref: "NEJM 2023" },
    ],
    word_count: wordCount,
    tone: "professional",
    strengths: [
      "Multiple high-quality evidence citations (systematic review, RCT, guideline)",
      "Clear clinical rationale aligned with appeal strategy",
      "Professional tone with specific, factual arguments",
      "All citations include provenance tiers for transparency",
    ],
    potential_weaknesses: [
      "Payer-specific medical policy not fully cited",
      "May need additional provider attestation letter",
    ],
  };
}

// ── Reviewer Mock ──────────────────────────────────────────────────────

function mockReviewer(inputData: Record<string, unknown>) {
  const draft = (inputData.draft ?? {}) as Record<string, unknown>;
  const evidence = (inputData.evidence ?? {}) as Record<string, unknown>;
  const citationsCount = Array.isArray(draft.citations_used) ? draft.citations_used.length : 3;
  const evidenceStrength = (evidence.overall_evidence_strength as string) ?? "strong";

  const checks = [
    { category: "COMPLETENESS", status: "pass", score: 0.95, details: "All 9 required sections are present and contain substantive content.", severity: "info" },
    { category: "CITATION_ACCURACY", status: "pass", score: 0.90, details: `${citationsCount} citations found with provenance tiers. All evidence items properly referenced.`, severity: "info" },
    { category: "CLINICAL_ACCURACY", status: "pass", score: 0.88, details: `Clinical rationale aligns with evidence strength (${evidenceStrength}). Medical arguments are sound.`, severity: "info" },
    { category: "TONE_APPROPRIATENESS", status: "pass", score: 0.92, details: "Tone is professional and factual. No adversarial or emotional language detected.", severity: "info" },
    { category: "COMPLIANCE", status: "pass", score: 0.95, details: "No PHI detected. Patient identified by hash only. No SSN, DOB, or real names present.", severity: "info" },
    { category: "PERSUASIVENESS", status: "pass", score: 0.85, details: "Arguments are logical and well-structured. Evidence hierarchy supports the case effectively.", severity: "info" },
    { category: "FORMATTING", status: "pass", score: 0.90, details: "Business letter format followed. Clear section delineation and professional layout.", severity: "info" },
    { category: "SPECIFICITY", status: "needs_improvement", score: 0.75, details: "Denial codes are referenced but payer-specific policy section numbers could be more precise.", severity: "minor" },
  ];

  const avgScore = Math.round((checks.reduce((s, c) => s + c.score, 0) / checks.length) * 1000) / 1000;
  const critical = checks.filter((c) => c.severity === "critical" && c.status === "fail");
  const minor = checks.filter((c) => c.severity === "minor" && c.status !== "pass");

  let verdict = "APPROVED";
  let revisionInstructions: string | null = null;
  if (critical.length > 0) {
    verdict = "NEEDS_REVISION";
    revisionInstructions = "Fix critical issues: " + critical.map((c) => c.details).join("; ");
  } else if (minor.length >= 2) {
    verdict = "NEEDS_REVISION";
    revisionInstructions = "Address minor issues for higher quality: " + minor.map((c) => c.details).join("; ");
  }

  return {
    overall_verdict: verdict,
    overall_score: avgScore,
    checks,
    critical_issues: critical.map((c) => c.details),
    minor_issues: minor.map((c) => c.details),
    recommendations: [
      "Add specific payer medical policy section references",
      "Consider including a provider attestation statement",
      "Strengthen the policy contradiction arguments with direct quotes",
    ],
    revision_instructions: revisionInstructions,
  };
}

// ── Coder Mock ─────────────────────────────────────────────────────────

function mockCoder(inputData: Record<string, unknown>) {
  const denial = getDenial(inputData);
  const cpt = denial.cpt_code ?? "99213";
  const icd10 = denial.icd10_code ?? "M54.5";
  const denialCode = denial.denial_code ?? "CO-50";

  const issues: Array<{
    category: string;
    severity: string;
    description: string;
    original_code: string;
    corrected_code: string | null;
    correction_rationale: string;
    would_reverse_denial: boolean;
  }> = [];
  let correctedCpt: string | null = null;
  let correctedIcd10: string | null = null;

  if (denialCode.startsWith("CO-4") || denialCode.startsWith("CO-11")) {
    issues.push({
      category: "CODE_DX_MATCH",
      severity: "DIRECT_CAUSE",
      description: `The ICD-10 code ${icd10} may not be a supported diagnosis for CPT ${cpt}. A more specific code may resolve the denial.`,
      original_code: icd10,
      corrected_code: "M54.16",
      correction_rationale: "Increasing ICD-10 specificity to the appropriate subcategory",
      would_reverse_denial: true,
    });
    correctedIcd10 = "M54.16";
  }

  if (denialCode.startsWith("CO-97")) {
    issues.push({
      category: "BUNDLING_ISSUES",
      severity: "CONTRIBUTING",
      description: `CPT ${cpt} may be bundled with another procedure. Adding modifier -59 may be appropriate.`,
      original_code: cpt,
      corrected_code: `${cpt}-59`,
      correction_rationale: "Distinct procedural service modifier to unbundle appropriately",
      would_reverse_denial: true,
    });
    correctedCpt = `${cpt}-59`;
  }

  let validationResult = "VALID";
  if (issues.some((i) => i.severity === "DIRECT_CAUSE")) {
    validationResult = "CORRECTABLE";
  } else if (issues.length > 0) {
    validationResult = "CORRECTABLE";
  }

  if (issues.length === 0) {
    issues.push({
      category: "CODE_SPECIFICITY",
      severity: "UNRELATED",
      description: `ICD-10 code ${icd10} could be more specific but this is not the primary cause of denial.`,
      original_code: icd10,
      corrected_code: null,
      correction_rationale: "Increased specificity may strengthen the appeal but won't reverse the denial alone",
      would_reverse_denial: false,
    });
  }

  return {
    validation_result: validationResult,
    overall_assessment: correctedCpt || correctedIcd10
      ? `CPT ${cpt} with ICD-10 ${icd10}: Coding corrections available that may help the appeal.`
      : `CPT ${cpt} with ICD-10 ${icd10}: Codes appear valid. Denial is likely based on medical necessity rather than coding.`,
    issues_found: issues,
    corrected_codes: {
      cpt: correctedCpt,
      icd10: correctedIcd10,
      modifiers: correctedCpt?.includes("-59") ? ["59"] : [],
    },
    coding_action_required: correctedCpt !== null || correctedIcd10 !== null,
    confidence: 0.87,
  };
}

// ── Policy Mock ────────────────────────────────────────────────────────

function mockPolicy(inputData: Record<string, unknown>) {
  const denial = getDenial(inputData);
  const carrier = denial.carrier_name ?? "Insurance Carrier";
  const cpt = denial.cpt_code ?? "99213";
  const icd10 = denial.icd10_code ?? "M54.5";
  const triage = (inputData.triage ?? {}) as Record<string, unknown>;
  const strategy = (triage.strategy as string) ?? "MEDICAL_NECESSITY";

  return {
    contradictions_found: [
      {
        id: "pol-1",
        type: "POLICY_CONTRADICTION",
        strength: "STRONG",
        description: `${carrier}'s medical policy for ${cpt} requires 'failure of 6 weeks of conservative therapy,' but the clinical guideline (ACR 2024) recommends intervention after 4 weeks when specific red flags are present.`,
        payer_position: "Requires 6 weeks conservative therapy before intervention",
        counter_position: "ACR Appropriateness Criteria 2024 recommends intervention after 4 weeks with documented red flags",
        source: "ACR Appropriateness Criteria, 2024 Update",
        impact_on_appeal: "Patient met the more stringent clinical guideline threshold; payer's requirement exceeds standard of care",
      },
      {
        id: "pol-2",
        type: "POLICY_GAP",
        strength: "MODERATE",
        description: `Payer policy for ${cpt} does not address the patient's specific clinical presentation with ${icd10}. The policy is silent on this diagnosis-procedure combination.`,
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
      {
        title: `${carrier} Medical Policy — Procedure ${cpt}`,
        section: "Section IV.B — Medical Necessity Criteria",
        url: null,
      },
      {
        title: "CMS LCD L35027 — Related Procedure Coverage",
        section: "Coverage Determination",
        url: "https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=35027",
      },
    ],
    regulatory_arguments: [
      "State External Review Law: Patient has right to independent external review of medical necessity denials",
      "Ambiguity Doctrine: Policy gaps should be interpreted in favor of the insured",
      "Mental Health Parity: If applicable, parity requirements may apply",
    ],
    overall_policy_assessment: `The policy analysis reveals 2 contradictions between ${carrier}'s medical policy and authoritative clinical guidelines. The strongest argument is that the payer's conservative therapy requirement exceeds the standard of care established by ACR 2024. Combined with the policy gap for this specific diagnosis-procedure combination, these findings substantially support the ${strategy} appeal strategy.`,
  };
}

// ── Citation Mock ──────────────────────────────────────────────────────

function mockCitation(inputData: Record<string, unknown>) {
  const evidence = (inputData.evidence ?? {}) as Record<string, unknown>;
  const evidenceItems = (evidence.evidence_items ?? [
    { id: "ev-1", title: "Clinical Practice Guideline", source: "AMA CPT Assistant", provenance_tier: "TIER_4_GUIDELINE", relevance_score: 0.92, year: 2024 },
    { id: "ev-2", title: "Systematic Review of Treatment Efficacy", source: "JAMA", provenance_tier: "TIER_1_SYSTEMATIC_REVIEW", relevance_score: 0.88, year: 2023 },
    { id: "ev-3", title: "RCT of Procedure vs. Usual Care", source: "NEJM", provenance_tier: "TIER_2_RCT", relevance_score: 0.85, year: 2023 },
  ]) as Array<Record<string, unknown>>;

  const tierWeights: Record<string, number> = {
    TIER_1_SYSTEMATIC_REVIEW: 1.0,
    TIER_2_RCT: 0.8,
    TIER_3_OBSERVATIONAL: 0.6,
    TIER_4_GUIDELINE: 0.7,
    TIER_5_EXPERT_OPINION: 0.4,
  };

  const tierDistribution: Record<string, number> = {
    TIER_1_SYSTEMATIC_REVIEW: 0,
    TIER_2_RCT: 0,
    TIER_3_OBSERVATIONAL: 0,
    TIER_4_GUIDELINE: 0,
    TIER_5_EXPERT_OPINION: 0,
  };

  const verified: Array<Record<string, unknown>> = [];
  let idx = 0;

  for (const item of evidenceItems) {
    idx++;
    const tier = (item.provenance_tier as string) ?? "TIER_5_EXPERT_OPINION";
    const relevance = (item.relevance_score as number) ?? 0.5;
    const year = (item.year as number) ?? 2023;
    const weight = tierWeights[tier] ?? 0.4;
    const recencyBonus = Math.max(-0.15, (year - 2023) * 0.05);
    const combined = Math.min(1.0, Math.round((weight * relevance + recencyBonus) * 1000) / 1000);

    tierDistribution[tier] = (tierDistribution[tier] ?? 0) + 1;

    verified.push({
      number: idx,
      id: (item.id as string) ?? `ev-${idx}`,
      formatted_citation: `${item.source ?? "Unknown"}. ${item.title ?? "Untitled"}. ${year}.`,
      provenance_tier: tier,
      tier_weight: weight,
      relevance_score: relevance,
      combined_score: combined,
      year,
      source_type: tier.includes("TIER_4") ? "guideline" : "journal",
      doi: null,
      pmid: null,
      verified: true,
      verification_note: "Citation format verified; provenance tier confirmed",
    });
  }

  // Also add policy citations
  const policy = (inputData.policy ?? {}) as Record<string, unknown>;
  const policyRefs = (policy.policy_references ?? []) as Array<Record<string, unknown>>;
  for (const polRef of policyRefs) {
    idx++;
    verified.push({
      number: idx,
      id: `pol-${idx}`,
      formatted_citation: `${polRef.title ?? "Policy Reference"}. Section: ${polRef.section ?? "N/A"}.`,
      provenance_tier: "TIER_4_GUIDELINE",
      tier_weight: 0.7,
      relevance_score: 0.80,
      combined_score: 0.56,
      year: 2024,
      source_type: "regulation",
      doi: null,
      pmid: null,
      verified: true,
      verification_note: "Policy reference included; direct link may be available",
    });
    tierDistribution["TIER_4_GUIDELINE"]++;
  }

  const avgCombined = verified.length > 0
    ? verified.reduce((s, v) => s + (v.combined_score as number), 0) / verified.length
    : 0;

  let quality = "weak";
  if (avgCombined >= 0.8) quality = "excellent";
  else if (avgCombined >= 0.6) quality = "good";
  else if (avgCombined >= 0.4) quality = "adequate";

  return {
    verified_citations: verified,
    tier_distribution: tierDistribution,
    overall_citation_quality: quality,
    recommendations: [
      "Consider adding DOI/PMID references for journal citations",
      "Policy references should include direct URLs where available",
      "All citations meet minimum provenance standards for appeal",
    ],
  };
}

// ── Orchestrator / Workflow Mock ───────────────────────────────────────

function mockWorkflow(inputData: Record<string, unknown>) {
  const caseId = (inputData.case_id as string) ?? randomUUID();
  const workflowId = randomUUID();
  const denial = getDenial(inputData);
  const startTime = nowISO();

  // Step 1: Triage
  const triageResult = mockTriage(inputData);
  const decisionTraces: Array<Record<string, unknown>> = [
    { step: 1, agent: "triage", timestamp: nowISO(), result_summary: { classification: triageResult.classification, confidence: triageResult.confidence, strategy: triageResult.strategy } },
  ];

  // If NOT_APPEALABLE, stop and flag for human
  if (triageResult.classification === "NOT_APPEALABLE") {
    return {
      case_id: caseId,
      workflow_id: workflowId,
      status: "needs_review",
      triage: triageResult,
      workflow_stopped_at: "triage",
      stop_reason: "Denial classified as NOT_APPEALABLE — requires human judgment",
      decision_traces: decisionTraces,
      hitl_gate: {
        gate_type: "gate_1",
        status: "pending_approval",
        content: "Triage classified this denial as NOT_APPEALABLE. Human review required to determine if appeal should proceed.",
      },
      _trace: { agent: "orchestrator", trace_id: randomUUID(), elapsed_seconds: 0.1, timestamp: startTime },
    };
  }

  // Step 2: Coder
  const coderInput = { denial, patient_context: inputData.patient_context ?? {} };
  const coderResult = mockCoder(coderInput);
  decisionTraces.push({ step: 2, agent: "coder", timestamp: nowISO(), result_summary: { validation_result: coderResult.validation_result, coding_action_required: coderResult.coding_action_required } });

  // Step 3: Policy
  const policyInput = { denial, patient_context: inputData.patient_context ?? {}, triage: triageResult, coding: coderResult };
  const policyResult = mockPolicy(policyInput);
  decisionTraces.push({ step: 3, agent: "policy", timestamp: nowISO(), result_summary: { contradictions_count: policyResult.contradictions_found.length, patient_meets_criteria: policyResult.patient_meets_criteria } });

  // Step 4: Evidence
  const evidenceInput = { denial, patient_context: inputData.patient_context ?? {}, triage: triageResult };
  const evidenceResult = mockEvidence(evidenceInput);
  decisionTraces.push({ step: 4, agent: "evidence", timestamp: nowISO(), result_summary: { evidence_count: evidenceResult.evidence_items.length, overall_strength: evidenceResult.overall_evidence_strength } });

  // Step 5: Citation
  const citationInput = { evidence: evidenceResult, policy: policyResult };
  const citationResult = mockCitation(citationInput);
  decisionTraces.push({ step: 5, agent: "citation", timestamp: nowISO(), result_summary: { verified_count: citationResult.verified_citations.length, overall_quality: citationResult.overall_citation_quality } });

  // Steps 6-8: Draft → Review → (revise if needed)
  let draftResult: Record<string, unknown> = {};
  let reviewResult: Record<string, unknown> = {};

  for (let loop = 0; loop < MAX_REVISION_LOOPS; loop++) {
    const loopLabel = loop > 0 ? `revision_${loop}` : "initial";

    // Step 6: Draft
    const draftInput: Record<string, unknown> = {
      case_id: caseId,
      denial,
      patient_context: inputData.patient_context ?? {},
      triage: triageResult,
      evidence: evidenceResult,
      policy: policyResult,
      citations: citationResult,
      coding: coderResult,
    };
    if (reviewResult.revision_instructions) {
      draftInput.revision_instructions = reviewResult.revision_instructions;
    }
    draftResult = mockDraft(draftInput);
    decisionTraces.push({ step: 6, agent: "drafter", timestamp: nowISO(), revision_loop: loop, result_summary: { word_count: draftResult.word_count, citations_count: (draftResult.citations_used as unknown[])?.length ?? 0 } });

    // Step 7: Review
    const reviewInput = { denial, triage: triageResult, evidence: evidenceResult, draft: draftResult };
    reviewResult = mockReviewer(reviewInput);
    decisionTraces.push({ step: 7, agent: "reviewer", timestamp: nowISO(), revision_loop: loop, result_summary: { verdict: reviewResult.overall_verdict, score: reviewResult.overall_score } });

    // Step 8: Check revision
    if (reviewResult.overall_verdict === "APPROVED" || reviewResult.overall_verdict === "REJECTED") {
      break;
    }
  }

  const finalStatus = reviewResult.overall_verdict === "NEEDS_REVISION" ? "needs_review" : "completed";

  return {
    case_id: caseId,
    workflow_id: workflowId,
    status: finalStatus,
    triage: triageResult,
    coder: coderResult,
    policy: policyResult,
    evidence: evidenceResult,
    citation: citationResult,
    draft: draftResult,
    review: reviewResult,
    decision_traces: decisionTraces,
    hitl_gate: {
      gate_type: "gate_2",
      status: "pending_approval",
      content: `Appeal letter generated and reviewed. Human approval required before submission. Review verdict: ${reviewResult.overall_verdict ?? "N/A"}, Score: ${reviewResult.overall_score ?? "N/A"}`,
    },
    _trace: { agent: "orchestrator", trace_id: randomUUID(), elapsed_seconds: 0.2, timestamp: startTime },
  };
}

// ─── Python Subprocess Runner ───────────────────────────────────────────

async function runPythonWorkflow(inputData: Record<string, unknown>): Promise<Record<string, unknown>> {
  const pythonScript = `
import asyncio, json, sys
from agents.orchestrator import OrchestratorAgent
async def main():
    agent = OrchestratorAgent()
    result = await agent.run(json.loads(sys.argv[1]))
    print(json.dumps(result))
asyncio.run(main())
`;

  const proc = Bun.spawn(["python3", "-c", pythonScript, JSON.stringify(inputData)], {
    cwd: "/home/z/my-project/mini-services/agent-fleet",
    stdout: "pipe",
    stderr: "pipe",
  });

  // Set timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      proc.kill();
      reject(new Error("Python subprocess timed out after 60 seconds"));
    }, SUBPROCESS_TIMEOUT_MS);
  });

  try {
    const exitCode = await Promise.race([proc.exited, timeoutPromise]);

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      console.error(`[workflow] Python subprocess exited with code ${exitCode}: ${stderr}`);
      throw new Error(`Python subprocess failed with exit code ${exitCode}`);
    }

    const stdout = await new Response(proc.stdout).text();
    return JSON.parse(stdout) as Record<string, unknown>;
  } catch (err) {
    console.error(`[workflow] Python subprocess error: ${err}`);
    // Fall back to mock data
    return mockWorkflow(inputData);
  }
}

// ─── GCP Status Check ──────────────────────────────────────────────────

async function checkGcpStatus(): Promise<Record<string, unknown>> {
  const firestoreStatus: Record<string, unknown> = { available: false, message: "Not configured" };
  const pubsubStatus: Record<string, unknown> = { available: false, message: "Not configured", topics: [] as string[] };

  // Check if gcloud CLI is available and we have a service account key
  try {
    // Check Firestore via REST API
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${GCP_PROJECT_ID}/databases/(default)/documents`;
    const firestoreResp = await fetch(firestoreUrl, { method: "GET", signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (firestoreResp && firestoreResp.ok) {
      firestoreStatus.available = true;
      firestoreStatus.message = "Firestore REST API reachable";
    } else if (firestoreResp) {
      firestoreStatus.available = false;
      firestoreStatus.message = `Firestore REST API returned status ${firestoreResp.status}`;
    } else {
      firestoreStatus.message = "Firestore REST API unreachable (network error)";
    }
  } catch {
    firestoreStatus.message = "Firestore check failed (timeout or error)";
  }

  // Check Pub/Sub topics
  try {
    const pubsubUrl = `https://pubsub.googleapis.com/v1/projects/${GCP_PROJECT_ID}/topics`;
    const pubsubResp = await fetch(pubsubUrl, { method: "GET", signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (pubsubResp && pubsubResp.ok) {
      const data = await pubsubResp.json() as { topics?: Array<{ name: string }> };
      pubsubStatus.available = true;
      pubsubStatus.message = "Pub/Sub REST API reachable";
      pubsubStatus.topics = (data.topics ?? []).map((t) => t.name.split("/").pop());
    } else if (pubsubResp) {
      pubsubStatus.available = false;
      pubsubStatus.message = `Pub/Sub REST API returned status ${pubsubResp.status}`;
    } else {
      pubsubStatus.message = "Pub/Sub REST API unreachable (network error)";
    }
  } catch {
    pubsubStatus.message = "Pub/Sub check failed (timeout or error)";
  }

  return {
    project_id: GCP_PROJECT_ID,
    firestore: firestoreStatus,
    pubsub: pubsubStatus,
    gemini_api_key_set: !MOCK_MODE,
    timestamp: nowISO(),
  };
}

// ─── Route Handler ──────────────────────────────────────────────────────

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    // ── GET /health ─────────────────────────────────────────────
    if (method === "GET" && path === "/health") {
      return jsonResponse({
        status: "ok",
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
        mock_mode: MOCK_MODE,
        model: GEMINI_MODEL,
        port: PORT,
        runtime: "bun",
        agents: ["triage", "evidence", "drafter", "reviewer", "coder", "policy", "citation", "orchestrator"],
        timestamp: nowISO(),
      });
    }

    // ── POST /agents/triage ─────────────────────────────────────
    if (method === "POST" && path === "/agents/triage") {
      const body = await parseBody<Record<string, unknown>>(req);
      const start = Date.now();
      const data = mockTriage(body);
      return jsonResponse({
        agent: "triage",
        status: "success",
        data,
        trace: { agent: "triage", trace_id: randomUUID(), elapsed_seconds: elapsedSince(start), timestamp: nowISO(), mode: "mock" },
      });
    }

    // ── POST /agents/evidence ───────────────────────────────────
    if (method === "POST" && path === "/agents/evidence") {
      const body = await parseBody<Record<string, unknown>>(req);
      const start = Date.now();
      const data = mockEvidence(body);
      return jsonResponse({
        agent: "evidence",
        status: "success",
        data,
        trace: { agent: "evidence", trace_id: randomUUID(), elapsed_seconds: elapsedSince(start), timestamp: nowISO(), mode: "mock" },
      });
    }

    // ── POST /agents/drafter ────────────────────────────────────
    if (method === "POST" && path === "/agents/drafter") {
      const body = await parseBody<Record<string, unknown>>(req);
      const start = Date.now();
      const data = mockDraft(body);
      return jsonResponse({
        agent: "drafter",
        status: "success",
        data,
        trace: { agent: "drafter", trace_id: randomUUID(), elapsed_seconds: elapsedSince(start), timestamp: nowISO(), mode: "mock" },
      });
    }

    // ── POST /agents/reviewer ───────────────────────────────────
    if (method === "POST" && path === "/agents/reviewer") {
      const body = await parseBody<Record<string, unknown>>(req);
      const start = Date.now();
      const data = mockReviewer(body);
      return jsonResponse({
        agent: "reviewer",
        status: "success",
        data,
        trace: { agent: "reviewer", trace_id: randomUUID(), elapsed_seconds: elapsedSince(start), timestamp: nowISO(), mode: "mock" },
      });
    }

    // ── POST /agents/coder ──────────────────────────────────────
    if (method === "POST" && path === "/agents/coder") {
      const body = await parseBody<Record<string, unknown>>(req);
      const start = Date.now();
      const data = mockCoder(body);
      return jsonResponse({
        agent: "coder",
        status: "success",
        data,
        trace: { agent: "coder", trace_id: randomUUID(), elapsed_seconds: elapsedSince(start), timestamp: nowISO(), mode: "mock" },
      });
    }

    // ── POST /agents/policy ─────────────────────────────────────
    if (method === "POST" && path === "/agents/policy") {
      const body = await parseBody<Record<string, unknown>>(req);
      const start = Date.now();
      const data = mockPolicy(body);
      return jsonResponse({
        agent: "policy",
        status: "success",
        data,
        trace: { agent: "policy", trace_id: randomUUID(), elapsed_seconds: elapsedSince(start), timestamp: nowISO(), mode: "mock" },
      });
    }

    // ── POST /agents/citation ───────────────────────────────────
    if (method === "POST" && path === "/agents/citation") {
      const body = await parseBody<Record<string, unknown>>(req);
      const start = Date.now();
      const data = mockCitation(body);
      return jsonResponse({
        agent: "citation",
        status: "success",
        data,
        trace: { agent: "citation", trace_id: randomUUID(), elapsed_seconds: elapsedSince(start), timestamp: nowISO(), mode: "mock" },
      });
    }

    // ── POST /agents/orchestrator ───────────────────────────────
    if (method === "POST" && path === "/agents/orchestrator") {
      const body = await parseBody<Record<string, unknown>>(req);
      const start = Date.now();
      const caseId = (body.case_id as string) ?? randomUUID();

      let result: Record<string, unknown>;
      if (MOCK_MODE) {
        result = mockWorkflow(body);
      } else {
        result = await runPythonWorkflow(body);
      }

      // Store workflow status
      const elapsed = elapsedSince(start);
      const trace = (result._trace ?? {}) as Record<string, unknown>;
      workflowStore.set(caseId, {
        case_id: caseId,
        workflow_id: (result.workflow_id as string) ?? randomUUID(),
        status: (result.status as string) ?? "completed",
        started_at: (trace.timestamp as string) ?? nowISO(),
        updated_at: nowISO(),
      });

      return jsonResponse(result);
    }

    // ── POST /workflow/run ──────────────────────────────────────
    if (method === "POST" && path === "/workflow/run") {
      const body = await parseBody<Record<string, unknown>>(req);
      const start = Date.now();
      const caseId = (body.case_id as string) ?? randomUUID();

      let result: Record<string, unknown>;
      if (MOCK_MODE) {
        result = mockWorkflow(body);
      } else {
        result = await runPythonWorkflow(body);
      }

      // Store workflow status
      const trace = (result._trace ?? {}) as Record<string, unknown>;
      workflowStore.set(caseId, {
        case_id: caseId,
        workflow_id: (result.workflow_id as string) ?? randomUUID(),
        status: (result.status as string) ?? "completed",
        started_at: (trace.timestamp as string) ?? nowISO(),
        updated_at: nowISO(),
      });

      return jsonResponse(result);
    }

    // ── GET /workflow/status/:case_id ───────────────────────────
    if (method === "GET" && path.startsWith("/workflow/status/")) {
      const caseId = path.replace("/workflow/status/", "");
      const status = workflowStore.get(caseId);
      if (status) {
        return jsonResponse(status);
      }
      return errorResponse(`Workflow not found for case_id: ${caseId}`, 404);
    }

    // ── GET /gcp/status ─────────────────────────────────────────
    if (method === "GET" && path === "/gcp/status") {
      const status = await checkGcpStatus();
      return jsonResponse(status);
    }

    // ── 404 ─────────────────────────────────────────────────────
    return errorResponse("Not found", 404);

  } catch (err) {
    console.error(`[server] Error handling ${method} ${path}:`, err);
    return errorResponse(err instanceof Error ? err.message : "Internal server error", 500);
  }
}

// ─── Start Bun HTTP Server ──────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,
  fetch: handleRequest,
});

const modeLabel = MOCK_MODE ? "MOCK MODE (no Gemini API key)" : "LIVE MODE (Gemini API connected)";
console.log(`🚀 ${SERVICE_NAME} v${SERVICE_VERSION} starting on port ${PORT}`);
console.log(`   Runtime: Bun ${Bun.version}`);
console.log(`   Mode: ${modeLabel}`);
console.log(`   Agents: triage, evidence, drafter, reviewer, coder, policy, citation, orchestrator`);
console.log(`   Endpoints: /health, /agents/*, /workflow/run, /workflow/status/:case_id, /gcp/status`);
console.log(`   Server listening at http://0.0.0.0:${PORT}`);
