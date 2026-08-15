/**
 * DenialDefender — NPI Lookup API (Day 12)
 * GET: Run NPI demo moment
 * POST: Look up specific NPI or search providers
 */

import { NextRequest, NextResponse } from 'next/server';
import { lookupNPI, searchNPI, runNPIDemo } from '@/lib/npi-registry';

export async function GET() {
  try {
    const demo = await runNPIDemo();
    return NextResponse.json({
      success: true,
      demo,
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
      const result = await lookupNPI(body.npi);
      return NextResponse.json({ success: true, result });
    }

    if (body.search) {
      // Search by name/taxonomy/state
      const result = await searchNPI(body.search);
      return NextResponse.json({ success: true, result });
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
