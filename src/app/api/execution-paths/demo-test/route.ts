/**
 * POST /api/execution-paths/demo-test — Run demo reliability test (Validation Gate 3)
 *
 * Tests all 3 execution paths and returns GO/NO-GO decision.
 */

import { NextRequest, NextResponse } from 'next/server';
import { testDemoReliability } from '@/lib/execution-paths';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const denialText = body.denialText || 'UnitedHealthcare\nClaims Adjudication Department\n\nDATE: January 15, 2026\n\nRE: Denial of Claim — 27447 (Total knee arthroplasty)\n\nDENIAL REASON: CO50 — Non-covered services because it is not deemed medically necessary';
    const payer = body.payer || 'UnitedHealthcare';
    const denialCategory = body.denialCategory || 'medical_necessity';

    const result = await testDemoReliability(
      { denialText, payer },
      denialCategory,
    );

    return NextResponse.json({
      success: true,
      gateResult: result.gateResult,
      gateDetail: result.gateDetail,
      livePath: result.livePath,
      fallbackPath: result.fallbackPath,
      demoSafePath: result.demoSafePath,
      allPathsProduceUsableAppeal: result.allPathsProduceUsableAppeal,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
