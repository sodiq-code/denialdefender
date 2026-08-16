/**
 * DenialDefender — Domain Validation API
 * GET  /api/domain-validation       — Get domain validation record
 * POST /api/domain-validation       — Run full domain validation
 * POST /api/domain-validation/area  — Validate a specific area
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  generateDomainValidation,
  runFullDomainValidation,
  validateDenialTaxonomy,
  validateEvidenceWorkflow,
  validateAppealStructure,
  validateDeadlineHandling,
  validateHitlBoundaries,
} from '@/lib/domain-validation';

export async function GET(request: NextRequest) {
  try {
    // Return the current domain validation record
    const record = generateDomainValidation();

    // Also run sub-validations
    const taxonomy = validateDenialTaxonomy();
    const evidence = validateEvidenceWorkflow();
    const appeal = validateAppealStructure();
    const deadline = validateDeadlineHandling();
    const hitl = validateHitlBoundaries();

    return NextResponse.json({
      record,
      validations: {
        taxonomy,
        evidence,
        appeal,
        deadline,
        hitl,
      },
      allPassed: taxonomy.valid && evidence.valid && appeal.valid && deadline.valid && hitl.valid,
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
      // Run full validation with DB persistence
      const record = await runFullDomainValidation();
      return NextResponse.json({ record, persisted: true });
    }

    if (action === 'validate_area') {
      const { area } = body;
      let result;

      switch (area) {
        case 'denial_taxonomy':
          result = validateDenialTaxonomy();
          break;
        case 'evidence_workflow':
          result = validateEvidenceWorkflow();
          break;
        case 'appeal_structure':
          result = validateAppealStructure();
          break;
        case 'deadline_handling':
          result = validateDeadlineHandling();
          break;
        case 'hitl_boundaries':
          result = validateHitlBoundaries();
          break;
        default:
          return NextResponse.json({ error: `Unknown area: ${area}` }, { status: 400 });
      }

      return NextResponse.json({ area, result });
    }

    // Default: generate and return
    const record = await runFullDomainValidation();
    return NextResponse.json({ record });
  } catch (error) {
    return NextResponse.json(
      { error: 'Domain validation failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
