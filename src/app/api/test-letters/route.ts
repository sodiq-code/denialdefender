/**
 * GET /api/test-letters — Load test letters and payer policy corpus
 * POST /api/test-letters — Run retrieval accuracy validation suite
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  loadTestLetters,
  loadPayerPolicyCorpus,
  policyResearchAgent,
  runValidationSuite,
  formatReport,
} from '@/lib/test-letters';

// GET /api/test-letters — Load corpus and test letters
export async function GET() {
  try {
    const corpus = loadPayerPolicyCorpus();
    const testLetters = loadTestLetters();

    return NextResponse.json({
      status: 'ok',
      corpus: {
        description: corpus.description,
        version: corpus.version,
        totalEntries: corpus.entries.length,
        payers: [...new Set(corpus.entries.map(e => e.payer_name))],
        denialTypes: [...new Set(corpus.entries.map(e => e.denial_type))],
        entries: corpus.entries.map(e => ({
          clause_id: e.clause_id,
          payer_name: e.payer_name,
          denial_type: e.denial_type,
          retrieval_weight: e.retrieval_weight,
          effective_date: e.effective_date,
          version: e.version,
          clause_text_preview: e.clause_text.slice(0, 150) + '...',
        })),
      },
      testLetters: {
        total: testLetters.letters.length,
        letters: testLetters.letters.map(l => ({
          id: l.id,
          payer: l.payer,
          denial_reason_code: l.denial_reason_code,
          denial_type: l.denial_type,
          cpt_codes: l.cpt_codes,
          icd_codes: l.icd_codes,
          expected_clause_ids: l.expected_clause_ids,
          letter_preview: l.denial_letter_text.slice(0, 150) + '...',
        })),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}

// POST /api/test-letters — Run retrieval accuracy validation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const topK = body.topK ?? 3;

    // Run the full validation suite
    const report = runValidationSuite(topK);
    const formattedReport = formatReport(report);

    return NextResponse.json({
      status: 'ok',
      report,
      formattedReport,
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}
