/**
 * DenialDefender — Full Pipeline with Decision Trace + HITL Gate 2 (Day 6)
 *
 * Extends the six-agent pipeline with:
 * 1. Decision trace streaming — each agent emits structured events → persist → stream via WebSocket
 * 2. HITL Gate 2 — approve/edit/reject the appeal letter with citation cards
 * 3. Version history — edits to the letter are tracked with full version history
 * 4. Triage edit propagation — editing parsed values re-runs Policy Research
 * 5. State machine transitions: REVIEWING → AWAITING_APPROVAL_2 → APPROVED → SUBMITTED
 *
 * Gate: Full workflow completes a case reliably; the trace is auditable.
 */

import { db } from '@/lib/db';
import { patientAdvocateAgent, type PatientAdvocateInput, type AdvocateResult } from './agents/patient-advocate';
import { denialTriageAgent, type DenialTriageInput, type TriageResult } from './agents/denial-triage';
import { policyResearchAgent, type PolicyResearchInput, type PolicyResearchResult } from './agents/policy-research-agent';
import { evidenceAssemblyAgent, type EvidenceAssemblyInput, type EvidenceAssemblyResult } from './agents/evidence-assembly';
import { letterDraftingAgent, type LetterDraftingInput, type LetterDraftingResult } from './agents/letter-drafting';
import { qualityReviewAgent, type QualityReviewInput, type QualityReviewResult } from './agents/quality-review';
import type { TraceEvent } from './agents/base-agent';
import {
  emitTraceEvent,
  emitTraceEvents,
  toStructuredTrace,
  type StructuredTraceEvent,
  type TraceChecklistItem,
  buildTraceChecklist,
} from './decision-trace-stream';
import {
  initVersionHistory,
  addSystemLetterVersion,
  addHumanLetterVersion,
  getCurrentLetterVersion,
  type InlineCitationVersion,
} from './letter-version-history';

// ─── Types ────────────────────────────────────────────────────────────────

export interface FullPipelineInput {
  denialText: string;
  payer: string;
  patientContext?: { diagnosis?: string; treatmentHistory?: string };
}

export interface Gate2Info {
  status: 'pending' | 'approved' | 'rejected';
  gateId: string | null;
  reviewNote: string;
  appealLetter: string;
  citationCount: number;
  qualityScore: number;
}

export interface FullPipelineResult {
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
  gate2: Gate2Info | null;
  pipelineStatus: 'awaiting_gate1' | 'gate1_rejected' | 'quality_review_failed' | 'awaiting_gate2' | 'gate2_rejected' | 'completed';
  caseId: string | null;
  latencyMs: number;
  traces: TraceEvent[];
  structuredTraces: StructuredTraceEvent[];
  traceChecklist: TraceChecklistItem[];
  letterVersion: number;
}

// ─── Main Pipeline (Phase 1: up to Gate 1) ─────────────────────────────────

