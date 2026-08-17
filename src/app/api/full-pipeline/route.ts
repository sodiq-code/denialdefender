/**
 * DenialDefender — Full Pipeline API (Day 6)
 *
 * POST /api/full-pipeline — Run pipeline up to Gate 1
 * GET  /api/full-pipeline — Pipeline info + gate requirements
 *
 * Tries the Gemini-backed agent fleet first; falls back to local mock pipeline.
 * Response includes `dataSource: 'live' | 'mock'` to indicate which was used.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runFullPipeline } from '@/lib/full-pipeline';

const FLEET_URL = process.env.AGENT_FLEET_URL || 'http://localhost:3004';
const FLEET_TIMEOUT_MS = 30_000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { denialText, payer, patientContext } = body;

    if (!denialText || !payer) {
      return NextResponse.json(
        { error: 'denialText and payer are required' },
        { status: 400 }
      );
    }

    let dataSource: 'live' | 'mock' = 'mock';
    let result: Record<string, unknown>;

    // ── Try the agent fleet (Gemini-backed orchestrator) ──
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FLEET_TIMEOUT_MS);

      const fleetRes = await fetch(`${FLEET_URL}/agents/orchestrator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          case_id: `case-${Date.now()}`,
          denial: {
            denial_code: 'UNKNOWN',
            denial_reason: denialText,
            carrier_name: payer,
          },
          patient_context: patientContext || {},
        }),
      });
      clearTimeout(timeout);

      if (fleetRes.ok) {
        const fleetData = await fleetRes.json();
        dataSource = 'live';
        result = {
          success: true,
          pipelineStatus: 'awaiting_gate1',
          caseId: fleetData.case_id || null,
          gate1: {
            status: 'pending',
            gateId: null,
            confirmPrompt: 'Review triage classification and confirm to proceed.',
          },
          advocate: fleetData.advocate || {
            urgencyLevel: 'standard',
            deadline: null,
          },
          triage: fleetData.triage || {},
          policyResearch: fleetData.policy || null,
          evidenceAssembly: fleetData.evidence || null,
          letterDrafting: fleetData.draft || null,
          qualityReview: fleetData.review || null,
          traces: fleetData.traces || [],
          traceChecklist: fleetData.trace_checklist || [],
          latencyMs: fleetData.latency_ms || 0,
        };
      }
    } catch {
      // Fleet unavailable — fall through to mock
    }

    // ── Fallback: local mock pipeline ──
    if (dataSource === 'mock') {
      const mockResult = await runFullPipeline({ denialText, payer, patientContext });
      result = {
        success: true,
        pipelineStatus: mockResult.pipelineStatus,
        caseId: mockResult.caseId,
        gate1: mockResult.gate1,
        advocate: {
          urgencyLevel: mockResult.advocate.caseFraming.urgencyLevel,
          deadline: mockResult.advocate.caseFraming.deadline,
        },
        triage: {
          denialType: mockResult.triage.denialJson.denialType,
          reasonCode: mockResult.triage.denialJson.reasonCode,
          payer: mockResult.triage.denialJson.payer,
          confidence: mockResult.triage.denialJson.confidence,
          isAppealable: mockResult.triage.classification.isAppealable,
          appealStrategy: mockResult.triage.classification.appealStrategy,
          humanConfirmPrompt: mockResult.triage.humanConfirmPrompt,
        },
        traces: mockResult.structuredTraces,
        traceChecklist: mockResult.traceChecklist,
        latencyMs: mockResult.latencyMs,
      };
    }

    return NextResponse.json({ ...result, dataSource });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
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
    pipeline: 'full-pipeline',
    version: 'day-6',
    dataSource,
    description: 'Full 6-agent pipeline with Decision Trace streaming + HITL Gate 1 + Gate 2',
    flow: 'Advocate → Triage → [Gate 1] → Policy Research → Evidence Assembly → Letter Drafting → Quality Review → [Gate 2] → Approved → Submit',
    agents: [
      { name: 'Patient Advocate', role: 'Empathetic intake & case framing' },
      { name: 'Denial Triage', role: 'Denial classification & structured JSON' },
      { name: 'Policy Research', role: 'Corpus retrieval & clause selection' },
      { name: 'Evidence Assembly', role: 'Clinical evidence matching & dedup' },
      { name: 'Letter Drafting', role: 'Evidence-backed appeal composition' },
      { name: 'Quality Review', role: 'Adversarial 7-check battery' },
    ],
    gates: [
      { number: 1, name: 'Confirm Denial', between: 'Triage → Policy Research', status: 'Blocks pipeline until human confirms' },
      { number: 2, name: 'Approve Appeal', between: 'Quality Review → Submission', status: 'Blocks submission until human approves' },
    ],
    traceFeatures: [
      'Structured DecisionTraceEvents persisted to DB',
      'Live trace streaming via WebSocket',
      'Figure 14.1 checklist format',
      'Auditable trace (agent, step, status, references)',
    ],
    versionHistory: 'All letter edits tracked with full version history',
  });
}
