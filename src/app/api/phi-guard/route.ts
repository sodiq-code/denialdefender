/**
 * DenialDefender — PHI Guard API (Day 10)
 *
 * POST: Classify content for PHI (the front gate)
 * GET:  Get PHI Guard audit log
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  runPhiGuard,
  getAllPhiGuardAudit,
  classifyContent,
} from '@/lib/phi-guard';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { content, caseId } = body;

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'content (string) is required' },
        { status: 400 },
      );
    }

    if (!caseId || typeof caseId !== 'string') {
      return NextResponse.json(
        { error: 'caseId (string) is required' },
        { status: 400 },
      );
    }

    // ── Run PHI Guard gate ──
    const { result, audit, traceEventId } = await runPhiGuard(content, caseId);

    return NextResponse.json({
      success: true,
      result: {
        detected: result.detected,
        patterns: result.patterns,
        riskScore: result.riskScore,
        verdict: result.verdict,
        reason: result.reason,
        modelInvocations: result.modelInvocations,
        timestamp: result.timestamp,
      },
      audit: {
        id: audit.id,
        caseId: audit.caseId,
        contentHash: audit.contentHash,
        verdict: audit.verdict,
        riskScore: audit.riskScore,
        patternCount: audit.patternCount,
        patternTypes: audit.patternTypes,
        modelInvocations: audit.modelInvocations,
        timestamp: audit.timestamp,
      },
      traceEventId,
    });
  } catch (error) {
    console.error('[PHI Guard API] Error:', error);
    return NextResponse.json(
      { error: 'PHI Guard classification failed' },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const audits = await getAllPhiGuardAudit();

    return NextResponse.json({
      success: true,
      audits,
      summary: {
        total: audits.length,
        blocked: audits.filter(a => a.verdict === 'BLOCK').length,
        allowed: audits.filter(a => a.verdict === 'ALLOW').length,
        zeroInvocationsOnBlock: audits
          .filter(a => a.verdict === 'BLOCK')
          .every(a => a.modelInvocations === 0),
      },
    });
  } catch (error) {
    console.error('[PHI Guard API] Error fetching audit log:', error);
    return NextResponse.json(
      { error: 'Failed to fetch PHI Guard audit log' },
      { status: 500 },
    );
  }
}