export async function runFullPipeline(
  input: FullPipelineInput,
): Promise<FullPipelineResult> {
  const totalStart = Date.now();
  const traces: TraceEvent[] = [];
  const structuredTraces: StructuredTraceEvent[] = [];

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
    const se = await emitTraceEvent({
      caseId, agent: 'pipeline', step: 'create_case',
      status: 'completed', detail: `Created case ${caseId} in state 'created'`,
      timestamp: new Date().toISOString(),
    });
    structuredTraces.push(se);
    traces.push({ agent: 'pipeline', step: 'create_case', timestamp: new Date().toISOString(), status: 'completed', detail: se.detail });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    traces.push({ agent: 'pipeline', step: 'create_case', timestamp: new Date().toISOString(), status: 'error', detail: `Failed: ${msg}` });
  }

  // Initialize version history
  if (caseId) {
    initVersionHistory(caseId);
  }

  // Step 2: Run Patient Advocate
  if (caseId) {
    try { await db.case.update({ where: { id: caseId }, data: { state: 'triage_active' } }); } catch { /* non-critical */ }
  }

  const advocateResult = await patientAdvocateAgent.run({
    denialText: input.denialText,
    patientContext: input.patientContext,
  });
  traces.push(advocateResult.trace);
  const advTrace = await emitTraceEvent(toStructuredTrace(caseId || '', {
    agent: 'patient-advocate', step: 'case_framing', timestamp: new Date().toISOString(),
    status: 'completed', detail: `Urgency: ${advocateResult.data.caseFraming.urgencyLevel}, Deadline: ${advocateResult.data.caseFraming.deadline || 'unknown'}`,
    latencyMs: advocateResult.latencyMs,
  }));
  structuredTraces.push(advTrace);

  // Step 3: Run Denial Triage
  const triageResult = await denialTriageAgent.run({
    denialText: input.denialText,
    payer: input.payer,
    advocateResult: advocateResult.data,
  });
  traces.push(triageResult.trace);
  const triTrace = await emitTraceEvent(toStructuredTrace(caseId || '', {
    agent: 'denial-triage', step: 'denial_classification', timestamp: new Date().toISOString(),
    status: 'completed', detail: `Type: ${triageResult.data.denialJson.denialType}, Code: ${triageResult.data.denialJson.reasonCode}, Confidence: ${triageResult.data.denialJson.confidence}`,
    latencyMs: triageResult.latencyMs,
  }));
  structuredTraces.push(triTrace);

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
      traces.push({ agent: 'pipeline', step: 'create_denial_record', timestamp: new Date().toISOString(), status: 'error', detail: `Failed: ${msg}` });
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
      const g1Trace = await emitTraceEvent({
        caseId, agent: 'pipeline', step: 'create_gate1',
        status: 'completed', detail: `Created HITL Gate 1 (${gate.id}). Pipeline STOPPED — awaiting human confirmation.`,
        timestamp: new Date().toISOString(),
      });
      structuredTraces.push(g1Trace);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      traces.push({ agent: 'pipeline', step: 'create_gate1', timestamp: new Date().toISOString(), status: 'error', detail: `Failed: ${msg}` });
    }
  }

  const traceChecklist = buildTraceChecklist(structuredTraces);
  const latencyMs = Date.now() - totalStart;

  return {
    advocate: advocateResult.data,
    triage: triageResult.data,
    gate1: { status: 'pending', gateId, confirmPrompt: triageResult.data.humanConfirmPrompt },
    policyResearch: null,
    evidenceAssembly: null,
    letterDrafting: null,
    qualityReview: null,
    gate2: null,
    pipelineStatus: 'awaiting_gate1',
    caseId,
    latencyMs,
    traces,
    structuredTraces,
    traceChecklist,
    letterVersion: 0,
  };
}

// ─── Resume After Gate 1 (Phase 2: runs all remaining agents) ──────────────

