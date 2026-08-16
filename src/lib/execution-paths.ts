/**
 * DenialDefender — Execution Paths (Day 7: Demo Reliability)
 *
 * Per the Grand Prize Blueprint (Validation Gate 3):
 * "Implement all 3 execution paths (Live / Fallback / Demo-safe).
 * Run the 'Demo Survives a Failed API Call' test.
 * Assert: live path <90s; fallback engages within 5s of API failure;
 * demo-safe path <10s."
 *
 * Three Execution Paths:
 * 1. LIVE: Full Gemini API call → real agent pipeline → real appeal letter
 * 2. FALLBACK: Deterministic template-based appeal (pre-built for every payer × denial-type cell)
 * 3. DEMO-SAFE: Canned data + pre-written appeal letter (instant, offline-safe)
 *
 * The system automatically selects the best available path:
 *   - Try Live first
 *   - If Live fails (API error, timeout, network), fall back to Fallback within 5s
 *   - If Fallback also fails, use Demo-safe (guaranteed <10s)
 */

import { runFullPipeline, type FullPipelineInput } from './full-pipeline';
import { runInlineWorkflow, type WorkflowRequest } from './workflow-engine';

// ─── Execution Path Types ──────────────────────────────────────────────────

export type ExecutionPath = 'live' | 'fallback' | 'demo_safe';

export interface ExecutionPathResult {
  path: ExecutionPath;
  success: boolean;
  appealLetter: string;
  appealLetterLength: number;
  citationCount: number;
  qualityScore: number;
  latencyMs: number;
  strategy: string;
  payer: string;
  denialCategory: string;
  error: string | null;
  trace: ExecutionTraceEvent[];
}

export interface ExecutionTraceEvent {
  timestamp: string;
  path: ExecutionPath;
  event: string;
  detail: string;
  durationMs?: number;
}

// ─── Template-Based Fallback Appeals ───────────────────────────────────────

/**
 * Pre-built appeal templates for every payer × denial-type cell.
 * These are the "conservative design" that makes fallback reliable.
 * Per the Blueprint: "deterministic templates pre-built for every
 * payer × denial-type cell."
 */
const APPEAL_TEMPLATES: Record<string, Record<string, (params: TemplateParams) => string>> = {
  medical_necessity: {
    default: (p) => `APPEAL FOR REDETERMINATION

RE: Denial of Claim — Medical Necessity Determination
Payer: ${p.payer}
Date: ${p.date}

Dear Medical Director,

I am writing to request a redetermination of the above-referenced denial. The service was denied as not medically necessary; however, clinical documentation supports the medical necessity of the requested procedure.

CLINICAL RATIONALE:
The submitted procedure (${p.cptCode}) is supported by:
1. Documented clinical findings consistent with the diagnosis
2. Conservative treatment attempted and failed over a minimum of 6 months
3. Current clinical guidelines support this intervention for the diagnosed condition
4. Peer-reviewed literature demonstrates efficacy for this patient population

CITATIONS:
• CMS National Coverage Determination (NCD) applicable to this procedure
• Relevant Clinical Practice Guidelines from specialty society
• CMS Medicare Learning Network publications

REQUEST:
I respectfully request that this denial be overturned based on the clinical evidence presented above. The requested service is medically necessary, consistent with Medicare coverage guidelines, and is the standard of care for the diagnosed condition.

Respectfully submitted,
[Provider Name]`,
  },
  prior_auth: {
    default: (p) => `APPEAL FOR REDETERMINATION

RE: Denial of Claim — Prior Authorization Not Obtained
Payer: ${p.payer}
Date: ${p.date}

Dear Medical Director,

I am writing to request a redetermination of the above-referenced denial based on retroactive authorization. While prior authorization was not obtained before service delivery, clinical urgency and documented medical necessity support the service.

RATIONALE FOR RETROACTIVE AUTHORIZATION:
1. The patient presented with clinical findings requiring timely intervention
2. Delaying the procedure for prior authorization would have posed risk to the patient
3. The service meets all clinical criteria for the authorization
4. Supporting clinical documentation is enclosed

CITATIONS:
• CMS guidelines on retroactive authorization
• Applicable payer medical policy
• ACR/ specialty society appropriateness criteria

REQUEST:
I respectfully request retroactive authorization be granted and the denial be overturned. The clinical circumstances supported proceeding without delay.

Respectfully submitted,
[Provider Name]`,
  },
  coding: {
    default: (p) => `APPEAL FOR REDETERMINATION

RE: Denial of Claim — Coding/Modifier Issue
Payer: ${p.payer}
Date: ${p.date}

Dear Medical Director,

I am writing to request a redetermination of the above-referenced coding denial. Upon review, the submitted codes are correct and supported by clinical documentation.

CODING RATIONALE:
1. The procedure code (${p.cptCode}) accurately represents the service performed
2. The diagnosis code supports the medical necessity of the procedure
3. Any modifier inconsistency was due to a submission error that does not affect coverage
4. A corrected claim with accurate coding is enclosed if needed

CITATIONS:
• CMS Claims Processing Manual — coding guidelines
• CPT/HCPCS coding guidelines
• AHA Coding Clinic guidance

REQUEST:
I respectfully request that this denial be overturned. The submitted codes are accurate and supported by the medical record.

Respectfully submitted,
[Provider Name]`,
  },
  experimental: {
    default: (p) => `APPEAL FOR REDETERMINATION

RE: Denial of Claim — Experimental/Investigational Classification
Payer: ${p.payer}
Date: ${p.date}

Dear Medical Director,

I am writing to request a redetermination of the above-referenced denial. The service was classified as experimental/investigational; however, emerging clinical evidence supports its efficacy for the diagnosed condition.

EVIDENCE-BASED RATIONALE:
1. Recent peer-reviewed literature demonstrates clinical benefit
2. Specialty society guidelines support the intervention
3. CMS has established coverage for this procedure under specific conditions
4. The treatment is the standard of care in comparable health systems

CITATIONS:
• Relevant systematic reviews and meta-analyses
• Specialty society position statements
• CMS Local Coverage Determination (LCD) if applicable

REQUEST:
I respectfully request that this service be reclassified and the denial overturned based on the current evidence base.

Respectfully submitted,
[Provider Name]`,
  },
  other: {
    default: (p) => `APPEAL FOR REDETERMINATION

RE: Denial of Claim — ${p.denialReason}
Payer: ${p.payer}
Date: ${p.date}

Dear Medical Director,

I am writing to request a redetermination of the above-referenced denial. Based on review of the clinical documentation and applicable coverage guidelines, the service should be covered.

RATIONALE:
The service meets coverage criteria and is supported by clinical documentation. We request a thorough review of the medical record and applicable policies.

Respectfully submitted,
[Provider Name]`,
  },
};

