import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/cases/[id]/gates - Get HITL gates for a case
 * Uses Turso directly for Cloud Run (persistent), Prisma for local dev
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { isTurso, getTursoClient } = await import('@/lib/db');

    if (isTurso) {
      const client = await getTursoClient();

      // Verify case exists
      const caseCheck = await client.execute({
        sql: `SELECT id FROM "Case" WHERE id = ?`,
        args: [id],
      });
      if (caseCheck.rows.length === 0) {
        return NextResponse.json({ error: 'Case not found' }, { status: 404 });
      }

      const result = await client.execute({
        sql: `SELECT id, case_id, gate_number, status, reviewer_note, resolved_at, created_at
              FROM "HitlGate" WHERE case_id = ? ORDER BY gate_number ASC`,
        args: [id],
      });

      return NextResponse.json({ gates: result.rows });
    }

    // Fallback: Prisma (local SQLite)
    const { db } = await import('@/lib/db');
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
 * Uses Turso directly for Cloud Run (persistent), Prisma for local dev
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

    const { isTurso, getTursoClient } = await import('@/lib/db');

    if (isTurso) {
      const client = await getTursoClient();

      // Verify case exists
      const caseCheck = await client.execute({
        sql: `SELECT id FROM "Case" WHERE id = ?`,
        args: [id],
      });
      if (caseCheck.rows.length === 0) {
        return NextResponse.json({ error: 'Case not found' }, { status: 404 });
      }

      // Check if a gate already exists for this case + gate_number
      const existingGate = await client.execute({
        sql: `SELECT id, case_id, gate_number, status, reviewer_note, resolved_at, created_at
              FROM "HitlGate" WHERE case_id = ? AND gate_number = ?`,
        args: [id, gateNumber],
      });

      if (existingGate.rows.length > 0) {
        // Resolve existing gate (approve/reject/edit)
        if (!body.status) {
          return NextResponse.json({ error: 'status is required when resolving an existing gate' }, { status: 400 });
        }

        const now = new Date().toISOString();
        await client.execute({
          sql: `UPDATE "HitlGate" SET status = ?, reviewer_note = ?, resolved_at = ? WHERE id = ?`,
          args: [body.status, body.reviewer_note ?? (existingGate.rows[0] as any).reviewer_note, now, (existingGate.rows[0] as any).id],
        });

        const result = await client.execute({
          sql: `SELECT id, case_id, gate_number, status, reviewer_note, resolved_at, created_at
                FROM "HitlGate" WHERE id = ?`,
          args: [(existingGate.rows[0] as any).id],
        });
        return NextResponse.json({ gate: result.rows[0] }, { status: 200 });
      } else {
        // Create a new gate
        const gateId = `gate_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const now = new Date().toISOString();
        await client.execute({
          sql: `INSERT INTO "HitlGate" (id, case_id, gate_number, status, reviewer_note, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [gateId, id, gateNumber, body.status ?? 'pending', body.reviewer_note ?? null, now],
        });

        const result = await client.execute({
          sql: `SELECT id, case_id, gate_number, status, reviewer_note, resolved_at, created_at
                FROM "HitlGate" WHERE id = ?`,
          args: [gateId],
        });
        return NextResponse.json({ gate: result.rows[0] }, { status: 201 });
      }
    }

    // Fallback: Prisma (local SQLite)
    const { db } = await import('@/lib/db');
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
