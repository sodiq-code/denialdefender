import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/seed — Seed the database with all blueprint cases
 *
 * Generates the full set of synthetic cases from the DenialDefender
 * blueprint (Days 2-14) and stores them in the persistent database
 * (Turso on Cloud Run, local SQLite in dev).
 *
 * Called once after deployment to populate the database.
 * Safe to call multiple times — skips existing cases.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json().catch(() => ({}));
    const targetCount = body.count || 90;
    const force = body.force === true;

    const { isTurso, getTursoClient } = await import('@/lib/db');

    if (isTurso) {
      const client = await getTursoClient();

      // Count existing
      const existing = await client.execute('SELECT COUNT(*) as total FROM "Case"');
      const existingCount = Number((existing.rows[0] as any)?.total ?? 0);

      if (existingCount >= targetCount && !force) {
        return NextResponse.json({
          status: 'already_seeded',
          existingCases: existingCount,
          message: `Database already has ${existingCount} cases. Use { "force": true } to re-seed.`,
        });
      }

      // If force, clear existing data
      if (force && existingCount > 0) {
        console.log('[seed] Clearing existing data...');
        await client.execute('DELETE FROM "Citation"');
        await client.execute('DELETE FROM "Outcome"');
        await client.execute('DELETE FROM "HitlGate"');
        await client.execute('DELETE FROM "DecisionTraceEvent"');
        await client.execute('DELETE FROM "Denial"');
        await client.execute('DELETE FROM "Evidence"');
        await client.execute('DELETE FROM "PhiGuardAudit"');
        await client.execute('DELETE FROM "GovernanceAudit"');
        await client.execute('DELETE FROM "LearnedPattern"');
        await client.execute('DELETE FROM "CaseMemoryState"');
        await client.execute('DELETE FROM "Case"');
        console.log('[seed] Cleared all tables');
      }

      // Generate synthetic cases
      const { generateSyntheticCases } = await import('@/lib/synthetic-cases');
      const synthesis = generateSyntheticCases(targetCount);

      let created = 0;
      const errors: string[] = [];

      for (const c of synthesis.cases) {
        try {
          const caseId = `case_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_${created}`;
          const now = new Date().toISOString();
          const deadline = c.appealDeadline.toISOString();

          // Insert Case (at hitl_gate_1 state — triaged, awaiting human confirmation)
          await client.execute({
            sql: `INSERT INTO "Case" (id, patient_id, state, deadline, persona, created_at, updated_at)
                  VALUES (?, ?, 'hitl_gate_1', ?, ?, ?, ?)`,
            args: [caseId, c.patientHash, deadline, c.persona, now, now],
          });

          // Insert Denial
          const denialId = `denial_${caseId}`;
          await client.execute({
            sql: `INSERT INTO "Denial" (id, case_id, payer, reason_code, category, denial_letter_text, deadline, confidence, structured_json, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              denialId, caseId, c.payer, c.denialReason.code, c.denialReason.category,
              c.denialLetterText, deadline, c.confidence,
              JSON.stringify({
                patientLabel: c.patientLabel,
                cptCode: c.cptCode,
                icd10Code: c.icd10Code,
                denialDate: c.denialDate,
                appealLevel: c.appealLevel,
                denialDescription: c.denialReason.description,
                payerStatement: c.denialReason.payerText,
              }),
              now,
            ],
          });

          // Insert Gate 1 (pending)
          const gateId = `gate1_${caseId}`;
          await client.execute({
            sql: `INSERT INTO "HitlGate" (id, case_id, gate_number, status, reviewer_note, created_at)
                  VALUES (?, ?, 1, 'pending', ?, ?)`,
            args: [
              gateId, caseId,
              `${c.payer} denied ${c.cptCode.description} for patient with ${c.icd10Code.description} as ${c.denialReason.category} (${c.denialReason.code}). Confidence: ${c.confidence.toFixed(2)}. Confirm this classification to proceed with Policy Research.`,
              now,
            ],
          });

          // Insert triage trace
          const traceId = `trace_${caseId}`;
          await client.execute({
            sql: `INSERT INTO "DecisionTraceEvent" (id, case_id, agent_name, step, status, details, timestamp)
                  VALUES (?, ?, 'denial-triage', 'classify', 'completed', ?, ?)`,
            args: [
              traceId, caseId,
              JSON.stringify({
                category: c.denialReason.category,
                confidence: c.confidence,
                payer: c.payer,
                strategy: c.denialReason.category === 'medical_necessity' ? 'clinical_justification' : 'procedural_correction',
              }),
              now,
            ],
          });

          created++;
        } catch (err: any) {
          errors.push(`Case ${c.patientLabel}: ${err.message}`);
          if (errors.length > 20) break;
        }
      }

      // Add special blueprint milestone cases
      const { createHash } = await import('crypto');
      const specialCases = [
        { id: 'case_demo_loss_001', payer: 'UnitedHealthcare', code: 'CO50', cat: 'medical_necessity', state: 'lost', persona: 'elderly' },
        { id: 'case_demo_win_001', payer: 'UnitedHealthcare', code: 'CO50', cat: 'medical_necessity', state: 'won', persona: 'chronic_condition' },
        { id: 'case_demo_submitted', payer: 'Medicare', code: 'CO16', cat: 'medical_necessity', state: 'submitted', persona: 'post_surgical' },
        { id: 'case_demo_approved', payer: 'Medicare', code: 'CO16', cat: 'medical_necessity', state: 'approved', persona: 'routine_care' },
      ];

      for (const sc of specialCases) {
        try {
          const check = await client.execute({ sql: 'SELECT id FROM "Case" WHERE id = ?', args: [sc.id] });
          if (check.rows.length > 0) continue;

          const now = new Date().toISOString();
          const deadline = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
          const patientHash = createHash('sha256').update(`synthetic:${sc.id}`).digest('hex').slice(0, 16);

          await client.execute({
            sql: `INSERT INTO "Case" (id, patient_id, state, deadline, persona, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [sc.id, patientHash, sc.state, deadline, sc.persona, now, now],
          });

          await client.execute({
            sql: `INSERT INTO "Denial" (id, case_id, payer, reason_code, category, denial_letter_text, deadline, confidence, structured_json, created_at)
                  VALUES (?, ?, ?, ?, ?, 'Your claim has been denied per clinical guidelines. See attached denial letter for full details and appeal rights.', ?, 0.85, '{}', ?)`,
            args: [`denial_${sc.id}`, sc.id, sc.payer, sc.code, sc.cat, deadline, now],
          });

          created++;
        } catch (err: any) {
          errors.push(`Special case ${sc.id}: ${err.message}`);
        }
      }

      // Final counts
      const [finalResult, denialResult, traceResult, gateResult] = await Promise.all([
        client.execute('SELECT COUNT(*) as total FROM "Case"'),
        client.execute('SELECT COUNT(*) as total FROM "Denial"'),
        client.execute('SELECT COUNT(*) as total FROM "DecisionTraceEvent"'),
        client.execute('SELECT COUNT(*) as total FROM "HitlGate"'),
      ]);

      return NextResponse.json({
        status: 'seeded',
        created,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
        durationMs: Date.now() - startTime,
        database: {
          cases: Number((finalResult.rows[0] as any)?.total ?? 0),
          denials: Number((denialResult.rows[0] as any)?.total ?? 0),
          traces: Number((traceResult.rows[0] as any)?.total ?? 0),
          gates: Number((gateResult.rows[0] as any)?.total ?? 0),
        },
        synthesis: {
          categories: synthesis.categories,
          payers: synthesis.payers,
        },
      });
    }

    // ── Local SQLite Mode: Use Prisma ──────────────────────────────
    const { db } = await import('@/lib/db');
    const existingCount = await db.case.count();
    if (existingCount >= targetCount && !force) {
      return NextResponse.json({
        status: 'already_seeded',
        existingCases: existingCount,
        message: `Database already has ${existingCount} cases. Use { "force": true } to re-seed.`,
      });
    }

    const { storeSyntheticCases } = await import('@/lib/synthetic-cases');
    const result = await storeSyntheticCases(targetCount);

    return NextResponse.json({
      status: 'seeded',
      created: result.created,
      errors: result.errors.length > 0 ? result.errors.slice(0, 10) : undefined,
      durationMs: Date.now() - startTime,
      totalCases: await db.case.count(),
    });
  } catch (error: any) {
    console.error('[POST /api/seed] Error:', error);
    return NextResponse.json(
      { status: 'error', message: error.message, durationMs: Date.now() - startTime },
      { status: 500 }
    );
  }
}

/**
 * GET /api/seed — Check seed status
 */
export async function GET() {
  try {
    const { isTurso, getTursoClient } = await import('@/lib/db');

    if (isTurso) {
      const client = await getTursoClient();
      const [caseCount, denialCount, traceCount, gateCount] = await Promise.all([
        client.execute('SELECT COUNT(*) as total FROM "Case"'),
        client.execute('SELECT COUNT(*) as total FROM "Denial"'),
        client.execute('SELECT COUNT(*) as total FROM "DecisionTraceEvent"'),
        client.execute('SELECT COUNT(*) as total FROM "HitlGate"'),
      ]);

      return NextResponse.json({
        database: 'turso',
        cases: Number((caseCount.rows[0] as any)?.total ?? 0),
        denials: Number((denialCount.rows[0] as any)?.total ?? 0),
        traces: Number((traceCount.rows[0] as any)?.total ?? 0),
        gates: Number((gateCount.rows[0] as any)?.total ?? 0),
      });
    }

    const { db } = await import('@/lib/db');
    return NextResponse.json({
      database: 'local_sqlite',
      cases: await db.case.count(),
      denials: await db.denial.count(),
      traces: await db.decisionTraceEvent.count(),
      gates: await db.hitlGate.count(),
    });
  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
