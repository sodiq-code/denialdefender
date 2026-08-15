/**
 * DenialDefender — Six-Agent Pipeline (Day 5)
 *
 * Chains: Advocate → Triage → [Gate 1] → Policy Research → Evidence Assembly → Letter Drafting → Quality Review
 *
 * Pipeline flow:
 * 1. Runs Advocate + Triage → Gate 1 (same as three-agent pipeline)
 * 2. After Gate 1 approval → Policy Research → Evidence Assembly → Letter Drafting → Quality Review
 * 3. If Quality Review FAILS → pipeline stops with quality_review_failed
 * 4. If Quality Review PASSES → pipeline completes with canProceed = true
 *
 * Case state transitions:
 *   ... → hitl_gate_1 → evidence_active → drafting_active → quality_review → hitl_gate_2
 */

import { db } from '@/lib/db';
import { patientAdvocateAgent, type PatientAdvocateInput, type AdvocateResult } from './agents/patient-advocate';
import { denialTriageAgent, type DenialTriageInput, type TriageResult } from './agents/denial-triage';
import { policyResearchAgent, type PolicyResearchInput, type PolicyResearchResult } from './agents/policy-research-agent';
import { evidenceAssemblyAgent, type EvidenceAssemblyInput, type EvidenceAssemblyResult } from './agents/evidence-assembly';
import { letterDraftingAgent, type LetterDraftingInput, type LetterDraftingResult } from './agents/letter-drafting';
import { qualityReviewAgent, type QualityReviewInput, type QualityReviewResult } from './agents/quality-review';
import type { TraceEvent } from './agents/base-agent';

// ─── Types ────────────────────────────────────────────────────────────────

export interface SixAgentPipelineInput {
  denialText: string;
  payer: string;
  patientContext?: { diagnosis?: string; treatmentHistory?: string };
}

export interface SixAgentPipelineResult {
  advocate: AdvocateResult;
  triage: TriageResult;
  gate1: {
    status: 'pending' | 'approved' | 'rejected';
    gateId: string | null;
    confirmPrompt: string;
  };
  policyResearch: PolicyResearchResult | null;
  evidenceAssembly: EvidenceAssemblyResult | null;
  letterDrafting: LetterDraftingResult | null;
  qualityReview: QualityReviewResult | null;
  pipelineStatus: 'awaiting_gate1' | 'gate1_rejected' | 'quality_review_failed' | 'completed';
  caseId: string | null;
  latencyMs: number;
  traces: TraceEvent[];
}

// ─── Main Pipeline ────────────────────────────────────────────────────────

/**
 * Run the six-agent pipeline up to HITL Gate 1.
 * The pipeline STOPS after triage and waits for human confirmation.
 * This is the same as the three-agent pipeline for the first phase.
 */
