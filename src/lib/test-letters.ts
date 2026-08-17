/**
 * DenialDefender — Test Letter Ingestion & Retrieval Accuracy Validation
 *
 * Day 2 (Task 5c): Loads test denial letters, runs each through
 * the Policy Research Agent (payer policy corpus retrieval), and
 * validates that expected clause IDs appear in the top-3 results.
 *
 * Gate: 5/5 test letters must have at least 1 expected clause_id
 *       in the top-3 retrieved results (≥ 1/2 expected in top-3).
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// ─── Types ────────────────────────────────────────────────────────────────

export interface PayerPolicyEntry {
  clause_id: string;
  payer_name: string;
  denial_type: string;
  clause_text: string;
  source_url: string;
  effective_date: string;
  embedding: string | null;
  retrieval_weight: number;
  version: string;
}

export interface PayerPolicyCorpus {
  description: string;
  version: string;
  created: string;
  provenance: string;
  entries: PayerPolicyEntry[];
}

export interface TestLetter {
  id: string;
  payer: string;
  denial_reason_code: string;
  denial_type: string;
  cpt_codes: string[];
  icd_codes: string[];
  denial_letter_text: string;
  expected_clause_ids: string[];
}

export interface TestLettersFile {
  description: string;
  version: string;
  created: string;
  letters: TestLetter[];
}

export interface RetrievalResult {
  clause_id: string;
  payer_name: string;
  denial_type: string;
  score: number;
  snippet: string;
}

export interface LetterTestResult {
  letter_id: string;
  payer: string;
  denial_type: string;
  expected_clause_ids: string[];
  retrieved_top3: RetrievalResult[];
  retrieved_top3_ids: string[];
  matched_clause_ids: string[];
  match_count: number;
  expected_count: number;
  pass: boolean;
  details: string;
}

export interface ValidationReport {
  total_letters: number;
  passed: number;
  failed: number;
  gate_passed: boolean;
  gate_threshold: string;
  results: LetterTestResult[];
  timestamp: string;
  corpus_size: number;
  corpus_payers: string[];
  corpus_denial_types: string[];
}

// ─── Corpus & Letter Loading ──────────────────────────────────────────────

const DATA_DIR = join(process.cwd(), 'data', 'corpus');

/**
 * Load the payer policy corpus from the JSON file.
 */
export function loadPayerPolicyCorpus(): PayerPolicyCorpus {
  const filePath = join(DATA_DIR, 'payer_policies.json');
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as PayerPolicyCorpus;
  return raw;
}

/**
 * Load test denial letters from the JSON file.
 */
export function loadTestLetters(): TestLettersFile {
  const filePath = join(DATA_DIR, 'test_letters.json');
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as TestLettersFile;
  return raw;
}

// ─── Policy Research Agent (Text-Based Retrieval) ─────────────────────────

/**
 * Tokenize text into lowercase terms for similarity matching.
 * Includes medical terminology awareness for better matching.
 */
function tokenize(text: string): Set<string> {
  const terms = new Set<string>();
  const words = text.toLowerCase().split(/\W+/);

  for (const word of words) {
    if (word.length >= 3 && word.length <= 40) {
      terms.add(word);
    }
  }

  // Extract multi-word medical terms
  const lowerText = text.toLowerCase();
  const multiWordTerms = [
    'medical necessity', 'prior authorization', 'prior auth', 'pre-certification',
    'precertification', 'coding error', 'billing error', 'experimental', 'investigational',
    'out-of-network', 'out of network', 'reasonable and necessary', 'coverage determination',
    'national coverage determination', 'local coverage determination',
    'social security act', 'appeal', 'redetermination', 'reconsideration',
    'clinical policy bulletin', 'correct coding initiative', 'no surprises act',
    'prudent layperson', 'network adequacy', 'independent dispute resolution',
    'coverage with evidence development', 'fda approval', 'clinical trial',
    'peer-reviewed', 'standard of care', 'letter of medical necessity',
    'carc', 'rarc', 'ncd', 'lcd', 'cci', 'mue', 'hipaa',
    'interqual', 'milliman care guidelines', 'utilization management',
    '42 cfr', 'social security', 'section 1862',
  ];

  for (const term of multiWordTerms) {
    if (lowerText.includes(term)) {
      terms.add(term.replace(/[\s\-/]+/g, '_'));
    }
  }

  // Extract code references (CFR, CPT, ICD, NCD, LCD)
  const codePatterns = [
    /\b(\d{2}\s*cfr\s*§\s*\d+\.\d+)/gi,
    /\b(cpt\s*\d{4,5}[a-z]?)/gi,
    /\b(icd[- ]?10[- ]?[a-z]\d+\.\d+)/gi,
    /\b(ncd\s*\d+\.\d+)/gi,
    /\b(lcd\s*l?\d+)/gi,
    /\b(carc\s*[a-z]{1,2}\d+)/gi,
    /\b(section\s*\d+\([a-z]\)\([a-z]\)\([a-z]\))/gi,
  ];

  for (const pattern of codePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      terms.add(match[1].toLowerCase().replace(/\s+/g, '_'));
    }
  }

  return terms;
}

