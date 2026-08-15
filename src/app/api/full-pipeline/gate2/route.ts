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

    // Submit action (after Gate 2 approval)
    if (action === 'submit') {
      if (!caseId) {
        return NextResponse.json({ error: 'caseId is required for submit action' }, { status: 400 });
      }
      const result = await submitAppeal(caseId);
      return NextResponse.json({ success: result.success, newState: result.newState });
    }

    // Gate 2 resolution
    if (!caseId || !resolution) {
      return NextResponse.json(
        { error: 'caseId and resolution (approved/rejected) are required' },
        { status: 400 }
      );
    }

    if (resolution !== 'approved' && resolution !== 'rejected') {
      return NextResponse.json(
        { error: 'resolution must be "approved" or "rejected"' },
        { status: 400 }
      );
    }

    const result = await resolveGate2(caseId, resolution, editedLetter, editReason);

    return NextResponse.json({
      success: result.success,
      newState: result.newState,
      letterVersion: result.letterVersion,
      gate2Status: result.gate2Status,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
