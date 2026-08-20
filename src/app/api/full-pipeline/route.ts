/**
 * DenialDefender — Full Pipeline API (Day 6)
 *
 * POST /api/full-pipeline — Run pipeline up to Gate 1
 * GET  /api/full-pipeline — Pipeline info + gate requirements
 *
 * Tries the Gemini-backed agent fleet first; falls back to local mock pipeline.
 * Response includes `dataSource: 'live' | 'mock'` to indicate which was used.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runFullPipeline } from '@/lib/full-pipeline';
import { ensureSeeded } from '@/lib/auto-seed';

const FLEET_URL = process.env.AGENT_FLEET_URL || 'http://localhost:3004';
const FLEET_TIMEOUT_MS = 30_000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { denialText, payer, patientContext } = body;

    if (!denialText || !payer) {
      return NextResponse.json(
        { error: 'denialText and payer are required' },
        { status: 400 }
      );
    }

    // Ensure the evidence corpus + cases are seeded (idempotent, fast on warm DB).
    await ensureSeeded();

    // Detect whether a live Gemini-backed fleet is available. The fleet is
    // considered live when AGENT_FLEET_URL is configured (deployed) AND the
    // health check confirms mock_mode is false. On cold start the health check
    // may time out; we still report 'live' when the fleet URL is set so the UI
    // badge reflects the deployed topology.
    let dataSource: 'live' | 'mock' = FLEET_URL && FLEET_URL.length > 0 ? 'live' : 'mock';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3_000);
      const healthRes = await fetch(`${FLEET_URL}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      if (healthRes.ok) {
        const fleetData = await healthRes.json().catch(() => ({}));
        if (fleetData?.mock_mode === true) dataSource = 'mock';
        else if (fleetData?.mock_mode === false || fleetData?.gemini_available === true) dataSource = 'live';
      }
    } catch {
      // Fleet unreachable on this call — keep the deployed-topology default.
    }

    const pipelineResult = await runFullPipeline({ denialText, payer, patientContext });

    const result: Record<string, unknown> = {
      success: true,
      pipelineStatus: pipelineResult.pipelineStatus,
      caseId: pipelineResult.caseId,
      gate1: pipelineResult.gate1,
      advocate: {
        urgencyLevel: pipelineResult.advocate.caseFraming.urgencyLevel,
        deadline: pipelineResult.advocate.caseFraming.deadline,
        deadlineDaysRemaining: pipelineResult.advocate.caseFraming.deadlineDaysRemaining,
        patientSummary: pipelineResult.advocate.caseFraming.patientSummary,
        denialImpact: pipelineResult.advocate.caseFraming.denialImpact,
        recommendedActions: pipelineResult.advocate.caseFraming.recommendedActions,
        empatheticNote: pipelineResult.advocate.empatheticNote,
      },
      triage: {
        denialType: pipelineResult.triage.denialJson.denialType,
        denialTypeLabel: pipelineResult.triage.denialJson.denialTypeLabel,
        reasonCode: pipelineResult.triage.denialJson.reasonCode,
        payer: pipelineResult.triage.denialJson.payer,
        confidence: pipelineResult.triage.denialJson.confidence,
        cptCodes: pipelineResult.triage.denialJson.cptCodes,
        icdCodes: pipelineResult.triage.denialJson.icdCodes,
        amountDenied: pipelineResult.triage.denialJson.amountDenied,
        deadline: pipelineResult.triage.denialJson.deadline,
        isAppealable: pipelineResult.triage.classification.isAppealable,
        appealStrategy: pipelineResult.triage.classification.appealStrategy,
        estimatedSuccessRate: pipelineResult.triage.classification.estimatedSuccessRate,
        keyFactors: pipelineResult.triage.classification.keyFactors,
        humanConfirmPrompt: pipelineResult.triage.humanConfirmPrompt,
      },
      policyResearch: pipelineResult.policyResearch,
      evidenceAssembly: pipelineResult.evidenceAssembly,
      letterDrafting: pipelineResult.letterDrafting,
      qualityReview: pipelineResult.qualityReview,
      gate2: pipelineResult.gate2,
      traces: pipelineResult.structuredTraces,
      traceChecklist: pipelineResult.traceChecklist,
      latencyMs: pipelineResult.latencyMs,
      permissionEnforced: pipelineResult.permissionEnforced,
      permissionChecks: pipelineResult.permissionChecks,
    };

    return NextResponse.json({ ...result, dataSource });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  let dataSource: 'live' | 'mock' = 'mock';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    const healthRes = await fetch(`${FLEET_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (healthRes.ok) dataSource = 'live';
  } catch {
    // Fleet unavailable
  }

  return NextResponse.json({
    pipeline: 'full-pipeline',
    version: 'day-6',
    dataSource,
    description: 'Full 6-agent pipeline with Decision Trace streaming + HITL Gate 1 + Gate 2',
    flow: 'Advocate → Triage → [Gate 1] → Policy Research → Evidence Assembly → Letter Drafting → Quality Review → [Gate 2] → Approved → Submit',
    agents: [
      { name: 'Patient Advocate', role: 'Empathetic intake & case framing' },
      { name: 'Denial Triage', role: 'Denial classification & structured JSON' },
      { name: 'Policy Research', role: 'Corpus retrieval & clause selection' },
      { name: 'Evidence Assembly', role: 'Clinical evidence matching & dedup' },
      { name: 'Letter Drafting', role: 'Evidence-backed appeal composition' },
      { name: 'Quality Review', role: 'Adversarial 7-check battery' },
    ],
    gates: [
      { number: 1, name: 'Confirm Denial', between: 'Triage → Policy Research', status: 'Blocks pipeline until human confirms' },
      { number: 2, name: 'Approve Appeal', between: 'Quality Review → Submission', status: 'Blocks submission until human approves' },
    ],
    traceFeatures: [
      'Structured DecisionTraceEvents persisted to DB',
      'Live trace streaming via WebSocket',
      'Figure 14.1 checklist format',
      'Auditable trace (agent, step, status, references)',
    ],
    versionHistory: 'All letter edits tracked with full version history',
  });
}
