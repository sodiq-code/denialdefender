import { NextRequest, NextResponse } from 'next/server';
import { runSixAgentPipeline } from '@/lib/six-agent-pipeline';

// Fleet URL: use environment variable on Cloud Run, localhost in dev
const FLEET_URL = process.env.AGENT_FLEET_URL || 'http://localhost:3004';
const FLEET_TIMEOUT_MS = 30_000; // Increased for Gemini API calls

/**
 * POST /api/six-agent-pipeline — Run the six-agent pipeline
 * (Advocate → Triage → Gate 1 → Policy → Evidence → Draft → Quality Review)
 *
 * Tries the Gemini-backed agent fleet first; falls back to local mock pipeline.
 * Response includes `dataSource: 'live' | 'mock'` to indicate which was used.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.denialText || typeof body.denialText !== 'string') {
      return NextResponse.json(
        { error: 'denialText is required and must be a string' },
        { status: 400 },
      );
    }

    if (!body.payer || typeof body.payer !== 'string') {
      return NextResponse.json(
        { error: 'payer is required and must be a string' },
        { status: 400 },
      );
    }

    let dataSource: 'live' | 'mock' = 'mock';
    let result: Record<string, unknown>;

    // ── Try the agent fleet (Gemini-backed) ──
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
            denial_reason: body.denialText,
            carrier_name: body.payer,
          },
          patient_context: body.patientContext || {},
        }),
      });
      clearTimeout(timeout);

      if (triageRes.ok) {
        const triageData = await triageRes.json();

        // Run policy agent
        const policyController = new AbortController();
        const policyTimeout = setTimeout(() => policyController.abort(), FLEET_TIMEOUT_MS);
        const policyRes = await fetch(`${FLEET_URL}/agents/policy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: policyController.signal,
          body: JSON.stringify({
            denial: {
              denial_code: 'UNKNOWN',
              denial_reason: body.denialText,
              carrier_name: body.payer,
            },
            patient_context: body.patientContext || {},
            triage: triageData.data || {},
          }),
        });
        clearTimeout(policyTimeout);
        const policyData = policyRes.ok ? await policyRes.json() : { data: null };

        // Run evidence agent
        const evidenceController = new AbortController();
        const evidenceTimeout = setTimeout(() => evidenceController.abort(), FLEET_TIMEOUT_MS);
        const evidenceRes = await fetch(`${FLEET_URL}/agents/evidence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: evidenceController.signal,
          body: JSON.stringify({
            denial: {
              denial_code: 'UNKNOWN',
              denial_reason: body.denialText,
              carrier_name: body.payer,
            },
            patient_context: body.patientContext || {},
            triage: triageData.data || {},
          }),
        });
        clearTimeout(evidenceTimeout);
        const evidenceData = evidenceRes.ok ? await evidenceRes.json() : { data: null };

        // Run citation agent
        const citationController = new AbortController();
        const citationTimeout = setTimeout(() => citationController.abort(), FLEET_TIMEOUT_MS);
        const citationRes = await fetch(`${FLEET_URL}/agents/citation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: citationController.signal,
          body: JSON.stringify({
            evidence: evidenceData.data || {},
            policy: policyData.data || {},
          }),
        });
        clearTimeout(citationTimeout);
        const citationData = citationRes.ok ? await citationRes.json() : { data: null };

        // Run drafter agent
        const draftController = new AbortController();
        const draftTimeout = setTimeout(() => draftController.abort(), FLEET_TIMEOUT_MS);
        const draftRes = await fetch(`${FLEET_URL}/agents/drafter`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: draftController.signal,
          body: JSON.stringify({
            denial: {
              denial_code: 'UNKNOWN',
              denial_reason: body.denialText,
              carrier_name: body.payer,
            },
            patient_context: body.patientContext || {},
            triage: triageData.data || {},
            evidence: evidenceData.data || {},
            policy: policyData.data || {},
            citations: citationData.data || {},
          }),
        });
        clearTimeout(draftTimeout);
        const draftData = draftRes.ok ? await draftRes.json() : { data: null };

        // Run reviewer agent
        const reviewController = new AbortController();
        const reviewTimeout = setTimeout(() => reviewController.abort(), FLEET_TIMEOUT_MS);
        const reviewRes = await fetch(`${FLEET_URL}/agents/reviewer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: reviewController.signal,
          body: JSON.stringify({
            denial: {
              denial_code: 'UNKNOWN',
              denial_reason: body.denialText,
              carrier_name: body.payer,
            },
            triage: triageData.data || {},
            evidence: evidenceData.data || {},
            draft: draftData.data || {},
          }),
        });
        clearTimeout(reviewTimeout);
        const reviewData = reviewRes.ok ? await reviewRes.json() : { data: null };

        // Determine dataSource from fleet traces — 'live' only if any agent used Gemini
        const triageMode = triageData.trace?.mode || 'mock';
        const anyLive = triageMode === 'live' ||
          (policyData.trace?.mode === 'live') ||
          (evidenceData.trace?.mode === 'live') ||
          (draftData.trace?.mode === 'live') ||
          (reviewData.trace?.mode === 'live');
        dataSource = anyLive ? 'live' : 'mock';
        result = {
          advocate: {
            caseFraming: {
              patientSummary: `Denial from ${body.payer}`,
              denialImpact: triageData.data?.appealability || 'Unknown',
              urgencyLevel: triageData.data?.urgency || 'standard',
              recommendedActions: [],
              deadline: null,
              deadlineDaysRemaining: null,
            },
            empatheticNote: 'Fleet-powered triage analysis completed.',
          },
          triage: triageData.data || {},
          gate1: {
            status: 'pending',
            gateId: null,
            confirmPrompt: 'Review triage classification and confirm to proceed.',
          },
          policyResearch: policyData.data || null,
          evidenceAssembly: evidenceData.data || null,
          letterDrafting: draftData.data || null,
          qualityReview: reviewData.data || null,
          citations: citationData.data || null,
          pipelineStatus: 'awaiting_gate1',
          caseId: null,
          latencyMs: 0,
        };
      }
    } catch {
      // Fleet unavailable — fall through to mock
    }

    // ── Fallback: local mock pipeline ──
    if (dataSource === 'mock') {
      const mockResult = await runSixAgentPipeline({
        denialText: body.denialText,
        payer: body.payer,
        patientContext: body.patientContext || undefined,
      });
      result = { ...mockResult };
    }

    return NextResponse.json({ ...result, dataSource });
  } catch (error: unknown) {
    console.error('[POST /api/six-agent-pipeline] Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Pipeline execution failed: ${msg}` },
      { status: 500 },
    );
  }
}

/**
 * GET /api/six-agent-pipeline — Returns pipeline info
 */
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
    pipeline: 'six-agent',
    version: 'day-5',
    dataSource,
    agents: [
      { name: 'patient-advocate', description: 'Empathetic intake and case framing', order: 1 },
      { name: 'denial-triage', description: 'Denial classification and structured JSON', order: 2 },
      { name: 'policy-research', description: 'Policy clause retrieval with provenance', order: 3 },
      { name: 'evidence-assembly', description: 'Clinical evidence matching and deduplication', order: 4 },
      { name: 'letter-drafting', description: 'Evidence-backed appeal draft with inline citations', order: 5 },
      { name: 'quality-review', description: 'Adversarial 7-check battery from Table 15.1', order: 6 },
    ],
    flow: 'Advocate → Triage → [HITL Gate 1] → Policy Research → Evidence Assembly → Letter Drafting → Quality Review',
    gates: {
      gate1: { name: 'Confirm Denial', blocksUntil: 'Policy Research Agent' },
      gate2: { name: 'Approve Final Appeal', blocksUntil: 'Submission' },
    },
    adversarialBattery: [
      { question: 'Citation Resolution', passCondition: 'All citations resolve + hash matches' },
      { question: 'Claim Tracing', passCondition: 'Every claim traced to a span' },
      { question: 'Policy Support', passCondition: 'Clause semantics checked' },
      { question: 'Deadline Verification', passCondition: 'Deadline recomputed independently' },
      { question: 'No Medical Advice', passCondition: 'No diagnostic / prescriptive language' },
      { question: 'No Overclaims', passCondition: 'Zero overclaims' },
      { question: 'Format Compliance', passCondition: 'Format verified' },
    ],
    caseStates: [
      'created → triage_active → hitl_gate_1 → [human confirms] → evidence_active → drafting_active → quality_review → hitl_gate_2',
    ],
  });
}
