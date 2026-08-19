/**
 * API Route — Agent Observability
 *
 * POST /api/governance/observability — Reconstruct case from trace events
 * GET  /api/governance/observability — Get observability stats or audit log
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  reconstructCase,
  getObservabilityStats,
} from '@/lib/agent-observability';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { caseId, action } = body;

    if (action === 'reconstruct' && caseId) {
      const reconstruction = await reconstructCase(caseId);
      return NextResponse.json(reconstruction);
    }

    return NextResponse.json(
      { error: 'action "reconstruct" and caseId are required' },
      { status: 400 },
    );
  } catch (error) {
    console.error('[Observability API] POST error:', error);
    return NextResponse.json(
      { error: 'Case reconstruction failed' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'stats') {
      const stats = await getObservabilityStats();
      return NextResponse.json(stats);
    }

    if (action === 'reconstruct') {
      const caseId = searchParams.get('caseId');
      if (!caseId) {
        return NextResponse.json(
          { error: 'caseId is required for reconstruction' },
          { status: 400 },
        );
      }
      const reconstruction = await reconstructCase(caseId);
      return NextResponse.json(reconstruction);
    }

    // Default: return stats
    const stats = await getObservabilityStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error('[Observability API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch observability data' },
      { status: 500 },
    );
  }
}
