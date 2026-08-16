/**
 * GET /api/evidence/[id] — Get single evidence record with full content
 * POST /api/evidence/ingest — Run full ingest pipeline
 * Uses Turso directly for Cloud Run (persistent), Prisma for local dev
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveCitation, ingestRawEvidence, getCorpusStats, ingestPayerPolicies } from '@/lib/evidence-ingest';

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
    const { isTurso, getTursoClient } = await import('@/lib/db');

    if (isTurso) {
      const client = await getTursoClient();

      // Build WHERE clause
      const conditions: string[] = ['status = ?'];
      const args: any[] = ['active'];
      if (tier) { conditions.push('provenance_tier = ?'); args.push(tier); }
      if (source) { conditions.push('source = ?'); args.push(source); }

      const whereClause = conditions.join(' AND ');

      // Count total
      const countResult = await client.execute({
        sql: `SELECT COUNT(*) as total FROM "Evidence" WHERE ${whereClause}`,
        args,
      });
      const total = Number((countResult.rows[0] as any)?.total ?? 0);

      // Fetch paginated records
      const offset = (page - 1) * pageSize;
      const recordsResult = await client.execute({
        sql: `SELECT id, source, document_name, section, provenance_tier, content_hash,
                     effective_date, retrieved_date, status, content
              FROM "Evidence" WHERE ${whereClause}
              ORDER BY provenance_tier ASC, source ASC
              LIMIT ? OFFSET ?`,
        args: [...args, pageSize, offset],
      });

      return NextResponse.json({
        status: 'ok',
        total,
        page,
        pageSize,
        records: recordsResult.rows.map((r: any) => ({
          id: r.id,
          source: r.source,
          document: r.document_name,
          section: r.section,
          provenance: r.provenance_tier,
          contentHash: r.content_hash,
          effectiveDate: r.effective_date,
          retrievedDate: r.retrieved_date,
          status: r.status,
          contentPreview: (r.content || '').slice(0, 200),
        })),
      });
    }

    // Fallback: Prisma (local SQLite)
    const { db } = await import('@/lib/db');
    const where: any = { status: 'active' };
    if (tier) where.provenance_tier = tier;
    if (source) where.source = source;

    const [records, total] = await Promise.all([
      db.evidence.findMany({
        where,
        select: {
          id: true, source: true, document_name: true, section: true,
          provenance_tier: true, content_hash: true, effective_date: true,
          retrieved_date: true, status: true, content: true,
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
