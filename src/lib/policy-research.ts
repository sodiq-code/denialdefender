/**
 * DenialDefender — Policy Research Service
 * Day 2: Core retrieval engine for the Policy Research Agent.
 *
 * Responsibilities:
 * - Query evidence corpus for relevant payer policy clauses
 * - Support retrieval by: payer name, denial type, CPT code, ICD code
 * - Return top-K results (K=5 for policy, K=3 for outcomes per blueprint)
 * - Provenance card generation for each result
 * - Re-ranking by retrieval_weight as per blueprint
 * - Retrieval latency measurement (target <200ms)
 */

import { db } from './db';
import { semanticSearch } from './evidence-embed';

// ─── Types ────────────────────────────────────────────────────────────────

export interface PolicyQuery {
  denialReason: string;
  payer?: string;
  denialType?: string;
  cptCodes?: string[];
  icdCodes?: string[];
  /** Override default top-K */
  topK?: number;
  /** "policy" (K=5) or "outcomes" (K=3) */
  mode?: 'policy' | 'outcomes';
}

export interface ProvenanceCard {
  evidenceId: string;
  source: string;
  documentName: string;
  section: string | null;
  provenanceTier: string;
  contentHash: string;
  effectiveDate: Date | null;
  payerName: string | null;
  denialType: string | null;
  clauseId: string | null;
  retrievalWeight: number;
}

export interface PolicyResult {
  evidenceId: string;
  source: string;
  documentName: string;
  section: string | null;
  content: string;
  contentPreview: string;
  provenanceTier: string;
  contentHash: string;
  payerName: string | null;
  denialType: string | null;
  clauseId: string | null;
  retrievalWeight: number;
  /** Semantic similarity score from evidence-embed */
  semanticScore: number;
  /** Final score after provenance boosting + retrieval_weight re-ranking */
  finalScore: number;
  provenanceCard: ProvenanceCard;
}

export interface PolicyRetrievalResponse {
  query: PolicyQuery;
  results: PolicyResult[];
  totalCandidates: number;
  latencyMs: number;
  withinSla: boolean; // true if latencyMs < 200
  mode: 'policy' | 'outcomes';
  topK: number;
}

// ─── Default K values per blueprint ───────────────────────────────────────

const DEFAULT_TOP_K: Record<string, number> = {
  policy: 5,
  outcomes: 3,
};

// ─── Provenance tier boost multipliers ────────────────────────────────────

const PROVENANCE_BOOST: Record<string, number> = {
  primary_source: 1.5,
  secondary_summary: 1.2,
  tertiary_commentary: 1.0,
};

// ─── Query Expansion ──────────────────────────────────────────────────────

/**
 * Expand a denial reason into multiple search terms for better recall.
 * Uses keyword extraction and medical terminology mapping.
 * Does NOT use LLM — pure rule-based expansion for <200ms latency.
 */
function expandQuery(query: PolicyQuery): string[] {
  const terms: string[] = [];

  // 1. Core denial reason terms
  const denialWords = query.denialReason
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length >= 3);
  terms.push(query.denialReason);
  if (denialWords.length > 2) {
    terms.push(denialWords.join(' '));
  }

  // 2. Denial type specific expansion
  const denialTypeMap: Record<string, string[]> = {
    medical_necessity: ['medical necessity', 'not medically necessary', 'clinical guidelines', 'standard of care', 'coverage criteria'],
    prior_auth: ['prior authorization', 'preauthorization', 'precertification', 'authorization required', 'retrospective review'],
    coding: ['coding error', 'incorrect code', 'code mismatch', 'bundling', 'unbundling', 'modifier'],
    experimental: ['experimental', 'investigational', 'not proven', 'insufficient evidence', 'clinical trial'],
    out_of_network: ['out of network', 'non-participating', 'network status', 'balance billing', 'emergency exception'],
  };

  const dtype = query.denialType || '';
  if (denialTypeMap[dtype]) {
    terms.push(...denialTypeMap[dtype]);
  }

  // 3. Payer-specific terms
  if (query.payer) {
    terms.push(query.payer);
    terms.push(`${query.payer} medical policy`);
    terms.push(`${query.payer} coverage`);
  }

  // 4. CPT code terms
  if (query.cptCodes && query.cptCodes.length > 0) {
    for (const cpt of query.cptCodes) {
      terms.push(`CPT ${cpt}`);
      terms.push(cpt);
    }
  }

  // 5. ICD code terms
  if (query.icdCodes && query.icdCodes.length > 0) {
    for (const icd of query.icdCodes) {
      terms.push(`ICD ${icd}`);
      terms.push(icd);
    }
  }

  return [...new Set(terms)]; // Deduplicate
}

