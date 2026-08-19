/**
 * DenialDefender — Vertical Slice Gate Test API
 * Day 3: POST runs the gate test (5 consecutive runs with different sample denials).
 *
 * Gate: A synthetic denial produces a draft with 3 real citations, 5× in a row.
 */

import { NextResponse } from 'next/server';
import { runVerticalSlice, SAMPLE_DENIAL_LETTERS } from '@/lib/vertical-slice-agent';

export async function POST() {
  const gateRuns = 5;
  const results: {
    run: number;
    sampleId: string;
    sampleLabel: string;
    citationsCount: number;
    gatePassed: boolean;
    latencyMs: number;
  }[] = [];

  const totalStart = Date.now();

  // Run the slice 5 times with different sample denials (cycle through the 3 samples)
  for (let i = 0; i < gateRuns; i++) {
    const sample = SAMPLE_DENIAL_LETTERS[i % SAMPLE_DENIAL_LETTERS.length];
    try {
      const result = await runVerticalSlice(sample.text, sample.payer);
      results.push({
        run: i + 1,
        sampleId: sample.id,
        sampleLabel: sample.label,
        citationsCount: result.citations.length,
        gatePassed: result.gatePassed,
        latencyMs: result.latencyMs,
      });
    } catch {
      results.push({
        run: i + 1,
        sampleId: sample.id,
        sampleLabel: sample.label,
        citationsCount: 0,
        gatePassed: false,
        latencyMs: 0,
      });
    }
  }

  const totalLatencyMs = Date.now() - totalStart;
  const allPassed = results.every(r => r.gatePassed);
  const passedCount = results.filter(r => r.gatePassed).length;

  return NextResponse.json({
    gate: '3-citations-5x',
    allPassed,
    passedCount,
    totalRuns: gateRuns,
    totalLatencyMs,
    results,
    timestamp: new Date().toISOString(),
  });
}
