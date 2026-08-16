import { NextRequest, NextResponse } from 'next/server';
import { resumeAfterGate1 } from '@/lib/three-agent-pipeline';

/**
 * POST /api/three-agent-pipeline/resume — Resume pipeline after Gate 1
 *
 * Input: { caseId, gateStatus: 'approved' | 'rejected', triageResult? }
 * - If approved → runs Policy Research → returns full result
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

    const result = await resumeAfterGate1(
      body.caseId,
      body.gateStatus,
      body.triageResult || undefined,
    );

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[POST /api/three-agent-pipeline/resume] Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Resume failed: ${msg}` },
      { status: 500 },
    );
  }
}
