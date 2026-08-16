import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/cases - List all cases with denial info
 * Uses Turso directly for Cloud Run (persistent), Prisma for local dev
 */
export async function GET() {
  try {
    const { isTurso, getTursoClient } = await import('@/lib/db');

    if (isTurso) {
      const client = await getTursoClient();
      const result = await client.execute(
        `SELECT c.id, c.patient_id, c.state, c.deadline, c.persona, c.created_at, c.updated_at,
                d.payer, d.reason_code, d.category, d.confidence
         FROM "Case" c LEFT JOIN "Denial" d ON d.case_id = c.id
         ORDER BY c.created_at DESC LIMIT 200`
      );

      const cases = result.rows.map((row: any) => ({
        id: row.id,
        patient_id: row.patient_id,
        state: row.state,
        deadline: row.deadline,
        persona: row.persona,
        created_at: row.created_at,
        updated_at: row.updated_at,
        denial: row.payer ? {
          payer: row.payer,
          reason_code: row.reason_code,
          category: row.category,
          confidence: row.confidence,
        } : null,
      }));

      return NextResponse.json({ cases, total: cases.length });
    }

    // Fallback: Prisma (local SQLite)
    const { db } = await import('@/lib/db');
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

    const { isTurso, getTursoClient } = await import('@/lib/db');

    if (isTurso) {
      const client = await getTursoClient();
      const id = `case_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();

      await client.execute({
        sql: `INSERT INTO "Case" (id, patient_id, state, deadline, persona, created_at, updated_at)
              VALUES (?, ?, 'created', ?, ?, ?, ?)`,
        args: [id, body.patient_id, body.deadline || null, body.persona || null, now, now],
      });

      // Fetch the created case
      const result = await client.execute({
        sql: `SELECT c.*, d.payer, d.reason_code, d.category, d.confidence
              FROM "Case" c LEFT JOIN "Denial" d ON d.case_id = c.id
              WHERE c.id = ?`,
        args: [id],
      });

      const caseData = result.rows[0] as any;
      return NextResponse.json({
        case: {
          ...caseData,
          denial: caseData?.payer ? { payer: caseData.payer, reason_code: caseData.reason_code, category: caseData.category, confidence: caseData.confidence } : null,
          traces: [],
          outcomes: [],
          gates: [],
        }
      }, { status: 201 });
    }

    // Fallback: Prisma (local SQLite)
    const { db } = await import('@/lib/db');
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
