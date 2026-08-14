/**
 * GET /api/evidence/[id] — Get single evidence record with full content
 * POST /api/evidence/ingest — Run full ingest pipeline
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveCitation, ingestRawEvidence, getCorpusStats, ingestPayerPolicies } from '@/lib/evidence-ingest';
import { db } from '@/lib/db';

const RAW_DIR = '/home/z/my-project/data/corpus/raw';

// GET /api/evidence?id=... — Resolve a citation to its source evidence
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');
    const tier = searchParams.get('tier');
    const source = searchParams.get('source');

    // Single record by ID
    if (id) {
      const evidence = await resolveCitation(id);
      if (!evidence) {
        return NextResponse.json(
          { status: 'error', message: 'Evidence record not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ status: 'ok', evidence });
    }

    // List evidence records with pagination and filtering
    const where: any = { status: 'active' };
    if (tier) where.provenance_tier = tier;
    if (source) where.source = source;

    const [records, total] = await Promise.all([
      db.evidence.findMany({
        where,
        select: {
          id: true,
          source: true,
          document_name: true,
          section: true,
          provenance_tier: true,
          content_hash: true,
          effective_date: true,
          retrieved_date: true,
          status: true,
          content: true,
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ provenance_tier: 'asc' }, { source: 'asc' }],
      }),
      db.evidence.count({ where }),
    ]);

    return NextResponse.json({
      status: 'ok',
      total,
      page,
      pageSize,
      records: records.map(r => ({
        id: r.id,
        source: r.source,
        document: r.document_name,
        section: r.section,
        provenance: r.provenance_tier,
        contentHash: r.content_hash,
        effectiveDate: r.effective_date,
        retrievedDate: r.retrieved_date,
        status: r.status,
        contentPreview: r.content.slice(0, 200),
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}

// POST /api/evidence — Run evidence ingest
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    // Ingest evidence
    if (body.action === 'ingest') {
      const result = await ingestRawEvidence(RAW_DIR);
      const stats = await getCorpusStats();
      return NextResponse.json({ status: 'ok', ingest: result, corpus: stats });
    }

    // Ingest payer policies
    if (body.action === 'ingest-policies') {
      const result = await ingestPayerPolicies();
      return NextResponse.json({ status: 'ok', policies: result });
    }

    // Generate synthetic cases
    if (body.action === 'synthetic') {
      const { storeSyntheticCases } = await import('@/lib/synthetic-cases');
      const count = body.count || 20;
      const result = await storeSyntheticCases(count);
      return NextResponse.json({ status: 'ok', synthetic: result });
    }

    return NextResponse.json(
      { status: 'error', message: 'Unknown action. Use "ingest", "ingest-policies", or "synthetic"' },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}
