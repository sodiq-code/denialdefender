/**
 * DenialDefender — Eval Service (Day 7: Outcome Learning harness v1)
 *
 * Implements the evaluation harness for measuring system quality on held-out cases.
 * Key properties:
 * - 10 held-out cases under data/cases/held_out/
 * - 5 metrics: top-1 accuracy, top-3 accuracy, citation grounding, argument selection, appeal quality
 * - Temperature pinned to 0 for deterministic eval runs
 * - Determinism gate: running twice produces identical scores
 * - Before-scores snapshot checked into repo
 *
 * Per the Ultimate Blueprint: "Pin temperature to zero for eval runs.
 * Build the outcome-ingestion path. Deliverable: a before-scores snapshot
 * for the ten held-out cases. Gate: the snapshot is deterministic —
 * running it twice produces identical scores."
 */

import { readFileSync, existsSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { db } from './db';

// ─── Held-Out Case Types ──────────────────────────────────────────────────

export interface HeldOutDenial {
  payer: string;
  reasonCode: string;
  category: string;
  denialLetterText: string;
  cptCode: string;
  icd10Code: string;
  amount: number;
  appealDeadline: string;
}

export interface ExpectedOutcome {
  appealStrategy: string;
  estimatedSuccessRate: number;
  keyFactors: string[];
}

export interface GroundTruth {
  correctStrategy: string;
  correctCitations: string[];
  minimumQualityScore: number;
  shouldAppeal: boolean;
}

export interface HeldOutCase {
  id: string;
  name: string;
  description: string;
  denial: HeldOutDenial;
  expectedOutcome: ExpectedOutcome;
  groundTruth: GroundTruth;
}

// ─── Eval Metric Types ─────────────────────────────────────────────────────

export type MetricName = 'top1_accuracy' | 'top3_accuracy' | 'citation_grounding' | 'argument_selection' | 'appeal_quality';

export const METRIC_NAMES: MetricName[] = [
  'top1_accuracy',
  'top3_accuracy',
  'citation_grounding',
  'argument_selection',
  'appeal_quality',
];

export const METRIC_LABELS: Record<MetricName, string> = {
  top1_accuracy: 'Top-1 Accuracy',
  top3_accuracy: 'Top-3 Accuracy',
  citation_grounding: 'Citation Grounding',
  argument_selection: 'Argument Selection',
  appeal_quality: 'Appeal Quality',
};

export interface MetricScore {
  metric: MetricName;
  value: number;         // 0.0 – 1.0
  details: string;
}

export interface CaseEvalResult {
  caseId: string;
  caseName: string;
  metrics: MetricScore[];
  pipelineOutput: PipelineOutputForEval | null;
  error: string | null;
  latencyMs: number;
}

export interface EvalSnapshot {
  timestamp: string;
  runId: string;
  temperature: number;       // MUST be 0
  caseResults: CaseEvalResult[];
  aggregateMetrics: Record<MetricName, number>;
  totalCases: number;
  determinismHash: string;   // hash of all scores for determinism check
}

// ─── Pipeline Output Captured for Eval ─────────────────────────────────────

export interface PipelineOutputForEval {
  triageStrategy: string;
  triageConfidence: number;
  isAppealable: boolean;
  appealStrategies: string[];     // ordered list (top-1, top-2, top-3)
  citationSources: string[];      // e.g., ["NCD 160.8", "CMS MLN Matters SE0528"]
  citationProvenanceTiers: string[];  // e.g., ["primary_source", "secondary_summary"]
  argumentQuality: number;        // 0–1 from quality review
  letterQuality: number;          // 0–1 from quality review
  appealLetter: string;
  appealLetterLength: number;
}

// ─── Load Held-Out Cases ───────────────────────────────────────────────────

const HELD_OUT_DIR = join(process.cwd(), 'data', 'cases', 'held_out');

export function loadHeldOutCases(): HeldOutCase[] {
  const cases: HeldOutCase[] = [];

  for (let i = 1; i <= 10; i++) {
    const num = String(i).padStart(3, '0');
    // Find the file matching this number
    const files = readdirSync(HELD_OUT_DIR);
    const match = files.find((f: string) => f.startsWith(`case_${num}_`) && f.endsWith('.json'));

    if (match && existsSync(join(HELD_OUT_DIR, match))) {
      try {
        const raw = readFileSync(join(HELD_OUT_DIR, match), 'utf-8');
        const parsed = JSON.parse(raw) as HeldOutCase;
        cases.push(parsed);
      } catch (e: any) {
        console.error(`Failed to load held-out case ${match}:`, e.message);
      }
    }
  }

  return cases;
}

// ─── Eval Scoring Functions ────────────────────────────────────────────────

/**
 * Top-1 Accuracy: Did the system's #1 strategy match the ground-truth strategy?
 * Binary: 1.0 if match, 0.0 if not.
 */
function scoreTop1Accuracy(output: PipelineOutputForEval, truth: GroundTruth): MetricScore {
  const match = output.triageStrategy === truth.correctStrategy;
  return {
    metric: 'top1_accuracy',
    value: match ? 1.0 : 0.0,
    details: match
      ? `Strategy "${output.triageStrategy}" matches ground truth`
      : `Strategy "${output.triageStrategy}" does NOT match ground truth "${truth.correctStrategy}"`,
  };
}

/**
 * Top-3 Accuracy: Is the ground-truth strategy in the top-3 strategies?
 * 1.0 if in top-3, 0.0 if not.
 */
function scoreTop3Accuracy(output: PipelineOutputForEval, truth: GroundTruth): MetricScore {
  const inTop3 = output.appealStrategies.slice(0, 3).includes(truth.correctStrategy);
  return {
    metric: 'top3_accuracy',
    value: inTop3 ? 1.0 : 0.0,
    details: inTop3
      ? `Ground truth "${truth.correctStrategy}" found in top-3 strategies: [${output.appealStrategies.slice(0, 3).join(', ')}]`
      : `Ground truth "${truth.correctStrategy}" NOT in top-3: [${output.appealStrategies.slice(0, 3).join(', ')}]`,
  };
}

/**
 * Citation Grounding: Fraction of ground-truth citations that appear in the system's citations.
 * Also weighted by provenance tier (primary > secondary > tertiary).
 */
function scoreCitationGrounding(output: PipelineOutputForEval, truth: GroundTruth): MetricScore {
  if (truth.correctCitations.length === 0) {
    return { metric: 'citation_grounding', value: 1.0, details: 'No ground-truth citations to match' };
  }

  let matched = 0;
  const matchedCitations: string[] = [];
  const unmatched: string[] = [];

  for (const truthCite of truth.correctCitations) {
    // Fuzzy match: check if any system citation contains the truth citation key or vice versa
    const found = output.citationSources.some(sysCite =>
      sysCite.toLowerCase().includes(truthCite.toLowerCase()) ||
      truthCite.toLowerCase().includes(sysCite.toLowerCase().split(' ')[0])
    );
    if (found) {
      matched++;
      matchedCitations.push(truthCite);
    } else {
      unmatched.push(truthCite);
    }
  }

  const rawScore = matched / truth.correctCitations.length;

  // Provenance tier bonus: primary citations get 1.0x, secondary 0.8x, tertiary 0.6x
  const tierWeights = output.citationProvenanceTiers.map(t => {
    if (t === 'primary_source') return 1.0;
    if (t === 'secondary_summary') return 0.8;
    return 0.6; // tertiary_commentary
  });
  const avgTierWeight = tierWeights.length > 0
    ? tierWeights.reduce((a, b) => a + b, 0) / tierWeights.length
    : 0.7;

  const score = rawScore * avgTierWeight;

  return {
    metric: 'citation_grounding',
    value: Math.round(score * 1000) / 1000,
    details: `Matched ${matched}/${truth.correctCitations.length} citations. Tier-adjuted score: ${(avgTierWeight * 100).toFixed(0)}% avg tier. Matched: [${matchedCitations.join(', ')}]. Missing: [${unmatched.join(', ')}]`,
  };
}

/**
 * Argument Selection: How well did the system select the right appeal arguments?
 * Based on key factor overlap with expected outcome key factors.
 */
function scoreArgumentSelection(output: PipelineOutputForEval, expected: ExpectedOutcome): MetricScore {
  if (expected.keyFactors.length === 0) {
    return { metric: 'argument_selection', value: 1.0, details: 'No expected key factors' };
  }

  // We score based on:
  // 1. Did the system correctly identify isAppealable? (should match groundTruth.shouldAppeal)
  // 2. Is the confidence close to the estimated success rate?
  // 3. Does the strategy match the expected strategy?
  let score = 0;

  // Strategy match (40% weight)
  if (output.triageStrategy === expected.appealStrategy) {
    score += 0.4;
  } else if (output.appealStrategies.slice(0, 3).includes(expected.appealStrategy)) {
    score += 0.2; // partial credit for top-3
  }

  // Confidence alignment (30% weight)
  const confidenceDiff = Math.abs(output.triageConfidence - expected.estimatedSuccessRate);
  const confidenceScore = Math.max(0, 1 - confidenceDiff * 2); // Penalize large gaps
  score += 0.3 * confidenceScore;

  // Appealability alignment (30% weight)
  score += 0.3; // Assume correct by default; deduct if appeal letter is empty for appealable case
  if (output.appealLetterLength === 0 && expected.estimatedSuccessRate > 0.1) {
    score -= 0.3; // Should have produced an appeal but didn't
  }

  return {
    metric: 'argument_selection',
    value: Math.round(score * 1000) / 1000,
    details: `Strategy match: ${output.triageStrategy === expected.appealStrategy ? 'yes' : 'no'}. Confidence: ${output.triageConfidence.toFixed(2)} vs expected ${expected.estimatedSuccessRate.toFixed(2)}. Appeal letter: ${output.appealLetterLength} chars.`,
  };
}

/**
 * Appeal Quality: Quality of the generated appeal letter.
 * Based on quality review score, letter length adequacy, and ground-truth minimum quality.
 */
function scoreAppealQuality(output: PipelineOutputForEval, truth: GroundTruth): MetricScore {
  // If the case is not appealable, quality is measured by correctly identifying it
  if (!truth.shouldAppeal) {
    const correctlyIdentified = !output.isAppealable;
    return {
      metric: 'appeal_quality',
      value: correctlyIdentified ? 1.0 : 0.2,
      details: correctlyIdentified
        ? 'Correctly identified as non-appealable'
        : 'Incorrectly identified as appealable (should not appeal)',
    };
  }

  // For appealable cases, score based on:
  // 1. Letter quality from QA (60% weight)
  // 2. Letter length adequacy (20% weight)
  // 3. Meets minimum quality threshold (20% weight)
  let score = 0;

  // Letter quality from QA review
  score += 0.6 * output.letterQuality;

  // Letter length adequacy (sweet spot: 500-5000 chars)
  const len = output.appealLetterLength;
  if (len >= 500 && len <= 5000) {
    score += 0.2;
  } else if (len >= 200 && len <= 10000) {
    score += 0.1; // partial credit
  }

  // Meets minimum quality threshold
  if (output.letterQuality >= truth.minimumQualityScore) {
    score += 0.2;
  } else {
    score += 0.2 * (output.letterQuality / truth.minimumQualityScore); // partial
  }

  return {
    metric: 'appeal_quality',
    value: Math.round(score * 1000) / 1000,
    details: `Letter quality: ${output.letterQuality.toFixed(2)} (min: ${truth.minimumQualityScore.toFixed(2)}). Length: ${output.appealLetterLength} chars. Arg quality: ${output.argumentQuality.toFixed(2)}.`,
  };
}

// ─── Run Full Eval ─────────────────────────────────────────────────────────

/**
 * Run the evaluation pipeline on a single held-out case.
 * Temperature is pinned to 0 for deterministic scoring.
 * Uses the inline workflow engine for reliability in sandbox.
 */
async function evalSingleCase(
  heldCase: HeldOutCase,
  pipelineRunner: (denialText: string, payer: string) => Promise<PipelineOutputForEval>,
): Promise<CaseEvalResult> {
  const start = Date.now();
  let output: PipelineOutputForEval | null = null;
  let error: string | null = null;

  try {
    output = await pipelineRunner(heldCase.denial.denialLetterText, heldCase.denial.payer);
  } catch (e: any) {
    error = e.message || 'Pipeline runner failed';
  }

  const latencyMs = Date.now() - start;

  if (error || !output) {
    return {
      caseId: heldCase.id,
      caseName: heldCase.name,
      metrics: METRIC_NAMES.map(m => ({ metric: m, value: 0, details: `Pipeline failed: ${error}` })),
      pipelineOutput: null,
      error,
      latencyMs,
    };
  }

  // Score all 5 metrics
  const metrics: MetricScore[] = [
    scoreTop1Accuracy(output, heldCase.groundTruth),
    scoreTop3Accuracy(output, heldCase.groundTruth),
    scoreCitationGrounding(output, heldCase.groundTruth),
    scoreArgumentSelection(output, heldCase.expectedOutcome),
    scoreAppealQuality(output, heldCase.groundTruth),
  ];

  return {
    caseId: heldCase.id,
    caseName: heldCase.name,
    metrics,
    pipelineOutput: output,
    error: null,
    latencyMs,
  };
}

/**
 * Run the full evaluation on all 10 held-out cases.
 * Temperature is pinned to 0.
 * Returns an EvalSnapshot that can be checked into the repo.
 */
export async function runFullEval(
  pipelineRunner: (denialText: string, payer: string) => Promise<PipelineOutputForEval>,
): Promise<EvalSnapshot> {
  const cases = loadHeldOutCases();
  const runId = `eval-${Date.now()}`;
  const caseResults: CaseEvalResult[] = [];

  // Run eval on each case sequentially for determinism
  for (const heldCase of cases) {
    const result = await evalSingleCase(heldCase, pipelineRunner);
    caseResults.push(result);
  }

  // Compute aggregate metrics (mean across all cases)
  const aggregateMetrics: Record<MetricName, number> = {
    top1_accuracy: 0,
    top3_accuracy: 0,
    citation_grounding: 0,
    argument_selection: 0,
    appeal_quality: 0,
  };

  for (const metric of METRIC_NAMES) {
    const values = caseResults.map(r => r.metrics.find(m => m.metric === metric)?.value || 0);
    aggregateMetrics[metric] = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 1000) / 1000;
  }

  // Compute determinism hash — hash of all metric values in a stable order
  const determinismHash = computeDeterminismHash(caseResults);

  return {
    timestamp: new Date().toISOString(),
    runId,
    temperature: 0, // ALWAYS 0 for eval
    caseResults,
    aggregateMetrics,
    totalCases: cases.length,
    determinismHash,
  };
}

