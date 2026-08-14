import { NextRequest, NextResponse } from 'next/server';
import { runWorkflow } from '@/lib/agent-fleet';
import { db } from '@/lib/db';

/**
 * POST /api/workflow — Run the full appeal workflow for a case
 *
 * Takes: { case_id, denial, patient_context }
 * Calls the agent fleet service at http://localhost:3004/workflow/run
 * Updates the case state in the database
 * Returns the full workflow result
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { case_id, denial, patient_context } = body;

    if (!case_id) {
      return NextResponse.json(
        { error: 'case_id is required' },
        { status: 400 }
      );
    }

    // Verify case exists in our database
    const existingCase = await db.case.findUnique({
      where: { id: case_id },
      include: { denial: true },
    });

    if (!existingCase) {
      return NextResponse.json(
        { error: 'Case not found' },
        { status: 404 }
      );
    }

    // Build the denial input from request body or existing case denial
    const denialInput = denial ?? (existingCase.denial ? {
      denial_code: existingCase.denial.reason_code,
      denial_reason: existingCase.denial.category,
      carrier_name: existingCase.denial.payer,
      cpt_code: undefined,
      icd10_code: undefined,
      amount_denied: undefined,
    } : {});

    // Update case state to triage_active before calling agent fleet
    await db.case.update({
      where: { id: case_id },
      data: { state: 'triage_active' },
    });

    // Call the agent fleet workflow
    const workflowResult = await runWorkflow({
      case_id,
      denial: denialInput,
      patient_context: patient_context ?? {},
    });

    // Map workflow status to case state
    let newCaseState: string;
    if (workflowResult.status === 'needs_review' && workflowResult.workflow_stopped_at === 'triage') {
      newCaseState = 'hitl_gate_1';
    } else if (workflowResult.status === 'completed') {
      newCaseState = 'hitl_gate_2';
    } else if (workflowResult.status === 'needs_review') {
      newCaseState = 'quality_review';
    } else {
      newCaseState = 'hitl_gate_2';
    }

    // Update case state
    await db.case.update({
      where: { id: case_id },
      data: { state: newCaseState },
    });

    // Record decision trace events from the workflow
    if (workflowResult.decision_traces && Array.isArray(workflowResult.decision_traces)) {
      for (const trace of workflowResult.decision_traces) {
        await db.decisionTraceEvent.create({
          data: {
            case_id,
            agent_name: String(trace.agent),
            step: String(trace.step),
            status: 'completed',
            details: JSON.stringify(trace.result_summary ?? {}),
            timestamp: new Date(trace.timestamp),
          },
        });
      }
    }

    // Create HITL gates if needed
    if (workflowResult.hitl_gate) {
      const gateType = workflowResult.hitl_gate.gate_type;
      const gateNumber = gateType === 'gate_1' ? 1 : 2;

      // Check if gate already exists
      const existingGate = await db.hitlGate.findFirst({
        where: { case_id, gate_number: gateNumber },
      });

      if (!existingGate) {
        await db.hitlGate.create({
          data: {
            case_id,
            gate_number: gateNumber,
            status: 'pending',
            reviewer_note: workflowResult.hitl_gate.content,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      workflow: workflowResult,
      new_state: newCaseState,
    });
  } catch (error) {
    console.error('[POST /api/workflow] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: 'Workflow execution failed', details: message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/workflow — Get agent fleet health status
 */
export async function GET() {
  try {
    const { getAgentFleetHealth } = await import('@/lib/agent-fleet');
    const health = await getAgentFleetHealth();
    return NextResponse.json({ health });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { health: { status: 'error', message } },
      { status: 503 }
    );
  }
}
