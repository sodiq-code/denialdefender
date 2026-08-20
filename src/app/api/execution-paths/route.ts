/**
 * POST /api/execution-paths — Execute a specific path (live/fallback/demo_safe/auto)
 * GET /api/execution-paths — Get path info
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  executeLivePath,
  executeFallbackPath,
  executeDemoSafePath,
  executeAutoSelect,
} from '@/lib/execution-paths';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const path = (body.path as string) || 'auto';
    const denialText = body.denialText || '';
    const payer = body.payer || 'UnitedHealthcare';
    const denialCategory = body.denialCategory || 'medical_necessity';
    const cptCode = body.cptCode || '';
    const denialReasonCode = body.denialReasonCode || '';

    if (path === 'auto') {
      const result = await executeAutoSelect(
        { denialText, payer },
        denialCategory,
        cptCode,
        denialReasonCode,
      );
      return NextResponse.json({
        success: true,
        result: {
          path: result.result.path,
          success: result.result.success,
          appealLetterLength: result.result.appealLetterLength,
          citationCount: result.result.citationCount,
          qualityScore: result.result.qualityScore,
          latencyMs: result.result.latencyMs,
          strategy: result.result.strategy,
          error: result.result.error,
        },
        pathsAttempted: result.pathsAttempted,
        fellBack: result.fellBack,
        appealLetter: result.result.appealLetter,
        trace: result.result.trace,
      });
    }

    if (path === 'live') {
      const result = await executeLivePath({ denialText, payer }, denialCategory);
      return NextResponse.json({
        success: result.success,
        result: {
          path: result.path,
          appealLetterLength: result.appealLetterLength,
          citationCount: result.citationCount,
          qualityScore: result.qualityScore,
          latencyMs: result.latencyMs,
          strategy: result.strategy,
          error: result.error,
        },
        appealLetter: result.appealLetter,
        trace: result.trace,
      });
    }

    if (path === 'fallback') {
      const result = await executeFallbackPath(payer, denialCategory, cptCode, denialReasonCode);
      return NextResponse.json({
        success: result.success,
        result: {
          path: result.path,
          appealLetterLength: result.appealLetterLength,
          citationCount: result.citationCount,
          qualityScore: result.qualityScore,
          latencyMs: result.latencyMs,
          strategy: result.strategy,
          error: result.error,
        },
        appealLetter: result.appealLetter,
        trace: result.trace,
      });
    }

    if (path === 'demo_safe') {
      const result = await executeDemoSafePath(denialCategory, payer);
      return NextResponse.json({
        success: result.success,
        result: {
          path: result.path,
          appealLetterLength: result.appealLetterLength,
          citationCount: result.citationCount,
          qualityScore: result.qualityScore,
          latencyMs: result.latencyMs,
          strategy: result.strategy,
          error: result.error,
        },
        appealLetter: result.appealLetter,
        trace: result.trace,
      });
    }

    return NextResponse.json(
      { success: false, error: `Unknown path: ${path}. Use: live, fallback, demo_safe, auto` },
      { status: 400 },
    );
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    paths: [
      {
        name: 'live',
        description: 'Full Gemini API call → real agent pipeline → real appeal letter',
        maxLatency: '90s',
        useWhen: 'API available and responsive',
      },
      {
        name: 'fallback',
        description: 'Deterministic template-based appeal (pre-built for payer × denial-type)',
        maxLatency: '5s',
        useWhen: 'Live API fails or times out',
      },
      {
        name: 'demo_safe',
        description: 'Canned data + pre-written appeal letter (instant, offline-safe)',
        maxLatency: '10s',
        useWhen: 'Both live and fallback fail — guaranteed to work',
      },
      {
        name: 'auto',
        description: 'Automatically selects best available: Live → Fallback → Demo-safe',
        maxLatency: '90s (live) / 5s (fallback) / 10s (demo-safe)',
        useWhen: 'Default — let the system decide',
      },
    ],
    gateCriteria: {
      livePath: '<90s',
      fallbackEngages: 'within 5s of API failure',
      demoSafePath: '<10s',
      allPathsProduceUsableAppeal: true,
    },
  });
}
