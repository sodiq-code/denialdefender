/**
 * POST /api/eval/ablation — Run agent-ablation experiment (Day 8)
 *
 * Run 4 topologies (single, 3-agent, 5-agent, 8-agent) on 10 held-out cases.
 * Produce the ablation table (Table 7.1) with real measured numbers.
 *
 * GET — Load ablation experiment info
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  runAblationExperiment,
  quickAblationExperiment,
  type AblationExperimentResult,
} from '@/lib/agent-ablation';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const useQuickMode = body.quick === true;

    let result: AblationExperimentResult;

    if (useQuickMode) {
      result = quickAblationExperiment();
    } else {
      result = await runAblationExperiment();
    }

    return NextResponse.json({
      success: true,
      experiment: {
        topologies: result.topologies.map(t => ({
          topology: t.topology,
          label: t.label,
          description: t.description,
          agentCount: t.agentCount,
          agentsIncluded: t.agentsIncluded,
          aggregate: {
            citationGrounding: t.aggregate.citationGrounding,
            citationGroundingPercent: Math.round(t.aggregate.citationGrounding * 100),
            unsupportedClaims: t.aggregate.unsupportedClaims,
            unsupportedClaimsLevel: t.aggregate.unsupportedClaimsLevel,
            verdict: t.aggregate.verdict,
            top1Accuracy: t.aggregate.top1Accuracy,
            top3Accuracy: t.aggregate.top3Accuracy,
            appealQuality: t.aggregate.appealQuality,
            argumentSelection: t.aggregate.argumentSelection,
          },
          caseCount: t.caseResults.length,
          caseErrors: t.caseResults.filter(c => c.error !== null).length,
        })),
        totalCases: result.totalCases,
        gatePassed: result.gatePassed,
        gateDetails: result.gateDetails,
        durationMs: result.durationMs,
        timestamp: result.timestamp,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Ablation experiment failed' },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      info: {
        description: 'Agent Ablation Experiment — Day 8 (Table 7.1)',
        purpose: 'Demonstrate that each agent removal breaks a measurable property',
        topologies: [
          {
            name: 'Single Agent (Monolith)',
            topology: 'single',
            agents: 1,
            expectedGrounding: '≤ 75%',
            expectedUnsupported: 'high',
          },
          {
            name: '3-Agent (Triage + Draft + Review)',
            topology: 'three_agent',
            agents: 3,
            expectedGrounding: '~84%',
            expectedUnsupported: 'medium',
          },
          {
            name: '5-Agent (+ Policy + Evidence)',
            topology: 'five_agent',
            agents: 5,
            expectedGrounding: '~91%',
            expectedUnsupported: 'low',
          },
          {
            name: '8-Agent (Full Pipeline)',
            topology: 'eight_agent',
            agents: 8,
            expectedGrounding: '~96%',
            expectedUnsupported: 'near-zero',
          },
        ],
        gate: 'Multi-agent separation improves something measurable; result reported honestly (Principle 5)',
        keyInsight: 'Removing Quality Review reintroduces unsupported claims that the compliance story cannot tolerate',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