export async function resumeAfterGate1(
  caseId: string,
  gateStatus: 'approved' | 'rejected',
  cachedTriageResult?: TriageResult,
  cachedAdvocateResult?: AdvocateResult,
): Promise<FullPipelineResult> {
  const totalStart = Date.now();
  const traces: TraceEvent[] = [];
  const structuredTraces: StructuredTraceEvent[] = [];

  const caseRecord = await db.case.findUnique({ where: { id: caseId } });
  if (!caseRecord) throw new Error(`Case ${caseId} not found`);

  const gate = await db.hitlGate.findFirst({ where: { case_id: caseId, gate_number: 1 } });
  if (!gate) throw new Error(`Gate 1 not found for case ${caseId}`);

  await db.hitlGate.update({ where: { id: gate.id }, data: { status: gateStatus, resolved_at: new Date() } });
  const g1Trace = await emitTraceEvent({
    caseId, agent: 'pipeline', step: 'resolve_gate1',
    status: 'completed', detail: `Gate 1 resolved as ${gateStatus} for case ${caseId}`,
    timestamp: new Date().toISOString(),
  });
  structuredTraces.push(g1Trace);

  // If rejected, pipeline stops
  if (gateStatus === 'rejected') {
    const stopTrace = await emitTraceEvent({
      caseId, agent: 'pipeline', step: 'pipeline_stopped',
      status: 'blocked', detail: `Pipeline STOPPED — Gate 1 rejected.`,
      timestamp: new Date().toISOString(),
    });
    structuredTraces.push(stopTrace);

    const denial = await db.denial.findUnique({ where: { case_id: caseId } });
    return buildResult(caseId, cachedAdvocateResult, cachedTriageResult, denial, {
      gate1: { status: 'rejected', gateId: gate.id, confirmPrompt: gate.reviewer_note || 'Gate 1 rejected' },
      pipelineStatus: 'gate1_rejected',
      traces, structuredTraces, latencyMs: Date.now() - totalStart,
    });
  }

  // Gate 1 approved → run remaining agents
  const approvalTrace = await emitTraceEvent({
    caseId, agent: 'pipeline', step: 'gate1_approved',
    status: 'completed', detail: `Gate 1 approved. Proceeding to Policy Research → Evidence → Draft → Quality Review.`,
    timestamp: new Date().toISOString(),
  });
  structuredTraces.push(approvalTrace);

  const denial = await db.denial.findUnique({ where: { case_id: caseId } });
  const triageResult: TriageResult = cachedTriageResult || buildDefaultTriage(denial);
  const advocateResult: AdvocateResult = cachedAdvocateResult || buildDefaultAdvocate(denial);

  // ─── Step A: Policy Research ──────────────────────────────────────────
  await db.case.update({ where: { id: caseId }, data: { state: 'evidence_active' } });

  const policyResult = await policyResearchAgent.run({ triageResult });
  traces.push(policyResult.trace);
  const polTrace = await emitTraceEvent(toStructuredTrace(caseId, {
    agent: 'policy-research', step: 'clause_retrieval', timestamp: new Date().toISOString(),
    status: 'completed', detail: `Retrieved ${policyResult.data.clauses.length} clauses in ${policyResult.data.retrievalLatencyMs}ms`,
    latencyMs: policyResult.latencyMs,
    references: policyResult.data.clauses.map(c => c.clauseId),
  }));
  structuredTraces.push(polTrace);

  // ─── Step B: Evidence Assembly ────────────────────────────────────────
  const evidenceResult = await evidenceAssemblyAgent.run({ triageResult, policyResearchResult: policyResult.data });
  traces.push(evidenceResult.trace);
  const evTrace = await emitTraceEvent(toStructuredTrace(caseId, {
    agent: 'evidence-assembly', step: 'evidence_matching', timestamp: new Date().toISOString(),
    status: 'completed', detail: `Assembled ${evidenceResult.data.totalEvidenceItems} evidence items, strength: ${evidenceResult.data.evidenceStrength}, duplicates removed: ${evidenceResult.data.duplicatesRemoved}`,
    latencyMs: evidenceResult.latencyMs,
  }));
  structuredTraces.push(evTrace);

  // ─── Step C: Letter Drafting ──────────────────────────────────────────
  await db.case.update({ where: { id: caseId }, data: { state: 'drafting_active' } });

  const draftingResult = await letterDraftingAgent.run({
    advocateResult, triageResult,
    policyResearchResult: policyResult.data,
    evidenceAssemblyResult: evidenceResult.data,
  });
  traces.push(draftingResult.trace);
  const drTrace = await emitTraceEvent(toStructuredTrace(caseId, {
    agent: 'letter-drafting', step: 'draft_composition', timestamp: new Date().toISOString(),
    status: 'completed', detail: `Drafted appeal letter: ${draftingResult.data.wordCount} words, ${draftingResult.data.citationCount} citations`,
    latencyMs: draftingResult.latencyMs,
  }));
  structuredTraces.push(drTrace);

  // Record letter version
  const letterVersion = addSystemLetterVersion(
    caseId,
    draftingResult.data.appealLetter,
    draftingResult.data.inlineCitations.map(ic => ({
      number: ic.number,
      evidenceId: ic.evidenceId,
      source: ic.source,
      documentName: ic.documentName,
      contentHash: ic.contentHash,
      claimText: ic.claimText,
      provenanceTier: ic.provenanceTier,
    })),
    draftingResult.data.wordCount,
  );

  // ─── Step D: Quality Review ───────────────────────────────────────────
  await db.case.update({ where: { id: caseId }, data: { state: 'quality_review' } });

  const qualityResult = await qualityReviewAgent.run({
    letterDraftingResult: draftingResult.data,
    evidenceAssemblyResult: evidenceResult.data,
    triageResult,
  });
  traces.push(qualityResult.trace);
  const qrTrace = await emitTraceEvent(toStructuredTrace(caseId, {
    agent: 'quality-review', step: 'adversarial_battery', timestamp: new Date().toISOString(),
    status: qualityResult.data.overallVerdict === 'PASS' ? 'completed' : 'blocked',
    detail: `Quality Review: ${qualityResult.data.overallVerdict} (score: ${qualityResult.data.overallScore}), ${qualityResult.data.citationsVerified}/5 citations verified, ${qualityResult.data.unsupportedClaims} unsupported claims`,
    latencyMs: qualityResult.latencyMs,
  }));
  structuredTraces.push(qrTrace);

  // If Quality Review FAILED → pipeline stops
  if (!qualityResult.data.canProceed) {
    const failTrace = await emitTraceEvent({
      caseId, agent: 'pipeline', step: 'quality_review_failed',
      status: 'blocked', detail: `Quality Review FAILED. Pipeline STOPPED. Score: ${qualityResult.data.overallScore}`,
      timestamp: new Date().toISOString(),
    });
    structuredTraces.push(failTrace);

    return {
      advocate: advocateResult,
      triage: triageResult,
      gate1: { status: 'approved', gateId: gate.id, confirmPrompt: gate.reviewer_note || 'Gate 1 approved' },
      policyResearch: policyResult.data,
      evidenceAssembly: evidenceResult.data,
      letterDrafting: draftingResult.data,
      qualityReview: qualityResult.data,
      gate2: null,
      pipelineStatus: 'quality_review_failed',
      caseId,
      latencyMs: Date.now() - totalStart,
      traces,
      structuredTraces,
      traceChecklist: buildTraceChecklist(structuredTraces),
      letterVersion: letterVersion.version,
    };
  }

  // ─── Quality Review PASSED → Create Gate 2 ───────────────────────────
  await db.case.update({ where: { id: caseId }, data: { state: 'hitl_gate_2' } });

  let gate2Id: string | null = null;
  try {
    const gate2 = await db.hitlGate.create({
      data: {
        case_id: caseId,
        gate_number: 2,
        status: 'pending',
        reviewer_note: `Quality Review PASSED (score: ${qualityResult.data.overallScore}). Appeal draft ready for final review. ${qualityResult.data.citationsVerified}/5 citations verified, ${qualityResult.data.unsupportedClaims} unsupported claims.`,
      },
    });
    gate2Id = gate2.id;
    const g2Trace = await emitTraceEvent({
      caseId, agent: 'pipeline', step: 'create_gate2',
      status: 'completed', detail: `Created HITL Gate 2 (${gate2.id}). Pipeline STOPPED — awaiting human approval of appeal.`,
      timestamp: new Date().toISOString(),
    });
    structuredTraces.push(g2Trace);
  } catch {
    // Non-critical
  }

  return {
    advocate: advocateResult,
    triage: triageResult,
    gate1: { status: 'approved', gateId: gate.id, confirmPrompt: gate.reviewer_note || 'Gate 1 approved' },
    policyResearch: policyResult.data,
    evidenceAssembly: evidenceResult.data,
    letterDrafting: draftingResult.data,
    qualityReview: qualityResult.data,
    gate2: {
      status: 'pending',
      gateId: gate2Id,
      reviewNote: `Quality Review PASSED. Appeal ready for final review. Score: ${qualityResult.data.overallScore}`,
      appealLetter: draftingResult.data.appealLetter,
      citationCount: draftingResult.data.citationCount,
      qualityScore: qualityResult.data.overallScore,
    },
    pipelineStatus: 'awaiting_gate2',
    caseId,
    latencyMs: Date.now() - totalStart,
    traces,
    structuredTraces,
    traceChecklist: buildTraceChecklist(structuredTraces),
    letterVersion: letterVersion.version,
  };
}

