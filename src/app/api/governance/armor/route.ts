/**
 * API Route — Model Armor Scan
 *
 * POST /api/governance/armor — Scan content for prompt-injection/jailbreak
 * GET  /api/governance/armor — Get Model Armor audit log
 */
import { NextRequest, NextResponse } from 'next/server';
import { scanContent, runModelArmor, getModelArmorAudit, INJECTION_PATTERNS } from '@/lib/model-armor';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, contentSource, caseId, agentName } = body;

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'content (string) is required' },
        { status: 400 },
      );
    }

    const source = contentSource || 'external_content';
    const result = await runModelArmor(
      content,
      source as 'retrieved_policy' | 'retrieved_evidence' | 'external_content',
      caseId,
      agentName,
    );

    return NextResponse.json({
      scan: {
        safe: result.result.safe,
        verdict: result.result.verdict,
        riskScore: result.result.riskScore,
        threatCount: result.result.threats.length,
        threats: result.result.threats.map(t => ({
          type: t.type,
          label: t.label,
          severity: t.severity,
          position: t.position,
        })),
        reason: result.result.reason,
        sanitizedContent: result.result.sanitizedContent,
      },
      auditId: result.auditId,
      traceEventId: result.traceEventId,
    });
  } catch (error) {
    console.error('[ModelArmor API] POST error:', error);
    return NextResponse.json(
      { error: 'Model Armor scan failed' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const caseId = searchParams.get('caseId') || undefined;
    const patterns = searchParams.get('patterns') === 'true';

    // Return pattern library if requested
    if (patterns) {
      return NextResponse.json({
        patterns: INJECTION_PATTERNS.map(p => ({
          type: p.type,
          label: p.label,
          severity: p.severity,
          description: p.description,
        })),
      });
    }

    // Return audit log
    const audit = await getModelArmorAudit(caseId);
    return NextResponse.json({
      component: 'model_armor',
      entries: audit,
      count: audit.length,
    });
  } catch (error) {
    console.error('[ModelArmor API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Model Armor audit' },
      { status: 500 },
    );
  }
}
