/**
 * DenialDefender — Citation Classifier API (Day 12)
 * GET: Run citation classifier demo
 * POST: Classify specific citations
 */

import { NextRequest, NextResponse } from 'next/server';
import { classifyCitations, runCitationClassifierDemo, type ClassifyCitationInput } from '@/lib/citation-classifier';

export async function GET() {
  try {
    const demo = runCitationClassifierDemo();
    return NextResponse.json({
      success: true,
      demo,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.citations || !Array.isArray(body.citations)) {
      return NextResponse.json(
        { success: false, error: 'Provide "citations" array with evidenceId, source, documentName, provenanceTier' },
        { status: 400 }
      );
    }

    const inputs: ClassifyCitationInput[] = body.citations;
    const result = classifyCitations(inputs);

    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