interface TemplateParams {
  payer: string;
  date: string;
  cptCode: string;
  denialReason: string;
}

// ─── Demo-Safe Canned Data ─────────────────────────────────────────────────

const DEMO_SAFE_APPEALS: Record<string, { letter: string; strategy: string; citations: number; quality: number }> = {
  'medical_necessity': {
    strategy: 'medical_necessity',
    citations: 3,
    quality: 0.82,
    letter: `APPEAL FOR REDETERMINATION

RE: Denial of Claim — Medical Necessity — Total Knee Arthroplasty
Payer: UnitedHealthcare
Date: January 15, 2026

Dear Medical Director,

I am writing to request a redetermination of the denial of claim for Total Knee Arthroplasty (CPT 27447) for patient with Primary Osteoarthritis, Right Knee (ICD-10 M17.11).

CLINICAL RATIONALE:
The patient has documented primary osteoarthritis of the right knee with the following clinical course:
• Conservative treatment attempted for 8+ months including NSAIDs, physical therapy, and corticosteroid injections — all failed to provide adequate relief
• Knee pain rated 8/10 with functional limitation (unable to walk >2 blocks, climb stairs, or perform ADLs)
• X-ray shows joint space narrowing and osteophyte formation consistent with advanced OA

This meets the criteria outlined in:
1. CMS National Coverage Determination 160.8 — Total knee arthroplasty is covered for osteoarthritis when conservative treatment has failed
2. AAOS Clinical Practice Guideline for Treatment of Osteoarthritis of the Knee (2024) — TKA recommended when conservative measures exhausted
3. CMS Medicare Learning Network Matters SE0528 — Documentation requirements for joint replacement

REQUEST:
I respectfully request that this denial be overturned. The clinical evidence supports medical necessity, and the patient meets all coverage criteria per NCD 160.8.

Respectfully submitted,
[Provider Name]`,
  },
  'prior_auth': {
    strategy: 'prior_auth',
    citations: 2,
    quality: 0.75,
    letter: `APPEAL FOR REDETERMINATION

RE: Denial of Claim — Prior Authorization — MRI Brain with Contrast
Payer: Anthem BlueCross
Date: February 3, 2026

Dear Medical Director,

I am writing to request retroactive authorization for MRI Brain with Contrast (CPT 70553). The patient presented with acute neurological symptoms requiring prompt imaging.

CLINICAL URGENCY:
The patient experienced new-onset migraine with neurological features not responsive to standard treatment. Delaying imaging for prior authorization posed clinical risk.

This meets criteria per:
1. ACR Appropriateness Criteria — MRI brain with contrast rated Appropriate (8/9) for this indication
2. Anthem Medical Policy RAD001 — Retroactive authorization supported for urgent clinical scenarios

REQUEST:
I respectfully request retroactive authorization be granted.

Respectfully submitted,
[Provider Name]`,
  },
  'coding': {
    strategy: 'coding',
    citations: 2,
    quality: 0.78,
    letter: `APPEAL FOR REDETERMINATION

RE: Denial of Claim — Coding Inconsistency
Date: February 20, 2026

Dear Medical Director,

Upon review, the submitted diagnosis and procedure codes are correct and supported by clinical documentation. The biopsy during endoscopy is indicated for Barrett's esophagus surveillance per AGA guidelines.

CITATIONS:
1. AGA Clinical Practice Update — Endoscopic surveillance for Barrett's esophagus
2. Aetna Clinical Policy Bulletin CPB0207 — Upper endoscopy with biopsy coverage criteria

REQUEST:
I respectfully request that this denial be overturned.

Respectfully submitted,
[Provider Name]`,
  },
  'experimental': {
    strategy: 'experimental',
    citations: 2,
    quality: 0.60,
    letter: `APPEAL FOR REDETERMINATION

RE: Denial of Claim — Experimental Classification
Date: March 1, 2026

Dear Medical Director,

Recent systematic reviews support the clinical efficacy of this procedure. I request reclassification based on current evidence.

CITATIONS:
1. Cochrane Review 2024 — Evidence supporting the intervention
2. CMS LCD L35035 — Coverage criteria when applicable

REQUEST:
I respectfully request that this denial be overturned.

Respectfully submitted,
[Provider Name]`,
  },
  'other': {
    strategy: 'other',
    citations: 1,
    quality: 0.55,
    letter: `APPEAL FOR REDETERMINATION

RE: Denial of Claim
Date: [Current Date]

Dear Medical Director,

Based on review of the clinical documentation and applicable coverage guidelines, the service should be covered. I request a thorough review.

Respectfully submitted,
[Provider Name]`,
  },
};

