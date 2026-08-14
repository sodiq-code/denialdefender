import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/cases/[id]/denial - Get denial for a case
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const denial = await db.denial.findUnique({
      where: { case_id: id },
    });

    if (!denial) {
      return NextResponse.json(
        { error: 'Denial not found for this case' },
        { status: 404 }
      );
    }

    return NextResponse.json({ denial });
  } catch (error) {
    console.error('[GET /api/cases/[id]/denial] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch denial' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cases/[id]/denial - Create or update denial for a case
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Validate required fields
    if (!body.payer) {
      return NextResponse.json(
        { error: 'payer is required' },
        { status: 400 }
      );
    }
    if (!body.reason_code) {
      return NextResponse.json(
        { error: 'reason_code is required' },
        { status: 400 }
      );
    }
    if (!body.category) {
      return NextResponse.json(
        { error: 'category is required' },
        { status: 400 }
      );
    }
    if (!body.denial_letter_text) {
      return NextResponse.json(
        { error: 'denial_letter_text is required' },
        { status: 400 }
      );
    }

    // Verify case exists
    const caseExists = await db.case.findUnique({ where: { id } });
    if (!caseExists) {
      return NextResponse.json(
        { error: 'Case not found' },
        { status: 404 }
      );
    }

    // Check if denial already exists for this case
    const existingDenial = await db.denial.findUnique({
      where: { case_id: id },
    });

    const denialData = {
      payer: body.payer,
      reason_code: body.reason_code,
      category: body.category,
      denial_letter_text: body.denial_letter_text,
      deadline: body.deadline ? new Date(body.deadline) : null,
      confidence: body.confidence ?? null,
      structured_json: body.structured_json ? JSON.stringify(body.structured_json) : null,
    };

    let denial;

    if (existingDenial) {
      // Update existing denial
      denial = await db.denial.update({
        where: { id: existingDenial.id },
        data: denialData,
      });
    } else {
      // Create new denial
      denial = await db.denial.create({
        data: {
          case_id: id,
          ...denialData,
        },
      });
    }

    return NextResponse.json(
      { denial },
      { status: existingDenial ? 200 : 201 }
    );
  } catch (error) {
    console.error('[POST /api/cases/[id]/denial] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create/update denial' },
      { status: 500 }
    );
  }
}
