/**
 * DenialDefender — Three-Agent Pipeline (Day 4)
 *
 * Chains: Patient Advocate → Denial Triage → [HITL Gate 1] → Policy Research
 *
 * Pipeline flow:
 * 1. Creates a Case in the DB (state = created)
 * 2. Runs Patient Advocate → updates case state to advocate_active → triage_active
 * 3. Runs Denial Triage → updates case state to hitl_gate_1
 * 4. Creates HITL Gate 1 in DB (status = pending)
 * 5. Returns result with pipelineStatus = 'awaiting_gate1'
 * 6. STOPS HERE — the human must approve Gate 1 before Policy Research runs
 *
 * When resumeAfterGate1 is called:
 * - If approved → runs Policy Research → updates case state to evidence_active → returns full result
 * - If rejected → pipeline stops, case state stays at hitl_gate_1
 */

import { db } from '@/lib/db';
import { patientAdvocateAgent, type PatientAdvocateInput, type AdvocateResult } from './agents/patient-advocate';
import { denialTriageAgent, type DenialTriageInput, type TriageResult } from './agents/denial-triage';
import { policyResearchAgent, type PolicyResearchInput, type PolicyResearchResult } from './agents/policy-research-agent';
import type { TraceEvent } from './agents/base-agent';

// ─── Types ────────────────────────────────────────────────────────────────

export interface ThreeAgentPipelineInput {
  denialText: string;
  payer: string;
  patientContext?: { diagnosis?: string; treatmentHistory?: string };
}

export interface ThreeAgentPipelineResult {
  // Phase 1: Advocate + Triage (always runs)
  advocate: AdvocateResult;
  triage: TriageResult;

  // Gate 1 status
  gate1: {
    status: 'pending' | 'approved' | 'rejected';
    gateId: string | null;
    confirmPrompt: string;
  };

  // Phase 2: Policy Research (only after Gate 1 approved)
  policyResearch: PolicyResearchResult | null;

  // Pipeline metadata
  pipelineStatus: 'awaiting_gate1' | 'gate1_rejected' | 'completed';
  caseId: string | null;
  latencyMs: number;
  traces: TraceEvent[];
}

// ─── Main Pipeline ────────────────────────────────────────────────────────

/**
 * Run the three-agent pipeline up to HITL Gate 1.
 * The pipeline STOPS after triage and waits for human confirmation.
 */
export async function runThreeAgentPipeline(
  input: ThreeAgentPipelineInput,
): Promise<ThreeAgentPipelineResult> {
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
    // Non-critical — pipeline continues
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
    detail: `Urgency: ${advocateResult.data.caseFraming.urgencyLevel}, Deadline: ${advocateResult.data.caseFraming.deadline || 'unknown'}, Actions: ${advocateResult.data.caseFraming.recommendedActions.length}`,
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
    detail: `Type: ${triageResult.data.denialJson.denialType}, Code: ${triageResult.data.denialJson.reasonCode}, Confidence: ${triageResult.data.denialJson.confidence}, Appealable: ${triageResult.data.classification.isAppealable}`,
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
        detail: `Created HITL Gate 1 (${gate.id}) for case ${caseId}. Pipeline STOPPED — awaiting human confirmation.`,
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

  const latencyMs = Date.now() - totalStart;

  // Step 6: Return — pipeline STOPS here
  return {
    advocate: advocateResult.data,
    triage: triageResult.data,
    gate1: {
      status: 'pending',
      gateId,
      confirmPrompt: triageResult.data.humanConfirmPrompt,
    },
    policyResearch: null,
    pipelineStatus: 'awaiting_gate1',
    caseId,
    latencyMs,
    traces,
  };
}

// ─── Resume After Gate 1 ──────────────────────────────────────────────────

/**
 * Resume the pipeline after Gate 1 resolution.
 * - If approved → runs Policy Research → returns full result
 * - If rejected → pipeline stops, case state stays at hitl_gate_1
 */
