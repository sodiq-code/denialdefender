/**
 * DenialDefender — Evidence Assembly Agent (Day 5 — Agent 4)
 *
 * Matches clinical evidence to the denial reason and deduplicates
 * against Policy Research output.
 * - Searches evidence corpus for clinical evidence matching denial reason
 * - Uses retrievePolicyClauses with mode='outcomes' for clinical evidence
 * - Deduplicates: if a clause from Policy Research also appears in clinical evidence, mark as duplicate
 * - Returns 5 evidence items total (3 from Policy Research + 2 additional clinical)
 * - Each evidence item must have a contentHash for Quality Review verification
 */

import { BaseAgent, type TraceEvent } from './base-agent';
import { retrievePolicyClauses, type PolicyQuery } from '../policy-research';
import { db } from '@/lib/db';
import type { TriageResult } from './denial-triage';
import type { PolicyResearchResult } from './policy-research-agent';

// ─── Types ────────────────────────────────────────────────────────────────

export interface EvidenceAssemblyInput {
  triageResult: TriageResult;
  policyResearchResult: PolicyResearchResult;
}

export interface ClinicalEvidenceItem {
  id: string;
  source: string;
  documentName: string;
  section: string | null;
  contentPreview: string;
  provenanceTier: string;
  relevanceScore: number;
  matchesDenialReason: boolean;
  contentHash: string;
}

export interface DeduplicatedClause {
  clauseId: string | null;
  source: string;
  documentName: string;
  section: string | null;
  contentPreview: string;
  provenanceTier: string;
  isDuplicate: boolean;
  duplicateOf: string | null;
}

export interface EvidenceAssemblyResult {
  clinicalEvidence: ClinicalEvidenceItem[];
  deduplicatedClauses: DeduplicatedClause[];
  evidenceStrength: 'strong' | 'moderate' | 'weak';
  totalEvidenceItems: number;
  duplicatesRemoved: number;
}

// ─── Content Hash Generator ────────────────────────────────────────────────

