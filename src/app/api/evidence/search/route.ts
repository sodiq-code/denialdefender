/**
 * GET /api/evidence/search?q=... — Search evidence corpus
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchEvidence } from '@/lib/evidence-ingest';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!query) {
      return NextResponse.json(
        { status: 'error', message: 'Query parameter "q" is required' },
        { status: 400 }
      );
    }

    const results = await searchEvidence(query, limit);

    return NextResponse.json({
      status: 'ok',
      query,
      total: results.length,
      results: results.map(r => ({
        id: r.id,
        source: r.source,
        document: r.document_name,
        section: r.section,
        provenance: r.provenance_tier,
        contentHash: r.content_hash,
        effectiveDate: r.effective_date,
        retrievedDate: r.retrieved_date,
        contentPreview: r.content.slice(0, 300),
        status: r.status,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}
