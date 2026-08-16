import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/workflow — Get agent fleet health status
 * Proxies to the agent fleet service at localhost:3004/health
 */
export async function GET() {
  try {
    const agentFleetUrl = process.env.AGENT_FLEET_URL || 'http://localhost:3004';
    const res = await fetch(`${agentFleetUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const health = await res.json();
      return NextResponse.json({ health });
    }

    return NextResponse.json(
      { health: { status: 'error', message: `Agent fleet returned ${res.status}` } },
      { status: 503 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { health: { status: 'error', message } },
      { status: 503 }
    );
  }
}

/**
 * POST /api/workflow — Run the full appeal workflow for a case
 * Proxies to the agent fleet service at localhost:3004/workflow/run
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const agentFleetUrl = process.env.AGENT_FLEET_URL || 'http://localhost:3004';

    const res = await fetch(`${agentFleetUrl}/workflow/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    const responseBody = await res.text();
    return new NextResponse(responseBody, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[POST /api/workflow] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: 'Workflow execution failed', details: message },
      { status: 500 }
    );
  }
}