export function generateContentHash(content: string): string {
  // Simple hash function for content verification
  let hash = 0;
  const str = content.trim().toLowerCase();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ─── Denial Reason to Search Terms ─────────────────────────────────────────

function denialReasonToSearchTerms(denialType: string, cptCodes: string[], icdCodes: string[]): string[] {
  const terms: string[] = [];

  const denialTermMap: Record<string, string[]> = {
    medical_necessity: ['medical necessity', 'clinical guidelines', 'standard of care', 'treatment criteria', 'evidence based'],
    prior_auth: ['prior authorization', 'precertification', 'authorization criteria', 'retrospective review'],
    coding: ['coding guidelines', 'correct coding', 'bundling', 'modifier', 'CCI edits'],
    experimental: ['experimental treatment', 'investigational', 'clinical trial', 'research evidence'],
    out_of_network: ['out of network', 'network exception', 'emergency exception', 'continuity of care'],
  };

  terms.push(...(denialTermMap[denialType] || ['medical necessity', 'clinical evidence']));

  for (const cpt of cptCodes) {
    terms.push(`CPT ${cpt}`);
  }
  for (const icd of icdCodes) {
    terms.push(`ICD ${icd}`);
  }

  return [...new Set(terms)];
}

// ─── Evidence Assembly Agent ───────────────────────────────────────────────

export class EvidenceAssemblyAgent extends BaseAgent<EvidenceAssemblyInput, EvidenceAssemblyResult> {
  name = 'evidence-assembly';
  description = 'Matches clinical evidence to denial reason and deduplicates against Policy Research output';

  protected async execute(input: EvidenceAssemblyInput): Promise<EvidenceAssemblyResult> {
    const { triageResult, policyResearchResult } = input;
    const { denialJson } = triageResult;

    // Step 1: Get policy research provenance data
    const policyEvidenceIds = new Set(
      policyResearchResult.provenanceCards.map(pc => pc.evidenceId)
    );
    const policyContentHashes = new Set(
      policyResearchResult.provenanceCards.map(pc => pc.contentHash)
    );

    // Step 2: Search for additional clinical evidence matching denial reason
    const searchTerms = denialReasonToSearchTerms(
      denialJson.denialType,
      denialJson.cptCodes,
      denialJson.icdCodes,
    );

    // Use retrievePolicyClauses with outcomes mode for clinical evidence
    const clinicalQuery: PolicyQuery = {
      denialReason: searchTerms.slice(0, 3).join(' '),
      payer: denialJson.payer,
      denialType: denialJson.denialType,
      cptCodes: denialJson.cptCodes.length > 0 ? denialJson.cptCodes : undefined,
      icdCodes: denialJson.icdCodes.length > 0 ? denialJson.icdCodes : undefined,
      mode: 'outcomes',
      topK: 5,
    };

    const clinicalResponse = await retrievePolicyClauses(clinicalQuery);

    // Step 3: Also search by CPT/ICD codes directly in the database
    let codeBasedEvidence: Array<{
      id: string;
      source: string;
      document_name: string;
      section: string | null;
      content: string;
      provenance_tier: string;
      content_hash: string;
    }> = [];

    if (denialJson.cptCodes.length > 0 || denialJson.icdCodes.length > 0) {
      const allCodes = [...denialJson.cptCodes, ...denialJson.icdCodes];
      for (const code of allCodes.slice(0, 3)) {
        try {
          const results = await db.evidence.findMany({
            where: {
              status: 'active',
              OR: [
                { content: { contains: code } },
                { section: { contains: code } },
              ],
            },
            take: 5,
            orderBy: { retrieval_weight: 'desc' },
          });
          codeBasedEvidence.push(...results);
        } catch {
          // Skip failed searches
        }
      }
    }

    // Step 4: Combine all clinical evidence
    const allClinicalCandidates = new Map<string, {
      id: string;
      source: string;
      documentName: string;
      section: string | null;
      contentPreview: string;
      provenanceTier: string;
      relevanceScore: number;
      contentHash: string;
    }>();

    // Add results from retrievePolicyClauses
    for (const r of clinicalResponse.results) {
      allClinicalCandidates.set(r.evidenceId, {
        id: r.evidenceId,
        source: r.source,
        documentName: r.documentName,
        section: r.section,
        contentPreview: r.content.slice(0, 200),
        provenanceTier: r.provenanceTier,
        relevanceScore: r.finalScore,
        contentHash: r.contentHash,
      });
    }

    // Add code-based evidence
    for (const r of codeBasedEvidence) {
      if (!allClinicalCandidates.has(r.id)) {
        allClinicalCandidates.set(r.id, {
          id: r.id,
          source: r.source,
          documentName: r.document_name,
          section: r.section,
          contentPreview: r.content.slice(0, 200),
          provenanceTier: r.provenance_tier,
          relevanceScore: 5.0,
          contentHash: r.content_hash,
        });
      }
    }

    // Step 5: Build policy research evidence items (3 items)
    const policyEvidenceItems: ClinicalEvidenceItem[] = policyResearchResult.provenanceCards.map(pc => ({
      id: pc.evidenceId,
      source: pc.source,
      documentName: pc.documentName,
      section: pc.section,
      contentPreview: policyResearchResult.clauses
        .find(c => c.clauseId === pc.clauseId)?.contentPreview || '',
      provenanceTier: pc.provenanceTier,
      relevanceScore: policyResearchResult.clauses
        .find(c => c.clauseId === pc.clauseId)?.relevanceScore || 5.0,
      matchesDenialReason: true,
      contentHash: pc.contentHash,
    }));

    // Step 6: Find 2 additional clinical evidence items (not from policy research)
    const additionalClinical: ClinicalEvidenceItem[] = [];
    for (const [, item] of allClinicalCandidates) {
      if (!policyEvidenceIds.has(item.id) && !policyContentHashes.has(item.contentHash)) {
        additionalClinical.push({
          ...item,
          matchesDenialReason: true,
        });
        if (additionalClinical.length >= 2) break;
      }
    }

    // If we don't have 2 additional items from search, try database fallback
    if (additionalClinical.length < 2) {
      try {
        const fallbackResults = await db.evidence.findMany({
          where: {
            status: 'active',
            NOT: { id: { in: Array.from(policyEvidenceIds) } },
          },
          take: 5,
          orderBy: { retrieval_weight: 'desc' },
        });

        for (const r of fallbackResults) {
          if (!policyContentHashes.has(r.content_hash) && !additionalClinical.some(a => a.id === r.id)) {
            additionalClinical.push({
              id: r.id,
              source: r.source,
              documentName: r.document_name,
              section: r.section,
              contentPreview: r.content.slice(0, 200),
              provenanceTier: r.provenance_tier,
              relevanceScore: r.retrieval_weight * 5,
              matchesDenialReason: false,
              contentHash: r.content_hash,
            });
            if (additionalClinical.length >= 2) break;
          }
        }
      } catch {
        // Fallback failed
      }
    }

    // Final: 5 evidence items total
    const clinicalEvidence: ClinicalEvidenceItem[] = [
      ...policyEvidenceItems,
      ...additionalClinical,
    ].slice(0, 5);

    // Step 7: Deduplicate policy clauses against clinical evidence
    const clinicalContentHashes = new Set(clinicalEvidence.map(ce => ce.contentHash));
    const clinicalIds = new Set(clinicalEvidence.map(ce => ce.id));

    let duplicatesRemoved = 0;
    const deduplicatedClauses: DeduplicatedClause[] = policyResearchResult.clauses.map(clause => {
      const matchingProvenance = policyResearchResult.provenanceCards.find(
        pc => pc.clauseId === clause.clauseId
      );
      const isDuplicate = matchingProvenance
        ? (clinicalContentHashes.has(matchingProvenance.contentHash) && clinicalIds.has(matchingProvenance.evidenceId))
        : false;

      if (isDuplicate) duplicatesRemoved++;

      return {
        clauseId: clause.clauseId,
        source: clause.source,
        documentName: clause.documentName,
        section: clause.section,
        contentPreview: clause.contentPreview,
        provenanceTier: clause.provenanceTier,
        isDuplicate,
        duplicateOf: isDuplicate && matchingProvenance ? matchingProvenance.evidenceId : null,
      };
    });

    // Step 8: Assess evidence strength
    const primaryCount = clinicalEvidence.filter(e => e.provenanceTier === 'primary_source').length;
    const secondaryCount = clinicalEvidence.filter(e => e.provenanceTier === 'secondary_summary').length;
    const matchingCount = clinicalEvidence.filter(e => e.matchesDenialReason).length;

    let evidenceStrength: 'strong' | 'moderate' | 'weak';
    if (primaryCount >= 2 && matchingCount >= 3) {
      evidenceStrength = 'strong';
    } else if ((primaryCount >= 1 || secondaryCount >= 2) && matchingCount >= 2) {
      evidenceStrength = 'moderate';
    } else {
      evidenceStrength = 'weak';
    }

    return {
      clinicalEvidence,
      deduplicatedClauses,
      evidenceStrength,
      totalEvidenceItems: clinicalEvidence.length,
      duplicatesRemoved,
    };
  }

  protected async mockExecute(input: EvidenceAssemblyInput): Promise<EvidenceAssemblyResult> {
    const { triageResult } = input;
    return {
      clinicalEvidence: [
        {
          id: 'mock-evidence-1',
          source: 'CMS Medicare Policy Manual',
          documentName: 'Medicare Coverage Determination',
          section: 'Section 1862(a)(1)(A)',
          contentPreview: 'Items and services that are not reasonable and necessary for the diagnosis or treatment of illness...',
          provenanceTier: 'primary_source',
          relevanceScore: 7.5,
          matchesDenialReason: true,
          contentHash: generateContentHash('CMS Medicare Policy Manual Section 1862'),
        },
        {
          id: 'mock-evidence-2',
          source: 'Clinical Practice Guidelines',
          documentName: 'AAOS Clinical Practice Guidelines',
          section: 'Chapter 4: Treatment Recommendations',
          contentPreview: 'Total knee arthroplasty is recommended for patients with advanced osteoarthritis when conservative...',
          provenanceTier: 'secondary_summary',
          relevanceScore: 6.0,
          matchesDenialReason: true,
          contentHash: generateContentHash('AAOS Clinical Practice Guidelines Chapter 4'),
        },
        {
          id: 'mock-evidence-3',
          source: 'Peer-Reviewed Literature',
          documentName: 'Journal of Bone and Joint Surgery',
          section: null,
          contentPreview: 'Long-term outcomes of total knee arthroplasty demonstrate significant improvement in function and...',
          provenanceTier: 'tertiary_commentary',
          relevanceScore: 5.0,
          matchesDenialReason: true,
          contentHash: generateContentHash('JBJS Long-term outcomes TKA'),
        },
        {
          id: 'mock-evidence-4',
          source: 'AHRQ Evidence Report',
          documentName: 'Effectiveness of Total Knee Replacement',
          section: 'Executive Summary',
          contentPreview: 'Total knee replacement is an effective treatment for end-stage knee osteoarthritis with documented...',
          provenanceTier: 'secondary_summary',
          relevanceScore: 5.5,
          matchesDenialReason: true,
          contentHash: generateContentHash('AHRQ Evidence Report TKA'),
        },
        {
          id: 'mock-evidence-5',
          source: 'CMS Local Coverage Determination',
          documentName: `LCD for ${triageResult.denialJson.denialTypeLabel}`,
          section: 'Coverage Criteria',
          contentPreview: 'Coverage is supported when clinical documentation demonstrates that the service meets established criteria...',
          provenanceTier: 'primary_source',
          relevanceScore: 4.5,
          matchesDenialReason: false,
          contentHash: generateContentHash('LCD coverage criteria mock'),
        },
      ],
      deduplicatedClauses: [
        {
          clauseId: 'MOCK-001',
          source: 'CMS Medicare Policy Manual',
          documentName: 'Medicare Coverage Determination',
          section: 'Section 1862(a)(1)(A)',
          contentPreview: 'Items and services that are not reasonable and necessary...',
          provenanceTier: 'primary_source',
          isDuplicate: true,
          duplicateOf: 'mock-evidence-1',
        },
        {
          clauseId: 'MOCK-002',
          source: 'Clinical Practice Guidelines',
          documentName: 'AAOS Clinical Practice Guidelines',
          section: 'Chapter 4: Treatment Recommendations',
          contentPreview: 'Total knee arthroplasty is recommended...',
          provenanceTier: 'secondary_summary',
          isDuplicate: true,
          duplicateOf: 'mock-evidence-2',
        },
        {
          clauseId: null,
          source: 'Peer-Reviewed Literature',
          documentName: 'Journal of Bone and Joint Surgery',
          section: null,
          contentPreview: 'Long-term outcomes of total knee arthroplasty...',
          provenanceTier: 'tertiary_commentary',
          isDuplicate: true,
          duplicateOf: 'mock-evidence-3',
        },
      ],
      evidenceStrength: 'strong',
      totalEvidenceItems: 5,
      duplicatesRemoved: 3,
    };
  }

  protected defaultOutput(): EvidenceAssemblyResult {
    return {
      clinicalEvidence: [],
      deduplicatedClauses: [],
      evidenceStrength: 'weak',
      totalEvidenceItems: 0,
      duplicatesRemoved: 0,
    };
  }
}

// Singleton instance for pipeline use
export const evidenceAssemblyAgent = new EvidenceAssemblyAgent();
