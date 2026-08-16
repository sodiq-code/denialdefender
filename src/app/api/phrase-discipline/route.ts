/**
 * DenialDefender — Phrase Discipline API (Day 12)
 * GET: Run phrase discipline demo (Table 17.1)
 * POST: Scan specific text for forbidden phrases
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  runPhraseDisciplineDemo,
  scanTextForViolations,
  applyPhraseCorrections,
  checkPhraseDiscipline,
  PHRASE_CORRECTIONS,
} from '@/lib/phrase-discipline';

export async function GET() {
  try {
    const demo = runPhraseDisciplineDemo();
    return NextResponse.json({
      success: true,
      corrections: PHRASE_CORRECTIONS.map(c => ({
        forbidden: c.forbidden,
        approved: c.approved,
        reason: c.reason,
      })),
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

    if (body.text) {
      // Scan provided text
      const violations = scanTextForViolations(body.text, body.source || 'provided-text');
      const { correctedText, correctionsCount } = applyPhraseCorrections(body.text);

      return NextResponse.json({
        success: true,
        violations,
        correctedText,
        correctionsCount,
        gatePassed: violations.length === 0,
      });
    }

    if (body.checkOnly) {
      // Quick check
      const result = checkPhraseDiscipline(body.checkOnly, body.source || 'text');
      return NextResponse.json({ success: true, ...result });
    }

    return NextResponse.json(
      { success: false, error: 'Provide "text" to scan or "checkOnly" for quick check' },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
