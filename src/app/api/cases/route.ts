import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/cases - List all cases with their denials and latest trace events
 */
export async function GET() {
  try {
    const cases = await db.case.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        denial: true,
        traces: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
    });

    return NextResponse.json({ cases });
  } catch (error) {
    console.error('[GET /api/cases] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cases' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cases - Create a new empty case (Day 1 gate: empty case round-trip)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
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
        persona: body.persona ?? null,
      },
      include: {
        denial: true,
        traces: true,
        outcomes: true,
        gates: true,
      },
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
