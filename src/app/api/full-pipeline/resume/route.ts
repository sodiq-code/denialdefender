/**
 * POST /api/full-pipeline/resume — Resume pipeline after Gate 1
 */

import { NextRequest, NextResponse } from 'next/server';
import { resumeAfterGate1 } from '@/lib/full-pipeline';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { caseId, gateStatus, cachedTriageResult, cachedAdvocateResult } = body;

    if (!caseId || !gateStatus) {
      return NextResponse.json(
        { error: 'caseId and gateStatus (approved/rejected) are required' },
        { status: 400 }
      );
    }

    if (gateStatus !== 'approved' && gateStatus !== 'rejected') {
      return NextResponse.json(
        { error: 'gateStatus must be "approved" or "rejected"' },
        { status: 400 }
      );
    }

    const result = await resumeAfterGate1(
      caseId,
      gateStatus,
      cachedTriageResult,
      cachedAdvocateResult,
    );

    return NextResponse.json({
      success: true,
      pipelineStatus: result.pipelineStatus,
      caseId: result.caseId,
      gate1: result.gate1,
      policyResearch: result.policyResearch ? {
        clauses: result.policyResearch.clauses,
        retrievalLatencyMs: result.policyResearch.retrievalLatencyMs,
      } : null,
      evidenceAssembly: result.evidenceAssembly ? {
        totalEvidenceItems: result.evidenceAssembly.totalEvidenceItems,
        evidenceStrength: result.evidenceAssembly.evidenceStrength,
        duplicatesRemoved: result.evidenceAssembly.duplicatesRemoved,
      } : null,
      letterDrafting: result.letterDrafting ? {
        wordCount: result.letterDrafting.wordCount,
        citationCount: result.letterDrafting.citationCount,
        formatCompliant: result.letterDrafting.formatCompliant,
        appealLetter: result.letterDrafting.appealLetter,
        inlineCitations: result.letterDrafting.inlineCitations,
        sections: result.letterDrafting.sections,
      } : null,
      qualityReview: result.qualityReview ? {
        overallVerdict: result.qualityReview.overallVerdict,
        overallScore: result.qualityReview.overallScore,
        citationsVerified: result.qualityReview.citationsVerified,
        unsupportedClaims: result.qualityReview.unsupportedClaims,
        canProceed: result.qualityReview.canProceed,
        batteryResults: result.qualityReview.batteryResults,
        issues: result.qualityReview.issues,
      } : null,
      gate2: result.gate2,
      traces: result.structuredTraces,
      traceChecklist: result.traceChecklist,
      letterVersion: result.letterVersion,
      latencyMs: result.latencyMs,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