// ─── Provenance Card Builder ──────────────────────────────────────────────

function buildProvenanceCard(evidence: {
  id: string;
  source: string;
  document_name: string;
  section: string | null;
  provenance_tier: string;
  content_hash: string;
  effective_date: Date | null;
  payer_name: string | null;
  denial_type: string | null;
  clause_id: string | null;
  retrieval_weight: number;
}): ProvenanceCard {
  return {
    evidenceId: evidence.id,
    source: evidence.source,
    documentName: evidence.document_name,
    section: evidence.section,
    provenanceTier: evidence.provenance_tier,
    contentHash: evidence.content_hash,
    effectiveDate: evidence.effective_date,
    payerName: evidence.payer_name,
    denialType: evidence.denial_type,
    clauseId: evidence.clause_id,
    retrievalWeight: evidence.retrieval_weight,
  };
}

// ─── Main Policy Retrieval ────────────────────────────────────────────────

/**
 * Retrieve relevant payer policy clauses from the evidence corpus.
 *
 * Pipeline:
 * 1. Expand query into multiple search terms
 * 2. Run semantic search via evidence-embed module
 * 3. Filter by payer, denial type, codes if specified
 * 4. Re-rank by: semantic_score * provenance_boost * retrieval_weight
 * 5. Return top-K with provenance cards
 */
