/**
 * POST /api/evidence/retrieve — Policy Research Retrieval Endpoint
 *
 * Accepts a denial context and returns top-K relevant evidence
 * with provenance cards and retrieval latency measurement.
 *
 * Request body:
 * {
 *   denialReason: string       — The denial reason text (required)
 *   payer?: string             — Payer name (e.g., "UnitedHealthcare")
 *   denialType?: string        — Denial classification (e.g., "medical_necessity")
 *   cptCodes?: string[]        — CPT procedure codes
 *   icdCodes?: string[]        — ICD diagnosis codes
 *   mode?: "policy" | "outcomes"  — Retrieval mode (default: "policy")
 *   topK?: number              — Override default top-K
 * }
 *
 * Response:
 * {
 *   status: "ok",
 *   results: PolicyResult[],
 *   totalCandidates: number,
 *   latencyMs: number,
 *   withinSla: boolean,
 *   mode: string,
 *   topK: number,
 *   expandedTerms: string[]   — The expanded search terms used
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  retrievePolicyClauses,
  expandQueryTerms,
  type PolicyQuery,
} from '@/lib/policy-research';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.denialReason || typeof body.denialReason !== 'string') {
      return NextResponse.json(
        {
          status: 'error',
          message: 'denialReason is required and must be a string',
        },
        { status: 400 }
      );
    }

    // Build the policy query
    const query: PolicyQuery = {
      denialReason: body.denialReason,
      payer: body.payer || undefined,
      denialType: body.denialType || undefined,
      cptCodes: Array.isArray(body.cptCodes) ? body.cptCodes : undefined,
      icdCodes: Array.isArray(body.icdCodes) ? body.icdCodes : undefined,
      mode: body.mode === 'outcomes' ? 'outcomes' : 'policy',
      topK: typeof body.topK === 'number' ? body.topK : undefined,
    };

    // Expand query terms for transparency
    const expandedTerms = expandQueryTerms(query.denialReason, query.payer);

    // Run policy retrieval
    const retrievalResult = await retrievePolicyClauses(query);

    return NextResponse.json({
      status: 'ok',
      results: retrievalResult.results,
      totalCandidates: retrievalResult.totalCandidates,
      latencyMs: retrievalResult.latencyMs,
      withinSla: retrievalResult.withinSla,
      mode: retrievalResult.mode,
      topK: retrievalResult.topK,
      expandedTerms,
      query: {
        denialReason: query.denialReason,
        payer: query.payer || null,
        denialType: query.denialType || null,
        cptCodes: query.cptCodes || [],
        icdCodes: query.icdCodes || [],
      },
    });
  } catch (error: any) {
    console.error('[/api/evidence/retrieve] Error:', error.message);
    return NextResponse.json(
      {
        status: 'error',
        message: error.message || 'Internal server error during policy retrieval',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/evidence/retrieve — Quick retrieval by query params
 * Simplified interface for single-query lookups.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const denialReason = searchParams.get('denialReason') || searchParams.get('q') || '';
    const payer = searchParams.get('payer') || undefined;
    const denialType = searchParams.get('denialType') || undefined;
    const mode = searchParams.get('mode') === 'outcomes' ? 'outcomes' : 'policy';

    if (!denialReason) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'denialReason or q query parameter is required',
        },
        { status: 400 }
      );
    }

    const query: PolicyQuery = {
      denialReason,
      payer,
      denialType,
      mode,
    };

    const retrievalResult = await retrievePolicyClauses(query);

    return NextResponse.json({
      status: 'ok',
      results: retrievalResult.results,
      totalCandidates: retrievalResult.totalCandidates,
      latencyMs: retrievalResult.latencyMs,
      withinSla: retrievalResult.withinSla,
      mode: retrievalResult.mode,
      topK: retrievalResult.topK,
    });
  } catch (error: any) {
    console.error('[/api/evidence/retrieve] GET Error:', error.message);
    return NextResponse.json(
      {
        status: 'error',
        message: error.message || 'Internal server error during policy retrieval',
      },
      { status: 500 }
    );
  }
}
