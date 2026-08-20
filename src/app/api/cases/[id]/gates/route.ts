import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/cases/[id]/gates - Get HITL gates for a case
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const caseExists = await db.case.findUnique({ where: { id } });
    if (!caseExists) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const gates = await db.hitlGate.findMany({
      where: { case_id: id },
      orderBy: { gate_number: 'asc' },
    });

    return NextResponse.json({ gates });
  } catch (error) {
    console.error('[GET /api/cases/[id]/gates] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch gates' }, { status: 500 });
  }
}

/**
 * POST /api/cases/[id]/gates - Create or resolve a HITL gate (approve/reject/edit)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Validate required fields
    if (body.gate_number === undefined || body.gate_number === null) {
      return NextResponse.json({ error: 'gate_number is required (1 or 2)' }, { status: 400 });
    }

    const gateNumber = Number(body.gate_number);
    if (gateNumber !== 1 && gateNumber !== 2) {
      return NextResponse.json({ error: 'gate_number must be 1 or 2' }, { status: 400 });
    }

    const caseExists = await db.case.findUnique({ where: { id } });
    if (!caseExists) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const existingGate = await db.hitlGate.findFirst({
      where: { case_id: id, gate_number: gateNumber },
    });

    let gate;
    if (existingGate) {
      if (!body.status) {
        return NextResponse.json({ error: 'status is required when resolving an existing gate' }, { status: 400 });
      }
      gate = await db.hitlGate.update({
        where: { id: existingGate.id },
        data: {
          status: body.status,
          reviewer_note: body.reviewer_note ?? existingGate.reviewer_note,
          resolved_at: new Date(),
        },
      });
    } else {
      gate = await db.hitlGate.create({
        data: {
          case_id: id,
          gate_number: gateNumber,
          status: body.status ?? 'pending',
          reviewer_note: body.reviewer_note ?? null,
        },
      });
    }

    return NextResponse.json({ gate }, { status: existingGate ? 200 : 201 });
  } catch (error) {
    console.error('[POST /api/cases/[id]/gates] Error:', error);
    return NextResponse.json({ error: 'Failed to create/resolve gate' }, { status: 500 });
  }
}
