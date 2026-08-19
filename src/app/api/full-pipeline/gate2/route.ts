/**
 * POST /api/full-pipeline/gate2 — Resolve HITL Gate 2
 * Edits to the letter are tracked with version history.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveGate2, submitAppeal } from '@/lib/full-pipeline';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { caseId, resolution, editedLetter, editReason, action } = body;

    if (!caseId) {
      return NextResponse.json({ error: 'caseId is required' }, { status: 400 });
    }

    // Gate 2 resolution first (if provided). This transitions the case from
    // hitl_gate_2 → approved (or stays/rejected). If the caller also passes
    // action='submit' we then immediately submit the approved appeal, so a
    // single "Approve & Submit" click works end-to-end.
    let gate2State: { newState: string; letterVersion: number; gate2Status: string } | null = null;
    if (resolution) {
      if (resolution !== 'approved' && resolution !== 'rejected') {
        return NextResponse.json(
          { error: 'resolution must be "approved" or "rejected"' },
          { status: 400 },
        );
      }
      const result = await resolveGate2(caseId, resolution, editedLetter, editReason);
      gate2State = {
        newState: result.newState,
        letterVersion: result.letterVersion,
        gate2Status: result.gate2Status,
      };
      // If the resolution was rejected, we cannot submit.
      if (resolution !== 'approved' && action === 'submit') {
        return NextResponse.json({
          success: false,
          ...gate2State,
          error: 'Cannot submit a rejected appeal',
        });
      }
    }

    // Submit action (after Gate 2 approval)
    if (action === 'submit') {
      const submitResult = await submitAppeal(caseId);
      return NextResponse.json({
        success: submitResult.success,
        newState: submitResult.newState,
        letterVersion: gate2State?.letterVersion,
        gate2Status: gate2State?.gate2Status ?? 'approved',
        submitted: submitResult.success,
      });
    }

    if (!gate2State) {
      return NextResponse.json(
        { error: 'resolution (approved/rejected) or action=submit is required' },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, ...gate2State });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
