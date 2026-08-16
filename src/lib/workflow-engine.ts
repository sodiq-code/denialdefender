/**
 * DenialDefender Inline Workflow Engine
 *
 * Runs the full 8-agent appeal workflow inside the Next.js app itself,
 * producing identical mock output to the external agent-fleet mini-service.
 *
 * Agent pipeline:
 *   triage → coder → policy → evidence → citation → draft → review → HITL gate
 *
 * This engine is used as a fallback when the external agent-fleet service
 * on port 3004 is unavailable (e.g., Bun process died in sandbox).
 */

import { randomUUID } from "crypto";
import type {
  WorkflowRequest,
  WorkflowResult,
  TriageResult,
  CoderResult,
  PolicyResult,
  EvidenceResult,
  CitationResult,
  DraftResult,
  ReviewResult,
  HitlGateResult,
  DecisionTrace,
  DenialInput,
} from "./agent-fleet";

// ─── Configuration ──────────────────────────────────────────────────────

const MAX_REVISION_LOOPS = 3;

/** Min/max delay (ms) per agent step to simulate execution time */
const STEP_DELAY_MIN = 50;
const STEP_DELAY_MAX = 200;

// ─── Utility Helpers ────────────────────────────────────────────────────

function nowISO(): string {
  return new Date().toISOString();
}

function todayDate(): string {
  return nowISO().slice(0, 10);
}

