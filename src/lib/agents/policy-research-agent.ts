/**
 * DenialDefender — Policy Research Agent (Day 4 — Agent 3)
 *
 * Owns retrieval over the corpus and clause selection.
 * - Uses retrievePolicyClauses from policy-research.ts
 * - Returns 3 clause-cited candidates with real provenance cards
 * - Measures retrieval latency (SLA: <200ms)
 * - Provides structured summary of findings
 */

import { BaseAgent, type TraceEvent } from './base-agent';
import { retrievePolicyClauses, type PolicyQuery, type PolicyResult } from '../policy-research';
import type { TriageResult } from './denial-triage';

// ─── Types ────────────────────────────────────────────────────────────────

export interface PolicyResearchInput {
  triageResult: TriageResult;
}

export interface PolicyClause {
  number: number;
  clauseId: string | null;
  source: string;
  documentName: string;
  section: string | null;
  contentPreview: string;        // First 200 chars
  provenanceTier: string;
  relevanceScore: number;
  retrievalWeight: number;
}

export interface ProvenanceCardData {
  evidenceId: string;
  source: string;
  documentName: string;
  section: string | null;
  provenanceTier: string;
  contentHash: string;
  payerName: string | null;
  denialType: string | null;
  clauseId: string | null;
  retrievalWeight: number;
}

export interface PolicyResearchResult {
  clauses: PolicyClause[];
  provenanceCards: ProvenanceCardData[];
  retrievalLatencyMs: number;
  withinSla: boolean;            // latency < 200ms
  summary: string;
}

// ─── Provenance Tier Label ────────────────────────────────────────────────

function provenanceTierLabel(tier: string): string {
  switch (tier) {
    case 'primary_source': return 'Primary Source';
    case 'secondary_summary': return 'Secondary Summary';
    case 'tertiary_commentary': return 'Tertiary Commentary';
    default: return tier;
  }
}

// ─── Summary Builder ──────────────────────────────────────────────────────

function buildSummary(clauses: PolicyClause[], triageResult: TriageResult): string {
  if (clauses.length === 0) {
    return `No policy clauses found for ${triageResult.denialJson.denialTypeLabel} denial from ${triageResult.denialJson.payer}. Manual policy review recommended.`;
  }

  const parts: string[] = [];
  parts.push(`Found ${clauses.length} relevant policy clause(s) for ${triageResult.denialJson.denialTypeLabel} denial from ${triageResult.denialJson.payer}.`);

  const primaryCount = clauses.filter(c => c.provenanceTier === 'primary_source').length;
  const secondaryCount = clauses.filter(c => c.provenanceTier === 'secondary_summary').length;
  if (primaryCount > 0) {
    parts.push(`${primaryCount} primary source(s) — strongest evidentiary tier.`);
  }
  if (secondaryCount > 0) {
    parts.push(`${secondaryCount} secondary summary/ies — clinical guidelines.`);
  }

  const withClauseId = clauses.filter(c => c.clauseId).length;
  if (withClauseId > 0) {
    parts.push(`${withClauseId} clause(s) with specific policy clause IDs for citation.`);
  }

  return parts.join(' ');
}

// ─── Policy Research Agent ────────────────────────────────────────────────

export class PolicyResearchAgent extends BaseAgent<PolicyResearchInput, PolicyResearchResult> {
  name = 'policy-research';
  description = 'Retrieval over the evidence corpus and clause selection — returns 3 clause-cited candidates with provenance cards';

  protected async execute(input: PolicyResearchInput): Promise<PolicyResearchResult> {
    const { triageResult } = input;
    const startMs = Date.now();

    // Build policy query from triage result
    const query: PolicyQuery = {
      denialReason: triageResult.classification.appealStrategy || triageResult.denialJson.denialTypeLabel,
      payer: triageResult.denialJson.payer,
      denialType: triageResult.denialJson.denialType,
      cptCodes: triageResult.denialJson.cptCodes.length > 0 ? triageResult.denialJson.cptCodes : undefined,
      icdCodes: triageResult.denialJson.icdCodes.length > 0 ? triageResult.denialJson.icdCodes : undefined,
      mode: 'outcomes',  // K=3 for outcomes mode
      topK: 3,
    };

    // Retrieve policy clauses
    const response = await retrievePolicyClauses(query);

    // Map to PolicyClause format
    const clauses: PolicyClause[] = response.results.map((r, idx) => ({
      number: idx + 1,
      clauseId: r.clauseId,
      source: r.source,
      documentName: r.documentName,
      section: r.section,
      contentPreview: r.content.slice(0, 200),
      provenanceTier: r.provenanceTier,
      relevanceScore: Math.round(r.finalScore * 100) / 100,
      retrievalWeight: r.retrievalWeight,
    }));

    // Map provenance cards
    const provenanceCards: ProvenanceCardData[] = response.results.map(r => ({
      evidenceId: r.evidenceId,
      source: r.source,
      documentName: r.documentName,
      section: r.section,
      provenanceTier: r.provenanceTier,
      contentHash: r.contentHash,
      payerName: r.payerName,
      denialType: r.denialType,
      clauseId: r.clauseId,
      retrievalWeight: r.retrievalWeight,
    }));

    const retrievalLatencyMs = Date.now() - startMs;

    return {
      clauses,
      provenanceCards,
      retrievalLatencyMs,
      withinSla: retrievalLatencyMs < 200,
      summary: buildSummary(clauses, triageResult),
    };
  }

  protected async mockExecute(input: PolicyResearchInput): Promise<PolicyResearchResult> {
    const { triageResult } = input;
    return {
      clauses: [
        {
          number: 1,
          clauseId: 'MOCK-001',
          source: 'CMS Medicare Policy Manual',
          documentName: 'Medicare Coverage Determination',
          section: 'Section 1862(a)(1)(A)',
          contentPreview: 'Items and services that are not reasonable and necessary for the diagnosis or treatment of illness...',
          provenanceTier: 'primary_source',
          relevanceScore: 7.5,
          retrievalWeight: 1.5,
        },
        {
          number: 2,
          clauseId: 'MOCK-002',
          source: 'Clinical Practice Guidelines',
          documentName: 'AAOS Clinical Practice Guidelines',
          section: 'Chapter 4: Treatment Recommendations',
          contentPreview: 'Total knee arthroplasty is recommended for patients with advanced osteoarthritis when conservative...',
          provenanceTier: 'secondary_summary',
          relevanceScore: 6.0,
          retrievalWeight: 1.2,
        },
        {
          number: 3,
          clauseId: null,
          source: 'Peer-Reviewed Literature',
          documentName: 'Journal of Bone and Joint Surgery',
          section: null,
          contentPreview: 'Long-term outcomes of total knee arthroplasty demonstrate significant improvement in function and...',
          provenanceTier: 'tertiary_commentary',
          relevanceScore: 5.0,
          retrievalWeight: 1.0,
        },
      ],
      provenanceCards: [],
      retrievalLatencyMs: 50,
      withinSla: true,
      summary: `Mock: 3 policy clauses found for ${triageResult.denialJson.denialTypeLabel} denial from ${triageResult.denialJson.payer}.`,
    };
  }

  protected defaultOutput(): PolicyResearchResult {
    return {
      clauses: [],
      provenanceCards: [],
      retrievalLatencyMs: 0,
      withinSla: false,
      summary: 'Policy research unavailable — manual review required.',
    };
  }
}

// Singleton instance for pipeline use
export const policyResearchAgent = new PolicyResearchAgent();
