/**
 * GET /api/eval/snapshot — Load a saved eval snapshot
 * POST /api/eval/snapshot — Save current eval as snapshot
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadEvalSnapshot, saveEvalSnapshot, runFullEval, type PipelineOutputForEval } from '@/lib/eval-service';
import { runFullPipeline } from '@/lib/full-pipeline';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const SNAPSHOT_DIR = join(process.cwd(), 'data', 'eval_snapshots');
const BEFORE_SCORES_PATH = join(SNAPSHOT_DIR, 'before-scores.json');

async function evalPipelineRunner(
  denialText: string,
  payer: string,
): Promise<PipelineOutputForEval> {
  const result = await runFullPipeline({ denialText, payer });

  // Extract citations
  const citationSources: string[] = [];
  const citationProvenanceTiers: string[] = [];

  if (result.evidenceAssembly?.clinicalEvidence) {
    for (const ev of result.evidenceAssembly.clinicalEvidence) {
      citationSources.push(ev.source || 'unknown');
      citationProvenanceTiers.push(ev.provenanceTier || 'secondary_summary');
    }
  }

  if (result.evidenceAssembly?.deduplicatedClauses) {
    for (const cl of result.evidenceAssembly.deduplicatedClauses) {
      const key = cl.clauseId || cl.source;
      if (key && !citationSources.includes(key)) {
        citationSources.push(key);
        citationProvenanceTiers.push(cl.provenanceTier || 'secondary_summary');
      }
    }
  }

  if (result.policyResearch?.clauses) {
    for (const clause of result.policyResearch.clauses) {
      const key = clause.clauseId || clause.source;
      if (key && !citationSources.includes(key)) {
        citationSources.push(key);
        citationProvenanceTiers.push(clause.provenanceTier || 'secondary_summary');
      }
    }
  }

  return {
    triageStrategy: result.triage?.classification?.appealStrategy || 'unknown',
    triageConfidence: result.triage?.classification?.estimatedSuccessRate || 0,
    isAppealable: result.triage?.classification?.isAppealable ?? true,
    appealStrategies: [
      result.triage?.classification?.appealStrategy || 'unknown',
      ...(result.triage?.classification?.keyFactors?.slice(0, 2).map(f => `supporting_${f.toLowerCase().replace(/\s+/g, '_')}`) || []),
    ].slice(0, 3),
    citationSources,
    citationProvenanceTiers,
    argumentQuality: result.qualityReview?.overallScore || 0.5,
    letterQuality: result.qualityReview?.overallScore || 0.5,
    appealLetter: result.letterDrafting?.appealLetter || '',
    appealLetterLength: (result.letterDrafting?.appealLetter || '').length,
  };
}

export async function GET() {
  try {
    // Ensure directory exists
    if (!existsSync(SNAPSHOT_DIR)) {
      mkdirSync(SNAPSHOT_DIR, { recursive: true });
    }

    // Load before-scores snapshot
    const snapshot = loadEvalSnapshot(BEFORE_SCORES_PATH);

    if (!snapshot) {
      return NextResponse.json({
        success: false,
        error: 'No before-scores snapshot found. Run POST to generate one.',
        path: BEFORE_SCORES_PATH,
      });
    }

    return NextResponse.json({
      success: true,
      snapshot: {
        runId: snapshot.runId,
        timestamp: snapshot.timestamp,
        temperature: snapshot.temperature,
        totalCases: snapshot.totalCases,
        determinismHash: snapshot.determinismHash,
        aggregateMetrics: snapshot.aggregateMetrics,
        caseSummaries: snapshot.caseResults.map(r => ({
          caseId: r.caseId,
          caseName: r.caseName,
          metrics: Object.fromEntries(r.metrics.map(m => [m.metric, m.value])),
          latencyMs: r.latencyMs,
        })),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    // Ensure directory exists
    if (!existsSync(SNAPSHOT_DIR)) {
      mkdirSync(SNAPSHOT_DIR, { recursive: true });
    }

    // Run full eval and save as before-scores snapshot
    const snapshot = await runFullEval(evalPipelineRunner);
    saveEvalSnapshot(snapshot, BEFORE_SCORES_PATH);

    return NextResponse.json({
      success: true,
      message: 'Before-scores snapshot generated and saved',
      path: BEFORE_SCORES_PATH,
      snapshot: {
        runId: snapshot.runId,
        timestamp: snapshot.timestamp,
        temperature: snapshot.temperature,
        totalCases: snapshot.totalCases,
        determinismHash: snapshot.determinismHash,
        aggregateMetrics: snapshot.aggregateMetrics,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
