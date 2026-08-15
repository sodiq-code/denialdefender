/**
 * POST /api/outcome-ingest — Ingest outcome records
 *
 * Day 7: Outcome Learning — outcome record updates procedural-evidence weights
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  ingestOutcome,
  ingestOutcomeBatch,
  generatePublicOutcomeRecords,
  generateSyntheticOutcomeRecords,
  type OutcomeRecord,
} from '@/lib/outcome-ingestion';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Single outcome ingestion
    if (body.caseId && body.verdict) {
      const record: OutcomeRecord = {
        caseId: body.caseId,
        verdict: body.verdict,
        level: body.level || 'Redetermination (MAC)',
        strategyUsed: body.strategyUsed || 'unknown',
        citationsUsed: body.citationsUsed || [],
        denialCategory: body.denialCategory || 'other',
        payer: body.payer || 'unknown',
        amount: body.amount || 0,
        turnaroundDays: body.turnaroundDays || 0,
        source: body.source || 'internal',
        sourceDetail: body.sourceDetail || '',
        timestamp: body.timestamp || new Date().toISOString(),
      };

      const result = await ingestOutcome(record);

      return NextResponse.json({
        success: true,
        outcomeId: result.outcomeId,
        weightUpdates: result.weightUpdates.length,
        memoryBankStatus: result.memoryBankStatus,
        durationMs: result.durationMs,
        details: result.weightUpdates.map(u => ({
          evidenceId: u.evidenceId,
          oldWeight: u.oldWeight,
          newWeight: u.newWeight,
          delta: u.delta,
          reason: u.reason,
        })),
      });
    }

    // Batch ingestion
    if (body.records && Array.isArray(body.records)) {
      const result = await ingestOutcomeBatch(body.records);
      return NextResponse.json({ success: true, ...result });
    }

    // Generate and ingest public records
    if (body.ingestPublic) {
      const records = generatePublicOutcomeRecords();
      const result = await ingestOutcomeBatch(records);
      return NextResponse.json({
        success: true,
        source: 'public_records',
        ...result,
      });
    }

    // Generate and ingest synthetic records
    if (body.ingestSynthetic) {
      const count = body.count || 10;
      const records = generateSyntheticOutcomeRecords(count);
      const result = await ingestOutcomeBatch(records);
      return NextResponse.json({
        success: true,
        source: 'synthetic_controlled',
        ...result,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid request. Provide caseId+verdict, records[], ingestPublic, or ingestSynthetic' },
      { status: 400 },
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}

export async function GET() {
  // Return available outcome sources
  return NextResponse.json({
    success: true,
    sources: {
      public: {
        description: 'Real CMS MA appeal data (public record)',
        count: 5,
        available: true,
      },
      synthetic: {
        description: 'Synthetic controlled cases (clearly labeled, not real wins)',
        available: true,
        defaultCount: 10,
      },
    },
  });
}
