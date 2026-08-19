/**
 * GET /api/evidence/corpus — Get evidence corpus statistics
 * POST /api/evidence/corpus — Trigger evidence ingest
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCorpusStats, ingestRawEvidence } from '@/lib/evidence-ingest';

import { join } from 'path';
const RAW_DIR = join(process.cwd(), 'data', 'corpus', 'raw');

export async function GET() {
  try {
    const stats = await getCorpusStats();
    return NextResponse.json({
      status: 'ok',
      corpus: stats,
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun === true;

    if (dryRun) {
      // Just return stats without ingesting
      const stats = await getCorpusStats();
      return NextResponse.json({
        status: 'ok',
        message: 'Dry run — no ingestion performed',
        corpus: stats,
      });
    }

    // Run the full ingest pipeline
    const result = await ingestRawEvidence(RAW_DIR);

    // Get updated stats
    const stats = await getCorpusStats();

    return NextResponse.json({
      status: 'ok',
      ingest: result,
      corpus: stats,
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}