// ─── Resolve Gate 2 ────────────────────────────────────────────────────────

export async function resolveGate2(
  caseId: string,
  resolution: 'approved' | 'rejected',
  editedLetter?: string,
  editReason?: string,
): Promise<{
  success: boolean;
  newState: string;
  letterVersion: number;
  gate2Status: string;
}> {
  const gate2 = await db.hitlGate.findFirst({ where: { case_id: caseId, gate_number: 2 } });
  if (!gate2) throw new Error(`Gate 2 not found for case ${caseId}`);

  await db.hitlGate.update({
    where: { id: gate2.id },
    data: {
      status: resolution === 'approved' ? 'approved' : 'rejected',
      resolved_at: new Date(),
      reviewer_note: editReason || (resolution === 'approved' ? 'Appeal approved by human reviewer' : 'Appeal rejected by human reviewer'),
    },
  });

  await emitTraceEvent({
    caseId, agent: 'pipeline', step: `resolve_gate2_${resolution}`,
    status: 'completed', detail: `Gate 2 resolved as ${resolution} for case ${caseId}`,
    timestamp: new Date().toISOString(),
  });

  // If letter was edited, record a new version
  let letterVersion = 0;
  if (editedLetter) {
    const currentVersion = getCurrentLetterVersion(caseId);
    const version = addHumanLetterVersion(
      caseId,
      editedLetter,
      currentVersion?.inlineCitations || [],
      editedLetter.split(/\s+/).filter(w => w.length > 0).length,
      editReason || 'Human edit before approval',
    );
    letterVersion = version.version;
  } else {
    const currentVersion = getCurrentLetterVersion(caseId);
    letterVersion = currentVersion?.version || 1;
  }

  // Update case state
  if (resolution === 'approved') {
    await db.case.update({ where: { id: caseId }, data: { state: 'approved' } });
    await emitTraceEvent({
      caseId, agent: 'pipeline', step: 'state_approved',
      status: 'completed', detail: `Case ${caseId} state: hitl_gate_2 → approved`,
      timestamp: new Date().toISOString(),
    });
    return { success: true, newState: 'approved', letterVersion, gate2Status: 'approved' };
  } else {
    await db.case.update({ where: { id: caseId }, data: { state: 'hitl_gate_2' } });
    await emitTraceEvent({
      caseId, agent: 'pipeline', step: 'gate2_rejected',
      status: 'blocked', detail: `Gate 2 rejected for case ${caseId}. Appeal requires revision.`,
      timestamp: new Date().toISOString(),
    });
    return { success: false, newState: 'hitl_gate_2', letterVersion, gate2Status: 'rejected' };
  }
}

