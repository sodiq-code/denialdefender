import { NextRequest, NextResponse } from 'next/server';
import { runSixAgentPipeline } from '@/lib/six-agent-pipeline';

/**
 * POST /api/six-agent-pipeline — Run the six-agent pipeline
 * (Advocate → Triage → Gate 1 → STOPS)
 *
 * Input: { denialText, payer, patientContext? }
 * Returns: SixAgentPipelineResult with pipelineStatus: 'awaiting_gate1'
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.denialText || typeof body.denialText !== 'string') {
      return NextResponse.json(
        { error: 'denialText is required and must be a string' },
        { status: 400 },
      );
    }

    if (!body.payer || typeof body.payer !== 'string') {
      return NextResponse.json(
        { error: 'payer is required and must be a string' },
        { status: 400 },
      );
    }

    const result = await runSixAgentPipeline({
      denialText: body.denialText,
      payer: body.payer,
      patientContext: body.patientContext || undefined,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[POST /api/six-agent-pipeline] Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Pipeline execution failed: ${msg}` },
      { status: 500 },
    );
  }
}

/**
 * GET /api/six-agent-pipeline — Returns pipeline info
 */
export async function GET() {
  return NextResponse.json({
    pipeline: 'six-agent',
    version: 'day-5',
    agents: [
      { name: 'patient-advocate', description: 'Empathetic intake and case framing', order: 1 },
      { name: 'denial-triage', description: 'Denial classification and structured JSON', order: 2 },
      { name: 'policy-research', description: 'Policy clause retrieval with provenance', order: 3 },
      { name: 'evidence-assembly', description: 'Clinical evidence matching and deduplication', order: 4 },
      { name: 'letter-drafting', description: 'Evidence-backed appeal draft with inline citations', order: 5 },
      { name: 'quality-review', description: 'Adversarial 7-check battery from Table 15.1', order: 6 },
    ],
    flow: 'Advocate → Triage → [HITL Gate 1] → Policy Research → Evidence Assembly → Letter Drafting → Quality Review',
    gates: {
      gate1: { name: 'Confirm Denial', blocksUntil: 'Policy Research Agent' },
      gate2: { name: 'Approve Final Appeal', blocksUntil: 'Submission' },
    },
    adversarialBattery: [
      { question: 'Citation Resolution', passCondition: 'All citations resolve + hash matches' },
      { question: 'Claim Tracing', passCondition: 'Every claim traced to a span' },
      { question: 'Policy Support', passCondition: 'Clause semantics checked' },
      { question: 'Deadline Verification', passCondition: 'Deadline recomputed independently' },
      { question: 'No Medical Advice', passCondition: 'No diagnostic / prescriptive language' },
      { question: 'No Overclaims', passCondition: 'Zero overclaims' },
      { question: 'Format Compliance', passCondition: 'Format verified' },
    ],
    caseStates: [
      'created → triage_active → hitl_gate_1 → [human confirms] → evidence_active → drafting_active → quality_review → hitl_gate_2',
    ],
  });
}
