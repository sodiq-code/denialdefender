import { NextRequest, NextResponse } from 'next/server';
import { runThreeAgentPipeline } from '@/lib/three-agent-pipeline';
import { SAMPLE_DENIAL_LETTERS } from '@/lib/vertical-slice-agent';

/**
 * POST /api/three-agent-pipeline — Run the three-agent pipeline
 * (Advocate → Triage → Gate 1 → STOPS)
 *
 * Input: { denialText, payer, patientContext? }
 * Returns: ThreeAgentPipelineResult with pipelineStatus: 'awaiting_gate1'
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

    const result = await runThreeAgentPipeline({
      denialText: body.denialText,
      payer: body.payer,
      patientContext: body.patientContext || undefined,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[POST /api/three-agent-pipeline] Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Pipeline execution failed: ${msg}` },
      { status: 500 },
    );
  }
}

/**
 * GET /api/three-agent-pipeline — Returns pipeline info and sample data
 */
export async function GET() {
  return NextResponse.json({
    pipeline: 'three-agent',
    version: 'day-4',
    agents: [
      { name: 'patient-advocate', description: 'Empathetic intake and case framing' },
      { name: 'denial-triage', description: 'Denial classification and structured JSON' },
      { name: 'policy-research', description: 'Policy clause retrieval with provenance' },
    ],
    flow: 'Advocate → Triage → [HITL Gate 1] → Policy Research',
    gateStructure: {
      gate1: {
        name: 'Confirm Denial',
        description: 'Human reviews triage result and confirms/rejects the denial classification',
        blocksUntil: 'Policy Research Agent',
      },
    },
    caseStates: [
      'created → advocate_active → triage_active → hitl_gate_1 → [human confirms] → evidence_active → triage_complete',
    ],
    samples: SAMPLE_DENIAL_LETTERS.map(s => ({
      id: s.id,
      label: s.label,
      payer: s.payer,
    })),
  });
}
