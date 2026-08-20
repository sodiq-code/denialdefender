import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/cases/[id] - Get a single case with denial, outcomes, and trace events
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caseData = await db.case.findUnique({
      where: { id },
      include: {
        denial: true,
        outcomes: { orderBy: { recorded_at: 'desc' } },
        traces: { orderBy: { timestamp: 'desc' } },
        gates: { orderBy: { created_at: 'desc' } },
      },
    });

    if (!caseData) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    return NextResponse.json({ case: caseData });
  } catch (error: any) {
    console.error('[GET /api/cases/[id]] Error:', error?.message || error);
    return NextResponse.json(
      { error: 'Failed to fetch case', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/cases/[id] - Update case state
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.case.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.state !== undefined) updateData.state = body.state;
    if (body.deadline !== undefined) updateData.deadline = body.deadline ? new Date(body.deadline) : null;
    if (body.persona !== undefined) updateData.persona = body.persona;

    const updatedCase = await db.case.update({
      where: { id },
      data: updateData,
      include: { denial: true, outcomes: true, traces: true, gates: true },
    });

    return NextResponse.json({ case: updatedCase });
  } catch (error: any) {
    console.error('[PATCH /api/cases/[id]] Error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to update case', detail: error?.message || String(error) }, { status: 500 });
  }
}
