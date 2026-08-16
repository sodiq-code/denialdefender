/**
 * API Route — GEAP Agent Registry
 *
 * GET /api/governance/registry — Query the agent registry
 *   Query params:
 *     ?agent=<name>            — Get a specific agent by name
 *     ?category=core           — Filter agents by category (core|governance|learning)
 *     ?capability=denial_classification — Filter agents by capability
 *     ?format=summary          — Return registry summary instead of full list
 *     ?format=capabilities     — Return all unique capabilities
 *     ?format=tools            — Return all unique tools
 *     ?format=events           — Return registry event log
 *     ?version_compat=<agent>  — Return version compatibility for an agent
 *
 * POST /api/governance/registry — Update agent health status
 *   Body: { agent: string, status: 'healthy'|'degraded'|'offline', execution: { timestamp, success, latencyMs } }
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  getAgent,
  listAgents,
  searchByCapability,
  getRegistrySummary,
  updateHealthStatus,
  getAllCapabilities,
  getAllTools,
  getRegistryEvents,
  getVersionCompatibility,
  areVersionCompatible,
  runRegistryDemo,
} from '@/lib/agent-registry';
import type { HealthStatus } from '@/lib/agent-registry';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentName = searchParams.get('agent');
    const category = searchParams.get('category') || undefined;
    const capability = searchParams.get('capability') || undefined;
    const format = searchParams.get('format');
    const versionCompat = searchParams.get('version_compat');

    // ── Return a specific agent by name ──
    if (agentName) {
      const agent = getAgent(agentName);
      if (!agent) {
        return NextResponse.json(
          { error: `Agent not found: ${agentName}` },
          { status: 404 },
        );
      }
      return NextResponse.json({
        component: 'agent_registry',
        agent,
      });
    }

    // ── Return version compatibility for an agent ──
    if (versionCompat) {
      const compatMap = getVersionCompatibility(versionCompat);
      const agent = getAgent(versionCompat);

      if (!agent) {
        return NextResponse.json(
          { error: `Agent not found: ${versionCompat}` },
          { status: 404 },
        );
      }

      // Evaluate all compatibility relationships
      const relationships = Object.entries(compatMap).map(([targetAgent, requiredRange]) => {
        const check = areVersionCompatible(versionCompat, targetAgent);
        return {
          targetAgent,
          targetVersion: getAgent(targetAgent)?.version || 'unknown',
          requiredRange,
          compatible: check.compatible,
        };
      });

      return NextResponse.json({
        component: 'agent_registry',
        agent: versionCompat,
        version: agent.version,
        compatibility: relationships,
      });
    }

    // ── Format: summary ──
    if (format === 'summary') {
      const summary = getRegistrySummary();
      return NextResponse.json({
        component: 'agent_registry',
        summary,
      });
    }

    // ── Format: capabilities ──
    if (format === 'capabilities') {
      const capabilities = getAllCapabilities();
      return NextResponse.json({
        component: 'agent_registry',
        capabilities,
        count: capabilities.length,
      });
    }

    // ── Format: tools ──
    if (format === 'tools') {
      const tools = getAllTools();
      return NextResponse.json({
        component: 'agent_registry',
        tools,
        count: tools.length,
      });
    }

    // ── Format: events ──
    if (format === 'events') {
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const events = getRegistryEvents(limit);
      return NextResponse.json({
        component: 'agent_registry',
        events,
        count: events.length,
      });
    }

    // ── Format: demo ──
    if (format === 'demo') {
      const demo = await runRegistryDemo();
      return NextResponse.json({
        component: 'agent_registry',
        demo,
      });
    }

    // ── Default: list agents with optional filtering ──
    const agents = listAgents({ category, capability });
    const summary = getRegistrySummary();

    return NextResponse.json({
      component: 'agent_registry',
      agents,
      count: agents.length,
      summary,
    });
  } catch (error) {
    console.error('[AgentRegistry API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to query agent registry' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agent, status, execution } = body;

    if (!agent || !status || !execution) {
      return NextResponse.json(
        { error: 'agent, status, and execution are required' },
        { status: 400 },
      );
    }

    if (!['healthy', 'degraded', 'offline'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be healthy, degraded, or offline' },
        { status: 400 },
      );
    }

    updateHealthStatus(agent, status as HealthStatus, {
      timestamp: execution.timestamp || new Date().toISOString(),
      success: execution.success,
      latencyMs: execution.latencyMs,
    });

    const updatedAgent = getAgent(agent);

    return NextResponse.json({
      component: 'agent_registry',
      updated: true,
      agent: updatedAgent,
    });
  } catch (error) {
    console.error('[AgentRegistry API] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to update agent health status' },
      { status: 500 },
    );
  }
}