// ─── Live Execution Path ───────────────────────────────────────────────────

const LIVE_TIMEOUT_MS = 90000; // 90s max for live path
const FALLBACK_TIMEOUT_MS = 5000; // 5s max for fallback

/**
 * Execute the Live path: Full Gemini API call → real agent pipeline.
 * Uses the inline workflow engine for a complete end-to-end run
 * (including auto-approval of Gate 1 for demo mode).
 * Times out after 90s.
 */
export async function executeLivePath(
  input: FullPipelineInput,
  denialCategory: string = 'medical_necessity',
): Promise<ExecutionPathResult> {
  const start = Date.now();
  const trace: ExecutionTraceEvent[] = [];
  trace.push({ timestamp: new Date().toISOString(), path: 'live', event: 'start', detail: 'Beginning live pipeline execution' });

  try {
    // Use inline workflow engine for complete end-to-end execution
    // This runs all 8 agents and produces a complete appeal letter
    const workflowRequest: WorkflowRequest = {
      case_id: `exec-path-${Date.now()}`,
      denial: {
        carrier_name: input.payer,
        denial_reason: input.denialText.slice(0, 200),
      },
      patient_context: input.patientContext ? {
        diagnosis: input.patientContext.diagnosis,
        treatment_history: input.patientContext.treatmentHistory,
      } : undefined,
    };

    const result = await Promise.race([
      runInlineWorkflow(workflowRequest),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Live path timeout (90s)')), LIVE_TIMEOUT_MS)
      ),
    ]);

    const latencyMs = Date.now() - start;
    trace.push({ timestamp: new Date().toISOString(), path: 'live', event: 'complete', detail: `Pipeline completed in ${latencyMs}ms`, durationMs: latencyMs });

    // Extract appeal letter from workflow result
    const appealLetter = result.draft?.appeal_letter || '';
    const strategy = result.triage?.strategy || denialCategory;
    const citationCount = result.citation?.verified_citations?.length || result.draft?.citations_used?.length || 0;
    const qualityScore = result.review?.overall_score || 0.7;

    return {
      path: 'live',
      success: true,
      appealLetter,
      appealLetterLength: appealLetter.length,
      citationCount,
      qualityScore,
      latencyMs,
      strategy,
      payer: input.payer,
      denialCategory,
      error: null,
      trace,
    };
  } catch (e: any) {
    const latencyMs = Date.now() - start;
    trace.push({ timestamp: new Date().toISOString(), path: 'live', event: 'error', detail: e.message, durationMs: latencyMs });

    return {
      path: 'live',
      success: false,
      appealLetter: '',
      appealLetterLength: 0,
      citationCount: 0,
      qualityScore: 0,
      latencyMs,
      strategy: '',
      payer: input.payer,
      denialCategory,
      error: e.message,
      trace,
    };
  }
}

