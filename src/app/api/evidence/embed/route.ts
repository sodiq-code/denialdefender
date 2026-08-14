/**
 * POST /api/evidence/embed — Generate embeddings for evidence records
 * GET /api/evidence/embed?q=... — Semantic search using embeddings
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateEmbeddings, semanticSearch } from '@/lib/evidence-embed';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit') || '10');

    if (!query) {
      return NextResponse.json(
        { status: 'error', message: 'Query parameter "q" is required' },
        { status: 400 }
      );
    }

    const results = await semanticSearch(query, limit);

    return NextResponse.json({
      status: 'ok',
      query,
      total: results.length,
      results,
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const result = await generateEmbeddings();

    return NextResponse.json({
      status: 'ok',
      embedding: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}
