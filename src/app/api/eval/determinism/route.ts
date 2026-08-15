/**
 * POST /api/eval/determinism — Verify determinism gate
 *
 * Runs the eval pipeline twice and checks if hashes match.
 * Gate: the snapshot is deterministic — running it twice produces identical scores.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  verifyDeterminism,
  type PipelineOutputForEval,
} from '@/lib/eval-service';
import { runFullPipeline } from '@/lib/full-pipeline';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const runs = body.runs || 2;

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

    const result = await verifyDeterminism(evalPipelineRunner, runs);

    return NextResponse.json({
      success: true,
      gatePassed: result.passed,
      hashes: result.hashes,
      allIdentical: result.passed,
      runsCompleted: result.runSnapshots.length,
      aggregateMetrics: result.runSnapshots[0]?.aggregateMetrics,
      detail: result.passed
        ? `DETERMINISM GATE PASSED — ${runs} runs produced identical hashes (${result.hashes[0]})`
        : `DETERMINISM GATE FAILED — hashes differ across ${runs} runs: ${result.hashes.join(', ')}`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
