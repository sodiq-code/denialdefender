/**
 * DenialDefender — Database Client
 *
 * Dual-mode database:
 * - Turso mode (TURSO_DB_URL set): Uses @libsql/client directly for persistent cloud SQLite
 * - Local mode: Uses Prisma with local SQLite file
 *
 * Prisma's SQLite provider validates DATABASE_URL starts with "file:" and the
 * LibSQL adapter has a URL_INVALID bug in Prisma 6.19.x. So for Turso,
 * we bypass Prisma entirely and use @libsql/client directly.
 */

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  dbInitialized: boolean | undefined
}

const TURSO_URL = process.env.TURSO_DB_URL || ''
const USE_TURSO = TURSO_URL.startsWith('libsql://') || TURSO_URL.startsWith('https://')

// ── Turso Direct Client ─────────────────────────────────────────────────────
let tursoClient: any = null

async function getTursoClient() {
  if (tursoClient) return tursoClient
  const { createClient } = await import('@libsql/client')
  tursoClient = createClient({
    url: TURSO_URL,
    authToken: process.env.TURSO_DB_TOKEN || '',
  })
  console.log('[db] Connected to Turso:', TURSO_URL.replace(/\/\/.*@/, '//***@'))
  return tursoClient
}

// ── Prisma Client (for local SQLite only) ───────────────────────────────────
const prismaClient = globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prismaClient

// DDL statements for auto-initialization (SQLite only)
const INIT_SQL = `
CREATE TABLE IF NOT EXISTS "Case" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "patient_id" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'created',
  "deadline" DATETIME,
  "persona" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS "Denial" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "case_id" TEXT NOT NULL UNIQUE,
  "payer" TEXT NOT NULL,
  "reason_code" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "denial_letter_text" TEXT NOT NULL,
  "deadline" DATETIME,
  "confidence" REAL,
  "structured_json" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Denial_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "Evidence" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "source" TEXT NOT NULL,
  "document_name" TEXT NOT NULL,
  "section" TEXT,
  "effective_date" DATETIME,
  "content_hash" TEXT NOT NULL,
  "embedding" TEXT,
  "provenance_tier" TEXT NOT NULL DEFAULT 'primary_source',
  "status" TEXT NOT NULL DEFAULT 'active',
  "retrieved_date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "content" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payer_name" TEXT,
  "denial_type" TEXT,
  "retrieval_weight" REAL NOT NULL DEFAULT 1.0,
  "clause_id" TEXT
);
CREATE TABLE IF NOT EXISTS "Citation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "evidence_id" TEXT NOT NULL,
  "span_start" INTEGER NOT NULL,
  "span_end" INTEGER NOT NULL,
  "claim_text" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'unverified',
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Citation_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "Evidence" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "Outcome" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "case_id" TEXT NOT NULL,
  "verdict" TEXT NOT NULL DEFAULT 'pending',
  "level" TEXT NOT NULL DEFAULT 'initial',
  "recorded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Outcome_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "DecisionTraceEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "case_id" TEXT NOT NULL,
  "agent_name" TEXT NOT NULL,
  "step" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'started',
  "details" TEXT,
  "references" TEXT,
  "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DecisionTraceEvent_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "HitlGate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "case_id" TEXT NOT NULL,
  "gate_number" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewer_note" TEXT,
  "resolved_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HitlGate_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "PhiGuardAudit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "case_id" TEXT NOT NULL,
  "content_hash" TEXT NOT NULL,
  "verdict" TEXT NOT NULL,
  "risk_score" INTEGER NOT NULL,
  "pattern_count" INTEGER NOT NULL,
  "pattern_types" TEXT NOT NULL,
  "model_invocations" INTEGER NOT NULL DEFAULT 0,
  "blocked_at" DATETIME,
  "allowed_at" DATETIME,
  "content_preview" TEXT NOT NULL,
  "details" TEXT,
  "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "GovernanceAudit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "case_id" TEXT,
  "component" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "agent_name" TEXT,
  "verdict" TEXT NOT NULL,
  "risk_score" INTEGER NOT NULL DEFAULT 0,
  "details" TEXT,
  "content_hash" TEXT,
  "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Evidence_content_hash_idx" ON "Evidence"("content_hash");
CREATE INDEX IF NOT EXISTS "Evidence_source_idx" ON "Evidence"("source");
CREATE INDEX IF NOT EXISTS "Evidence_provenance_tier_idx" ON "Evidence"("provenance_tier");
CREATE INDEX IF NOT EXISTS "Evidence_status_idx" ON "Evidence"("status");
CREATE INDEX IF NOT EXISTS "PhiGuardAudit_case_id_idx" ON "PhiGuardAudit"("case_id");
CREATE INDEX IF NOT EXISTS "GovernanceAudit_component_idx" ON "GovernanceAudit"("component");
CREATE INDEX IF NOT EXISTS "GovernanceAudit_verdict_idx" ON "GovernanceAudit"("verdict");
CREATE TABLE IF NOT EXISTS "LearnedPattern" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "pattern_type" TEXT NOT NULL,
  "denial_category" TEXT NOT NULL,
  "payer" TEXT NOT NULL,
  "data" TEXT NOT NULL,
  "confidence" REAL NOT NULL DEFAULT 0.5,
  "source_outcomes" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS "CaseMemoryState" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "case_id" TEXT NOT NULL UNIQUE,
  "state" TEXT NOT NULL DEFAULT 'intake',
  "denial_category" TEXT,
  "payer" TEXT,
  "deadline" DATETIME,
  "hitl_gates" TEXT NOT NULL DEFAULT '{"gate1":false,"gate2":false}',
  "agent_results" TEXT NOT NULL DEFAULT '{}',
  "decision_trace" TEXT NOT NULL DEFAULT '[]',
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS "LearnedPattern_pattern_type_idx" ON "LearnedPattern"("pattern_type");
CREATE INDEX IF NOT EXISTS "LearnedPattern_denial_category_idx" ON "LearnedPattern"("denial_category");
CREATE INDEX IF NOT EXISTS "LearnedPattern_payer_idx" ON "LearnedPattern"("payer");
CREATE INDEX IF NOT EXISTS "LearnedPattern_confidence_idx" ON "LearnedPattern"("confidence");
CREATE INDEX IF NOT EXISTS "CaseMemoryState_case_id_idx" ON "CaseMemoryState"("case_id");
CREATE INDEX IF NOT EXISTS "CaseMemoryState_state_idx" ON "CaseMemoryState"("state");
`