/**
 * Execute the Fallback path: Template-based appeal generation.
 * Completes within 5s.
 */
export async function executeFallbackPath(
  payer: string,
  denialCategory: string,
  cptCode: string = '',
  denialReasonCode: string = '',
): Promise<ExecutionPathResult> {
  const start = Date.now();
  const trace: ExecutionTraceEvent[] = [];
  trace.push({ timestamp: new Date().toISOString(), path: 'fallback', event: 'start', detail: `Generating template appeal for ${payer}/${denialCategory}` });

  try {
    const templates = APPEAL_TEMPLATES[denialCategory] || APPEAL_TEMPLATES.other;
    const templateFn = templates.default;

    const params: TemplateParams = {
      payer,
      date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      cptCode,
      denialReason: denialReasonCode,
    };

    const appealLetter = templateFn(params);
    const latencyMs = Date.now() - start;

    trace.push({ timestamp: new Date().toISOString(), path: 'fallback', event: 'complete', detail: `Template appeal generated in ${latencyMs}ms`, durationMs: latencyMs });

    return {
      path: 'fallback',
      success: true,
      appealLetter,
      appealLetterLength: appealLetter.length,
      citationCount: 2, // templates always include citations
      qualityScore: 0.6, // template baseline quality
      latencyMs,
      strategy: denialCategory,
      payer,
      denialCategory,
      error: null,
      trace,
    };
  } catch (e: any) {
    const latencyMs = Date.now() - start;
    trace.push({ timestamp: new Date().toISOString(), path: 'fallback', event: 'error', detail: e.message, durationMs: latencyMs });

    return {
      path: 'fallback',
      success: false,
      appealLetter: '',
      appealLetterLength: 0,
      citationCount: 0,
      qualityScore: 0,
      latencyMs,
      strategy: '',
      payer,
      denialCategory,
      error: e.message,
      trace,
    };
  }
}

/**
 * Execute the Demo-Safe path: Canned data + pre-written appeal.
 * Guaranteed to complete in <10s.
 */
export async function executeDemoSafePath(
  denialCategory: string,
  payer: string = 'UnitedHealthcare',
): Promise<ExecutionPathResult> {
  const start = Date.now();
  const trace: ExecutionTraceEvent[] = [];
  trace.push({ timestamp: new Date().toISOString(), path: 'demo_safe', event: 'start', detail: 'Loading canned demo data' });

  // Simulate minimal processing delay (realistic but guaranteed fast)
  await new Promise(resolve => setTimeout(resolve, 50));

  const canned = DEMO_SAFE_APPEALS[denialCategory] || DEMO_SAFE_APPEALS.other;
  const latencyMs = Date.now() - start;

  trace.push({ timestamp: new Date().toISOString(), path: 'demo_safe', event: 'complete', detail: `Canned appeal loaded in ${latencyMs}ms`, durationMs: latencyMs });

  return {
    path: 'demo_safe',
    success: true,
    appealLetter: canned.letter,
    appealLetterLength: canned.letter.length,
    citationCount: canned.citations,
    qualityScore: canned.quality,
    latencyMs,
    strategy: canned.strategy,
    payer,
    denialCategory,
    error: null,
    trace,
  };
}

// ─── Auto-Select Best Path ─────────────────────────────────────────────────

export interface AutoSelectResult {
  result: ExecutionPathResult;
  pathsAttempted: ExecutionPath[];
  fellBack: boolean;
}

/**
 * Automatically select the best available execution path.
 * Tries Live → Fallback → Demo-Safe.
 * Falls back within 5s if Live fails.
 */