/** Small random delay to simulate agent execution time */
function stepDelay(): Promise<void> {
  const ms = STEP_DELAY_MIN + Math.random() * (STEP_DELAY_MAX - STEP_DELAY_MIN);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDenial(input: WorkflowRequest | Record<string, unknown>): DenialInput {
  return (input.denial ?? input) as DenialInput;
}

// ─── Mock Agent Functions ───────────────────────────────────────────────
// These replicate the EXACT mock data from mini-services/agent-fleet/index.ts

function mockTriage(inputData: WorkflowRequest | Record<string, unknown>): TriageResult {
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

function mockEvidence(inputData: Record<string, unknown>): EvidenceResult {
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

function mockDraft(inputData: Record<string, unknown>): DraftResult {
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

function mockReviewer(inputData: Record<string, unknown>): ReviewResult {
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

function mockCoder(inputData: Record<string, unknown>): CoderResult {
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

function mockPolicy(inputData: Record<string, unknown>): PolicyResult {
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

function mockCitation(inputData: Record<string, unknown>): CitationResult {
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

  const verified: Array<{
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
  }> = [];
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
    ? verified.reduce((s, v) => s + v.combined_score, 0) / verified.length
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

// ─── Inline Workflow Engine ─────────────────────────────────────────────

/**
 * Run the full 8-agent appeal workflow inline (inside Next.js).
 *
 * Produces output identical to the external agent-fleet mini-service's
 * mock mode. Includes small artificial delays per step to simulate
 * agent execution time.
 *
 * Pipeline:
 *   triage → coder → policy → evidence → citation → draft → review → HITL gate
 */
export async function runInlineWorkflow(request: WorkflowRequest): Promise<WorkflowResult> {
  const caseId = request.case_id ?? randomUUID();
  const workflowId = randomUUID();
  const denial = getDenial(request);
  const startTime = nowISO();
  const startMs = Date.now();

  // ── Step 1: Triage ──────────────────────────────────────────────────
  await stepDelay();
  const triageResult = mockTriage(request);
  const decisionTraces: DecisionTrace[] = [
    {
      step: 1,
      agent: "triage",
      timestamp: nowISO(),
      result_summary: {
        classification: triageResult.classification,
        confidence: triageResult.confidence,
        strategy: triageResult.strategy,
      },
    },
  ];

  // If NOT_APPEALABLE, short-circuit and flag for human review
  if (triageResult.classification === "NOT_APPEALABLE") {
    const elapsed = Math.round((Date.now() - startMs) / 1000 * 1000) / 1000;
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
      _trace: {
        agent: "orchestrator",
        trace_id: randomUUID(),
        elapsed_seconds: elapsed,
        timestamp: startTime,
      },
    };
  }

  // ── Step 2: Coder ───────────────────────────────────────────────────
  await stepDelay();
  const coderInput = { denial, patient_context: request.patient_context ?? {} };
  const coderResult = mockCoder(coderInput);
  decisionTraces.push({
    step: 2,
    agent: "coder",
    timestamp: nowISO(),
    result_summary: {
      validation_result: coderResult.validation_result,
      coding_action_required: coderResult.coding_action_required,
    },
  });

  // ── Step 3: Policy ──────────────────────────────────────────────────
  await stepDelay();
  const policyInput = { denial, patient_context: request.patient_context ?? {}, triage: triageResult, coding: coderResult };
  const policyResult = mockPolicy(policyInput);
  decisionTraces.push({
    step: 3,
    agent: "policy",
    timestamp: nowISO(),
    result_summary: {
      contradictions_count: policyResult.contradictions_found.length,
      patient_meets_criteria: policyResult.patient_meets_criteria,
    },
  });

  // ── Step 4: Evidence ────────────────────────────────────────────────
  await stepDelay();
  const evidenceInput = { denial, patient_context: request.patient_context ?? {}, triage: triageResult };
  const evidenceResult = mockEvidence(evidenceInput);
  decisionTraces.push({
    step: 4,
    agent: "evidence",
    timestamp: nowISO(),
    result_summary: {
      evidence_count: evidenceResult.evidence_items.length,
      overall_strength: evidenceResult.overall_evidence_strength,
    },
  });

  // ── Step 5: Citation ────────────────────────────────────────────────
  await stepDelay();
  const citationInput = { evidence: evidenceResult, policy: policyResult };
  const citationResult = mockCitation(citationInput);
  decisionTraces.push({
    step: 5,
    agent: "citation",
    timestamp: nowISO(),
    result_summary: {
      verified_count: citationResult.verified_citations.length,
      overall_quality: citationResult.overall_citation_quality,
    },
  });

  // ── Steps 6-8: Draft → Review → (revise if needed) ─────────────────
  let draftResult: DraftResult = {} as DraftResult;
  let reviewResult: ReviewResult = {} as ReviewResult;

  for (let loop = 0; loop < MAX_REVISION_LOOPS; loop++) {
    // Step 6: Draft
    await stepDelay();
    const draftInput: Record<string, unknown> = {
      case_id: caseId,
      denial,
      patient_context: request.patient_context ?? {},
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
    decisionTraces.push({
      step: 6,
      agent: "drafter",
      timestamp: nowISO(),
      revision_loop: loop,
      result_summary: {
        word_count: draftResult.word_count,
        citations_count: draftResult.citations_used?.length ?? 0,
      },
    });

    // Step 7: Review
    await stepDelay();
    const reviewInput = { denial, triage: triageResult, evidence: evidenceResult, draft: draftResult };
    reviewResult = mockReviewer(reviewInput);
    decisionTraces.push({
      step: 7,
      agent: "reviewer",
      timestamp: nowISO(),
      revision_loop: loop,
      result_summary: {
        verdict: reviewResult.overall_verdict,
        score: reviewResult.overall_score,
      },
    });

    // Step 8: Check revision
    if (reviewResult.overall_verdict === "APPROVED" || reviewResult.overall_verdict === "REJECTED") {
      break;
    }
  }

  const finalStatus = reviewResult.overall_verdict === "NEEDS_REVISION" ? "needs_review" : "completed";
  const elapsed = Math.round((Date.now() - startMs) / 1000 * 1000) / 1000;

  const hitlGate: HitlGateResult = {
    gate_type: "gate_2",
    status: "pending_approval",
    content: `Appeal letter generated and reviewed. Human approval required before submission. Review verdict: ${reviewResult.overall_verdict ?? "N/A"}, Score: ${reviewResult.overall_score ?? "N/A"}`,
  };

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
    hitl_gate: hitlGate,
    _trace: {
      agent: "orchestrator",
      trace_id: randomUUID(),
      elapsed_seconds: elapsed,
      timestamp: startTime,
    },
  };
}
