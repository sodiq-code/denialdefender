import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy route for agent fleet API calls.
 *
 * Forwards requests from /api/agents/* to the agent fleet service at http://localhost:3004/*
 * This provides a cleaner internal API and better error handling than exposing the port pattern.
 *
 * Examples:
 *   GET  /api/agents/health          → http://localhost:3004/health
 *   POST /api/agents/triage          → http://localhost:3004/agents/triage
 *   POST /api/agents/evidence        → http://localhost:3004/agents/evidence
 *   POST /api/agents/workflow/run    → http://localhost:3004/workflow/run
 *   GET  /api/agents/gcp/status      → http://localhost:3004/gcp/status
 */

const AGENT_FLEET_URL = process.env.AGENT_FLEET_URL || 'http://localhost:3004';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params);
}

async function proxyRequest(
  request: NextRequest,
  params: Promise<{ path: string[] }>
) {
  try {
    const { path } = await params;
    const pathStr = path.join('/');

    // Special mapping for health and gcp/status
    let targetPath: string;
    if (pathStr === 'health') {
      targetPath = '/health';
    } else if (pathStr === 'gcp/status') {
      targetPath = '/gcp/status';
    } else if (pathStr === 'workflow/run') {
      targetPath = '/workflow/run';
    } else if (pathStr.startsWith('workflow/status/')) {
      targetPath = `/${pathStr}`;
    } else {
      // Agent endpoints: /api/agents/triage → /agents/triage
      targetPath = `/agents/${pathStr}`;
    }

    const targetUrl = `${AGENT_FLEET_URL}${targetPath}`;

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Build fetch options
    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
      signal: AbortSignal.timeout(120000), // 2-minute timeout for workflow
    };

    // Forward request body for POST requests
    if (request.method === 'POST') {
      fetchOptions.body = await request.text();
    }

    const response = await fetch(targetUrl, fetchOptions);

    // Forward the response
    const responseBody = await response.text();

    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('[/api/agents/*] Proxy error:', error);
    const message = error instanceof Error ? error.message : 'Unknown proxy error';
    return NextResponse.json(
      { error: 'Agent fleet proxy error', details: message },
      { status: 502 }
    );
  }
}
