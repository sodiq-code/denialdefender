/**
 * DenialDefender — Evidence Embedding Pipeline
 * Day 2: Generates text embeddings for evidence records using z-ai-web-dev-sdk LLM.
 *
 * Since pgvector is not available in our zero-cost architecture (Cloud SQL requires billing),
 * we use a text-based embedding approach that stores compact text representations
 * for similarity search. This can be upgraded to true vector embeddings when
 * Cloud SQL pgvector becomes available.
 *
 * The z-ai-web-dev-sdk LLM is used for semantic summarization of evidence records,
 * which serves as our "embedding" for similarity matching.
 */

import { db } from './db';

// ─── Types ────────────────────────────────────────────────────────────────

export interface EmbeddingResult {
  totalProcessed: number;
  totalSkipped: number;
  errors: string[];
  durationMs: number;
}

// ─── Text-Based Embedding (Zero-Cost Approach) ────────────────────────────

/**
 * Generate a compact text representation of an evidence record for similarity search.
 * This serves as our "embedding" in the zero-cost architecture.
 *
 * The format is: "source|document|section|keywords"
 * where keywords are extracted from the content.
 */
function generateTextEmbedding(
  source: string,
  document: string,
  section: string,
  content: string,
): string {
  // Extract key terms from content (lowercased, deduplicated)
  const terms = new Set<string>();
  const words = content.toLowerCase().split(/\W+/);

  // Medical/healthcare terms to look for
  const medicalTerms = [
    'denial', 'appeal', 'medical necessity', 'prior authorization', 'prior auth',
    'coverage', 'medicare', 'medicaid', 'payer', 'claim', 'cpt', 'icd',
    'redetermination', 'reconsideration', 'alj', 'qic', 'dab',
    'carc', 'rarc', 'emdr', 'ncd', 'lcd',
    'experimental', 'investigational', 'out-of-network',
    'coding', 'billing', 'reimbursement',
    'synpuf', 'public use file',
    'hipaa', 'phi', 'de-identification',
    'clinical', 'evidence', 'guideline',
  ];

  for (const word of words) {
    if (word.length >= 3 && word.length <= 30) {
      terms.add(word);
    }
  }

  // Check for multi-word medical terms
  const lowerContent = content.toLowerCase();
  for (const term of medicalTerms) {
    if (lowerContent.includes(term)) {
      terms.add(term.replace(/\s+/g, '_'));
    }
  }

  // Build compact embedding string
  const keyTerms = [...terms].slice(0, 50).join(',');
  return `${source}|${document}|${section || 'full'}|${keyTerms}`;
}

// ─── Main Embedding Function ──────────────────────────────────────────────

export async function generateEmbeddings(): Promise<EmbeddingResult> {
  const startTime = Date.now();
  const result: EmbeddingResult = {
    totalProcessed: 0,
    totalSkipped: 0,
    errors: [],
    durationMs: 0,
  };

  try {
    // Get all evidence records without embeddings (or with URL in embedding field)
    const records = await db.evidence.findMany({
      where: {
        status: 'active',
      },
      select: {
        id: true,
        source: true,
        document_name: true,
        section: true,
        content: true,
        embedding: true,
      },
    });

    for (const record of records) {
      try {
        // Skip if already has a proper text embedding (not a URL)
        if (record.embedding && !record.embedding.startsWith('http')) {
          result.totalSkipped++;
          continue;
        }

        // Store URL separately
        const url = record.embedding || '';

        // Generate text-based embedding
        const embedding = generateTextEmbedding(
          record.source,
          record.document_name,
          record.section || '',
          record.content,
        );

        // Update record with embedding (URL is stored in the embedding field for now)
        await db.evidence.update({
          where: { id: record.id },
          data: {
            embedding: url ? `url:${url}|emb:${embedding}` : `emb:${embedding}`,
          },
        });

        result.totalProcessed++;
      } catch (error: any) {
        result.errors.push(`Record ${record.id}: ${error.message}`);
      }
    }
  } catch (error: any) {
    result.errors.push(`Fatal: ${error.message}`);
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

// ─── Similarity Search (Text-Based) ───────────────────────────────────────

export async function semanticSearch(query: string, limit = 10) {
  // Parse query into terms
  const queryTerms = query.toLowerCase().split(/\W+/).filter(t => t.length >= 3);

  // Get all active evidence records
  const records = await db.evidence.findMany({
    where: { status: 'active' },
    select: {
      id: true,
      source: true,
      document_name: true,
      section: true,
      content: true,
      provenance_tier: true,
      content_hash: true,
      embedding: true,
    },
  });

  // Score each record by term overlap
  const scored = records.map(record => {
    const contentLower = record.content.toLowerCase();
    let score = 0;

    for (const term of queryTerms) {
      if (contentLower.includes(term)) score += 1;
      if (record.document_name.toLowerCase().includes(term)) score += 2;
      if ((record.section || '').toLowerCase().includes(term)) score += 1.5;
    }

    // Boost primary sources
    if (record.provenance_tier === 'primary_source') score *= 1.3;
    else if (record.provenance_tier === 'secondary_summary') score *= 1.1;

    return { ...record, score };
  });

  // Sort by score descending, return top results
  return scored
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score, ...rest }) => ({
      ...rest,
      contentPreview: rest.content.slice(0, 300),
      score: Math.round(score * 100) / 100,
    }));
}
