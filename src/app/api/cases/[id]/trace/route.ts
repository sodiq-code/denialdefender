import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/cases/[id]/trace - Get all decision trace events for a case
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