let initPromise: Promise<void> | null = null

async function initializeSchema(): Promise<void> {
  if (initPromise) return initPromise
  if (USE_TURSO) return // Turso tables already exist

  initPromise = (async () => {
    if (globalForPrisma.dbInitialized) return
    try {
      await prismaClient.case.count()
      globalForPrisma.dbInitialized = true
    } catch (e: any) {
      if (e?.code === 'P2021') {
        console.log('[db] Creating tables in SQLite...')
        try {
          const statements = INIT_SQL.split(';').map(s => s.trim()).filter(s => s.length > 0)
          for (const stmt of statements) {
            await prismaClient.$executeRawUnsafe(stmt)
          }
          console.log('[db] Tables created successfully')
        } catch (err) {
          console.error('[db] Table creation error:', err)
        }
        globalForPrisma.dbInitialized = true
      } else {
        throw e
      }
    }
  })()
  return initPromise
}

/**
 * Proxy that auto-initializes on first property access.
 * For Turso: routes all model calls through @libsql/client
 * For SQLite: uses Prisma normally
 */
export const db = new Proxy(prismaClient, {
  get(target, prop, receiver) {
    if (typeof prop === 'string' && prop !== '$transaction' && prop !== '$connect' && prop !== '$disconnect' && prop !== '$extends' && prop !== '$executeRawUnsafe' && prop !== '$queryRawUnsafe') {
      const original = Reflect.get(target, prop, receiver)
      if (original && typeof original === 'object') {
        return new Proxy(original, {
          get(modelTarget, modelProp, modelReceiver) {
            const method = Reflect.get(modelTarget, modelProp, modelReceiver)
            if (typeof method === 'function') {
              return async function (...args: any[]) {
                await initializeSchema()
                return method.apply(modelTarget, args)
              }
            }
            return method
          }
        })
      }
    }
    return original
  }
}) as PrismaClient

/** Whether using Turso (persistent) or local SQLite (ephemeral) */
export const isTurso = USE_TURSO

/** Get the raw Turso client for direct queries */
export { getTursoClient }