// ─── Submit Appeal (after Gate 2 approval) ─────────────────────────────────

export async function submitAppeal(caseId: string): Promise<{ success: boolean; newState: string }> {
  const caseRecord = await db.case.findUnique({ where: { id: caseId } });
  if (!caseRecord) throw new Error(`Case ${caseId} not found`);
  if (caseRecord.state !== 'approved') throw new Error(`Case must be in 'approved' state to submit. Current: ${caseRecord.state}`);

  await db.case.update({ where: { id: caseId }, data: { state: 'submitted' } });
  await emitTraceEvent({
    caseId, agent: 'pipeline', step: 'submit_appeal',
    status: 'completed', detail: `Appeal submitted for case ${caseId}`,
    timestamp: new Date().toISOString(),
  });

  return { success: true, newState: 'submitted' };
}

// ─── Triage Edit → Re-run Policy Research ─────────────────────────────────

export async function editTriageAndRerun(
  caseId: string,
  field: string,
  oldValue: string,
  newValue: string,
  currentTriageResult: TriageResult,
): Promise<{
  updatedTriage: TriageResult;
  newPolicyResearch: PolicyResearchResult;
  traceEvent: StructuredTraceEvent;
}> {
  const { recordTriageEdit } = await import('./letter-version-history');
  recordTriageEdit(caseId, field, oldValue, newValue);

  // Apply the edit to triage result
  const updatedTriage: TriageResult = { ...currentTriageResult };
  switch (field) {
    case 'payer':
      updatedTriage.denialJson = { ...updatedTriage.denialJson, payer: newValue };
      break;
    case 'reasonCode':
      updatedTriage.denialJson = { ...updatedTriage.denialJson, reasonCode: newValue };
      break;
    case 'denialType':
      updatedTriage.denialJson = { ...updatedTriage.denialJson, denialType: newValue, denialTypeLabel: newValue, category: newValue };
      break;
  }

  // Re-run Policy Research with updated context
  const newPolicyResult = await policyResearchAgent.run({ triageResult: updatedTriage });

  const traceEvent = await emitTraceEvent({
    caseId, agent: 'policy-research', step: 'rerun_after_edit',
    status: 'completed', detail: `Re-ran Policy Research after triage edit "${field}": "${oldValue}" → "${newValue}". Retrieved ${newPolicyResult.data.clauses.length} clauses.`,
    timestamp: new Date().toISOString(),
    latencyMs: newPolicyResult.latencyMs,
    references: newPolicyResult.data.clauses.map(c => c.clauseId),
    metadata: { field, oldValue, newValue },
  });

  return { updatedTriage, newPolicyResearch: newPolicyResult.data, traceEvent };
}

// ─── Gate Test ─────────────────────────────────────────────────────────────

