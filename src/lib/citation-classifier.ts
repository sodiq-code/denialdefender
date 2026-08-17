/**
 * DenialDefender — Citation Classifier
 *
 * Rule-based citation credibility scorer using weighted heuristic dimensions.
 *
 * This is a deterministic, rule-based classifier (NOT an ML model) that scores
 * evidence citations on credibility using curated authority maps and weighted
 * heuristics. It runs locally with zero external API calls and produces
 * reproducible scores for any identical input.
 *
 * Scoring dimensions:
 * - Source authority (government > peer-reviewed > commercial) — weight 0.35
 * - Specificity (clause-level > section-level > document-level) — weight 0.25
 * - Recency (current > stale) — weight 0.20
 * - Corroboration (multiple sources > single source) — weight 0.20
 *
 * For ML-backed citation analysis, the agent fleet's citation agent calls
 * Gemini 3.5 Flash via the /agents/citation endpoint (when GEMINI_API_KEY
 * is set). This local classifier serves as the fast, zero-dependency fallback.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export interface CitationScore {
  evidenceId: string;
  source: string;
  documentName: string;
  provenanceTier: string;
  /** Overall credibility score 0-100 */
  credibilityScore: number;
  /** Individual dimension scores */
  dimensions: {
    sourceAuthority: number;   // 0-100: government=90, peer-reviewed=70, commercial=40, unknown=20
    recency: number;           // 0-100: <1yr=90, 1-3yr=70, 3-5yr=50, >5yr=30
    specificity: number;       // 0-100: clause=90, section=70, document=40, vague=20
    corroboration: number;     // 0-100: 3+ sources=90, 2 sources=70, 1 source=40
  };
  /** Classification label */
  classification: 'high_credibility' | 'moderate_credibility' | 'low_credibility' | 'unverified';
  /** Reason for the classification */
  reason: string;
  /** Whether the citation should be used in an appeal */
  appealRecommended: boolean;
}

export interface CitationClassificationResult {
  scores: CitationScore[];
  summary: {
    total: number;
    highCredibility: number;
    moderateCredibility: number;
    lowCredibility: number;
    unverified: number;
    averageScore: number;
    recommendedForAppeal: number;
  };
  /** Classifier identifier — reports actual classifier type (rule-based or gemini-backed) */
  modelUsed: string;
  /** Processing time in ms */
  latencyMs: number;
}

// ─── Source Authority Scoring ────────────────────────────────────────────

const SOURCE_AUTHORITY_MAP: Record<string, number> = {
  // Government sources (highest authority)
  'cms': 95,
  'medicare': 92,
  'medicaid': 90,
  'hhs': 88,
  'nih': 87,
  'cdc': 85,
  'oig': 83,
  'gao': 82,
  'state_department_insurance': 80,

  // Professional organizations
  'ama': 78,
  'aha': 76,
  'aaos': 75,
  'acp': 74,
  'kff': 72, // Kaiser Family Foundation

  // Peer-reviewed
  'health_affairs': 70,
  'nejm': 72,
  'jama': 71,
  'journal': 65,

  // Commercial / Payer
  'unitedhealthcare': 45,
  'aetna': 45,
  'cigna': 45,
  'humana': 45,
  'anthem': 45,
  'payer': 40,

  // News / Commentary
  'news': 30,
  'blog': 20,
  'social_media': 10,
};

/**
 * Score source authority based on source identifier
 */
function scoreSourceAuthority(source: string): number {
  const lower = source.toLowerCase();

  // Direct match
  for (const [key, score] of Object.entries(SOURCE_AUTHORITY_MAP)) {
    if (lower.includes(key)) return score;
  }

  // Check if it looks like a government source
  if (lower.includes('.gov') || lower.includes('federal') || lower.includes('regulation')) return 85;

  // Check if it looks like peer-reviewed
  if (lower.includes('peer') || lower.includes('journal') || lower.includes('pubmed')) return 65;

  // Check if it's a policy document
  if (lower.includes('policy') || lower.includes('manual') || lower.includes('guideline')) return 60;

  // Unknown source
  return 25;
}

// ─── Recency Scoring ─────────────────────────────────────────────────────

/**
 * Score recency based on effective date or content date
 */
function scoreRecency(effectiveDate?: Date | string | null): number {
  if (!effectiveDate) return 50; // No date = neutral

  const date = typeof effectiveDate === 'string' ? new Date(effectiveDate) : effectiveDate;
  const now = new Date();
  const ageMs = now.getTime() - date.getTime();
  const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);

  if (ageYears < 1) return 95;       // Current (< 1 year)
  if (ageYears < 2) return 85;       // Recent (1-2 years)
  if (ageYears < 3) return 70;       // Moderate (2-3 years)
  if (ageYears < 5) return 50;       // Aging (3-5 years)
  if (ageYears < 10) return 30;      // Stale (5-10 years)
  return 15;                          // Very old (> 10 years)
}

