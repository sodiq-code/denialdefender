/**
 * GET /api/outcome-learning — Outcome learning status and current weights
 * POST /api/outcome-learning — Run behavioral demo or ingest outcome
 *
 * Behavioral Demo (action: "behavioral_demo"):
 *   1. Run triage WITHOUT learned context (Case 1 — baseline)
 *   2. Ingest a specific LOSS outcome for the target payer/category
 *   3. Run triage AGAIN with learned context (Case 2 — after learning)
 *   4. Return both results + the measured behavioral difference
 *
 * This demonstrates the Outcome Learning Loop:
 *   Outcome → Weight Update → Prompt Injection → Better Decision
 */

import { NextRequest, NextResponse } from 'next/server';
import { memoryBank } from '@/lib/geap-memory-bank';
import { ingestOutcome, type OutcomeRecord } from '@/lib/outcome-ingestion';
import { db } from '@/lib/db';

const FLEET_URL = process.env.AGENT_FLEET_URL || 'http://localhost:3004';
const FLEET_TIMEOUT_MS = 30_000;

// ─── Types ──────────────────────────────────────────────────────────────

interface BehavioralDemoResult {
  case1: {
    label: string;
    agentResult: Record<string, unknown>;
    learnedContextUsed: boolean;
    strategy: string;
    estimatedSuccessRate: number;
    confidence: number;
  };
  outcomeIngested: {
    verdict: string;
    payer: string;
    category: string;
    weightUpdates: number;
  };
  case2: {
    label: string;
    agentResult: Record<string, unknown>;
    learnedContextUsed: boolean;
    strategy: string;
    estimatedSuccessRate: number;
    confidence: number;
  };
  behavioralChange: {
    strategyChanged: boolean;
    successRateDelta: number;
    confidenceDelta: number;
    learnedContextApplied: boolean;
    improvementDescription: string;
  };
  learningLoopProven: boolean;
}

// ─── Fetch learned context from Memory Bank ────────────────────────────

async function getLearnedContext(payer: string, denialCategory: string): Promise<{
  strategySuccessRates: Record<string, number>;
  evidenceWeightHints: Record<string, number>;
  payerBehaviorNotes: string[];
  categoryOutcomeCount: number;
} | null> {
  try {
    const weights = await memoryBank.getOutcomeWeights(denialCategory, payer);
    if (!weights || weights.sampleSize === 0) return null;

    const strategySuccessRates: Record<string, number> = {};
    const payerBehaviorNotes: string[] = [];

    // Extract strategy rates from learned patterns
    const patterns = await memoryBank.getLearnedPatterns({
      patternType: 'strategy_weight',
      denialCategory,
      payer,
    });
    for (const pattern of patterns.slice(0, 10)) {
      const data = pattern.data as Record<string, unknown>;
      if (data.strategy && data.successRate) {
        strategySuccessRates[data.strategy as string] = data.successRate as number;
      }
    }

    // If no specific patterns, derive from weight updates
    if (Object.keys(strategySuccessRates).length === 0 && weights.sampleSize > 0) {
      // Use strategy weights directly from the outcome weights object
      const w = weights.weights as Record<string, number>;
      if (w) {
        for (const [key, val] of Object.entries(w)) {
          if (['medical_necessity', 'prior_auth', 'coding', 'experimental', 'out_of_network'].includes(key) && val != null) {
            strategySuccessRates[key] = val;
          }
        }
      }
      // Fallback: derive from procedural/clinical weights
      if (Object.keys(strategySuccessRates).length === 0) {
        strategySuccessRates['medical_necessity'] = Math.min(0.95, 0.5 + (w?.proceduralWeight ?? 0.5) * 0.3);
        strategySuccessRates['prior_auth'] = Math.min(0.85, 0.4 + (w?.proceduralWeight ?? 0.5) * 0.15);
        strategySuccessRates['coding'] = Math.min(0.90, 0.45 + (w?.proceduralWeight ?? 0.5) * 0.2);
      }
    }

    // Add payer behavior notes from outcome data
    if (weights.sampleSize >= 3) {
      payerBehaviorNotes.push(
        `${payer} has ${weights.sampleSize} outcome records for ${denialCategory} denials`
      );
    }

    // Get evidence weight hints
    const evidencePatterns = await memoryBank.getLearnedPatterns({
      patternType: 'citation_relevance',
      denialCategory,
      payer,
    });
    const evidenceWeightHints: Record<string, number> = {};
    for (const ep of evidencePatterns.slice(0, 5)) {
      const data = ep.data as Record<string, unknown>;
      if (data.source && data.weight) {
        evidenceWeightHints[data.source as string] = data.weight as number;
      }
    }

    return {
      strategySuccessRates,
      evidenceWeightHints,
      payerBehaviorNotes,
      categoryOutcomeCount: weights.sampleSize,
    };
  } catch (e) {
    console.warn('Failed to get learned context:', e);
    return null;
  }
}

// ─── Call fleet agent ──────────────────────────────────────────────────

