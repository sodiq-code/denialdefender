import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/cases/[id]/trace - Get all decision trace events for a case
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
        sql: `SELECT id, case_id, agent_name, step, status, details, references, timestamp
              FROM "DecisionTraceEvent" WHERE case_id = ? ORDER BY timestamp ASC`,
        args: [id],
      });

      return NextResponse.json({ traces: result.rows });
    }

    // Fallback: Prisma (local SQLite)
    const { db } = await import('@/lib/db');
    const caseExists = await db.case.findUnique({ where: { id } });
    if (!caseExists) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const traces = await db.decisionTraceEvent.findMany({
      where: { case_id: id },
      orderBy: { timestamp: 'asc' },
    });

    return NextResponse.json({ traces });
  } catch (error) {
    console.error('[GET /api/cases/[id]/trace] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch trace events' }, { status: 500 });
  }
}

/**
 * POST /api/cases/[id]/trace - Add a new decision trace event
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
    if (!body.agent_name) {
      return NextResponse.json({ error: 'agent_name is required' }, { status: 400 });
    }
    if (!body.step) {
      return NextResponse.json({ error: 'step is required' }, { status: 400 });
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

      const traceId = `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      const details = body.details ? JSON.stringify(body.details) : null;
      const references = body.references ? JSON.stringify(body.references) : null;

      await client.execute({
        sql: `INSERT INTO "DecisionTraceEvent" (id, case_id, agent_name, step, status, details, references, timestamp)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [traceId, id, body.agent_name, body.step, body.status ?? 'started', details, references, now],
      });

      const result = await client.execute({
        sql: `SELECT id, case_id, agent_name, step, status, details, references, timestamp
              FROM "DecisionTraceEvent" WHERE id = ?`,
        args: [traceId],
      });

      return NextResponse.json({ trace: result.rows[0] }, { status: 201 });
    }

    // Fallback: Prisma (local SQLite)
    const { db } = await import('@/lib/db');
    const caseExists = await db.case.findUnique({ where: { id } });
    if (!caseExists) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const traceEvent = await db.decisionTraceEvent.create({
      data: {
        case_id: id,
        agent_name: body.agent_name,
        step: body.step,
        status: body.status ?? 'started',
        details: body.details ? JSON.stringify(body.details) : null,
        references: body.references ? JSON.stringify(body.references) : null,
      },
    });

    return NextResponse.json({ trace: traceEvent }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/cases/[id]/trace] Error:', error);
    return NextResponse.json({ error: 'Failed to create trace event' }, { status: 500 });
  }
}