export async function runDay6GateTest(
  input: FullPipelineInput,
): Promise<{
  fullWorkflowCompleted: boolean;
  traceEventCount: number;
  bothGatesWorking: boolean;
  gate1BlocksPipeline: boolean;
  gate2BlocksSubmission: boolean;
  traceAuditable: boolean;
  traceChecklist: TraceChecklistItem[];
  gateResult: 'PASS' | 'FAIL';
}> {
  // Run the full pipeline up to Gate 1
  const phase1 = await runFullPipeline(input);
  const caseId = phase1.caseId!;

  // Gate 1 should block the pipeline
  const gate1BlocksPipeline = phase1.pipelineStatus === 'awaiting_gate1';

  // Resume with approval → runs all remaining agents → creates Gate 2
  const phase2 = await resumeAfterGate1(caseId, 'approved');
  const fullWorkflowCompleted = phase2.pipelineStatus === 'awaiting_gate2';

  // Count trace events (combine both phases)
  const traceEventCount = phase1.structuredTraces.length + phase2.structuredTraces.length;

  // Verify Gate 2 blocks submission (case should be in hitl_gate_2 state)
  const caseAfterPhase2 = await db.case.findUnique({ where: { id: caseId } });
  const gate2BlocksSubmission = caseAfterPhase2?.state === 'hitl_gate_2';

  // Resolve Gate 2 with approval
  if (phase2.gate2?.gateId) {
    await resolveGate2(caseId, 'approved');
  }
  const caseAfterApproval = await db.case.findUnique({ where: { id: caseId } });
  const bothGatesWorking = gate1BlocksPipeline && fullWorkflowCompleted && gate2BlocksSubmission && caseAfterApproval?.state === 'approved';

  // Verify trace is auditable (structured events, not free text)
  const allTraces = [...phase1.structuredTraces, ...phase2.structuredTraces];
  const traceAuditable = allTraces.every(e =>
    typeof e.agent === 'string' &&
    typeof e.step === 'string' &&
    ['started', 'completed', 'error', 'blocked'].includes(e.status)
  );

  const gateResult: 'PASS' | 'FAIL' = bothGatesWorking && traceAuditable && traceEventCount >= 7 ? 'PASS' : 'FAIL';

  return {
    fullWorkflowCompleted,
    traceEventCount,
    bothGatesWorking,
    gate1BlocksPipeline,
    gate2BlocksSubmission,
    traceAuditable,
    traceChecklist: buildTraceChecklist([...phase1.structuredTraces, ...phase2.structuredTraces]),
    gateResult,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function buildDefaultTriage(denial: { payer?: string; reason_code?: string; category?: string; confidence?: number | null; } | null): TriageResult {
  return {
    denialJson: {
      payer: denial?.payer || 'Unknown', reasonCode: denial?.reason_code || 'UNKNOWN',
      denialType: (denial?.category as string) || 'medical_necessity',
      denialTypeLabel: (denial?.category as string) || 'Medical Necessity',
      category: (denial?.category as string) || 'medical_necessity',
      confidence: denial?.confidence || 0.7, cptCodes: [], icdCodes: [], amountDenied: 0, deadline: null,
    },
    classification: { isAppealable: true, appealStrategy: 'Medical Necessity — cite clinical guidelines', estimatedSuccessRate: 0.65, keyFactors: ['Clinical guidelines'] },
    humanConfirmPrompt: 'Gate 1 default prompt',
  };
}

function buildDefaultAdvocate(denial: { payer?: string; deadline?: Date | null; } | null): AdvocateResult {
  return {
    caseFraming: {
      patientSummary: 'Case information from existing record', denialImpact: 'Pipeline proceeding — Gate 1 approved',
      urgencyLevel: 'standard', recommendedActions: [],
      deadline: denial?.deadline?.toISOString().split('T')[0] || null, deadlineDaysRemaining: null,
    },
    empatheticNote: 'The denial classification was confirmed.',
  };
}

function buildResult(
  caseId: string,
  cachedAdvocateResult: AdvocateResult | undefined,
  cachedTriageResult: TriageResult | undefined,
  denial: { payer?: string; reason_code?: string; category?: string; confidence?: number | null; } | null,
  extra: {
    gate1: { status: 'rejected'; gateId: string | null; confirmPrompt: string };
    pipelineStatus: 'gate1_rejected';
    traces: TraceEvent[];
    structuredTraces: StructuredTraceEvent[];
    latencyMs: number;
  },
): FullPipelineResult {
  return {
    advocate: cachedAdvocateResult || buildDefaultAdvocate(denial),
    triage: cachedTriageResult || buildDefaultTriage(denial),
    gate1: extra.gate1,
    policyResearch: null, evidenceAssembly: null, letterDrafting: null, qualityReview: null, gate2: null,
    pipelineStatus: extra.pipelineStatus,
    caseId,
    latencyMs: extra.latencyMs,
    traces: extra.traces,
    structuredTraces: extra.structuredTraces,
    traceChecklist: buildTraceChecklist(extra.structuredTraces),
    letterVersion: 0,
  };
}