// ─── Specificity Scoring ─────────────────────────────────────────────────

/**
 * Score specificity based on citation granularity
 */
function scoreSpecificity(params: {
  hasClauseId: boolean;
  hasSection: boolean;
  hasContentPreview: boolean;
  provenanceTier: string;
}): number {
  // Clause-level citation (highest specificity)
  if (params.hasClauseId) return 95;

  // Section-level with provenance tier
  if (params.hasSection && params.provenanceTier === 'primary_source') return 85;
  if (params.hasSection) return 70;

  // Document-level with primary provenance
  if (params.provenanceTier === 'primary_source') return 60;
  if (params.provenanceTier === 'secondary_summary') return 50;

  // Tertiary or no section
  if (params.hasContentPreview) return 35;

  return 20; // Vague citation
}

// ─── Corroboration Scoring ───────────────────────────────────────────────

/**
 * Score corroboration based on number of supporting sources
 */
function scoreCorroboration(sourceCount: number): number {
  if (sourceCount >= 4) return 95;
  if (sourceCount >= 3) return 85;
  if (sourceCount >= 2) return 70;
  if (sourceCount >= 1) return 40;
  return 15; // No corroboration
}

// ─── Classification ──────────────────────────────────────────────────────

/**
 * Classify a citation based on its credibility score
 */
function classifyCitationByScore(score: number): {
  classification: CitationScore['classification'];
  appealRecommended: boolean;
  reason: string;
} {
  if (score >= 80) {
    return {
      classification: 'high_credibility',
      appealRecommended: true,
      reason: 'High-authority source with strong citation specificity and corroboration',
    };
  }
  if (score >= 60) {
    return {
      classification: 'moderate_credibility',
      appealRecommended: true,
      reason: 'Acceptable source authority with adequate specificity for appeal use',
    };
  }
  if (score >= 40) {
    return {
      classification: 'low_credibility',
      appealRecommended: false,
      reason: 'Limited authority or specificity; consider finding stronger evidence',
    };
  }
  return {
    classification: 'unverified',
    appealRecommended: false,
    reason: 'Insufficient credibility for appeal; source cannot be independently verified',
  };
}

// ─── Public API ──────────────────────────────────────────────────────────

export interface ClassifyCitationInput {
  evidenceId: string;
  source: string;
  documentName: string;
  provenanceTier: string;
  clauseId?: string | null;
  section?: string | null;
  contentPreview?: string;
  effectiveDate?: Date | string | null;
  /** Number of other sources corroborating this evidence */
  corroborationCount?: number;
}

/**
 * Classify a single citation for credibility.
 * Pure rule-based scorer — deterministic, no ML model, no external API.
 * Scores are computed from weighted heuristics (see module-level docs).
 */
export function classifyCitation(input: ClassifyCitationInput): CitationScore {
  const sourceAuthority = scoreSourceAuthority(input.source);
  const recency = scoreRecency(input.effectiveDate);
  const specificity = scoreSpecificity({
    hasClauseId: !!input.clauseId,
    hasSection: !!input.section,
    hasContentPreview: !!input.contentPreview,
    provenanceTier: input.provenanceTier,
  });
  const corroboration = scoreCorroboration(input.corroborationCount || 0);

  // Weighted average: authority and specificity are most important for appeals
  const credibilityScore = Math.round(
    sourceAuthority * 0.35 +
    specificity * 0.25 +
    recency * 0.20 +
    corroboration * 0.20
  );

  const { classification, appealRecommended, reason } = classifyCitationByScore(credibilityScore);

  return {
    evidenceId: input.evidenceId,
    source: input.source,
    documentName: input.documentName,
    provenanceTier: input.provenanceTier,
    credibilityScore,
    dimensions: {
      sourceAuthority,
      recency,
      specificity,
      corroboration,
    },
    classification,
    reason,
    appealRecommended,
  };
}

/**
 * Classify multiple citations at once (batch classification).
 * Used by the Evidence Assembly agent to score all evidence for a case.
 */
