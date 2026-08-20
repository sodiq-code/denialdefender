/**
 * DenialDefender — NPI Lookup API (Day 12)
 * GET: Run NPI demo moment
 * POST: Look up specific NPI or search providers
 *
 * Tries the real NPI Registry API (https://npiregistry.cms.hhs.gov/api/) via the
 * agent fleet or directly; falls back to cached mock data for demo reliability.
 * Response includes `dataSource: 'live' | 'mock'` to indicate which was used.
 */

import { NextRequest, NextResponse } from 'next/server';
import { lookupNPI, searchNPI, runNPIDemo } from '@/lib/npi-registry';

const FLEET_URL = process.env.AGENT_FLEET_URL || 'http://localhost:3004';
const NPI_REGISTRY_BASE = 'https://npiregistry.cms.hhs.gov/api/2.1';
const API_TIMEOUT_MS = 8_000;
const FLEET_TIMEOUT_MS = 30_000;

/**
 * Try the real NPI Registry API directly for a provider lookup.
 * Returns null if API is unreachable.
 */
async function lookupNPIFromRegistry(npi: string): Promise<Record<string, unknown> | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    const url = `${NPI_REGISTRY_BASE}/?number=${npi}&enumeration_type=NPI-1&limit=1&skip=0&pretty=false`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'DenialDefender/1.0',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) return null;
    const data = await response.json();
    if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
      return null;
    }
    return data.results[0] as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    // Run the demo which already tries live API first with fallback
    const demo = await runNPIDemo();

    // Determine data source based on the validation result
    const dataSource: string = demo.validation.source;

    return NextResponse.json({
      success: true,
      demo,
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

    if (body.npi) {
      // Lookup by NPI number
      let dataSource: string = 'mock';
      let result: Record<string, unknown> = {};

      // ── Try the agent fleet's coder agent (may have NPI validation) ──
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FLEET_TIMEOUT_MS);

        const fleetRes = await fetch(`${FLEET_URL}/agents/coder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            denial: { denial_code: 'UNKNOWN', denial_reason: 'NPI lookup' },
            patient_context: { npi: body.npi },
          }),
        });
        clearTimeout(timeout);

        if (fleetRes.ok) {
          const fleetData = await fleetRes.json();
          dataSource = 'live';
          result = fleetData.data || fleetData;
        }
      } catch {
        // Fleet unavailable — fall through
      }

      // ── Try the real NPI Registry API directly ──
      if (dataSource === 'mock') {
        const liveResult = await lookupNPIFromRegistry(body.npi);
        if (liveResult) {
          dataSource = 'live';
          result = liveResult;
        }
      }

      // ── Fallback: local lookup (which itself tries live then cached) ──
      if (dataSource === 'mock') {
        const localResult = await lookupNPI(body.npi);
        dataSource = localResult.source;
        result = localResult as unknown as Record<string, unknown>;
      }

      return NextResponse.json({ success: true, result, dataSource });
    }

    if (body.search) {
      // Search by name/taxonomy/state — use local lib which tries live then fallback
      const searchResult = await searchNPI(body.search);
      const dataSource: string = searchResult.source;

      return NextResponse.json({ success: true, result: searchResult, dataSource });
    }

    return NextResponse.json(
      { success: false, error: 'Provide either "npi" (string) or "search" (object with firstName, lastName, taxonomyDescription, state)' },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
