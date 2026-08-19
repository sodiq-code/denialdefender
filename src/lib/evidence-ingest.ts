/**
 * DenialDefender — Evidence Ingest Service
 * Day 2: Processes raw evidence files, content-hashes, tags with provenance,
 * splits into sections, and stores in SQLite via Prisma.
 *
 * Each evidence record has:
 * - SHA-256 content hash
 * - Source, document, section metadata
 * - Effective date, retrieved date
 * - Provenance tier (primary_source / secondary_summary / tertiary_commentary)
 * - Status (active / superseded / retired)
 */

import { createHash } from 'crypto';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { db } from './db';

// ─── Types ────────────────────────────────────────────────────────────────

export interface RawEvidenceFile {
  source: string;
  document: string;
  url: string;
  retrievedDate: string;
  title?: string;
  description?: string;
  content: string;
  // Optional structured data
  items?: unknown[];
  codes?: unknown[];
  data?: unknown[];
  sections?: unknown[];
}

export interface IngestedRecord {
  id: string;
  source: string;
  documentName: string;
  section: string;
  effectiveDate: Date | null;
  retrievedDate: Date;
  contentHash: string;
  provenanceTier: 'primary_source' | 'secondary_summary' | 'tertiary_commentary';
  status: 'active' | 'superseded' | 'retired';
  content: string;
  url: string;
}

export interface IngestResult {
  totalFiles: number;
  totalRecords: number;
  recordsByTier: Record<string, number>;
  recordsBySource: Record<string, number>;
  errors: string[];
  durationMs: number;
}

// ─── Provenance Tier Classification ───────────────────────────────────────

const PRIMARY_SOURCES = [
  'CMS', 'Medicare.gov', 'HHS', 'Noridian', 'X12',
];

const SECONDARY_SOURCES = [
  'AHA', 'KFF', 'Health Affairs', 'GAO', 'OIG',
];

// Documents that contain code lists get split into individual code entries
const CODE_LIST_DOCUMENTS = [
  'x12_carc_codes', 'cms_cag_codes', 'cms_rarc_codes',
  'cms_review_reason_codes', 'cms_emdr_categories',
  'cms_ma_org_determinations', 'cms_msp_denials',
];

function classifyProvenance(source: string): 'primary_source' | 'secondary_summary' | 'tertiary_commentary' {
  if (PRIMARY_SOURCES.some(s => source.includes(s))) return 'primary_source';
  if (SECONDARY_SOURCES.some(s => source.includes(s))) return 'secondary_summary';
  return 'tertiary_commentary';
}

// ─── Content Hashing ──────────────────────────────────────────────────────

export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

// ─── Section Splitting ────────────────────────────────────────────────────

/**
 * Split a document's content into logical sections.
 * Each section becomes its own evidence record for granular retrieval.
 */
function splitIntoSections(content: string, documentName: string): Array<{ section: string; content: string }> {
  const sections: Array<{ section: string; content: string }> = [];

  // Strategy 1: Split by headers (## or === or numbered sections)
  const headerPattern = /\n(?=#{1,4}\s|\d+\.\s+[A-Z]|[A-Z][A-Z\s]+)\n/g;
  const splits = content.split(headerPattern);

  if (splits.length > 1 && splits.some(s => s.trim().length > 100)) {
    let sectionIdx = 0;
    for (const split of splits) {
      const trimmed = split.trim();
      if (trimmed.length < 50) continue; // Skip tiny fragments
      sectionIdx++;
      // Extract section title from first line
      const firstLine = trimmed.split('\n')[0].slice(0, 80);
      sections.push({
        section: `Section ${sectionIdx}: ${firstLine}`,
        content: trimmed,
      });
    }
  }

  // Strategy 2: Split large content into chunks of ~2000 chars at paragraph boundaries
  if (sections.length === 0 && content.length > 2000) {
    const CHUNK_SIZE = 2000;
    let pos = 0;
    let chunkIdx = 0;
    while (pos < content.length) {
      let end = Math.min(pos + CHUNK_SIZE, content.length);
      // Find next paragraph break after CHUNK_SIZE
      if (end < content.length) {
        const nextBreak = content.indexOf('\n\n', end);
        if (nextBreak > 0 && nextBreak < end + 500) {
          end = nextBreak;
        }
      }
      chunkIdx++;
      const chunk = content.slice(pos, end).trim();
      if (chunk.length > 50) {
        sections.push({
          section: `Part ${chunkIdx}`,
          content: chunk,
        });
      }
      pos = end + 1;
    }
  }

  // Strategy 3: Keep as single section if small enough
  if (sections.length === 0) {
    sections.push({
      section: 'Full Document',
      content,
    });
  }

  return sections;
}

/**
 * Split code-list documents into individual code entries.
 * Each CARC/CAG/eMDR code becomes its own evidence record.
 */
function splitCodeList(content: string, documentName: string): Array<{ section: string; content: string }> {
  const entries: Array<{ section: string; content: string }> = [];

  // Parse code entries from structured content
  // Format varies: "CODE: Description" or "• CODE - Description" or "CODE\tDescription"
  const codePatterns = [
    /([A-Z]\d{1,4}\.[A-Z0-9]*(?:\.\d+)?)\s*[:\-–]\s*(.+)/g,  // e.g., A5.1: Description
    /([A-Z]{2,5}\d{2,5})\s*[:\-–]\s*(.+)/g,                    // e.g., CO16: Description
    /^[\s•\-*]*([A-Z0-9]+(?:\.[A-Z0-9]+)*)\s*[:\-–]\s*(.+)$/gm, // General code pattern
  ];

  let found = false;
  for (const pattern of codePatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const code = match[1].trim();
      const description = match[2].trim();
      if (code.length >= 2 && code.length <= 20 && description.length >= 10) {
        entries.push({
          section: `Code ${code}`,
          content: `${code}: ${description}`,
        });
        found = true;
      }
    }
    if (found) break;
  }

  // If no structured codes found, fall back to section splitting
  if (!found) {
    return splitIntoSections(content, documentName);
  }

  return entries;
}