export function classifyCitations(inputs: ClassifyCitationInput[]): CitationClassificationResult {
  const startMs = Date.now();

  const scores = inputs.map(input => classifyCitation(input));

  // Count corroborations (same document name from different sources)
  const docNameCounts: Record<string, number> = {};
  for (const input of inputs) {
    docNameCounts[input.documentName] = (docNameCounts[input.documentName] || 0) + 1;
  }

  // Re-score with corroboration counts
  const rescored = inputs.map((input, idx) => {
    const corroborationCount = (docNameCounts[input.documentName] || 1) - 1;
    return classifyCitation({ ...input, corroborationCount });
  });

  const highCredibility = rescored.filter(s => s.classification === 'high_credibility').length;
  const moderateCredibility = rescored.filter(s => s.classification === 'moderate_credibility').length;
  const lowCredibility = rescored.filter(s => s.classification === 'low_credibility').length;
  const unverified = rescored.filter(s => s.classification === 'unverified').length;
  const averageScore = rescored.length > 0
    ? Math.round(rescored.reduce((sum, s) => sum + s.credibilityScore, 0) / rescored.length)
    : 0;
  const recommendedForAppeal = rescored.filter(s => s.appealRecommended).length;

  return {
    scores: rescored,
    summary: {
      total: rescored.length,
      highCredibility,
      moderateCredibility,
      lowCredibility,
      unverified,
      averageScore,
      recommendedForAppeal,
    },
    modelUsed: 'rule-based-citation-classifier-v1',
    latencyMs: Date.now() - startMs,
  };
}

/**
 * Run the citation classifier demo moment:
 * - Classify a set of realistic evidence citations
 * - Show the full credibility scoring breakdown
 * - Demonstrate the on-device capability
 */
export function runCitationClassifierDemo(): CitationClassificationResult {
  const demoInputs: ClassifyCitationInput[] = [
    {
      evidenceId: 'EV-001',
      source: 'CMS Medicare Policy Manual',
      documentName: 'Medicare Coverage Determination',
      provenanceTier: 'primary_source',
      clauseId: 'UHC-MP-001.4.B',
      section: 'Section 1862(a)(1)(A)',
      contentPreview: 'Items and services that are not reasonable and necessary...',
      effectiveDate: '2024-01-01',
      corroborationCount: 3,
    },
    {
      evidenceId: 'EV-002',
      source: 'Clinical Practice Guidelines',
      documentName: 'AAOS Clinical Practice Guidelines',
      provenanceTier: 'secondary_summary',
      section: 'Chapter 4: Treatment Recommendations',
      contentPreview: 'Total knee arthroplasty is recommended for patients with advanced osteoarthritis...',
      effectiveDate: '2023-06-15',
      corroborationCount: 2,
    },
    {
      evidenceId: 'EV-003',
      source: 'Peer-Reviewed Literature',
      documentName: 'Journal of Bone and Joint Surgery',
      provenanceTier: 'tertiary_commentary',
      contentPreview: 'Long-term outcomes of total knee arthroplasty...',
      effectiveDate: '2022-03-10',
      corroborationCount: 1,
    },
    {
      evidenceId: 'EV-004',
      source: 'HHS Guidance on De-identification',
      documentName: 'HIPAA De-identification Methods',
      provenanceTier: 'primary_source',
      clauseId: 'HHS-DEID-001',
      section: 'Safe Harbor Method',
      contentPreview: 'The Safe Harbor method requires removal of 18 identifiers...',
      effectiveDate: '2024-06-01',
      corroborationCount: 2,
    },
    {
      evidenceId: 'EV-005',
      source: 'UnitedHealthcare Policy',
      documentName: 'UHC Medical Policy: TKA Coverage',
      provenanceTier: 'secondary_summary',
      clauseId: 'UHC-MP-001.4.B',
      section: 'Coverage Determination',
      contentPreview: 'Total knee arthroplasty is considered medically necessary when...',
      effectiveDate: '2024-03-01',
      corroborationCount: 1,
    },
    {
      evidenceId: 'EV-006',
      source: 'Health Affairs Journal',
      documentName: 'Medicare Advantage Denial Rates',
      provenanceTier: 'tertiary_commentary',
      contentPreview: 'Medicare Advantage plans deny 17% of initial claims...',
      effectiveDate: '2024-01-15',
      corroborationCount: 4,
    },
    {
      evidenceId: 'EV-007',
      source: 'GAO Report',
      documentName: 'Medicare Advantage Appeals',
      provenanceTier: 'primary_source',
      section: 'Chapter 3: Appeal Outcomes',
      contentPreview: 'MA organizations overturned 43% of their own denials...',
      effectiveDate: '2023-09-01',
      corroborationCount: 2,
    },
    {
      evidenceId: 'EV-008',
      source: 'Unknown Blog Post',
      documentName: 'How to Win Your Appeal',
      provenanceTier: 'tertiary_commentary',
      contentPreview: 'Tips and tricks for getting your denial overturned...',
      effectiveDate: null,
      corroborationCount: 0,
    },
  ];

  return classifyCitations(demoInputs);
}
