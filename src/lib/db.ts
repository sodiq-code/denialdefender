/**
 * DenialDefender — Database Client
 *
 * Supports both local SQLite and Turso (libSQL) for Cloud Run persistence:
 * - TURSO_DB_URL + TURSO_DB_TOKEN → Turso (persistent cloud SQLite via Prisma adapter)
 * - DATABASE_URL=file:... → Local SQLite (development / ephemeral)
 *
 * Prisma's SQLite provider validates DATABASE_URL starts with "file:" at startup.
 * So we use separate TURSO_DB_URL/TURSO_DB_TOKEN env vars for the Turso connection,
 * while keeping DATABASE_URL as a valid file: path for Prisma's schema validation.
 * When the adapter is provided, Prisma uses it for queries (ignoring DATABASE_URL).
 */

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  dbInitialized: boolean | undefined
}

const TURSO_URL = process.env.TURSO_DB_URL || ''
const USE_TURSO = TURSO_URL.startsWith('libsql://') || TURSO_URL.startsWith('https://')

// DDL statements for auto-initialization
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

async function createPrismaClient(): Promise<PrismaClient> {
  if (USE_TURSO) {
    try {
      const { PrismaLibSQL } = await import('@prisma/adapter-libsql')
      const { createClient } = await import('@libsql/client')

      const libsql = createClient({
        url: TURSO_URL,
        authToken: process.env.TURSO_DB_TOKEN || '',
      })

      const adapter = new PrismaLibSQL(libsql)
      // DATABASE_URL must be a valid file: path for Prisma's SQLite validation,
      // but the adapter overrides the actual connection to Turso
      const client = new PrismaClient({ adapter } as any)
      console.log('[db] Connected to Turso (persistent):', TURSO_URL.replace(/\/\/.*@/, '//***@'))
      return client
    } catch (err) {
      console.error('[db] Turso adapter failed, falling back to SQLite:', err)
    }
  }

  console.log('[db] Using SQLite (local/ephemeral)')
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })
}

// Create PrismaClient — async for Turso, sync for SQLite
let prismaClient: PrismaClient
let prismaReady: Promise<void>

if (USE_TURSO) {
  // Placeholder — will be replaced when Turso adapter is ready
  prismaClient = null as any
  prismaReady = createPrismaClient().then(client => {
    prismaClient = client
  })
} else {
  prismaClient = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })
  prismaReady = Promise.resolve()
}

let initPromise: Promise<void> | null = null

async function initializeSchema(): Promise<void> {
  if (initPromise) return initPromise

  initPromise = (async () => {
    // Wait for Turso client to be ready
    await prismaReady

    if (globalForPrisma.dbInitialized) return

    try {
      await prismaClient.case.count()
      globalForPrisma.dbInitialized = true
    } catch (e: any) {
      if (e?.code === 'P2021') {
        console.log('[db] Creating tables...')
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
 * Export a proxy that auto-initializes on first property access.
 * Also waits for Turso adapter to be ready before any query.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop, _receiver) {
    if (typeof prop === 'string' && prop !== '$transaction' && prop !== '$connect' && prop !== '$disconnect' && prop !== '$extends' && prop !== '$executeRawUnsafe' && prop !== '$queryRawUnsafe') {
      return new Proxy({}, {
        get(_modelTarget, modelProp, _modelReceiver) {
          const methodRef = { current: null as any }
          return async function (...args: any[]) {
            await prismaReady
            await initializeSchema()
            // Get the actual model method at call time (after prismaClient is set)
            const model = (prismaClient as any)[prop]
            if (!model) throw new Error(`[db] Model ${String(prop)} not found`)
            const method = model[modelProp]
            if (!method) throw new Error(`[db] Method ${String(modelProp)} not found on ${String(prop)}`)
            return method.apply(model, args)
          }
        }
      })
    }
    // For $executeRawUnsafe etc.
    return async function (...args: any[]) {
      await prismaReady
      await initializeSchema()
      return (prismaClient as any)[prop](...args)
    }
  }
}) as PrismaClient

/** Whether using Turso (persistent) or local SQLite (ephemeral) */
export const isTurso = USE_TURSO
