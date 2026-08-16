import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/cases/[id]/denial - Get denial for a case
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
      const result = await client.execute({
        sql: `SELECT id, case_id, payer, reason_code, category, denial_letter_text, deadline, confidence, structured_json, created_at
              FROM "Denial" WHERE case_id = ?`,
        args: [id],
      });

      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Denial not found for this case' }, { status: 404 });
      }

      return NextResponse.json({ denial: result.rows[0] });
    }

    // Fallback: Prisma (local SQLite)
    const { db } = await import('@/lib/db');
    const denial = await db.denial.findUnique({ where: { case_id: id } });
    if (!denial) {
      return NextResponse.json({ error: 'Denial not found for this case' }, { status: 404 });
    }
    return NextResponse.json({ denial });
  } catch (error) {
    console.error('[GET /api/cases/[id]/denial] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch denial' }, { status: 500 });
  }
}

/**
 * POST /api/cases/[id]/denial - Create or update denial for a case
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
    if (!body.payer) return NextResponse.json({ error: 'payer is required' }, { status: 400 });
    if (!body.reason_code) return NextResponse.json({ error: 'reason_code is required' }, { status: 400 });
    if (!body.category) return NextResponse.json({ error: 'category is required' }, { status: 400 });
    if (!body.denial_letter_text) return NextResponse.json({ error: 'denial_letter_text is required' }, { status: 400 });

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

      // Check if denial already exists
      const existingDenial = await client.execute({
        sql: `SELECT id FROM "Denial" WHERE case_id = ?`,
        args: [id],
      });

      const now = new Date().toISOString();
      const deadline = body.deadline || null;
      const confidence = body.confidence ?? null;
      const structuredJson = body.structured_json ? JSON.stringify(body.structured_json) : null;

      if (existingDenial.rows.length > 0) {
        // Update existing denial
        await client.execute({
          sql: `UPDATE "Denial" SET payer = ?, reason_code = ?, category = ?, denial_letter_text = ?,
                deadline = ?, confidence = ?, structured_json = ? WHERE case_id = ?`,
          args: [body.payer, body.reason_code, body.category, body.denial_letter_text,
                 deadline, confidence, structuredJson, id],
        });

        const result = await client.execute({
          sql: `SELECT id, case_id, payer, reason_code, category, denial_letter_text, deadline, confidence, structured_json, created_at
                FROM "Denial" WHERE case_id = ?`,
          args: [id],
        });
        return NextResponse.json({ denial: result.rows[0] }, { status: 200 });
      } else {
        // Create new denial
        const denialId = `denial_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        await client.execute({
          sql: `INSERT INTO "Denial" (id, case_id, payer, reason_code, category, denial_letter_text, deadline, confidence, structured_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [denialId, id, body.payer, body.reason_code, body.category, body.denial_letter_text,
                 deadline, confidence, structuredJson, now],
        });

        const result = await client.execute({
          sql: `SELECT id, case_id, payer, reason_code, category, denial_letter_text, deadline, confidence, structured_json, created_at
                FROM "Denial" WHERE id = ?`,
          args: [denialId],
        });
        return NextResponse.json({ denial: result.rows[0] }, { status: 201 });
      }
    }

    // Fallback: Prisma (local SQLite)
    const { db } = await import('@/lib/db');
    const caseExists = await db.case.findUnique({ where: { id } });
    if (!caseExists) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const existingDenial = await db.denial.findUnique({ where: { case_id: id } });

    const denialData = {
      payer: body.payer,
      reason_code: body.reason_code,
      category: body.category,
      denial_letter_text: body.denial_letter_text,
      deadline: body.deadline ? new Date(body.deadline) : null,
      confidence: body.confidence ?? null,
      structured_json: body.structured_json ? JSON.stringify(body.structured_json) : null,
    };

    let denial;
    if (existingDenial) {
      denial = await db.denial.update({ where: { id: existingDenial.id }, data: denialData });
    } else {
      denial = await db.denial.create({ data: { case_id: id, ...denialData } });
    }

    return NextResponse.json({ denial }, { status: existingDenial ? 200 : 201 });
  } catch (error) {
    console.error('[POST /api/cases/[id]/denial] Error:', error);
    return NextResponse.json({ error: 'Failed to create/update denial' }, { status: 500 });
  }
}
