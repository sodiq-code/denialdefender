/**
 * DenialDefender — Vertical Slice API
 * Day 3: POST runs the vertical slice, GET returns status info.
 *
 * Tries the Gemini-backed agent fleet first; falls back to local mock pipeline.
 * Response includes `dataSource: 'live' | 'mock'` to indicate which was used.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runVerticalSlice, SAMPLE_DENIAL_LETTERS } from '@/lib/vertical-slice-agent';

const FLEET_URL = process.env.AGENT_FLEET_URL || 'http://localhost:3004';
const FLEET_TIMEOUT_MS = 30_000;

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

    let dataSource: 'live' | 'mock' = 'mock';
    let result: Record<string, unknown> = {};

    // ── Try the agent fleet (Gemini-backed triage + drafter) ──
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FLEET_TIMEOUT_MS);

      const triageRes = await fetch(`${FLEET_URL}/agents/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          denial: {
            denial_code: 'UNKNOWN',
            denial_reason: denialText,
            carrier_name: payer || 'Unknown',
          },
          patient_context: {},
        }),
      });
      clearTimeout(timeout);

      if (triageRes.ok) {
        const triageData = await triageRes.json();

        // Run drafter for appeal preview
        const draftController = new AbortController();
        const draftTimeout = setTimeout(() => draftController.abort(), FLEET_TIMEOUT_MS);
        const draftRes = await fetch(`${FLEET_URL}/agents/drafter`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: draftController.signal,
          body: JSON.stringify({
            denial: {
              denial_code: 'UNKNOWN',
              denial_reason: denialText,
              carrier_name: payer || 'Unknown',
            },
            patient_context: {},
            triage: triageData.data || {},
          }),
        });
        clearTimeout(draftTimeout);
        const draftData = draftRes.ok ? await draftRes.json() : { data: null };

        dataSource = 'live';
        result = {
          parsedDenial: triageData.data || {},
          appealDraft: draftData.data || null,
          triage: triageData.data || {},
          success: true,
          gatePassed: !!(triageData.data?.appealability),
          latencyMs: 0,
          trace: [
            { step: 'triage', agent: 'fleet-triage', timestamp: new Date().toISOString(), detail: 'Fleet-powered triage analysis' },
            { step: 'draft', agent: 'fleet-drafter', timestamp: new Date().toISOString(), detail: 'Fleet-powered appeal draft' },
          ],
        };
      }
    } catch {
      // Fleet unavailable — fall through to mock
    }

    // ── Fallback: local mock vertical slice ──
    if (dataSource === 'mock') {
      const mockResult = await runVerticalSlice(denialText, payer);
      result = { ...mockResult };
    }

    return NextResponse.json({ ...result, dataSource });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Vertical slice failed', detail: message },
      { status: 500 },
    );
  }
}

export async function GET() {
  let dataSource: 'live' | 'mock' = 'mock';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    const healthRes = await fetch(`${FLEET_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (healthRes.ok) dataSource = 'live';
  } catch {
    // Fleet unavailable
  }

  return NextResponse.json({
    name: 'DenialDefender Vertical Slice',
    day: 3,
    dataSource,
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