export async function retrievePolicyClauses(query: PolicyQuery): Promise<PolicyRetrievalResponse> {
  const startTime = Date.now();
  const mode = query.mode || 'policy';
  const topK = query.topK || DEFAULT_TOP_K[mode];

  // Step 1: Expand query
  const searchTerms = expandQuery(query);

  // Step 2: Run semantic search for each term, collect candidates
  const candidateMap = new Map<string, {
    id: string;
    source: string;
    document_name: string;
    section: string | null;
    content: string;
    provenance_tier: string;
    content_hash: string;
    payer_name: string | null;
    denial_type: string | null;
    clause_id: string | null;
    retrieval_weight: number;
    semanticScore: number;
  }>();

  // Search with the most specific terms first (limited to avoid excessive queries)
  const prioritizedTerms = searchTerms.slice(0, 6);
  for (const term of prioritizedTerms) {
    try {
      const results = await semanticSearch(term, 20);
      for (const r of results) {
        const existing = candidateMap.get(r.id);
        const score = r.score || 0;
        if (!existing || score > existing.semanticScore) {
          candidateMap.set(r.id, {
            id: r.id,
            source: r.source,
            document_name: r.document_name,
            section: r.section,
            content: r.content,
            provenance_tier: r.provenance_tier as string,
            content_hash: r.content_hash,
            payer_name: (r as any).payer_name ?? null,
            denial_type: (r as any).denial_type ?? null,
            clause_id: (r as any).clause_id ?? null,
            retrieval_weight: (r as any).retrieval_weight ?? 1.0,
            semanticScore: score,
          });
        }
      }
    } catch {
      // Skip failed searches — other terms may still return results
    }
  }

  // Step 3: Apply structured filters via database query
  // Build a where clause for payer, denial_type, and code filtering
  const filteredCandidates: Array<{
    id: string;
    source: string;
    document_name: string;
    section: string | null;
    content: string;
    provenance_tier: string;
    content_hash: string;
    payer_name: string | null;
    denial_type: string | null;
    clause_id: string | null;
    retrieval_weight: number;
    effective_date: Date | null;
  }> = [];

  if (query.payer || query.denialType) {
    // Use database for structured filtering
    const where: any = { status: 'active' };
    if (query.payer) {
      where.OR = [
        { payer_name: { contains: query.payer } },
        { content: { contains: query.payer } },
        { source: { contains: query.payer } },
      ];
    }
    if (query.denialType) {
      if (where.OR) {
        // Add denial_type filter alongside payer filter
        const existingOr = where.OR;
        delete where.OR;
        where.AND = [
          { OR: existingOr },
          {
            OR: [
              { denial_type: query.denialType },
              { content: { contains: query.denialType.replace('_', ' ') } },
            ],
          },
        ];
      } else {
        where.OR = [
          { denial_type: query.denialType },
          { content: { contains: query.denialType.replace('_', ' ') } },
        ];
      }
    }

    const dbResults = await db.evidence.findMany({
      where,
      take: 30,
      orderBy: [
        { provenance_tier: 'asc' },
        { retrieval_weight: 'desc' },
      ],
    });
    filteredCandidates.push(...dbResults);
  }

  // Step 3b: Search by CPT/ICD codes in content
  if (query.cptCodes && query.cptCodes.length > 0) {
    for (const cpt of query.cptCodes) {
      const cptResults = await db.evidence.findMany({
        where: {
          status: 'active',
          OR: [
            { content: { contains: cpt } },
            { section: { contains: cpt } },
          ],
        },
        take: 10,
        orderBy: { retrieval_weight: 'desc' },
      });
      filteredCandidates.push(...cptResults);
    }
  }

  if (query.icdCodes && query.icdCodes.length > 0) {
    for (const icd of query.icdCodes) {
      const icdResults = await db.evidence.findMany({
        where: {
          status: 'active',
          OR: [
            { content: { contains: icd } },
            { section: { contains: icd } },
          ],
        },
        take: 10,
        orderBy: { retrieval_weight: 'desc' },
      });
      filteredCandidates.push(...icdResults);
    }
  }

  // Merge DB-filtered results into candidate map
  for (const r of filteredCandidates) {
    if (!candidateMap.has(r.id)) {
      // Assign a base semantic score for DB results (no semantic search was done)
      const existingSemantic = Array.from(candidateMap.values())
        .find(c => c.content_hash === r.content_hash);
      candidateMap.set(r.id, {
        id: r.id,
        source: r.source,
        document_name: r.document_name,
        section: r.section,
        content: r.content,
        provenance_tier: r.provenance_tier,
        content_hash: r.content_hash,
        payer_name: r.payer_name,
        denial_type: r.denial_type,
        clause_id: r.clause_id,
        retrieval_weight: r.retrieval_weight,
        semanticScore: existingSemantic?.semanticScore ?? 5.0, // Base score for structured matches
      });
    }
  }

  // Step 4: Re-rank by semantic_score * provenance_boost * retrieval_weight
  const ranked = Array.from(candidateMap.values())
    .map(candidate => {
      const provenanceBoost = PROVENANCE_BOOST[candidate.provenance_tier] || 1.0;
      const finalScore = candidate.semanticScore * provenanceBoost * candidate.retrieval_weight;
      return { ...candidate, finalScore };
    })
    .sort((a, b) => b.finalScore - a.finalScore);

  // Step 5: Return top-K with provenance cards
  const topResults = ranked.slice(0, topK);

  const results: PolicyResult[] = topResults.map(r => ({
    evidenceId: r.id,
    source: r.source,
    documentName: r.document_name,
    section: r.section,
    content: r.content,
    contentPreview: r.content.slice(0, 500),
    provenanceTier: r.provenance_tier,
    contentHash: r.content_hash,
    payerName: r.payer_name,
    denialType: r.denial_type,
    clauseId: r.clause_id,
    retrievalWeight: r.retrieval_weight,
    semanticScore: Math.round(r.semanticScore * 100) / 100,
    finalScore: Math.round(r.finalScore * 100) / 100,
    provenanceCard: buildProvenanceCard({
      id: r.id,
      source: r.source,
      document_name: r.document_name,
      section: r.section,
      provenance_tier: r.provenance_tier,
      content_hash: r.content_hash,
      effective_date: null,
      payer_name: r.payer_name,
      denial_type: r.denial_type,
      clause_id: r.clause_id,
      retrieval_weight: r.retrieval_weight,
    }),
  }));

  const latencyMs = Date.now() - startTime;

  return {
    query,
    results,
    totalCandidates: candidateMap.size,
    latencyMs,
    withinSla: latencyMs < 200,
    mode,
    topK,
  };
}

// ─── Specialized Search: Payer Policy Clauses ─────────────────────────────

/**
 * Search specifically for payer policy clauses by payer name and clause ID.
 * This is a targeted search for known payer policy documents.
 */
