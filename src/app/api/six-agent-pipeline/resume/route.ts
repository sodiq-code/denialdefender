import { NextRequest, NextResponse } from 'next/server';
import { resumeSixAgentPipeline } from '@/lib/six-agent-pipeline';

/**
 * POST /api/six-agent-pipeline/resume — Resume pipeline after Gate 1
 *
 * Input: { caseId, gateStatus: 'approved' | 'rejected', triageResult?, advocateResult? }
 * - If approved → runs Policy Research → Evidence → Draft → Quality Review
 * - If rejected → returns rejected result
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.caseId || typeof body.caseId !== 'string') {
      return NextResponse.json(
        { error: 'caseId is required and must be a string' },
        { status: 400 },
      );
    }

    if (body.gateStatus !== 'approved' && body.gateStatus !== 'rejected') {
      return NextResponse.json(
        { error: 'gateStatus must be "approved" or "rejected"' },
        { status: 400 },
      );
    }

    const result = await resumeSixAgentPipeline(
      body.caseId,
      body.gateStatus,
      body.triageResult || undefined,
      body.advocateResult || undefined,
    );

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[POST /api/six-agent-pipeline/resume] Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Resume failed: ${msg}` },
      { status: 500 },
    );
  }
}
