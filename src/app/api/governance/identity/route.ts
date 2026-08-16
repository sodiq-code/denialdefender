/**
 * API Route — Agent Identity Permission Check
 *
 * POST /api/governance/identity — Check agent permission
 * GET  /api/governance/identity — Get all agent permissions or audit log
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  checkPermission,
  getAllAgentPermissions,
  getAgentPermission,
  getAgentIdentityAudit,
  AGENT_PERMISSIONS,
  DEMONSTRATION_VIOLATIONS,
  DEMONSTRATION_ALLOWANCES,
} from '@/lib/agent-identity';
import type { AgentRole, Resource, Capability } from '@/lib/agent-identity';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agent, resource, capability, caseId, detail } = body;

    if (!agent || !resource || !capability) {
      return NextResponse.json(
        { error: 'agent, resource, and capability are required' },
        { status: 400 },
      );
    }

    const result = await checkPermission(
      agent as AgentRole,
      resource as Resource,
      capability as Capability,
      caseId,
      detail,
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('[AgentIdentity API] POST error:', error);
    return NextResponse.json(
      { error: 'Permission check failed' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agent = searchParams.get('agent');
    const audit = searchParams.get('audit') === 'true';
    const caseId = searchParams.get('caseId') || undefined;
    const demo = searchParams.get('demo') === 'true';

    // Return demo examples
    if (demo) {
      return NextResponse.json({
        violations: DEMONSTRATION_VIOLATIONS,
        allowances: DEMONSTRATION_ALLOWANCES,
      });
    }

    // Return audit log
    if (audit) {
      const auditEntries = await getAgentIdentityAudit(caseId);
      return NextResponse.json({
        component: 'agent_identity',
        entries: auditEntries,
        count: auditEntries.length,
      });
    }

    // Return specific agent permissions
    if (agent) {
      const perm = getAgentPermission(agent as AgentRole);
      if (!perm) {
        return NextResponse.json(
          { error: `Unknown agent: ${agent}` },
          { status: 404 },
        );
      }
      return NextResponse.json(perm);
    }

    // Return all agent permissions
    return NextResponse.json({
      agents: getAllAgentPermissions(),
      count: AGENT_PERMISSIONS.length,
    });
  } catch (error) {
    console.error('[AgentIdentity API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agent identity' },
      { status: 500 },
    );
  }
}