export async function searchPayerPolicyClauses(
  payerName: string,
  options?: {
    denialType?: string;
    clauseId?: string;
    limit?: number;
  }
): Promise<PolicyResult[]> {
  const startTime = Date.now();
  const limit = options?.limit || 5;

  const where: any = { status: 'active' };

  // Filter by payer name
  const payerConditions: any[] = [
    { payer_name: { contains: payerName } },
    { source: { contains: payerName } },
    { document_name: { contains: payerName } },
    { content: { contains: payerName } },
  ];
  where.OR = payerConditions;

  // Optional denial type filter
  if (options?.denialType) {
    const existingOr = where.OR;
    delete where.OR;
    where.AND = [
      { OR: existingOr },
      {
        OR: [
          { denial_type: options.denialType },
          { content: { contains: options.denialType.replace('_', ' ') } },
        ],
      },
    ];
  }

  // Optional clause ID filter
  if (options?.clauseId) {
    const existingAnd = where.AND || [];
    delete where.AND;
    delete where.OR;
    where.AND = [
      ...existingAnd,
      { OR: [{ clause_id: options.clauseId }, { content: { contains: options.clauseId } }] },
    ];
  }

  const dbResults = await db.evidence.findMany({
    where,
    take: limit * 2, // Over-fetch for re-ranking
    orderBy: [
      { provenance_tier: 'asc' },
      { retrieval_weight: 'desc' },
    ],
  });

  // Re-rank with provenance boost and retrieval_weight
  const ranked = dbResults
    .map(r => {
      const provenanceBoost = PROVENANCE_BOOST[r.provenance_tier] || 1.0;
      const finalScore = 5.0 * provenanceBoost * r.retrieval_weight;
      return { ...r, finalScore };
    })
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, limit);

  return ranked.map(r => ({
    evidenceId: r.id,
    source: r.source,
    documentName: r.document_name,
    section: r.section,
    content: r.content,
    contentPreview: r.content.slice(0, 500),
    provenanceTier: r.provenance_tier,
    contentHash: r.content_hash,
    payerName: r.payer_name,
    denialType: r.denial_type,
    clauseId: r.clause_id,
    retrievalWeight: r.retrieval_weight,
    semanticScore: 5.0,
    finalScore: Math.round((5.0 * (PROVENANCE_BOOST[r.provenance_tier] || 1.0) * r.retrieval_weight) * 100) / 100,
    provenanceCard: buildProvenanceCard({
      id: r.id,
      source: r.source,
      document_name: r.document_name,
      section: r.section,
      provenance_tier: r.provenance_tier,
      content_hash: r.content_hash,
      effective_date: r.effective_date,
      payer_name: r.payer_name,
      denial_type: r.denial_type,
      clause_id: r.clause_id,
      retrieval_weight: r.retrieval_weight,
    }),
  }));
}

// ─── LLM Query Expansion (for Python agent) ───────────────────────────────

/**
 * Use the dual-backend LLM to expand a denial reason into search terms.
 * This is designed to be called from the API route, which proxies to
 * the Python agent fleet's LLM backend.
 *
 * Returns expanded search terms for better recall.
 */
export function expandQueryTerms(denialReason: string, payer?: string): string[] {
  // Fast rule-based expansion (no LLM needed for <200ms target)
  // The Python agent uses LLM for richer expansion when latency budget allows
  const terms: string[] = [];

  // Core denial reason
  terms.push(denialReason);

  // Extract key phrases
  const lowerReason = denialReason.toLowerCase();

  // Medical necessity patterns
  if (lowerReason.includes('medical necessity') || lowerReason.includes('not medically necessary')) {
    terms.push('medical necessity criteria');
    terms.push('clinical guidelines');
    terms.push('standard of care');
  }

  // Prior auth patterns
  if (lowerReason.includes('prior auth') || lowerReason.includes('preauth') || lowerReason.includes('precert')) {
    terms.push('prior authorization requirements');
    terms.push('precertification criteria');
  }

  // Experimental patterns
  if (lowerReason.includes('experimental') || lowerReason.includes('investigational')) {
    terms.push('experimental treatment');
    terms.push('investigational procedure');
    terms.push('clinical trial evidence');
  }

  // Coding patterns
  if (lowerReason.includes('coding') || lowerReason.includes('code') || lowerReason.includes('bundle')) {
    terms.push('coding guidelines');
    terms.push('correct coding initiative');
    terms.push('bundling rules');
  }

  // Add payer if specified
  if (payer) {
    terms.push(`${payer} policy`);
    terms.push(`${payer} coverage determination`);
  }

  return [...new Set(terms)];
}
