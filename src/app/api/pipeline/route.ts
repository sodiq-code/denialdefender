/**
 * POST /api/pipeline — Run the Two-Agent Pipeline (Triage → Policy Research)
 *
 * Accepts a denial letter and payer name, then:
 * 1. Triage Agent classifies the denial
 * 2. Policy Research Agent retrieves relevant evidence
 * 3. Returns combined results with latency measurements
 *
 * GET /api/pipeline — Pipeline health/status check
 */

import { NextRequest, NextResponse } from 'next/server';
import { runTwoAgentPipeline, triageDenial, researchPolicy } from '@/lib/two-agent-pipeline';

// GET /api/pipeline — Health check and pipeline info
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    pipeline: 'two-agent',
    agents: ['triage', 'policy-research'],
    version: '2.0.0',
    description: 'DenialDefender Two-Agent Pipeline: Triage → Policy Research',
  });
}

// POST /api/pipeline — Run the two-agent pipeline
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    // Support running individual steps first (research doesn't need denialLetter)
    if (body.step === 'research') {
      const triageInput = body.triage_result || body.triageResult;
      if (!triageInput) {
        return NextResponse.json(
          { status: 'error', message: 'Research step requires triage_result in body' },
          { status: 400 }
        );
      }
      const startTime = Date.now();
      const evidence = await researchPolicy(triageInput);
      const latencyMs = Date.now() - startTime;
      return NextResponse.json({
        status: 'ok',
        step: 'research',
        evidence,
        latencyMs,
      });
    }

    // Validate required fields for triage/full pipeline
    if (!body.denial_letter && !body.denialLetter) {
      return NextResponse.json(
        { status: 'error', message: 'Missing required field: denial_letter (or denialLetter)' },
        { status: 400 }
      );
    }

    if (!body.payer) {
      return NextResponse.json(
        { status: 'error', message: 'Missing required field: payer' },
        { status: 400 }
      );
    }

    const denialLetter = body.denial_letter || body.denialLetter;
    const payer = body.payer;

    // Support running individual steps
    if (body.step === 'triage') {
      const startTime = Date.now();
      const triage = await triageDenial(denialLetter, payer);
      const latencyMs = Date.now() - startTime;
      return NextResponse.json({
        status: 'ok',
        step: 'triage',
        triage,
        latencyMs,
      });
    }

    // Default: run full pipeline (Triage → Policy Research)
    const result = await runTwoAgentPipeline(denialLetter, payer);

    return NextResponse.json({
      status: 'ok',
      pipeline: 'triage-to-policy-research',
      triage: {
        denial_type: result.triage.denial_type,
        denial_type_label: result.triage.denial_type_label,
        payer: result.triage.payer,
        reason_codes: result.triage.reason_codes,
        cpt_codes: result.triage.cpt_codes,
        icd_codes: result.triage.icd_codes,
        category: result.triage.category,
        confidence: result.triage.confidence,
        summary: result.triage.summary,
        appeal_strategy: result.triage.appeal_strategy,
      },
      evidence: {
        query: result.evidence.query,
        results: result.evidence.results.map(r => ({
          evidenceId: r.evidenceId,
          source: r.source,
          documentName: r.documentName,
          section: r.section,
          contentPreview: r.content.slice(0, 300),
          provenanceTier: r.provenanceTier,
          payerName: r.payerName,
          denialType: r.denialType,
          clauseId: r.clauseId,
          retrievalWeight: r.retrievalWeight,
          finalScore: r.finalScore,
          provenanceCard: r.provenanceCard,
        })),
        totalCandidates: result.evidence.totalCandidates,
        latencyMs: result.evidence.latencyMs,
        withinSla: result.evidence.withinSla,
        topK: result.evidence.topK,
      },
      latency: result.latency,
      success: result.success,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'error', message: error.message, stack: error.stack?.slice(0, 500) },
      { status: 500 }
    );
  }
}
