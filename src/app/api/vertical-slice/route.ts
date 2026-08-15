/**
 * DenialDefender — Vertical Slice API
 * Day 3: POST runs the vertical slice, GET returns status info.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runVerticalSlice, SAMPLE_DENIAL_LETTERS } from '@/lib/vertical-slice-agent';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { denialText, payer } = body as { denialText?: string; payer?: string };

    if (!denialText || typeof denialText !== 'string' || denialText.trim().length === 0) {
      return NextResponse.json(
        { error: 'denialText is required and must be a non-empty string' },
        { status: 400 },
      );
    }

    const result = await runVerticalSlice(denialText, payer);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Vertical slice failed', detail: message },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'DenialDefender Vertical Slice',
    day: 3,
    description: 'Single monolithic agent: upload denial → parse → retrieve 3 citations → draft appeal → render with provenance cards',
    agent: 'vertical-slice',
    steps: [
      { step: 1, name: 'Parse Denial', description: 'Rule-based extraction of denial_code, type, payer, CPT/ICD codes, amount' },
      { step: 2, name: 'Retrieve Citations', description: 'Policy research with retrievePolicyClauses (topK: 3) from evidence corpus' },
      { step: 3, name: 'Draft Appeal', description: 'Template-based one-paragraph appeal with inline citation references' },
    ],
    gate: {
      requirement: '3+ citations per run, 5 consecutive runs',
      endpoint: '/api/vertical-slice/gate',
    },
    sampleLetters: SAMPLE_DENIAL_LETTERS.map(s => ({
      id: s.id,
      label: s.label,
      payer: s.payer,
    })),
  });
}