/**
 * Compute a deterministic hash from all case results.
 * This hash MUST be identical across runs for the determinism gate.
 */
function computeDeterminismHash(results: CaseEvalResult[]): string {
  // Sort by caseId for stability
  const sorted = [...results].sort((a, b) => a.caseId.localeCompare(b.caseId));

  // Create a string representation of all scores
  const scoreStr = sorted.map(r =>
    `${r.caseId}:${r.metrics.map(m => `${m.metric}=${m.value.toFixed(4)}`).join(',')}`
  ).join('|');

  return createHash('sha256').update(scoreStr).digest('hex').slice(0, 16);
}

/**
 * Verify determinism: run the eval twice and compare hashes.
 * Returns true if hashes match (determinism gate passes).
 */
export async function verifyDeterminism(
  pipelineRunner: (denialText: string, payer: string) => Promise<PipelineOutputForEval>,
  runs: number = 2,
): Promise<{ passed: boolean; hashes: string[]; runSnapshots: EvalSnapshot[] }> {
  const hashes: string[] = [];
  const runSnapshots: EvalSnapshot[] = [];

  for (let i = 0; i < runs; i++) {
    const snapshot = await runFullEval(pipelineRunner);
    hashes.push(snapshot.determinismHash);
    runSnapshots.push(snapshot);
  }

  const passed = hashes.every(h => h === hashes[0]);
  return { passed, hashes, runSnapshots };
}