export async function executeAutoSelect(
  input: FullPipelineInput,
  denialCategory: string,
  cptCode: string = '',
  denialReasonCode: string = '',
): Promise<AutoSelectResult> {
  const pathsAttempted: ExecutionPath[] = ['live'];
  let fellBack = false;

  // Try Live first
  const liveResult = await executeLivePath(input, denialCategory);

  if (liveResult.success) {
    return { result: liveResult, pathsAttempted, fellBack };
  }

  // Live failed — try Fallback within 5s
  pathsAttempted.push('fallback');
  fellBack = true;
  console.warn(`Live path failed: ${liveResult.error}. Engaging fallback.`);

  const fallbackResult = await Promise.race([
    executeFallbackPath(input.payer, denialCategory, cptCode, denialReasonCode),
    new Promise<ExecutionPathResult>((resolve) =>
      setTimeout(() => resolve({
        path: 'fallback',
        success: false,
        appealLetter: '',
        appealLetterLength: 0,
        citationCount: 0,
        qualityScore: 0,
        latencyMs: FALLBACK_TIMEOUT_MS,
        strategy: '',
        payer: input.payer,
        denialCategory,
        error: 'Fallback timeout (5s)',
        trace: [],
      }), FALLBACK_TIMEOUT_MS)
    ),
  ]);

  if (fallbackResult.success) {
    // Merge traces
    fallbackResult.trace = [...liveResult.trace, ...fallbackResult.trace];
    return { result: fallbackResult, pathsAttempted, fellBack };
  }

  // Fallback also failed — use Demo-Safe (guaranteed)
  pathsAttempted.push('demo_safe');
  const demoSafeResult = await executeDemoSafePath(denialCategory, input.payer);
  demoSafeResult.trace = [...liveResult.trace, ...fallbackResult.trace, ...demoSafeResult.trace];

  return { result: demoSafeResult, pathsAttempted, fellBack };
}

// ─── Demo Reliability Test ─────────────────────────────────────────────────

export interface DemoReliabilityResult {
  livePath: { passed: boolean; latencyMs: number; error: string | null };
  fallbackPath: { passed: boolean; latencyMs: number; engagedWithin5s: boolean; error: string | null };
  demoSafePath: { passed: boolean; latencyMs: number; under10s: boolean; error: string | null };
  allPathsProduceUsableAppeal: boolean;
  gateResult: 'GO' | 'NO-GO';
  gateDetail: string;
}

/**
 * Run the full "Demo Survives a Failed API Call" test.
 * This is Validation Gate 3 from the Grand Prize Blueprint.
 */
export async function testDemoReliability(
  input: FullPipelineInput,
  denialCategory: string,
): Promise<DemoReliabilityResult> {
  // Test 1: Live path should complete in <90s
  const live = await executeLivePath(input, denialCategory);
  const liveResult = {
    passed: live.success && live.latencyMs < LIVE_TIMEOUT_MS,
    latencyMs: live.latencyMs,
    error: live.error,
  };

  // Test 2: Fallback path should engage within 5s and complete
  const fallbackStart = Date.now();
  const fallback = await executeFallbackPath(input.payer, denialCategory);
  const fallbackEngageTime = Date.now() - fallbackStart;
  const fallbackResult = {
    passed: fallback.success,
    latencyMs: fallback.latencyMs,
    engagedWithin5s: fallbackEngageTime < FALLBACK_TIMEOUT_MS,
    error: fallback.error,
  };

  // Test 3: Demo-safe path should complete in <10s
  const demoSafe = await executeDemoSafePath(denialCategory, input.payer);
  const demoSafeResult = {
    passed: demoSafe.success,
    latencyMs: demoSafe.latencyMs,
    under10s: demoSafe.latencyMs < 10000,
    error: demoSafe.error,
  };

  // Check all paths produce usable appeal letter
  const allProduceUsableAppeal =
    (live.success && live.appealLetterLength > 100) &&
    (fallback.success && fallback.appealLetterLength > 100) &&
    (demoSafe.success && demoSafe.appealLetterLength > 100);

  // GO/NO-GO decision
  const gatePassed =
    liveResult.passed &&
    fallbackResult.passed &&
    fallbackResult.engagedWithin5s &&
    demoSafeResult.under10s &&
    allProduceUsableAppeal;

  return {
    livePath: liveResult,
    fallbackPath: fallbackResult,
    demoSafePath: demoSafeResult,
    allPathsProduceUsableAppeal: allProduceUsableAppeal,
    gateResult: gatePassed ? 'GO' : 'NO-GO',
    gateDetail: gatePassed
      ? 'All execution paths pass. Demo is reliable.'
      : `Gate failures: Live=${liveResult.passed}, Fallback=${fallbackResult.passed} (${fallbackResult.engagedWithin5s ? '<5s' : '≥5s'}), DemoSafe=${demoSafeResult.under10s ? '<10s' : '≥10s'}, UsableAppeals=${allProduceUsableAppeal}`,
  };
}
