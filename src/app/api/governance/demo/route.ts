/**
 * API Route — Governance Demo Moment
 *
 * GET /api/governance/demo — Run the full governance demo (Armor + Identity + Observability + Agent Registry)
 */
import { NextResponse } from 'next/server';
import { runGovernanceDemo } from '@/lib/agent-observability';
import { runRegistryDemo } from '@/lib/agent-registry';

export async function GET() {
  try {
    const demo = await runGovernanceDemo();
    const registryDemo = await runRegistryDemo();
    return NextResponse.json({
      ...demo,
      agentRegistry: registryDemo,
    });
  } catch (error) {
    console.error('[Governance Demo API] error:', error);
    return NextResponse.json(
      { error: 'Governance demo failed' },
      { status: 500 },
    );
  }
}
