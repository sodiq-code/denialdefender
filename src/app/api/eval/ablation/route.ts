/**
 * POST /api/eval/ablation — Run agent-ablation experiment (Day 8)
 *
 * Run 4 topologies (single, 3-agent, 5-agent, 8-agent) on 10 held-out cases.
 * Produce the ablation table (Table 7.1) with real measured numbers.
 *
 * Supports:
 *   {quick: true}            — documented baseline numbers (fast)
 *   {quick: false}           — full experiment with real agents
 *   {includeCases: true}     — include per-case breakdown in response
 *
 * GET — Load ablation experiment info and topology descriptions
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  runAblationExperiment,
  quickAblationExperiment,
  type AblationExperimentResult,
  type AblationTopologyResult,
  type AblationCaseResult,
} from '@/lib/agent-ablation';

/**
 * Format a topology result for the API response.
 * When includeCases is true, per-case breakdowns are included.
 */
function formatTopology(t: AblationTopologyResult, includeCases: boolean) {
  const base = {
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
  };

  if (!includeCases) return base;

  // Include per-case breakdown
  const caseResults: Array<{
    caseId: string;
    caseName: string;
    metrics: {
      citationGrounding: number;
      citationGroundingPercent: number;
      unsupportedClaims: number;
      unsupportedClaimsLevel: string;
      verdict: string;
      top1Accuracy: number;
      top3Accuracy: number;
      appealQuality: number;
      argumentSelection: number;
    };
    latencyMs: number;
    error: string | null;
  }> = t.caseResults.map((c: AblationCaseResult) => ({
    caseId: c.caseId,
    caseName: c.caseName,
    metrics: {
      citationGrounding: c.metrics.citationGrounding,
      citationGroundingPercent: Math.round(c.metrics.citationGrounding * 100),
      unsupportedClaims: c.metrics.unsupportedClaims,
      unsupportedClaimsLevel: c.metrics.unsupportedClaimsLevel,
      verdict: c.metrics.verdict,
      top1Accuracy: c.metrics.top1Accuracy,
      top3Accuracy: c.metrics.top3Accuracy,
      appealQuality: c.metrics.appealQuality,
      argumentSelection: c.metrics.argumentSelection,
    },
    latencyMs: c.latencyMs,
    error: c.error,
  }));

  return { ...base, caseResults };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const useQuickMode = body.quick === true;
    const includeCases = body.includeCases === true;

    let result: AblationExperimentResult;

    if (useQuickMode) {
      result = quickAblationExperiment();
    } else {
      result = await runAblationExperiment();
    }

    // Compute improvement deltas (single → full)
    const singleTop = result.topologies.find(t => t.topology === 'single');
    const fullTop = result.topologies.find(t => t.topology === 'eight_agent');
    const deltas = (singleTop && fullTop) ? {
      citationGrounding: Math.round((fullTop.aggregate.citationGrounding - singleTop.aggregate.citationGrounding) * 1000) / 1000,
      unsupportedClaims: Math.round((singleTop.aggregate.unsupportedClaims - fullTop.aggregate.unsupportedClaims) * 10) / 10,
      top1Accuracy: Math.round((fullTop.aggregate.top1Accuracy - singleTop.aggregate.top1Accuracy) * 1000) / 1000,
      appealQuality: Math.round((fullTop.aggregate.appealQuality - singleTop.aggregate.appealQuality) * 1000) / 1000,
      argumentSelection: Math.round((fullTop.aggregate.argumentSelection - singleTop.aggregate.argumentSelection) * 1000) / 1000,
    } : null;

    return NextResponse.json({
      success: true,
      experiment: {
        topologies: result.topologies.map(t => formatTopology(t, includeCases)),
        totalCases: result.totalCases,
        gatePassed: result.gatePassed,
        gateDetails: result.gateDetails,
        deltas,
        durationMs: result.durationMs,
        timestamp: result.timestamp,
        mode: useQuickMode ? 'quick' : 'full',
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Ablation experiment failed';
    return NextResponse.json(
      { success: false, error: msg },
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
            agentsIncluded: ['Triage+Draft (Monolith)'],
            agentsRemoved: ['Policy Research', 'Evidence Assembly', 'Medical Coder', 'Citation Agent', 'Quality Review', 'Orchestrator', 'Patient Advocate'],
            expectedGrounding: '≤ 75%',
            expectedUnsupported: 'high',
            expectedVerdict: 'Fails verification',
          },
          {
            name: '3-Agent (Triage + Draft + Review)',
            topology: 'three_agent',
            agents: 3,
            agentsIncluded: ['Triage', 'Draft', 'Quality Review'],
            agentsRemoved: ['Policy Research', 'Evidence Assembly', 'Medical Coder', 'Citation Agent', 'Orchestrator', 'Patient Advocate'],
            expectedGrounding: '~84%',
            expectedUnsupported: 'medium',
            expectedVerdict: 'Weak grounding',
          },
          {
            name: '5-Agent (+ Policy + Evidence)',
            topology: 'five_agent',
            agents: 5,
            agentsIncluded: ['Triage', 'Policy Research', 'Evidence Assembly', 'Draft', 'Quality Review'],
            agentsRemoved: ['Medical Coder', 'Citation Agent', 'Orchestrator', 'Patient Advocate'],
            expectedGrounding: '~91%',
            expectedUnsupported: 'low',
            expectedVerdict: 'Strong grounding',
          },
          {
            name: '8-Agent (Full Pipeline)',
            topology: 'eight_agent',
            agents: 8,
            agentsIncluded: ['Patient Advocate', 'Triage', 'Medical Coder', 'Policy Research', 'Evidence', 'Citation', 'Draft', 'Quality Review', 'Orchestrator'],
            agentsRemoved: [],
            expectedGrounding: '~96%',
            expectedUnsupported: 'near-zero',
            expectedVerdict: 'Independently verifiable',
          },
        ],
        gate: 'Multi-agent separation improves something measurable; result reported honestly (Principle 5)',
        honestyPrinciple: 'If the delta is negative on any metric, that is reported, not hidden',
        keyInsight: 'Removing Quality Review reintroduces unsupported claims that the compliance story cannot tolerate',
        marginalAgents: [
          { agent: 'Quality Review', breaksWhat: 'Unsupported claims pass undetected', measurableDegradation: 'Unsupported claims: near-zero → high' },
          { agent: 'Policy Research', breaksWhat: 'No payer-specific policy backing', measurableDegradation: 'Citation grounding drops ~20%' },
          { agent: 'Evidence Assembly', breaksWhat: 'No clinical evidence matching', measurableDegradation: 'Citation grounding drops ~15%, unsupported claims rise' },
          { agent: 'Citation Agent', breaksWhat: 'Unverified citations', measurableDegradation: 'Citation provenance stays unverified' },
          { agent: 'Medical Coder', breaksWhat: 'Invalid CPT/ICD codes', measurableDegradation: 'Coding accuracy fails' },
        ],
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 },
    );
  }
}
