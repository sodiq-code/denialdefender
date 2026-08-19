/**
 * DenialDefender — PHI Guard Gate Verification API (Day 10)
 *
 * GET: Verify the PHI Guard gate for a case
 *   - Every BLOCK has modelInvocations === 0
 *   - BLOCK events exist in decision trace
 *   - No agent invocations after BLOCK
 *   - Audit log integrity
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyPhiGuardGate } from '@/lib/phi-guard';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const caseId = searchParams.get('caseId');

    if (!caseId) {
      return NextResponse.json(
        { error: 'caseId query parameter is required' },
        { status: 400 },
      );
    }

    const verification = await verifyPhiGuardGate(caseId);

    return NextResponse.json({
      success: true,
      caseId,
      passed: verification.passed,
      checks: verification.checks,
    });
  } catch (error) {
    console.error('[PHI Guard Verify API] Error:', error);
    return NextResponse.json(
      { error: 'Gate verification failed' },
      { status: 500 },
    );
  }
}
