/**
 * POST /api/full-pipeline/gate-test — Run Day 6 gate test
 * Verifies: full workflow completes, both gates work, trace is auditable
 */

import { NextRequest, NextResponse } from 'next/server';
import { runDay6GateTest } from '@/lib/full-pipeline';

const SAMPLE_DENIAL = `DETERMINATION OF COVERAGE

Date: August 20, 2026
Patient ID: XXX-XX-4321
Claim ID: CLM-2026-0815-0042

Your claim for CPT 27447 (Total Knee Arthroplasty) has been denied as not medically necessary.

Reason Code: CO-50
Denial Category: Medical Necessity
Diagnosis: M17.11 (Primary osteoarthritis, right knee)
Amount Denied: $34,567.89

Per Medicare Coverage Determination, the requested service does not meet the criteria for coverage under 42 CFR § 410.32. Conservative treatment options have not been adequately documented as exhausted.

You have 120 calendar days from the date of this determination to file an appeal.

Medicare Appeals and Grievances Department`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const denialText = body.denialText || SAMPLE_DENIAL;
    const payer = body.payer || 'Medicare';

    const result = await runDay6GateTest({ denialText, payer });

    return NextResponse.json({
      gateResult: result.gateResult,
      checks: {
        fullWorkflowCompleted: result.fullWorkflowCompleted,
        traceEventCount: result.traceEventCount,
        bothGatesWorking: result.bothGatesWorking,
        gate1BlocksPipeline: result.gate1BlocksPipeline,
        gate2BlocksSubmission: result.gate2BlocksSubmission,
        traceAuditable: result.traceAuditable,
      },
      traceChecklist: result.traceChecklist,
      summary: result.gateResult === 'PASS'
        ? `Day 6 Gate PASSED: Full workflow completes with ${result.traceEventCount} trace events, both HITL gates functional, trace is auditable`
        : `Day 6 Gate FAILED: workflow=${result.fullWorkflowCompleted}, gates=${result.bothGatesWorking}, auditable=${result.traceAuditable}, events=${result.traceEventCount}`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
