/**
 * POST /api/demo/two-case — Run the two-case behavioral demo (Day 9)
 *
 * Case 1 runs to LOSS → system updates procedural evidence →
 * Case 2 (same payer, related denial) runs with different argument ranking →
 * Agent explains the change.
 *
 * GET — Load demo info without running
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  runTwoCaseDemo,
  quickTwoCaseDemo,
  type TwoCaseDemoResult,
} from '@/lib/two-case-demo';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const useQuickMode = body.quick !== false; // default to quick for stability

    let result: TwoCaseDemoResult;

    if (useQuickMode) {
      result = await quickTwoCaseDemo();
    } else {
      result = await runTwoCaseDemo();
    }

    return NextResponse.json({
      success: true,
      demo: {
        case1: {
          payer: result.case1.payer,
          appealStrategy: result.case1.appealStrategy,
          argumentRanking: result.case1.argumentRanking,
          citationsUsed: result.case1.citationsUsed,
          verdict: result.case1.verdict,
          weightUpdates: result.case1.weightUpdates.map(w => ({
            evidenceId: w.evidenceId,
            oldWeight: w.oldWeight,
            newWeight: w.newWeight,
            delta: w.delta,
            reason: w.reason,
          })),
          weightUpdateCount: result.case1.weightUpdates.length,
          memoryBankStatus: result.case1.ingestionResult.memoryBankStatus,
          durationMs: result.case1.durationMs,
        },
        case2: {
          payer: result.case2.payer,
          appealStrategy: result.case2.appealStrategy,
          argumentRanking: result.case2.argumentRanking,
          citationsUsed: result.case2.citationsUsed,
          rankingChangeExplanation: result.case2.rankingChangeExplanation,
          durationMs: result.case2.durationMs,
        },
        rankingChange: {
          promoted: result.rankingChange.promoted,
          demoted: result.rankingChange.demoted,
          unchanged: result.rankingChange.unchanged,
          isVisiblyDifferent: result.rankingChange.isVisiblyDifferent,
        },
        beforeAfterMetrics: result.beforeAfterMetrics ? {
          before: result.beforeAfterMetrics.beforeMetrics,
          after: result.beforeAfterMetrics.afterMetrics,
          deltas: result.beforeAfterMetrics.deltas,
        } : null,
        gatePassed: result.gatePassed,
        gateDetails: result.gateDetails,
        behavioralSummary: result.behavioralSummary,
        durationMs: result.durationMs,
        timestamp: result.timestamp,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Two-case demo failed' },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      info: {
        description: 'Two-Case Behavioral Demo — Day 9',
        purpose: 'Case 1 runs to LOSS, system updates evidence weights, Case 2 (same payer, related denial) runs with visibly different argument ranking',
        gate: 'Ranking change is attributable to recorded outcomes (Memory Bank weight delta), NOT a hardcoded reorder',
        case1: {
          payer: 'UnitedHealthcare',
          procedure: '27447 — Total knee arthroplasty',
          denialReason: 'CO50 — Not medically necessary',
          verdict: 'LOSS (deliberate for demo)',
        },
        case2: {
          payer: 'UnitedHealthcare',
          procedure: '27130 — Total hip arthroplasty',
          denialReason: 'CO50 — Not medically necessary',
          expectedBehavior: 'Different argument ranking after outcome learning from Case 1',
        },
        keyInsight: 'This is the single biggest strategic change from the blueprint — actual observable learning, not a performed animation',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
