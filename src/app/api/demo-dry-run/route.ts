/**
 * DenialDefender — Demo Dry Run API
 * GET  /api/demo-dry-run         — Get demo steps and test cases
 * POST /api/demo-dry-run         — Execute dry run session
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  runDemoDryRun,
  runSingleDemo,
  quickDemoTest,
  getDemoSteps,
  getDemoTestCases,
} from '@/lib/demo-dry-run';

export async function GET(request: NextRequest) {
  try {
    const steps = getDemoSteps();
    const testCases = getDemoTestCases();

    return NextResponse.json({
      steps,
      testCases,
      totalSteps: steps.length,
      act1Steps: steps.filter(s => s.act === 1).length,
      act2Steps: steps.filter(s => s.act === 2).length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Demo dry run info fetch failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, targetRuns } = body;

    if (action === 'quick_test') {
      // Single run for quick verification
      const result = await quickDemoTest();
      return NextResponse.json({ result });
    }

    if (action === 'single_run') {
      // Single numbered run
      const { runNumber = 1, testCaseIndex = 0 } = body;
      const result = await runSingleDemo(runNumber, testCaseIndex);
      return NextResponse.json({ result });
    }

    // Default: full 10x dry run
    const runs = targetRuns && targetRuns > 0 ? targetRuns : 10;
    const session = await runDemoDryRun(runs);
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      { error: 'Demo dry run failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
