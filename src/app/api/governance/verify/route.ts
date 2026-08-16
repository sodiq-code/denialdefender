/**
 * API Route — Governance Gate Verification
 *
 * GET /api/governance/verify — Verify the Day 11 governance gate
 */
import { NextResponse } from 'next/server';
import { verifyGovernanceGate } from '@/lib/agent-observability';

export async function GET() {
  try {
    const result = await verifyGovernanceGate();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Governance Verify API] error:', error);
    return NextResponse.json(
      { error: 'Gate verification failed' },
      { status: 500 },
    );
  }
}
