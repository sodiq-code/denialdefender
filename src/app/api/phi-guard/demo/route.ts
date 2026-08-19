/**
 * DenialDefender — PHI Guard Demo API (Day 10)
 *
 * Runs the demo moment:
 *   1. Synthetic case → ALLOW
 *   2. Sensitive document → BLOCK with "no model invocation"
 *   3. Gate verification
 *
 * GET: Run the full demo
 */

import { NextResponse } from 'next/server';
import { runPhiGuardDemo } from '@/lib/phi-guard';

export async function GET() {
  try {
    const demo = await runPhiGuardDemo();

    return NextResponse.json({
      success: true,
      demo: {
        synthetic: {
          label: 'Synthetic Case — No PHI',
          result: demo.synthetic.result,
          audit: demo.synthetic.audit,
        },
        sensitive: {
          label: 'Sensitive Document — Contains PHI',
          result: demo.sensitive.result,
          audit: demo.sensitive.audit,
        },
      },
      gateVerification: demo.gateVerification,
      gatePassed: demo.gateVerification.passed,
    });
  } catch (error) {
    console.error('[PHI Guard Demo API] Error:', error);
    return NextResponse.json(
      { error: 'PHI Guard demo failed' },
      { status: 500 },
    );
  }
}