async function callFleetAgent(
  agentName: string,
  payload: Record<string, unknown>,
  learnedContext?: Record<string, unknown>
): Promise<{ data: Record<string, unknown>; trace: Record<string, unknown> }> {
  const body = { ...payload };
  if (learnedContext) {
    body.learnedContext = learnedContext;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FLEET_TIMEOUT_MS);

  try {
    const res = await fetch(`${FLEET_URL}/agents/${agentName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Fleet returned ${res.status}`);
    }

    const result = await res.json();
    return { data: result.data, trace: result.trace };
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

// ─── GET: Status ────────────────────────────────────────────────────────

export async function GET() {
  try {
    const mbStatus = memoryBank.getStatus();

    // Count outcomes in DB
    let outcomeCount = 0;
    try {
      outcomeCount = await db.outcome.count();
    } catch {
      // DB may not be available
    }

    // Count learned patterns
    let patternCount = 0;
    try {
      patternCount = await db.learnedPattern.count();
    } catch {
      // DB may not be available
    }

    return NextResponse.json({
      success: true,
      status: {
        outcomeRecordsStored: outcomeCount,
        learnedPatternsStored: patternCount,
        memoryBank: mbStatus,
        learningLoopActive: mbStatus.longTermMemory.active,
        fleetConnected: FLEET_URL,
      },
      capabilities: {
        behavioralDemo: 'POST with action="behavioral_demo"',
        ingestOutcome: 'POST with action="ingest_outcome"',
        getWeights: 'POST with action="get_weights"',
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── POST: Actions ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action as string;

    switch (action) {
      case 'behavioral_demo':
        return await runBehavioralDemo(body);
      case 'ingest_outcome':
        return await handleIngestOutcome(body);
      case 'get_weights':
        return await handleGetWeights(body);
      case 'ingest_batch':
        return await handleIngestBatch();
      default:
        return NextResponse.json(
          { success: false, error: 'Unknown action. Use: behavioral_demo, ingest_outcome, get_weights, ingest_batch' },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── Behavioral Demo ───────────────────────────────────────────────────

async function runBehavioralDemo(body: Record<string, unknown>): Promise<Response> {
  const payer = (body.payer as string) || 'UnitedHealthcare';
  const denialCategory = (body.denialCategory as string) || 'medical_necessity';
  const denialCode = (body.denialCode as string) || '19';
  const procedureCode = (body.procedureCode as string) || '99213';
  const diagnosisCode = (body.diagnosisCode as string) || 'M54.5';

  const denialPayload = {
    caseId: 'BEHAVIORAL-DEMO',
    denialCode,
    denialReason: 'Medical necessity not established',
    procedureCode,
    diagnosisCode,
    payer,
  };

  // ── CASE 1: Run WITHOUT learned context (baseline) ──
  const case1Result = await callFleetAgent('triage', denialPayload);
  const case1Data = case1Result.data;
  const case1Strategy = (case1Data.strategy as string) || 'MEDICAL_NECESSITY';
  const case1SuccessRate = (case1Data.estimated_success_rate as number) || 0.7;
  const case1Confidence = (case1Data.confidence as number) || 0.78;

  // ── INGEST A LOSS OUTCOME ──
  // This simulates: the appeal from Case 1 was LOST in the real world
  const lossRecord: OutcomeRecord = {
    caseId: `demo-loss-${Date.now()}`,
    verdict: 'lost',
    level: 'Redetermination (MAC)',
    strategyUsed: case1Strategy.toLowerCase(),
    citationsUsed: ['JAMA 2023', 'NEJM 2023', 'AMA CPT Assistant 2024'],
    denialCategory,
    payer,
    amount: 1500,
    turnaroundDays: 45,
    source: 'synthetic_controlled',
    sourceDetail: 'Behavioral demo — synthetic loss to trigger learning',
    timestamp: new Date().toISOString(),
  };

  const ingestionResult = await ingestOutcome(lossRecord);

  // Also ingest a WIN for a different strategy to show the system prefers it
  const altStrategy = case1Strategy === 'MEDICAL_NECESSITY' ? 'coding' : 'medical_necessity';
  const winRecord: OutcomeRecord = {
    caseId: `demo-win-${Date.now()}`,
    verdict: 'won',
    level: 'Reconsideration (QIC)',
    strategyUsed: altStrategy,
    citationsUsed: ['CMS MLN Matters SE0528', 'CPT Assistant'],
    denialCategory,
    payer,
    amount: 3200,
    turnaroundDays: 60,
    source: 'synthetic_controlled',
    sourceDetail: 'Behavioral demo — synthetic win to shift strategy preference',
    timestamp: new Date().toISOString(),
  };

  await ingestOutcome(winRecord);

  // ── CASE 2: Run WITH learned context ──
  const learnedContext = await getLearnedContext(payer, denialCategory);

  const case2Result = await callFleetAgent('triage', denialPayload, learnedContext as Record<string, unknown> | undefined);
  const case2Data = case2Result.data;
  const case2Strategy = (case2Data.strategy as string) || case1Strategy;
  const case2SuccessRate = (case2Data.estimated_success_rate as number) || case1SuccessRate;
  const case2Confidence = (case2Data.confidence as number) || case1Confidence;

  // ── COMPUTE BEHAVIORAL CHANGE ──
  const strategyChanged = case2Strategy !== case1Strategy;
  const successRateDelta = Math.round((case2SuccessRate - case1SuccessRate) * 1000) / 10;
  const confidenceDelta = Math.round((case2Confidence - case1Confidence) * 1000) / 10;
  const learnedContextApplied = case2Result.trace?.learnedContextUsed === true ||
    case2Data.learned_from_outcomes === true;

  let improvementDescription: string;
  if (strategyChanged) {
    improvementDescription = `Strategy changed from ${case1Strategy} to ${case2Strategy} after learning from a loss outcome. The system now prefers the strategy with higher historical success rate.`;
  } else if (successRateDelta !== 0) {
    improvementDescription = `Success rate estimate adjusted by ${successRateDelta > 0 ? '+' : ''}${successRateDelta}% after outcome learning. The system recalibrated its prediction based on ${learnedContext?.categoryOutcomeCount ?? 2} past outcomes.`;
  } else {
    improvementDescription = `Learned context was ${learnedContextApplied ? 'applied' : 'not applied'}. With more outcome data, behavioral changes will become more pronounced. The learning loop is now active.`;
  }

  const result: BehavioralDemoResult = {
    case1: {
      label: 'Before Learning (no outcome data)',
      agentResult: case1Data,
      learnedContextUsed: false,
      strategy: case1Strategy,
      estimatedSuccessRate: case1SuccessRate,
      confidence: case1Confidence,
    },
    outcomeIngested: {
      verdict: 'lost (then win for alt strategy)',
      payer,
      category: denialCategory,
      weightUpdates: ingestionResult.weightUpdates.length,
    },
    case2: {
      label: 'After Learning (outcome-informed)',
      agentResult: case2Data,
      learnedContextUsed: learnedContextApplied,
      strategy: case2Strategy,
      estimatedSuccessRate: case2SuccessRate,
      confidence: case2Confidence,
    },
    behavioralChange: {
      strategyChanged,
      successRateDelta,
      confidenceDelta,
      learnedContextApplied,
      improvementDescription,
    },
    learningLoopProven: strategyChanged || successRateDelta !== 0 || learnedContextApplied,
  };

  return NextResponse.json({
    success: true,
    demo: result,
    principle: 'Principle 9 (Measured Learning) & Principle 10 (Behavioral Improvement) — the system demonstrably changes behavior after recording outcome data',
  });
}

// ─── Ingest Single Outcome ─────────────────────────────────────────────

async function handleIngestOutcome(body: Record<string, unknown>): Promise<Response> {
  const record: OutcomeRecord = {
    caseId: (body.caseId as string) || `manual-${Date.now()}`,
    verdict: body.verdict as OutcomeRecord['verdict'],
    level: (body.level as string) || 'Redetermination (MAC)',
    strategyUsed: (body.strategyUsed as string) || 'medical_necessity',
    citationsUsed: (body.citationsUsed as string[]) || [],
    denialCategory: (body.denialCategory as string) || 'medical_necessity',
    payer: (body.payer as string) || 'UnitedHealthcare',
    amount: (body.amount as number) || 0,
    turnaroundDays: (body.turnaroundDays as number) || 30,
    source: (body.source as OutcomeRecord['source']) || 'internal',
    sourceDetail: (body.sourceDetail as string) || 'Manual outcome ingestion',
    timestamp: new Date().toISOString(),
  };

  const result = await ingestOutcome(record);

  return NextResponse.json({
    success: true,
    outcomeId: result.outcomeId,
    weightUpdates: result.weightUpdates.length,
    memoryBankStatus: result.memoryBankStatus,
    durationMs: result.durationMs,
  });
}

// ─── Get Current Weights ───────────────────────────────────────────────

async function handleGetWeights(body: Record<string, unknown>): Promise<Response> {
  const payer = (body.payer as string) || 'UnitedHealthcare';
  const category = (body.denialCategory as string) || 'medical_necessity';

  const weights = await memoryBank.getOutcomeWeights(category, payer);
  const learnedContext = await getLearnedContext(payer, category);

  return NextResponse.json({
    success: true,
    payer,
    denialCategory: category,
    weights,
    learnedContext,
  });
}

// ─── Ingest Batch (50 outcomes for before/after) ───────────────────────

async function handleIngestBatch(): Promise<Response> {
  const { generatePublicOutcomeRecords, generateSyntheticOutcomeRecords, ingestOutcomeBatch } = await import('@/lib/outcome-ingestion');

  const publicRecords = generatePublicOutcomeRecords();
  const syntheticRecords = generateSyntheticOutcomeRecords(45);
  const allRecords = [...publicRecords, ...syntheticRecords];

  const result = await ingestOutcomeBatch(allRecords);

  return NextResponse.json({
    success: true,
    totalRecords: result.totalRecords,
    successful: result.successful,
    failed: result.failed,
    totalWeightUpdates: result.totalWeightUpdates,
    memoryBankStatus: result.memoryBankStatus,
    sources: { public: publicRecords.length, synthetic: syntheticRecords.length },
    durationMs: result.durationMs,
  });
}
