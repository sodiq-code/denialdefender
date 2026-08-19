/**
 * POST /api/eval — Run full evaluation on 10 held-out cases
 *
 * Day 7: Outcome Learning harness v1
 * Runs the eval pipeline with temperature=0 for determinism.
 * Returns before-scores snapshot.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  runFullEval,
  saveEvalSnapshot,
  loadHeldOutCases,
  type PipelineOutputForEval,
} from '@/lib/eval-service';
import { runFullPipeline } from '@/lib/full-pipeline';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const saveToDisk = body.saveToDisk !== false; // default true

    // Define the pipeline runner for eval
    // Temperature is pinned to 0 inside the pipeline
    async function evalPipelineRunner(
      denialText: string,
      payer: string,
    ): Promise<PipelineOutputForEval> {
      const result = await runFullPipeline({ denialText, payer });

      // Extract structured output for eval scoring
      const triageStrategy = result.triage?.classification?.appealStrategy || 'unknown';
      const triageConfidence = result.triage?.classification?.estimatedSuccessRate || 0;
      const isAppealable = result.triage?.classification?.isAppealable ?? true;

      // Build top-3 strategies from triage key factors
      const appealStrategies = [
        triageStrategy,
        ...(result.triage?.classification?.keyFactors?.slice(0, 2).map(f => `supporting_${f.toLowerCase().replace(/\s+/g, '_')}`) || []),
      ].slice(0, 3);

      // Extract citations from evidence assembly and policy research
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

      const argumentQuality = result.qualityReview?.overallScore || 0.5;
      const letterQuality = result.qualityReview?.overallScore || 0.5;
      const appealLetter = result.letterDrafting?.appealLetter || '';
      const appealLetterLength = appealLetter.length;

      return {
        triageStrategy,
        triageConfidence,
        isAppealable,
        appealStrategies,
        citationSources,
        citationProvenanceTiers,
        argumentQuality,
        letterQuality,
        appealLetter,
        appealLetterLength,
      };
    }

    // Run the full evaluation
    const snapshot = await runFullEval(evalPipelineRunner);

    // Save to disk if requested
    if (saveToDisk) {
      const snapshotPath = `data/eval_snapshots/before-scores-${snapshot.runId}.json`;
      try {
        saveEvalSnapshot(snapshot, snapshotPath);
      } catch (e: any) {
        // Non-fatal — snapshot is still in memory
        console.warn('Could not save snapshot to disk:', e.message);
      }
    }

    // Load held-out case info for context
    const heldOutCases = loadHeldOutCases();

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
          error: r.error,
          latencyMs: r.latencyMs,
        })),
      },
      heldOutCaseCount: heldOutCases.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Eval run failed' },
      { status: 500 },
    );
  }
}

export async function GET() {
  // Return held-out case metadata without running eval
  try {
    const cases = loadHeldOutCases();
    return NextResponse.json({
      success: true,
      totalCases: cases.length,
      cases: cases.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        payer: c.denial.payer,
        category: c.denial.category,
        reasonCode: c.denial.reasonCode,
        shouldAppeal: c.groundTruth.shouldAppeal,
        expectedSuccessRate: c.expectedOutcome.estimatedSuccessRate,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
