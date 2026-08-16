import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/cases - List cases using a subprocess to avoid OOM from heavy native modules.
 *
 * Spawns a quick `node -e` subprocess that uses better-sqlite3 to query
 * the database, keeping the main Next.js server process lightweight.
 */
export async function GET() {
  try {
    const { execSync } = await import('child_process');
    const dbPath = process.env.DATABASE_URL?.replace('file:', '') || '';

    const result = execSync(
      `node -e "
const Database = require('better-sqlite3');
const db = new Database('${dbPath}', { readonly: true });
const cases = db.prepare('SELECT c.id, c.patient_id, c.state, c.deadline, c.persona, c.created_at, c.updated_at, d.payer, d.reason_code, d.category, d.confidence FROM \\"Case\\" c LEFT JOIN \\"Denial\\" d ON d.case_id = c.id ORDER BY c.created_at DESC LIMIT 200').all();
process.stdout.write(JSON.stringify({ cases, total: cases.length }));
db.close();
"`,
      { timeout: 10000, encoding: 'utf-8', cwd: process.cwd() }
    );

    const data = JSON.parse(result);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[GET /api/cases] Error:', error);
    // Fallback: return empty response rather than crashing
    return NextResponse.json({ cases: [], total: 0 });
  }
}

/**
 * POST /api/cases - Create a new case
 * Uses a subprocess for write operations too.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.patient_id) {
      return NextResponse.json(
        { error: 'patient_id is required' },
        { status: 400 }
      );
    }

    const { execSync } = await import('child_process');
    const dbPath = process.env.DATABASE_URL?.replace('file:', '') || '';

    const result = execSync(
      `node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const c = await p.case.create({
    data: {
      patient_id: '${body.patient_id}',
      state: 'created',
      deadline: ${body.deadline ? `new Date('${body.deadline}')` : 'null'},
      persona: ${body.persona ? `'${body.persona}'` : 'null'},
    },
    include: { denial: true, traces: true, outcomes: true, gates: true },
  });
  process.stdout.write(JSON.stringify({ case: c }));
  await p.\\$disconnect();
})();
"`,
      { timeout: 15000, encoding: 'utf-8', cwd: process.cwd() }
    );

    const data = JSON.parse(result);
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[POST /api/cases] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create case' },
      { status: 500 }
    );
  }
}
