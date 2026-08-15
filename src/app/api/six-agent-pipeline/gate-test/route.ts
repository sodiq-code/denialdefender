import { NextRequest, NextResponse } from 'next/server';
import { runGateTest } from '@/lib/six-agent-pipeline';

/**
 * POST /api/six-agent-pipeline/gate-test — Gate test
 *
 * Runs pipeline with a GOOD draft (should PASS) and a BROKEN draft (should FAIL/blocked).
 * - Good draft: Real denial with real citations → Quality Review should PASS
 * - Broken draft: Same denial but with a fake citation injected → Quality Review should FAIL
 *
 * The gate passes if the broken draft IS blocked (proving the adversarial battery works).
 *
 * Input: { denialText, payer, patientContext? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.denialText || typeof body.denialText !== 'string') {
      return NextResponse.json(
        { error: 'denialText is required and must be a string' },
        { status: 400 },
      );
    }

    if (!body.payer || typeof body.payer !== 'string') {
      return NextResponse.json(
        { error: 'payer is required and must be a string' },
        { status: 400 },
      );
    }

    const result = await runGateTest({
      denialText: body.denialText,
      payer: body.payer,
      patientContext: body.patientContext || undefined,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[POST /api/six-agent-pipeline/gate-test] Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Gate test failed: ${msg}` },
      { status: 500 },
    );
  }
}
