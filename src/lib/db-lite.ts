/**
 * DenialDefender — Lightweight Database Client
 *
 * Uses better-sqlite3 for simple read queries that don't need
 * the full Prisma client (which is ~74MB and causes OOM in
 * memory-constrained environments).
 *
 * For write operations and complex queries, use the Prisma
 * client from @/lib/db.
 */

import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DATABASE_URL?.replace('file:', '') || path.join(process.cwd(), 'db', 'custom.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    // Don't set WAL on readonly - just use the default journal mode
  }
  return _db;
}

/**
 * Get total case count — used by the dashboard metrics.
 */
export function getCaseCount(): number {
  const db = getDb();
  const result = db.prepare('SELECT COUNT(*) as count FROM "Case"').get() as { count: number };
  return result.count;
}

/**
 * Get case state distribution — for dashboard stats.
 */
export function getCaseStateStats(): Record<string, number> {
  const db = getDb();
  const rows = db.prepare('SELECT state, COUNT(*) as count FROM "Case" GROUP BY state').all() as Array<{ state: string; count: number }>;
  const stats: Record<string, number> = {};
  for (const row of rows) {
    stats[row.state] = row.count;
  }
  return stats;
}

/**
 * Get recent cases with denial info — for the cases list view.
 */
export function getRecentCases(limit = 50, offset = 0): Array<Record<string, unknown>> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      c.id, c.patient_id, c.state, c.deadline, c.persona, c.created_at, c.updated_at,
      d.payer, d.reason_code, d.category, d.confidence
    FROM "Case" c
    LEFT JOIN "Denial" d ON d.case_id = c.id
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as Array<Record<string, unknown>>;
  return rows;
}

/**
 * Get evidence count.
 */
export function getEvidenceCount(): number {
  const db = getDb();
  const result = db.prepare('SELECT COUNT(*) as count FROM "Evidence"').get() as { count: number };
  return result.count;
}

/**
 * Check if the database is accessible.
 */
export function isDatabaseHealthy(): boolean {
  try {
    const db = getDb();
    db.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}