// ─── Main Ingest Function ─────────────────────────────────────────────────

export async function ingestRawEvidence(rawDir: string): Promise<IngestResult> {
  const startTime = Date.now();
  const result: IngestResult = {
    totalFiles: 0,
    totalRecords: 0,
    recordsByTier: { primary_source: 0, secondary_summary: 0, tertiary_commentary: 0 },
    recordsBySource: {},
    errors: [],
    durationMs: 0,
  };

  try {
    const files = readdirSync(rawDir)
      .filter(f => f.endsWith('.json') && f !== 'manifest.json')
      .sort();

    result.totalFiles = files.length;

    for (const file of files) {
      try {
        const filePath = join(rawDir, file);
        const raw: RawEvidenceFile = JSON.parse(readFileSync(filePath, 'utf-8'));

        if (!raw.content || raw.content.length < 10) {
          result.errors.push(`${file}: empty or missing content`);
          continue;
        }

        const source = raw.source || 'Unknown';
        const documentName = raw.document || raw.title || basename(file, '.json');
        const url = raw.url || '';
        const retrievedDate = new Date(raw.retrievedDate || '2026-08-16');
        const provenanceTier = classifyProvenance(source);

        // Determine effective date from content or metadata
        const effectiveDate = extractEffectiveDate(raw);

        // Split document into records
        const isCodeList = CODE_LIST_DOCUMENTS.some(d => file.includes(d));
        const sections = isCodeList
          ? splitCodeList(raw.content, documentName)
          : splitIntoSections(raw.content, documentName);

        // Create evidence records in database
        for (const section of sections) {
          const hash = contentHash(section.content);

          try {
            // Check for duplicate content (same hash + same document)
            const existing = await db.evidence.findFirst({
              where: { content_hash: hash, document_name: documentName },
            });
            if (existing) {
              // Skip duplicate content from same document
              continue;
            }

            const evidence = await db.evidence.create({
              data: {
                source,
                document_name: documentName,
                section: section.section,
                effective_date: effectiveDate,
                content_hash: hash,
                provenance_tier: provenanceTier as any,
                status: 'active' as any,
                retrieved_date: retrievedDate,
                content: section.content,
                embedding: url, // Store URL in embedding field temporarily (will be replaced with actual embeddings)
              },
            });

            result.totalRecords++;
            result.recordsByTier[provenanceTier] = (result.recordsByTier[provenanceTier] || 0) + 1;
            result.recordsBySource[source] = (result.recordsBySource[source] || 0) + 1;
          } catch (dbError: any) {
            result.errors.push(`${file}/${section.section}: ${dbError.message}`);
          }
        }
      } catch (fileError: any) {
        result.errors.push(`${file}: ${fileError.message}`);
      }
    }
  } catch (error: any) {
    result.errors.push(`Fatal: ${error.message}`);
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

// ─── Effective Date Extraction ────────────────────────────────────────────

function extractEffectiveDate(raw: RawEvidenceFile): Date | null {
  // Try to find effective date in content
  const datePatterns = [
    /effective[:\s]+(\d{4}-\d{2}-\d{2})/i,
    /effective[:\s]+(\w+ \d{1,2},? \d{4})/i,
    /effective[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /published[:\s]+(\d{4}-\d{2}-\d{2})/i,
    /updated[:\s]+(\d{4}-\d{2}-\d{2})/i,
    /(\d{4}-\d{2}-\d{2})/g, // Any ISO date
  ];

  for (const pattern of datePatterns) {
    const match = pattern.exec(raw.content);
    if (match) {
      const date = new Date(match[1]);
      if (!isNaN(date.getTime())) return date;
    }
  }

  return null;
}

// ─── Corpus Statistics ────────────────────────────────────────────────────

export async function getCorpusStats() {
  const [
    totalRecords,
    primaryCount,
    secondaryCount,
    tertiaryCount,
    sourceBreakdown,
  ] = await Promise.all([
    db.evidence.count(),
    db.evidence.count({ where: { provenance_tier: 'primary_source' } }),
    db.evidence.count({ where: { provenance_tier: 'secondary_summary' } }),
    db.evidence.count({ where: { provenance_tier: 'tertiary_commentary' } }),
    db.evidence.groupBy({
      by: ['source'],
      _count: { _all: true },
      orderBy: { source: 'asc' },
    }),
  ]);

  // Count documents with hashes (all records now have required content_hash)
  const hashedCount = totalRecords;

  // Count unique documents
  const uniqueDocs = await db.evidence.groupBy({
    by: ['document_name'],
    _count: { _all: true },
  });

  return {
    totalRecords,
    hashedRecords: hashedCount,
    uniqueDocuments: uniqueDocs.length,
    byTier: {
      primary_source: primaryCount,
      secondary_summary: secondaryCount,
      tertiary_commentary: tertiaryCount,
    },
    bySource: sourceBreakdown.map(s => ({
      source: s.source,
      count: s._count._all,
    })),
    gatePassed: totalRecords >= 100 && hashedCount >= 100,
  };
}

// ─── Evidence Search ──────────────────────────────────────────────────────

export async function searchEvidence(query: string, limit = 20) {
  // Text-based search (pgvector semantic search will be added later)
  const results = await db.evidence.findMany({
    where: {
      status: 'active',
      OR: [
        { content: { contains: query } },
        { document_name: { contains: query } },
        { section: { contains: query } },
        { source: { contains: query } },
      ],
    },
    take: limit,
    orderBy: { provenance_tier: 'asc' }, // Primary first
  });

  return results;
}

// ─── Payer Policy Ingest (Day 2) ───────────────────────────────────────────

export interface PayerPolicyEntry {
  clause_id: string;
  payer_name: string;
  denial_type: string;
  clause_text: string;
  source_url: string;
  effective_date: string;
  retrieval_weight: number;
  version: string;
}

export interface PayerPolicyIngestResult {
  totalEntries: number;
  ingested: number;
  skipped: number;
  errors: string[];
  durationMs: number;
}

/**
 * Ingest payer policies from payer_policies.json into the Evidence table.
 * Each entry is mapped to an Evidence record with payer-specific fields.
 */
export async function ingestPayerPolicies(): Promise<PayerPolicyIngestResult> {
  const startTime = Date.now();
  const result: PayerPolicyIngestResult = {
    totalEntries: 0,
    ingested: 0,
    skipped: 0,
    errors: [],
    durationMs: 0,
  };

  try {
    const policiesPath = join(process.cwd(), 'data', 'corpus', 'payer_policies.json');
    const raw = JSON.parse(readFileSync(policiesPath, 'utf-8'));
    const entries: PayerPolicyEntry[] = raw.entries || [];

    result.totalEntries = entries.length;

    for (const entry of entries) {
      try {
        // Normalize denial_type to lowercase underscored format
        const denialType = entry.denial_type
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '');

        // Compute SHA-256 content hash
        const hash = contentHash(entry.clause_text);

        // Check for duplicate by content_hash + clause_id
        const existing = await db.evidence.findFirst({
          where: {
            content_hash: hash,
            clause_id: entry.clause_id,
          },
        });

        if (existing) {
          result.skipped++;
          continue;
        }

        // Create Evidence record
        await db.evidence.create({
          data: {
            source: entry.payer_name,
            document_name: `Payer Policy ${entry.clause_id}`,
            section: entry.denial_type,
            content: entry.clause_text,
            content_hash: hash,
            payer_name: entry.payer_name,
            denial_type: denialType,
            clause_id: entry.clause_id,
            retrieval_weight: entry.retrieval_weight,
            effective_date: new Date(entry.effective_date),
            provenance_tier: 'primary_source',
            embedding: entry.source_url, // Store URL temporarily
            status: 'active',
          },
        });

        result.ingested++;
      } catch (entryError: any) {
        result.errors.push(`${entry.clause_id}: ${entryError.message}`);
      }
    }
  } catch (error: any) {
    result.errors.push(`Fatal: ${error.message}`);
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

// ─── Citation Resolution ──────────────────────────────────────────────────

export async function resolveCitation(evidenceId: string) {
  const evidence = await db.evidence.findUnique({
    where: { id: evidenceId },
    include: { citations: true },
  });

  if (!evidence) return null;

  return {
    id: evidence.id,
    source: evidence.source,
    document: evidence.document_name,
    section: evidence.section,
    provenance: evidence.provenance_tier,
    contentHash: evidence.content_hash,
    effectiveDate: evidence.effective_date,
    retrievedDate: evidence.retrieved_date,
    content: evidence.content,
    url: evidence.embedding, // URL stored in embedding field
    citations: evidence.citations,
  };
}
