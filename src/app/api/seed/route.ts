import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/seed — Seed the database with all blueprint cases
 *
 * Generates the full set of synthetic cases from the DenialDefender
 * blueprint (Days 2-14) and stores them in the local SQLite database.
 *
 * Called once after deployment to populate the database.
 * Safe to call multiple times — skips existing cases.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json().catch(() => ({}));
    const targetCount = body.count || 90;
    const force = body.force === true;

    const existingCount = await db.case.count();
    if (existingCount >= targetCount && !force) {
      return NextResponse.json({
        status: 'already_seeded',
        existingCases: existingCount,
        message: `Database already has ${existingCount} cases. Use { "force": true } to re-seed.`,
      });
    }

    const { storeSyntheticCases } = await import('@/lib/synthetic-cases');
    const result = await storeSyntheticCases(targetCount);

    return NextResponse.json({
      status: 'seeded',
      created: result.created,
      errors: result.errors.length > 0 ? result.errors.slice(0, 10) : undefined,
      durationMs: Date.now() - startTime,
      totalCases: await db.case.count(),
    });
  } catch (error: any) {
    console.error('[POST /api/seed] Error:', error);
    return NextResponse.json(
      { status: 'error', message: error.message, durationMs: Date.now() - startTime },
      { status: 500 }
    );
  }
}

/**
 * GET /api/seed — Check seed status
 */
export async function GET() {
  try {
    return NextResponse.json({
      database: 'local_sqlite',
      cases: await db.case.count(),
      denials: await db.denial.count(),
      traces: await db.decisionTraceEvent.count(),
      gates: await db.hitlGate.count(),
    });
  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
