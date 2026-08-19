/**
 * DenialDefender — NPI Validate API (Day 12)
 * POST: Validate a provider NPI against a specific case specialty
 * GET: Get fallback providers list
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateProviderForCase, getFallbackProviders, validateNPIChecksum, validateNPIFormat } from '@/lib/npi-registry';

export async function GET() {
  try {
    const providers = getFallbackProviders();
    return NextResponse.json({
      success: true,
      providers,
      total: providers.length,
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
    const { npi, expectedSpecialty } = body;

    if (!npi) {
      return NextResponse.json(
        { success: false, error: 'NPI number is required' },
        { status: 400 }
      );
    }

    // Quick format/checksum validation
    const formatValid = validateNPIFormat(npi);
    const checksumValid = validateNPIChecksum(npi);

    if (!formatValid || !checksumValid) {
      return NextResponse.json({
        success: true,
        result: {
          npi,
          isValid: false,
          provider: null,
          validationDetails: {
            npiFormatValid: formatValid,
            npiChecksumValid: checksumValid,
            foundInRegistry: false,
            isActive: false,
            taxonomyMatch: false,
          },
          specialtyMatch: false,
          latencyMs: 0,
          source: 'fallback',
        },
      });
    }

    const result = await validateProviderForCase(npi, expectedSpecialty);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
