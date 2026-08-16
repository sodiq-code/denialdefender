/**
 * DenialDefender — Citation Classifier API (Day 12)
 * GET: Run citation classifier demo
 * POST: Classify specific citations
 *
 * Tries the Gemini-backed agent fleet's citation agent first; falls back to local classifier.
 * Response includes `dataSource: 'live' | 'mock'` to indicate which was used.
 */

import { NextRequest, NextResponse } from 'next/server';
import { classifyCitations, runCitationClassifierDemo, type ClassifyCitationInput } from '@/lib/citation-classifier';

const FLEET_URL = 'http://localhost:3004';
const FLEET_TIMEOUT_MS = 10_000;

export async function GET() {
  try {
    let dataSource: 'live' | 'mock' = 'mock';
    let result: Record<string, unknown>;

    // ── Try the agent fleet's citation agent ──
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FLEET_TIMEOUT_MS);

      const fleetRes = await fetch(`${FLEET_URL}/agents/citation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          evidence: {},
          policy: {},
        }),
      });
      clearTimeout(timeout);

      if (fleetRes.ok) {
        const fleetData = await fleetRes.json();
        dataSource = 'live';
        result = fleetData.data || fleetData;
      }
    } catch {
      // Fleet unavailable — fall through to mock
    }

    // ── Fallback: local citation classifier ──
    if (dataSource === 'mock') {
      result = runCitationClassifierDemo();
    }

    return NextResponse.json({
      success: true,
      demo: result,
      dataSource,
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

    let dataSource: 'live' | 'mock' = 'mock';
    let result: Record<string, unknown>;

    // ── Try the agent fleet's citation agent ──
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FLEET_TIMEOUT_MS);

      const fleetRes = await fetch(`${FLEET_URL}/agents/citation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          evidence: { citations: body.citations },
          policy: {},
        }),
      });
      clearTimeout(timeout);

      if (fleetRes.ok) {
        const fleetData = await fleetRes.json();
        dataSource = 'live';
        result = fleetData.data || fleetData;
      }
    } catch {
      // Fleet unavailable — fall through to mock
    }

    // ── Fallback: local citation classifier ──
    if (dataSource === 'mock') {
      const inputs: ClassifyCitationInput[] = body.citations;
      result = classifyCitations(inputs);
    }

    return NextResponse.json({ success: true, result, dataSource });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
