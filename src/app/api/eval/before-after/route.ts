/**
 * POST /api/eval/before-after — Run before/after experiment (Day 8)
 *
 * Ingest 50 outcome records, update weights, re-score 10 held-out cases.
 * Produce the before/after delta table with honest reporting.
 *
 * GET — Load existing before/after results
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  runBeforeAfterExperiment,
  computePerCaseBreakdown,
  quickBeforeAfterExperiment,
  type BeforeAfterResult,
} from '@/lib/before-after-experiment';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const useQuickMode = body.quick === true;

    let result: BeforeAfterResult;

    if (useQuickMode) {
      result = await quickBeforeAfterExperiment();
    } else {
      result = await runBeforeAfterExperiment();
    }

    // Compute per-case breakdown
    const perCaseBreakdown = computePerCaseBreakdown(
      result.beforeSnapshot,
      result.afterSnapshot,
    );

    return NextResponse.json({
      success: true,
      experiment: {
        deltas: result.deltas.map(d => ({
          metric: d.metric,
          metricLabel: d.metric.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          beforeValue: d.beforeValue,
          afterValue: d.afterValue,
          delta: d.delta,
          deltaPercent: d.deltaPercent,
          improved: d.improved,
          honest: d.honest,
        })),
        beforeSnapshot: {
          runId: result.beforeSnapshot.runId,
          timestamp: result.beforeSnapshot.timestamp,
          temperature: result.beforeSnapshot.temperature,
          totalCases: result.beforeSnapshot.totalCases,
          determinismHash: result.beforeSnapshot.determinismHash,
          aggregateMetrics: result.beforeSnapshot.aggregateMetrics,
        },
        afterSnapshot: {
          runId: result.afterSnapshot.runId,
          timestamp: result.afterSnapshot.timestamp,
          temperature: result.afterSnapshot.temperature,
          totalCases: result.afterSnapshot.totalCases,
          determinismHash: result.afterSnapshot.determinismHash,
          aggregateMetrics: result.afterSnapshot.aggregateMetrics,
        },
        outcomeIngestion: {
          totalRecords: result.outcomeIngestion.totalRecords,
          successful: result.outcomeIngestion.successful,
          failed: result.outcomeIngestion.failed,
          totalWeightUpdates: result.outcomeIngestion.totalWeightUpdates,
          memoryBankStatus: result.outcomeIngestion.memoryBankStatus,
        },
        outcomeSources: result.outcomeSources,
        perCaseBreakdown: perCaseBreakdown.map(pc => ({
          caseId: pc.caseId,
          caseName: pc.caseName,
          beforeMetrics: pc.beforeMetrics,
          afterMetrics: pc.afterMetrics,
          deltas: pc.deltas,
        })),
        gatePassed: result.gatePassed,
        gateDetails: result.gateDetails,
        durationMs: result.durationMs,
        timestamp: result.timestamp,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Before/after experiment failed' },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    // Return information about the experiment without running it
    return NextResponse.json({
      success: true,
      info: {
        description: 'Before/After Experiment — Day 8',
        purpose: 'Ingest 50 outcome records, update weights, re-score 10 held-out cases',
        metrics: [
          'top1_accuracy',
          'top3_accuracy',
          'citation_grounding',
          'argument_selection',
          'appeal_quality',
        ],
        outcomeRecords: {
          public: 5,
          synthetic: 45,
          total: 50,
        },
        gate: 'The before/after table is honest — negative deltas are reported, not hidden (Principle 5)',
        target: 'Top-3 retrieval accuracy improvement ≥ 20% after outcome learning',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
