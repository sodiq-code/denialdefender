import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/cases/[id] - Get a single case with denial, outcomes, and trace events
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

      // Fetch case with denial
      const caseResult = await client.execute({
        sql: `SELECT c.id, c.patient_id, c.state, c.deadline, c.persona, c.created_at, c.updated_at,
                     d.id as denial_id, d.payer, d.reason_code, d.category, d.denial_letter_text,
                     d.confidence, d.structured_json, d.created_at as denial_created_at
              FROM "Case" c LEFT JOIN "Denial" d ON d.case_id = c.id
              WHERE c.id = ?`,
        args: [id],
      });

      if (caseResult.rows.length === 0) {
        return NextResponse.json({ error: 'Case not found' }, { status: 404 });
      }

      const row = caseResult.rows[0] as any;

      // Fetch outcomes
      const outcomeResult = await client.execute({
        sql: `SELECT id, verdict, level, recorded_at FROM "Outcome" WHERE case_id = ? ORDER BY recorded_at DESC`,
        args: [id],
      });

      // Fetch traces
      const traceResult = await client.execute({
        sql: `SELECT id, case_id, agent_name, step, status, details, references, timestamp
              FROM "DecisionTraceEvent" WHERE case_id = ? ORDER BY timestamp DESC`,
        args: [id],
      });

      // Fetch gates
      const gateResult = await client.execute({
        sql: `SELECT id, case_id, gate_number, status, reviewer_note, resolved_at, created_at
              FROM "HitlGate" WHERE case_id = ? ORDER BY created_at DESC`,
        args: [id],
      });

      const caseData = {
        id: row.id,
        patient_id: row.patient_id,
        state: row.state,
        deadline: row.deadline,
        persona: row.persona,
        created_at: row.created_at,
        updated_at: row.updated_at,
        denial: row.denial_id ? {
          id: row.denial_id,
          payer: row.payer,
          reason_code: row.reason_code,
          category: row.category,
          denial_letter_text: row.denial_letter_text,
          confidence: row.confidence,
          structured_json: row.structured_json,
          created_at: row.denial_created_at,
        } : null,
        outcomes: outcomeResult.rows.map((o: any) => ({
          id: o.id,
          verdict: o.verdict,
          level: o.level,
          recorded_at: o.recorded_at,
        })),
        traces: traceResult.rows.map((t: any) => ({
          id: t.id,
          case_id: t.case_id,
          agent_name: t.agent_name,
          step: t.step,
          status: t.status,
          details: t.details,
          references: t.references,
          timestamp: t.timestamp,
        })),
        gates: gateResult.rows.map((g: any) => ({
          id: g.id,
          case_id: g.case_id,
          gate_number: g.gate_number,
          status: g.status,
          reviewer_note: g.reviewer_note,
          resolved_at: g.resolved_at,
          created_at: g.created_at,
        })),
      };

      return NextResponse.json({ case: caseData });
    }

    // Fallback: Prisma (local SQLite)
    const { db } = await import('@/lib/db');
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
  } catch (error) {
    console.error('[GET /api/cases/[id]] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch case' }, { status: 500 });
  }
}

/**
 * PATCH /api/cases/[id] - Update case state
 * Uses Turso directly for Cloud Run (persistent), Prisma for local dev
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { isTurso, getTursoClient } = await import('@/lib/db');

    if (isTurso) {
      const client = await getTursoClient();

      // Verify case exists
      const existing = await client.execute({
        sql: `SELECT id, patient_id, state, deadline, persona, created_at, updated_at FROM "Case" WHERE id = ?`,
        args: [id],
      });

      if (existing.rows.length === 0) {
        return NextResponse.json({ error: 'Case not found' }, { status: 404 });
      }

      // Build update
      const now = new Date().toISOString();
      const updates: string[] = ['updated_at = ?'];
      const args: any[] = [now];

      if (body.state !== undefined) { updates.push('state = ?'); args.push(body.state); }
      if (body.deadline !== undefined) { updates.push('deadline = ?'); args.push(body.deadline || null); }
      if (body.persona !== undefined) { updates.push('persona = ?'); args.push(body.persona || null); }

      args.push(id); // WHERE id = ?

      await client.execute({
        sql: `UPDATE "Case" SET ${updates.join(', ')} WHERE id = ?`,
        args,
      });

      // Fetch updated case with relations
      const caseResult = await client.execute({
        sql: `SELECT c.id, c.patient_id, c.state, c.deadline, c.persona, c.created_at, c.updated_at,
                     d.id as denial_id, d.payer, d.reason_code, d.category, d.denial_letter_text, d.confidence
              FROM "Case" c LEFT JOIN "Denial" d ON d.case_id = c.id
              WHERE c.id = ?`,
        args: [id],
      });

      const row = caseResult.rows[0] as any;
      return NextResponse.json({
        case: {
          ...row,
          denial: row.denial_id ? {
            id: row.denial_id, payer: row.payer, reason_code: row.reason_code,
            category: row.category, denial_letter_text: row.denial_letter_text, confidence: row.confidence,
          } : null,
        },
      });
    }

    // Fallback: Prisma (local SQLite)
    const { db } = await import('@/lib/db');
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
  } catch (error) {
    console.error('[PATCH /api/cases/[id]] Error:', error);
    return NextResponse.json({ error: 'Failed to update case' }, { status: 500 });
  }
}