export async function resumeAfterGate1(
  caseId: string,
  gateStatus: 'approved' | 'rejected',
  cachedTriageResult?: TriageResult,
): Promise<ThreeAgentPipelineResult> {
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
      detail: `Pipeline STOPPED — Gate 1 rejected. Case ${caseId} will not proceed to Policy Research.`,
    });

    // Get the existing denial for triage info
    const denial = await db.denial.findUnique({ where: { case_id: caseId } });

    return {
      advocate: {
        caseFraming: {
          patientSummary: 'Case information from existing record',
          denialImpact: 'Pipeline stopped at Gate 1 — rejection',
          urgencyLevel: 'standard',
          recommendedActions: [],
          deadline: null,
          deadlineDaysRemaining: null,
        },
        empatheticNote: 'The denial classification was rejected. The pipeline will not proceed further.',
      },
      triage: cachedTriageResult || {
        denialJson: {
          payer: denial?.payer || 'Unknown',
          reasonCode: denial?.reason_code || 'UNKNOWN',
          denialType: (denial?.category as string) || 'medical_necessity',
          denialTypeLabel: 'Unknown',
          category: (denial?.category as string) || 'unknown',
          confidence: denial?.confidence || 0,
          cptCodes: [],
          icdCodes: [],
          amountDenied: 0,
          deadline: null,
        },
        classification: {
          isAppealable: true,
          appealStrategy: 'Review denied',
          estimatedSuccessRate: 0,
          keyFactors: [],
        },
        humanConfirmPrompt: 'Gate 1 was rejected',
      },
      gate1: {
        status: 'rejected',
        gateId: gate.id,
        confirmPrompt: gate.reviewer_note || 'Gate 1 rejected',
      },
      policyResearch: null,
      pipelineStatus: 'gate1_rejected',
      caseId,
      latencyMs: Date.now() - totalStart,
      traces,
    };
  }

  // Gate 1 approved → run Policy Research
  traces.push({
    agent: 'pipeline',
    step: 'gate1_approved',
    timestamp: new Date().toISOString(),
    status: 'completed',
    detail: `Gate 1 approved for case ${caseId}. Proceeding to Policy Research.`,
  });

  // Update case state
  await db.case.update({ where: { id: caseId }, data: { state: 'evidence_active' } });

  // Get denial info for triage
  const denial = await db.denial.findUnique({ where: { case_id: caseId } });
  let triageResult: TriageResult = cachedTriageResult || {
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
    humanConfirmPrompt: gate.reviewer_note || 'Gate 1 approved',
  };

  // Run Policy Research
  const policyInput: PolicyResearchInput = {
    triageResult,
  };

  const policyResult = await policyResearchAgent.run(policyInput);
  traces.push(policyResult.trace);
  traces.push({
    agent: 'policy-research',
    step: 'clause_retrieval',
    timestamp: new Date().toISOString(),
    status: 'completed',
    detail: `Retrieved ${policyResult.data.clauses.length} clauses in ${policyResult.data.retrievalLatencyMs}ms (SLA: ${policyResult.data.withinSla ? 'met' : 'missed'})`,
    latencyMs: policyResult.latencyMs,
  });

  // Update case state to evidence_active → triage_complete
  await db.case.update({ where: { id: caseId }, data: { state: 'triage_complete' } });

  // Emit decision trace events to DB
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
      // Non-critical
    }
  }

  return {
    advocate: {
      caseFraming: {
        patientSummary: 'Case information from existing record',
        denialImpact: 'Pipeline proceeding — Gate 1 approved',
        urgencyLevel: 'standard',
        recommendedActions: [],
        deadline: denial?.deadline?.toISOString().split('T')[0] || null,
        deadlineDaysRemaining: null,
      },
      empatheticNote: 'The denial classification was confirmed. Policy Research is now complete.',
    },
    triage: triageResult,
    gate1: {
      status: 'approved',
      gateId: gate.id,
      confirmPrompt: gate.reviewer_note || 'Gate 1 approved',
    },
    policyResearch: policyResult.data,
    pipelineStatus: 'completed',
    caseId,
    latencyMs: Date.now() - totalStart,
    traces,
  };
}
