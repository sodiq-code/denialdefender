/**
 * API Route — Governance Demo Moment
 *
 * GET /api/governance/demo — Run the full governance demo (Armor + Identity + Observability)
 */
import { NextResponse } from 'next/server';
import { runGovernanceDemo } from '@/lib/agent-observability';

export async function GET() {
  try {
    const demo = await runGovernanceDemo();
    return NextResponse.json(demo);
  } catch (error) {
    console.error('[Governance Demo API] error:', error);
    return NextResponse.json(
      { error: 'Governance demo failed' },
      { status: 500 },
    );
  }
}
