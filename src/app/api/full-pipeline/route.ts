/**
 * DenialDefender — Full Pipeline API (Day 6)
 *
 * POST /api/full-pipeline — Run pipeline up to Gate 1
 * GET  /api/full-pipeline — Pipeline info + gate requirements
 */

import { NextRequest, NextResponse } from 'next/server';
import { runFullPipeline } from '@/lib/full-pipeline';

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

    const result = await runFullPipeline({ denialText, payer, patientContext });

    return NextResponse.json({
      success: true,
      pipelineStatus: result.pipelineStatus,
      caseId: result.caseId,
      gate1: result.gate1,
      advocate: {
        urgencyLevel: result.advocate.caseFraming.urgencyLevel,
        deadline: result.advocate.caseFraming.deadline,
      },
      triage: {
        denialType: result.triage.denialJson.denialType,
        reasonCode: result.triage.denialJson.reasonCode,
        payer: result.triage.denialJson.payer,
        confidence: result.triage.denialJson.confidence,
        isAppealable: result.triage.classification.isAppealable,
        appealStrategy: result.triage.classification.appealStrategy,
        humanConfirmPrompt: result.triage.humanConfirmPrompt,
      },
      traces: result.structuredTraces,
      traceChecklist: result.traceChecklist,
      latencyMs: result.latencyMs,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    pipeline: 'full-pipeline',
    version: 'day-6',
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