export async function runSixAgentPipeline(
  input: SixAgentPipelineInput,
): Promise<SixAgentPipelineResult> {
  const totalStart = Date.now();
  const traces: TraceEvent[] = [];

  // Step 1: Create a Case in the DB
  let caseId: string | null = null;
  try {
    const caseRecord = await db.case.create({
      data: {
        patient_id: `patient-${Date.now()}`,
        state: 'created',
      },
    });
    caseId = caseRecord.id;
    traces.push({
      agent: 'pipeline',
      step: 'create_case',
      timestamp: new Date().toISOString(),
      status: 'completed',
      detail: `Created case ${caseId} in state 'created'`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    traces.push({
      agent: 'pipeline',
      step: 'create_case',
      timestamp: new Date().toISOString(),
      status: 'error',
      detail: `Failed to create case: ${msg}`,
    });
  }

  // Step 2: Run Patient Advocate
  try {
    if (caseId) {
      await db.case.update({ where: { id: caseId }, data: { state: 'triage_active' } });
    }
  } catch {
    // Non-critical
  }

  const advocateInput: PatientAdvocateInput = {
    denialText: input.denialText,
    patientContext: input.patientContext,
  };

  const advocateResult = await patientAdvocateAgent.run(advocateInput);
  traces.push(advocateResult.trace);
  traces.push({
    agent: 'patient-advocate',
    step: 'case_framing',
    timestamp: new Date().toISOString(),
    status: 'completed',
    detail: `Urgency: ${advocateResult.data.caseFraming.urgencyLevel}, Deadline: ${advocateResult.data.caseFraming.deadline || 'unknown'}`,
    latencyMs: advocateResult.latencyMs,
  });

  // Step 3: Run Denial Triage
  const triageInput: DenialTriageInput = {
    denialText: input.denialText,
    payer: input.payer,
    advocateResult: advocateResult.data,
  };

  const triageResult = await denialTriageAgent.run(triageInput);
  traces.push(triageResult.trace);
  traces.push({
    agent: 'denial-triage',
    step: 'denial_classification',
    timestamp: new Date().toISOString(),
    status: 'completed',
    detail: `Type: ${triageResult.data.denialJson.denialType}, Code: ${triageResult.data.denialJson.reasonCode}, Confidence: ${triageResult.data.denialJson.confidence}`,
    latencyMs: triageResult.latencyMs,
  });

  // Step 4: Create Denial record in DB
  if (caseId) {
    try {
      await db.denial.create({
        data: {
          case_id: caseId,
          payer: triageResult.data.denialJson.payer,
          reason_code: triageResult.data.denialJson.reasonCode,
          category: triageResult.data.denialJson.denialType as any,
          denial_letter_text: input.denialText,
          deadline: triageResult.data.denialJson.deadline ? new Date(triageResult.data.denialJson.deadline) : null,
          confidence: triageResult.data.denialJson.confidence,
          structured_json: JSON.stringify(triageResult.data.denialJson),
        },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      traces.push({
        agent: 'pipeline',
        step: 'create_denial_record',
        timestamp: new Date().toISOString(),
        status: 'error',
        detail: `Failed to create denial record: ${msg}`,
      });
    }
  }

  // Step 5: Create HITL Gate 1 and set case state
  let gateId: string | null = null;
  if (caseId) {
    try {
      await db.case.update({ where: { id: caseId }, data: { state: 'hitl_gate_1' } });
      const gate = await db.hitlGate.create({
        data: {
          case_id: caseId,
          gate_number: 1,
          status: 'pending',
          reviewer_note: triageResult.data.humanConfirmPrompt,
        },
      });
      gateId = gate.id;
      traces.push({
        agent: 'pipeline',
        step: 'create_gate1',
        timestamp: new Date().toISOString(),
        status: 'completed',
        detail: `Created HITL Gate 1 (${gate.id}). Pipeline STOPPED — awaiting human confirmation.`,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      traces.push({
        agent: 'pipeline',
        step: 'create_gate1',
        timestamp: new Date().toISOString(),
        status: 'error',
        detail: `Failed to create Gate 1: ${msg}`,
      });
    }
  }

  // Emit decision trace events to DB
  if (caseId) {
    await emitTraces(caseId, traces);
  }

  const latencyMs = Date.now() - totalStart;

  // Step 6: Return — pipeline STOPS at Gate 1
  return {
    advocate: advocateResult.data,
    triage: triageResult.data,
    gate1: {
      status: 'pending',
      gateId,
      confirmPrompt: triageResult.data.humanConfirmPrompt,
    },
    policyResearch: null,
    evidenceAssembly: null,
    letterDrafting: null,
    qualityReview: null,
    pipelineStatus: 'awaiting_gate1',
    caseId,
    latencyMs,
    traces,
  };
}

// ─── Resume After Gate 1 ──────────────────────────────────────────────────

/**
 * Resume the six-agent pipeline after Gate 1 resolution.
 * - If approved → Policy Research → Evidence Assembly → Letter Drafting → Quality Review
 * - If rejected → pipeline stops
 */
export async function resumeSixAgentPipeline(
  caseId: string,
  gateStatus: 'approved' | 'rejected',
  cachedTriageResult?: TriageResult,
  cachedAdvocateResult?: AdvocateResult,
): Promise<SixAgentPipelineResult> {
  const totalStart = Date.now();
  const traces: TraceEvent[] = [];

  // Verify the case exists
  const caseRecord = await db.case.findUnique({ where: { id: caseId } });
  if (!caseRecord) {
    throw new Error(`Case ${caseId} not found`);
  }

  // Resolve Gate 1 in DB
  const gate = await db.hitlGate.findFirst({
    where: { case_id: caseId, gate_number: 1 },
  });

  if (!gate) {
    throw new Error(`Gate 1 not found for case ${caseId}`);
  }

  await db.hitlGate.update({
    where: { id: gate.id },
    data: {
      status: gateStatus,
      resolved_at: new Date(),
    },
  });

  traces.push({
    agent: 'pipeline',
    step: 'resolve_gate1',
    timestamp: new Date().toISOString(),
    status: 'completed',
    detail: `Gate 1 resolved as ${gateStatus} for case ${caseId}`,
  });

  // If rejected, pipeline stops
  if (gateStatus === 'rejected') {
    traces.push({
      agent: 'pipeline',
      step: 'pipeline_stopped',
      timestamp: new Date().toISOString(),
      status: 'blocked',
      detail: `Pipeline STOPPED — Gate 1 rejected.`,
    });

    const denial = await db.denial.findUnique({ where: { case_id: caseId } });

    return {
      advocate: cachedAdvocateResult || {
        caseFraming: {
          patientSummary: 'Case information from existing record',
          denialImpact: 'Pipeline stopped at Gate 1 — rejection',
          urgencyLevel: 'standard',
          recommendedActions: [],
          deadline: null,
          deadlineDaysRemaining: null,
        },
        empatheticNote: 'The denial classification was rejected.',
      },
      triage: cachedTriageResult || buildDefaultTriage(denial),
      gate1: { status: 'rejected', gateId: gate.id, confirmPrompt: gate.reviewer_note || 'Gate 1 rejected' },
      policyResearch: null,
      evidenceAssembly: null,
      letterDrafting: null,
      qualityReview: null,
      pipelineStatus: 'gate1_rejected',
      caseId,
      latencyMs: Date.now() - totalStart,
      traces,
    };
  }

  // Gate 1 approved → run remaining agents
  traces.push({
    agent: 'pipeline',
    step: 'gate1_approved',
    timestamp: new Date().toISOString(),
    status: 'completed',
    detail: `Gate 1 approved. Proceeding to Policy Research → Evidence → Draft → Quality Review.`,
  });

  // Get denial info for triage
  const denial = await db.denial.findUnique({ where: { case_id: caseId } });
  const triageResult: TriageResult = cachedTriageResult || buildDefaultTriage(denial);
  const advocateResult: AdvocateResult = cachedAdvocateResult || {
    caseFraming: {
      patientSummary: 'Case information from existing record',
      denialImpact: 'Pipeline proceeding — Gate 1 approved',
      urgencyLevel: 'standard',
      recommendedActions: [],
      deadline: denial?.deadline?.toISOString().split('T')[0] || null,
      deadlineDaysRemaining: null,
    },
    empatheticNote: 'The denial classification was confirmed.',
  };

  // ─── Step A: Policy Research ──────────────────────────────────────────
  await db.case.update({ where: { id: caseId }, data: { state: 'evidence_active' } });

  const policyInput: PolicyResearchInput = { triageResult };
  const policyResult = await policyResearchAgent.run(policyInput);
  traces.push(policyResult.trace);
  traces.push({
    agent: 'policy-research',
    step: 'clause_retrieval',
    timestamp: new Date().toISOString(),
    status: 'completed',
    detail: `Retrieved ${policyResult.data.clauses.length} clauses in ${policyResult.data.retrievalLatencyMs}ms`,
    latencyMs: policyResult.latencyMs,
  });

  // ─── Step B: Evidence Assembly ────────────────────────────────────────
  const evidenceInput: EvidenceAssemblyInput = {
    triageResult,
    policyResearchResult: policyResult.data,
  };
  const evidenceResult = await evidenceAssemblyAgent.run(evidenceInput);
  traces.push(evidenceResult.trace);
  traces.push({
    agent: 'evidence-assembly',
    step: 'evidence_matching',
    timestamp: new Date().toISOString(),
    status: 'completed',
    detail: `Assembled ${evidenceResult.data.totalEvidenceItems} evidence items, strength: ${evidenceResult.data.evidenceStrength}, duplicates removed: ${evidenceResult.data.duplicatesRemoved}`,
    latencyMs: evidenceResult.latencyMs,
  });

  // ─── Step C: Letter Drafting ──────────────────────────────────────────
  await db.case.update({ where: { id: caseId }, data: { state: 'drafting_active' } });

  const draftingInput: LetterDraftingInput = {
    advocateResult,
    triageResult,
    policyResearchResult: policyResult.data,
    evidenceAssemblyResult: evidenceResult.data,
  };
  const draftingResult = await letterDraftingAgent.run(draftingInput);
  traces.push(draftingResult.trace);
  traces.push({
    agent: 'letter-drafting',
    step: 'draft_composition',
    timestamp: new Date().toISOString(),
    status: 'completed',
    detail: `Drafted appeal letter: ${draftingResult.data.wordCount} words, ${draftingResult.data.citationCount} citations, format compliant: ${draftingResult.data.formatCompliant}`,
    latencyMs: draftingResult.latencyMs,
  });

  // ─── Step D: Quality Review ───────────────────────────────────────────
  await db.case.update({ where: { id: caseId }, data: { state: 'quality_review' } });

  const qualityInput: QualityReviewInput = {
    letterDraftingResult: draftingResult.data,
    evidenceAssemblyResult: evidenceResult.data,
    triageResult,
  };
  const qualityResult = await qualityReviewAgent.run(qualityInput);
  traces.push(qualityResult.trace);
  traces.push({
    agent: 'quality-review',
    step: 'adversarial_battery',
    timestamp: new Date().toISOString(),
    status: qualityResult.data.overallVerdict === 'PASS' ? 'completed' : 'blocked',
    detail: `Quality Review: ${qualityResult.data.overallVerdict} (score: ${qualityResult.data.overallScore}), ${qualityResult.data.citationsVerified}/5 citations verified, ${qualityResult.data.unsupportedClaims} unsupported claims, ${qualityResult.data.issues.length} issues`,
    latencyMs: qualityResult.latencyMs,
  });

  // Determine final pipeline status
  const pipelineStatus = qualityResult.data.canProceed ? 'completed' : 'quality_review_failed';

  if (pipelineStatus === 'completed') {
    await db.case.update({ where: { id: caseId }, data: { state: 'hitl_gate_2' } });
    // Create Gate 2
    try {
      await db.hitlGate.create({
        data: {
          case_id: caseId,
          gate_number: 2,
          status: 'pending',
          reviewer_note: `Quality Review PASSED. Appeal draft ready for final review. Score: ${qualityResult.data.overallScore}. Citations: ${qualityResult.data.citationsVerified}/5.`,
        },
      });
    } catch {
      // Non-critical
    }
  }

  // Emit decision trace events to DB
  await emitTraces(caseId, traces);

  return {
    advocate: advocateResult,
    triage: triageResult,
    gate1: { status: 'approved', gateId: gate.id, confirmPrompt: gate.reviewer_note || 'Gate 1 approved' },
    policyResearch: policyResult.data,
    evidenceAssembly: evidenceResult.data,
    letterDrafting: draftingResult.data,
    qualityReview: qualityResult.data,
    pipelineStatus,
    caseId,
    latencyMs: Date.now() - totalStart,
    traces,
  };
}

// ─── Gate Test ─────────────────────────────────────────────────────────────

/**
 * Gate test — verifies the adversarial battery blocks a broken draft.
 * - Good draft: Real pipeline → Quality Review should PASS
 * - Broken draft: Same pipeline but with a fake citation injected → Quality Review should FAIL
 */
export async function runGateTest(
  input: SixAgentPipelineInput,
): Promise<{
  goodDraft: { passed: boolean; verdict: string; score: number; citationsVerified: number };
  brokenDraft: { blocked: boolean; verdict: string; score: number; failedChecks: string[] };
  gateResult: 'PASS' | 'FAIL'; // Gate passes if broken draft IS blocked
}> {
  // Run the full pipeline for the good draft
  const pipelineResult = await runSixAgentPipeline(input);

  // We need to simulate the full pipeline to get a draft
  // Run advocate + triage
  const advocateInput: PatientAdvocateInput = {
    denialText: input.denialText,
    patientContext: input.patientContext,
  };
  const advocateResult = await patientAdvocateAgent.run(advocateInput);
  const triageInput: DenialTriageInput = {
    denialText: input.denialText,
    payer: input.payer,
    advocateResult: advocateResult.data,
  };
  const triageResult = await denialTriageAgent.run(triageInput);

  // Run policy research
  const policyResult = await policyResearchAgent.run({ triageResult: triageResult.data });

  // Run evidence assembly
  const evidenceResult = await evidenceAssemblyAgent.run({
    triageResult: triageResult.data,
    policyResearchResult: policyResult.data,
  });

  // Run letter drafting
  const draftingResult = await letterDraftingAgent.run({
    advocateResult: advocateResult.data,
    triageResult: triageResult.data,
    policyResearchResult: policyResult.data,
    evidenceAssemblyResult: evidenceResult.data,
  });

  // Run quality review on GOOD draft
  const goodQualityResult = await qualityReviewAgent.run({
    letterDraftingResult: draftingResult.data,
    evidenceAssemblyResult: evidenceResult.data,
    triageResult: triageResult.data,
  });

  // Create BROKEN draft by injecting a fake citation
  const brokenDraftingResult: LetterDraftingResult = {
    ...draftingResult.data,
    inlineCitations: [
      ...draftingResult.data.inlineCitations.slice(0, 4),
      {
        number: 5,
        evidenceId: 'FAKE-EVIDENCE-ID-XXX',
        source: 'Nonexistent Source',
        documentName: 'Fake Document',
        contentHash: 'fakehash12345',
        claimText: 'This citation does not resolve to any real document',
        provenanceTier: 'tertiary_commentary',
      },
    ],
    appealLetter: draftingResult.data.appealLetter.replace(
      /\[5\]/g,
      '[5]'
    ) + ' [5]',
  };

  // Run quality review on BROKEN draft
  const brokenQualityResult = await qualityReviewAgent.run({
    letterDraftingResult: brokenDraftingResult,
    evidenceAssemblyResult: evidenceResult.data,
    triageResult: triageResult.data,
  });

  const goodPassed = goodQualityResult.data.overallVerdict === 'PASS';
  const brokenBlocked = brokenQualityResult.data.overallVerdict === 'FAIL';
  const gateResult: 'PASS' | 'FAIL' = brokenBlocked ? 'PASS' : 'FAIL';

  return {
    goodDraft: {
      passed: goodPassed,
      verdict: goodQualityResult.data.overallVerdict,
      score: goodQualityResult.data.overallScore,
      citationsVerified: goodQualityResult.data.citationsVerified,
    },
    brokenDraft: {
      blocked: brokenBlocked,
      verdict: brokenQualityResult.data.overallVerdict,
      score: brokenQualityResult.data.overallScore,
      failedChecks: brokenQualityResult.data.batteryResults
        .filter(br => !br.passed)
        .map(br => br.attackQuestion.slice(0, 60)),
    },
    gateResult,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function buildDefaultTriage(denial: {
  payer?: string;
  reason_code?: string;
  category?: string;
  confidence?: number | null;
} | null): TriageResult {
  return {
    denialJson: {
      payer: denial?.payer || 'Unknown',
      reasonCode: denial?.reason_code || 'UNKNOWN',
      denialType: (denial?.category as string) || 'medical_necessity',
      denialTypeLabel: (denial?.category as string) || 'Medical Necessity',
      category: (denial?.category as string) || 'medical_necessity',
      confidence: denial?.confidence || 0.7,
      cptCodes: [],
      icdCodes: [],
      amountDenied: 0,
      deadline: null,
    },
    classification: {
      isAppealable: true,
      appealStrategy: 'Medical Necessity — cite clinical guidelines',
      estimatedSuccessRate: 0.65,
      keyFactors: ['Clinical guidelines'],
    },
    humanConfirmPrompt: 'Gate 1 default prompt',
  };
}

async function emitTraces(caseId: string, traces: TraceEvent[]): Promise<void> {
  for (const trace of traces) {
    try {
      await db.decisionTraceEvent.create({
        data: {
          case_id: caseId,
          agent_name: trace.agent,
          step: trace.step,
          status: trace.status === 'completed' ? 'completed' : trace.status === 'error' ? 'error' : 'started',
          details: JSON.stringify({
            detail: trace.detail,
            latencyMs: trace.latencyMs,
          }),
        },
      });
    } catch {
      // Non-critical — traces are best-effort
    }
  }
}
