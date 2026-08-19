import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/cases - List all cases with denial info
 */
export async function GET() {
  try {
    const cases = await db.case.findMany({
      include: { denial: true },
      orderBy: { created_at: 'desc' },
      take: 200,
    });

    return NextResponse.json({ cases, total: cases.length });
  } catch (error) {
    console.error('[GET /api/cases] Error:', error);
    return NextResponse.json({ cases: [], total: 0 });
  }
}

/**
 * POST /api/cases - Create a new case
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.patient_id) {
      return NextResponse.json(
        { error: 'patient_id is required' },
        { status: 400 }
      );
    }

    const newCase = await db.case.create({
      data: {
        patient_id: body.patient_id,
        state: 'created',
        deadline: body.deadline ? new Date(body.deadline) : null,
        persona: body.persona || null,
      },
      include: { denial: true, traces: true, outcomes: true, gates: true },
    });

    return NextResponse.json({ case: newCase }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/cases] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create case' },
      { status: 500 }
    );
  }
}
