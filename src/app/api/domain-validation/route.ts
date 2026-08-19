/**
 * DenialDefender — Automated Domain Validation API
 *
 * GET  /api/domain-validation         — Get domain rules, last validation, and payer deadlines
 * POST /api/domain-validation         — Run full automated domain validation
 *
 * This endpoint powers the Domain Validation tab in the governance panel.
 * It validates the system against 20 authoritative domain rules from
 * CMS, AMA, and payer databases — replacing one-time human expert review
 * with continuous, automated correctness checks.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  runFullDomainValidation,
  getDomainRules,
  getConcreteChanges,
  getPayerDeadlines,
  validateTriageOutput,
  validateAppealOutput,
} from '@/lib/domain-validator';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'rules') {
      return NextResponse.json({
        rules: getDomainRules(),
        total: getDomainRules().length,
      });
    }

    if (action === 'changes') {
      return NextResponse.json({
        changes: getConcreteChanges(),
        total: getConcreteChanges().length,
        allImplemented: getConcreteChanges().every(c => c.implemented),
      });
    }

    if (action === 'deadlines') {
      return NextResponse.json({
        deadlines: getPayerDeadlines(),
      });
    }

    // Default: return rules + changes + deadlines
    const rules = getDomainRules();
    const changes = getConcreteChanges();
    const deadlines = getPayerDeadlines();

    return NextResponse.json({
      validatorType: 'automated_domain_rule_engine',
      rules: { total: rules.length, categories: [...new Set(rules.map(r => r.category))] },
      changes: { total: changes.length, allImplemented: changes.every(c => c.implemented) },
      deadlines: { totalPayers: Object.keys(deadlines).length },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Domain validation fetch failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action } = body;

    if (action === 'full_validation') {
      const report = await runFullDomainValidation();
      return NextResponse.json({ report, persisted: true });
    }

    if (action === 'validate_triage') {
      const { output } = body;
      if (!output) {
        return NextResponse.json({ error: 'Provide "output" with triage fields' }, { status: 400 });
      }
      const results = validateTriageOutput(output);
      return NextResponse.json({ results, passed: results.every(r => r.passed) });
    }

    if (action === 'validate_appeal') {
      const { output } = body;
      if (!output || !output.letterText) {
        return NextResponse.json({ error: 'Provide "output" with letterText' }, { status: 400 });
      }
      const results = validateAppealOutput(output);
      return NextResponse.json({ results, passed: results.every(r => r.passed) });
    }

    // Default: run full validation
    const report = await runFullDomainValidation();
    return NextResponse.json({ report });
  } catch (error) {
    return NextResponse.json(
      { error: 'Domain validation failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
