import { NextRequest, NextResponse } from 'next/server';
import { runThreeAgentPipeline } from '@/lib/three-agent-pipeline';
import { SAMPLE_DENIAL_LETTERS } from '@/lib/vertical-slice-agent';
import { db } from '@/lib/db';

const FLEET_URL = process.env.AGENT_FLEET_URL || 'http://localhost:3004';
const FLEET_TIMEOUT_MS = 30_000;

/**
 * POST /api/three-agent-pipeline — Run the three-agent pipeline
 * (Advocate → Triage → Gate 1 → STOPS)
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
    let result: Record<string, unknown> = {};

    // ── Try the agent fleet (Gemini-backed) ──
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FLEET_TIMEOUT_MS);

      // Step 1: Run triage via fleet
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

        // Step 2: Run policy via fleet
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

        // Step 3: Run drafter via fleet (optional, for preview)
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
            policy: policyData.data || {},
          }),
        });
        clearTimeout(draftTimeout);

        const draftData = draftRes.ok ? await draftRes.json() : { data: null };

        dataSource = 'live';

        // Create a case in the DB so Gate 1 approval/rejection works
        let fleetCaseId: string | null = null;
        try {
          const caseRecord = await db.case.create({
            data: {
              patient_id: `patient-${Date.now()}`,
              state: 'hitl_gate_1',
            },
          });
          fleetCaseId = caseRecord.id;
          await db.hitlGate.create({
            data: {
              case_id: fleetCaseId,
              gate_number: 1,
              status: 'pending',
              reviewer_note: 'Review triage classification and confirm to proceed.',
            },
          });
        } catch (dbErr) {
          console.error('[POST /api/three-agent-pipeline] Fleet DB case creation failed:', dbErr);
        }

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
          policyResearch: policyData.data || null,
          draftPreview: draftData.data || null,
          gate1: {
            status: 'pending',
            gateId: null,
            confirmPrompt: 'Review triage classification and confirm to proceed.',
          },
          pipelineStatus: 'awaiting_gate1',
          caseId: fleetCaseId,
          latencyMs: 0,
        };
      }
    } catch {
      // Fleet unavailable — fall through to mock
    }

    // ── Fallback: local mock pipeline ──
    if (dataSource === 'mock') {
      const mockResult = await runThreeAgentPipeline({
        denialText: body.denialText,
        payer: body.payer,
        patientContext: body.patientContext || undefined,
      });
      result = { ...mockResult };
    }

    return NextResponse.json({ ...result, dataSource });
  } catch (error: unknown) {
    console.error('[POST /api/three-agent-pipeline] Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Pipeline execution failed: ${msg}` },
      { status: 500 },
    );
  }
}

/**
 * GET /api/three-agent-pipeline — Returns pipeline info and sample data
 */
export async function GET() {
  let dataSource: 'live' | 'mock' = 'mock';

  // Try fleet health check to determine data source
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
    pipeline: 'three-agent',
    version: 'day-4',
    dataSource,
    agents: [
      { name: 'patient-advocate', description: 'Empathetic intake and case framing' },
      { name: 'denial-triage', description: 'Denial classification and structured JSON' },
      { name: 'policy-research', description: 'Policy clause retrieval with provenance' },
    ],
    flow: 'Advocate → Triage → [HITL Gate 1] → Policy Research',
    gateStructure: {
      gate1: {
        name: 'Confirm Denial',
        description: 'Human reviews triage result and confirms/rejects the denial classification',
        blocksUntil: 'Policy Research Agent',
      },
    },
    caseStates: [
      'created → advocate_active → triage_active → hitl_gate_1 → [human confirms] → evidence_active → triage_complete',
    ],
    samples: SAMPLE_DENIAL_LETTERS.map(s => ({
      id: s.id,
      label: s.label,
      payer: s.payer,
    })),
  });
}
