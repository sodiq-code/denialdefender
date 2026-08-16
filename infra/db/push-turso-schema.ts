/**
 * Push Prisma schema DDL to Turso database
 * Usage: TURSO_DB_URL=... TURSO_DB_TOKEN=... bun run infra/db/push-turso-schema.ts
 */
import { createClient } from '@libsql/client';

const TURSO_URL = process.env.TURSO_DB_URL || '';
const TURSO_TOKEN = process.env.TURSO_DB_TOKEN || '';

const DDL_STATEMENTS = [
  // Tables
  `CREATE TABLE IF NOT EXISTS "Case" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patient_id" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'created',
    "deadline" DATETIME,
    "persona" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "Denial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "case_id" TEXT NOT NULL,
    "payer" TEXT NOT NULL,
    "reason_code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "denial_letter_text" TEXT NOT NULL,
    "deadline" DATETIME,
    "confidence" REAL,
    "structured_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Denial_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Evidence" (
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
  )`,
  `CREATE TABLE IF NOT EXISTS "Citation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evidence_id" TEXT NOT NULL,
    "span_start" INTEGER NOT NULL,
    "span_end" INTEGER NOT NULL,
    "claim_text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unverified',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Citation_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "Evidence" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Outcome" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "case_id" TEXT NOT NULL,
    "verdict" TEXT NOT NULL DEFAULT 'pending',
    "level" TEXT NOT NULL DEFAULT 'initial',
    "recorded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Outcome_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "DecisionTraceEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "case_id" TEXT NOT NULL,
    "agent_name" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'started',
    "details" TEXT,
    "references" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DecisionTraceEvent_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "HitlGate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "case_id" TEXT NOT NULL,
    "gate_number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewer_note" TEXT,
    "resolved_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HitlGate_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "PhiGuardAudit" (
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
  )`,
  `CREATE TABLE IF NOT EXISTS "GovernanceAudit" (
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
  )`,
  // Indexes
  `CREATE INDEX IF NOT EXISTS "Denial_case_id_key" ON "Denial"("case_id")`,
  `CREATE INDEX IF NOT EXISTS "Evidence_content_hash_idx" ON "Evidence"("content_hash")`,
  `CREATE INDEX IF NOT EXISTS "Evidence_source_idx" ON "Evidence"("source")`,
  `CREATE INDEX IF NOT EXISTS "Evidence_provenance_tier_idx" ON "Evidence"("provenance_tier")`,
  `CREATE INDEX IF NOT EXISTS "Evidence_status_idx" ON "Evidence"("status")`,
  `CREATE INDEX IF NOT EXISTS "Evidence_payer_name_idx" ON "Evidence"("payer_name")`,
  `CREATE INDEX IF NOT EXISTS "Evidence_denial_type_idx" ON "Evidence"("denial_type")`,
  `CREATE INDEX IF NOT EXISTS "Evidence_clause_id_idx" ON "Evidence"("clause_id")`,
  `CREATE INDEX IF NOT EXISTS "PhiGuardAudit_case_id_idx" ON "PhiGuardAudit"("case_id")`,
  `CREATE INDEX IF NOT EXISTS "PhiGuardAudit_verdict_idx" ON "PhiGuardAudit"("verdict")`,
  `CREATE INDEX IF NOT EXISTS "PhiGuardAudit_content_hash_idx" ON "PhiGuardAudit"("content_hash")`,
  `CREATE INDEX IF NOT EXISTS "GovernanceAudit_component_idx" ON "GovernanceAudit"("component")`,
  `CREATE INDEX IF NOT EXISTS "GovernanceAudit_action_idx" ON "GovernanceAudit"("action")`,
  `CREATE INDEX IF NOT EXISTS "GovernanceAudit_agent_name_idx" ON "GovernanceAudit"("agent_name")`,
  `CREATE INDEX IF NOT EXISTS "GovernanceAudit_case_id_idx" ON "GovernanceAudit"("case_id")`,
  `CREATE INDEX IF NOT EXISTS "GovernanceAudit_verdict_idx" ON "GovernanceAudit"("verdict")`,
];

async function main() {
  const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

  console.log('Pushing schema to Turso...');
  for (const stmt of DDL_STATEMENTS) {
    try {
      await client.execute(stmt);
      console.log('✓', stmt.slice(0, 60) + '...');
    } catch (e: any) {
      if (e.message?.includes('already exists')) {
        console.log('⊘ (exists)', stmt.slice(0, 60) + '...');
      } else {
        console.error('✗', stmt.slice(0, 60), e.message);
      }
    }
  }
  console.log('Schema push complete!');
}

main().catch(console.error);