/**
 * Compute a similarity score between a query and a payer policy clause.
 *
 * Scoring factors:
 * 1. Term overlap (Jaccard-like) — core similarity
 * 2. Payer match bonus — exact payer name match
 * 3. Denial type match bonus — denial type keyword overlap
 * 4. Retrieval weight — corpus-assigned weight
 * 5. CARC/Reason code match — specific denial code references
 */
function computeSimilarity(
  queryTokens: Set<string>,
  queryText: string,
  entry: PayerPolicyEntry,
  payerName: string,
  denialType: string,
): number {
  const clauseTokens = tokenize(entry.clause_text);

  // 1. Term overlap (intersection / min-size for asymmetric matching)
  let intersection = 0;
  for (const token of queryTokens) {
    if (clauseTokens.has(token)) intersection++;
  }
  const minSize = Math.min(queryTokens.size, clauseTokens.size);
  const termOverlap = minSize > 0 ? intersection / minSize : 0;

  // 2. Payer match bonus
  const payerMatch = entry.payer_name.toLowerCase() === payerName.toLowerCase() ? 0.25 : 0;

  // 3. Denial type match
  const denialTypeKeywords: Record<string, string[]> = {
    'Medical Necessity': ['medical_necessity', 'reasonable_and_necessary', 'medically_necessary', 'not_medically_necessary', 'section_1862'],
    'Prior Authorization': ['prior_authorization', 'prior_auth', 'pre-certification', 'precertification', 'authorization_required', 'notification'],
    'Coding/Billing': ['coding', 'billing', 'coding_error', 'billing_error', 'unbundling', 'correct_coding_initiative', 'modifier', 'carc', 'co16', 'co18'],
    'Experimental/Investigational': ['experimental', 'investigational', 'fda_approval', 'clinical_trial', 'phase_i', 'phase_ii', 'phase_iii', 'peer-reviewed', 'ced', 'coverage_with_evidence_development'],
    'Out-of-Network': ['out-of-network', 'out_of_network', 'network', 'no_surprises_act', 'prudent_layperson', 'independent_dispute_resolution', 'network_adequacy', 'balance_billing'],
  };

  const typeKeywords = denialTypeKeywords[denialType] ?? [];
  const queryLower = queryText.toLowerCase();
  let typeMatchCount = 0;
  for (const kw of typeKeywords) {
    if (entry.clause_text.toLowerCase().includes(kw.replace(/_/g, ' ')) ||
        entry.clause_text.toLowerCase().includes(kw.replace(/_/g, '-'))) {
      typeMatchCount++;
    }
  }
  // Also check if the entry's denial_type matches the query's denial_type
  const denialTypeMatch = entry.denial_type === denialType ? 0.20 : 0;
  const typeKeywordBonus = typeKeywords.length > 0 ? (typeMatchCount / typeKeywords.length) * 0.10 : 0;

  // 4. Retrieval weight
  const weightBonus = (entry.retrieval_weight - 0.8) * 0.5; // Normalize: 0.8→0, 1.0→0.10

  // 5. Reason code Match — check if denial reason code appears in clause
  const reasonCodeMatch = /\bCO\d{2}\b|\bPR\d{2}\b|\bOA\d{2}\b/.test(queryText)
    ? 0.05
    : 0;

  // Combine scores
  const score = termOverlap * 0.40 + payerMatch + denialTypeMatch + typeKeywordBonus + weightBonus + reasonCodeMatch;

  return Math.round(score * 10000) / 10000; // 4 decimal places
}

/**
 * Policy Research Agent: Given a test letter, retrieve the top-K
 * most relevant payer policy clauses from the corpus.
 */
export function policyResearchAgent(
  letter: TestLetter,
  corpus: PayerPolicyEntry[],
  topK = 3,
): RetrievalResult[] {
  // Build query text from the letter
  const queryText = [
    letter.denial_letter_text,
    `Payer: ${letter.payer}`,
    `Denial Type: ${letter.denial_type}`,
    `Denial Code: ${letter.denial_reason_code}`,
    `CPT: ${letter.cpt_codes.join(', ')}`,
    `ICD: ${letter.icd_codes.join(', ')}`,
  ].join('\n');

  const queryTokens = tokenize(queryText);

  // Score each corpus entry
  const scored = corpus.map(entry => ({
    entry,
    score: computeSimilarity(queryTokens, queryText, entry, letter.payer, letter.denial_type),
  }));

  // Sort by score descending, take top-K
  const topResults = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return topResults.map(r => ({
    clause_id: r.entry.clause_id,
    payer_name: r.entry.payer_name,
    denial_type: r.entry.denial_type,
    score: r.score,
    snippet: r.entry.clause_text.slice(0, 200) + '...',
  }));
}