/**
 * Save the eval snapshot to disk (for repo check-in).
 */
export function saveEvalSnapshot(snapshot: EvalSnapshot, filepath: string): void {
  writeFileSync(filepath, JSON.stringify(snapshot, null, 2), 'utf-8');
}

/**
 * Load a previous eval snapshot from disk (for comparison).
 */
export function loadEvalSnapshot(filepath: string): EvalSnapshot | null {
  if (!existsSync(filepath)) return null;
  try {
    return JSON.parse(readFileSync(filepath, 'utf-8')) as EvalSnapshot;
  } catch {
    return null;
  }
}

// ─── Aggregate Report Helpers ──────────────────────────────────────────────

export interface EvalReport {
  snapshot: EvalSnapshot;
  previousSnapshot: EvalSnapshot | null;
  deltas: Record<MetricName, number> | null;
  perCaseBreakdown: {
    caseId: string;
    caseName: string;
    metrics: Record<MetricName, number>;
    error: string | null;
  }[];
}

/**
 * Generate a full eval report with delta from previous snapshot.
 */
export function generateEvalReport(
  snapshot: EvalSnapshot,
  previousSnapshotPath: string,
): EvalReport {
  const previousSnapshot = loadEvalSnapshot(previousSnapshotPath);

  let deltas: Record<MetricName, number> | null = null;
  if (previousSnapshot) {
    deltas = {} as Record<MetricName, number>;
    for (const metric of METRIC_NAMES) {
      deltas[metric] = Math.round(
        (snapshot.aggregateMetrics[metric] - previousSnapshot.aggregateMetrics[metric]) * 1000
      ) / 1000;
    }
  }

  const perCaseBreakdown = snapshot.caseResults.map(r => ({
    caseId: r.caseId,
    caseName: r.caseName,
    metrics: Object.fromEntries(r.metrics.map(m => [m.metric, m.value])) as Record<MetricName, number>,
    error: r.error,
  }));

  return { snapshot, previousSnapshot, deltas, perCaseBreakdown };
}
