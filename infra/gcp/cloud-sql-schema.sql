-- ══════════════════════════════════════════════════════════════════════════════
-- DenialDefender Cloud SQL pgvector Schema
-- PostgreSQL 16 + pgvector extension
-- Applied to: denialdefender-pg / evidence database
-- ══════════════════════════════════════════════════════════════════════════════

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ═══════════════════════════════════════════════════════════════
-- Evidence Table — Stores indexed evidence documents with embeddings
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS evidence (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source          TEXT NOT NULL,                -- 'CMS', 'payer_policy', 'medicare_appeals', 'synpufs'
    document_name   TEXT NOT NULL,                -- Document title / filename
    section         TEXT,                         -- Section within the document
    effective_date  DATE,                         -- When the policy/evidence took effect
    content_hash    TEXT NOT NULL UNIQUE,         -- SHA-256 hash of the content for dedup
    content         TEXT NOT NULL,                -- Full text content
    embedding       vector(768),                  -- Gemini text-embedding-004 (768 dims)
    provenance_tier TEXT NOT NULL DEFAULT 'primary_source'
                    CHECK (provenance_tier IN ('primary_source', 'secondary_summary', 'tertiary_commentary')),
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'superseded', 'retired')),
    retrieved_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index for fast approximate nearest-neighbor search
CREATE INDEX IF NOT EXISTS idx_evidence_embedding ON evidence
    USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_evidence_source ON evidence (source, status);
CREATE INDEX IF NOT EXISTS idx_evidence_hash ON evidence (content_hash);

-- ═══════════════════════════════════════════════════════════════
-- Citation Table — Links evidence to specific claims in appeal drafts
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS citation (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id     UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    span_start      INTEGER,                      -- Character offset start in evidence content
    span_end        INTEGER,                      -- Character offset end in evidence content
    claim_text      TEXT NOT NULL,                -- The specific claim this citation supports
    status          TEXT NOT NULL DEFAULT 'unverified'
                    CHECK (status IN ('verified', 'unverified', 'disputed', 'unsupported')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_citation_evidence ON citation (evidence_id);
CREATE INDEX IF NOT EXISTS idx_citation_status ON citation (status);

-- ═══════════════════════════════════════════════════════════════
-- Provenance View — For provenance card rendering
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW provenance_card AS
SELECT
    e.id AS evidence_id,
    e.source,
    e.document_name,
    e.section,
    e.effective_date,
    e.content_hash,
    e.provenance_tier,
    e.status AS evidence_status,
    e.retrieved_date,
    c.id AS citation_id,
    c.claim_text,
    c.status AS citation_status
FROM evidence e
LEFT JOIN citation c ON c.evidence_id = e.id;

-- ═══════════════════════════════════════════════════════════════
-- Helper: Similarity search function (cosine)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION search_evidence(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    source TEXT,
    document_name TEXT,
    section TEXT,
    content TEXT,
    provenance_tier TEXT,
    similarity float
)
LANGUAGE sql STABLE
AS $$
    SELECT
        e.id,
        e.source,
        e.document_name,
        e.section,
        e.content,
        e.provenance_tier,
        1 - (e.embedding <=> query_embedding) AS similarity
    FROM evidence e
    WHERE e.status = 'active'
      AND 1 - (e.embedding <=> query_embedding) >= match_threshold
    ORDER BY e.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- ═══════════════════════════════════════════════════════════════
-- Firestore Security Rules (documented here for reference)
-- These are deployed separately via gcloud firestore security-rules create
-- ═══════════════════════════════════════════════════════════════
-- rules_version = '2';
-- service cloud.firestore {
--   match /databases/{database}/documents {
--     match /{document=**} {
--       allow read, write: if false;
--     }
--   }
-- }