// ─── Retrieval Accuracy Validation ────────────────────────────────────────

/**
 * Validate retrieval accuracy for a single test letter.
 *
 * A letter "passes" if at least 1 of its expected_clause_ids
 * appears in the top-3 retrieved results.
 */
export function validateLetter(
  letter: TestLetter,
  corpus: PayerPolicyEntry[],
  topK = 3,
): LetterTestResult {
  const retrieved = policyResearchAgent(letter, corpus, topK);
  const retrievedIds = retrieved.map(r => r.clause_id);

  const matchedIds = letter.expected_clause_ids.filter(id => retrievedIds.includes(id));
  const matchCount = matchedIds.length;
  const expectedCount = letter.expected_clause_ids.length;

  // Pass if at least 1 expected clause is in top-K
  const pass = matchCount >= 1;

  let details: string;
  if (pass && matchCount === expectedCount) {
    details = `PASS: All ${expectedCount} expected clause(s) found in top-${topK}`;
  } else if (pass) {
    details = `PASS: ${matchCount}/${expectedCount} expected clause(s) found in top-${topK} (${matchedIds.join(', ')})`;
  } else {
    details = `FAIL: 0/${expectedCount} expected clause(s) found in top-${topK}. Expected: [${letter.expected_clause_ids.join(', ')}], Got: [${retrievedIds.join(', ')}]`;
  }

  return {
    letter_id: letter.id,
    payer: letter.payer,
    denial_type: letter.denial_type,
    expected_clause_ids: letter.expected_clause_ids,
    retrieved_top3: retrieved,
    retrieved_top3_ids: retrievedIds,
    matched_clause_ids: matchedIds,
    match_count: matchCount,
    expected_count: expectedCount,
    pass,
    details,
  };
}

/**
 * Run the full validation suite: all test letters against the payer policy corpus.
 *
 * Gate: 5/5 letters must pass (at least 1 expected clause_id in top-3).
 */
export function runValidationSuite(topK = 3): ValidationReport {
  const corpus = loadPayerPolicyCorpus();
  const testLetters = loadTestLetters();

  const results = testLetters.letters.map(letter =>
    validateLetter(letter, corpus.entries, topK)
  );

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  const uniquePayers = [...new Set(corpus.entries.map(e => e.payer_name))];
  const uniqueDenialTypes = [...new Set(corpus.entries.map(e => e.denial_type))];

  return {
    total_letters: results.length,
    passed,
    failed,
    gate_passed: passed === results.length, // 5/5 required
    gate_threshold: `${results.length}/${results.length} letters must have ≥1 expected clause_id in top-${topK}`,
    results,
    timestamp: new Date().toISOString(),
    corpus_size: corpus.entries.length,
    corpus_payers: uniquePayers,
    corpus_denial_types: uniqueDenialTypes,
  };
}

/**
 * Format a validation report as a human-readable string.
 */
export function formatReport(report: ValidationReport): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('  DenialDefender — Payer Policy Retrieval Accuracy Report');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`  Timestamp:      ${report.timestamp}`);
  lines.push(`  Corpus Size:    ${report.corpus_size} entries`);
  lines.push(`  Payers:         ${report.corpus_payers.join(', ')}`);
  lines.push(`  Denial Types:   ${report.corpus_denial_types.join(', ')}`);
  lines.push(`  Test Letters:   ${report.total_letters}`);
  lines.push(`  Gate Threshold: ${report.gate_threshold}`);
  lines.push('');
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('  RESULTS');
  lines.push('───────────────────────────────────────────────────────────');

  for (const result of report.results) {
    const status = result.pass ? 'PASS' : 'FAIL';
    lines.push('');
    lines.push(`  ${status}  Letter ${result.letter_id} — ${result.payer} / ${result.denial_type}`);
    lines.push(`         Expected:  [${result.expected_clause_ids.join(', ')}]`);
    lines.push(`         Retrieved: [${result.retrieved_top3_ids.join(', ')}]`);
    lines.push(`         Matched:   [${result.matched_clause_ids.join(', ')}] (${result.match_count}/${result.expected_count})`);
    lines.push(`         Details:   ${result.details}`);

    // Show top-3 scores
    for (const r of result.retrieved_top3) {
      lines.push(`           → ${r.clause_id} (${r.payer_name}/${r.denial_type}) score=${r.score}`);
    }
  }

  lines.push('');
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('  GATE RESULT');
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('');
  lines.push(`  Passed:  ${report.passed}/${report.total_letters}`);
  lines.push(`  Failed:  ${report.failed}/${report.total_letters}`);
  lines.push(`  Gate:    ${report.gate_passed ? 'PASSED (5/5)' : 'FAILED'}`);
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════');

  return lines.join('\n');
}
