/**
 * API Route — GEAP Memory Bank
 *
 * GET  /api/governance/memory-bank — Returns Memory Bank status and statistics
 * POST /api/governance/memory-bank — Save a learned pattern or update weights
 *
 * Per the Ultimate Blueprint (Section 11 — Memory & State Architecture):
 *   - Long-term memory: Vertex AI Memory Bank → KEEP if stable
 *   - Case state: Firestore
 *   - Evidence & citations: Cloud SQL pgvector
 *
 * The Memory Bank is the core of the Outcome Learning loop:
 *   Case → Pipeline → Appeal → Real-World Verdict → Outcome Ingested
 *   → Weight Update → Better Retrieval → Better Appeals → Better Outcomes
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  memoryBank,
  type LearnedPattern,
  type PatternQuery,
  type WeightUpdate,
  type CaseState,
  type PatternType,
} from '@/lib/geap-memory-bank';

// ─── GET: Memory Bank Status & Statistics ──────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // Get status
    const status = memoryBank.getStatus();

    // Get detailed stats from the store
    const stats = await memoryBank.getDetailedStats();

    // Handle specific query actions
    if (action === 'patterns') {
      const query: PatternQuery = {
        patternType: url.searchParams.get('patternType') as PatternType | undefined,
        denialCategory: url.searchParams.get('denialCategory') || undefined,
        payer: url.searchParams.get('payer') || undefined,
        minConfidence: url.searchParams.get('minConfidence')
          ? parseFloat(url.searchParams.get('minConfidence')!)
          : undefined,
        limit: url.searchParams.get('limit')
          ? parseInt(url.searchParams.get('limit')!)
          : 50,
      };

      const patterns = await memoryBank.getLearnedPatterns(query);
      return NextResponse.json({
        success: true,
        patterns,
        store: status.longTermMemory.store,
      });
    }

    if (action === 'weights') {
      const denialCategory = url.searchParams.get('denialCategory') || 'medical_necessity';
      const payer = url.searchParams.get('payer') || 'UnitedHealthcare';

      const weights = await memoryBank.getOutcomeWeights(denialCategory, payer);
      return NextResponse.json({
        success: true,
        weights,
        store: status.longTermMemory.store,
      });
    }

    if (action === 'case') {
      const caseId = url.searchParams.get('caseId');
      if (!caseId) {
        return NextResponse.json(
          { success: false, error: 'caseId parameter required' },
          { status: 400 },
        );
      }

      const caseState = await memoryBank.getCaseState(caseId);
      return NextResponse.json({
        success: true,
        caseState,
        store: status.caseMemory.store,
      });
    }

    // Default: return full status + stats
    return NextResponse.json({
      success: true,
      status,
      stats,
      environment: {
        gcpProjectId: process.env.GCP_PROJECT_ID || null,
        gcpRegion: process.env.GCP_REGION || 'us-central1',
        vertexMemoryBankName: process.env.VERTEX_MEMORY_BANK_NAME || 'denialdefender-memory',
      },
    });
  } catch (error: any) {
    console.error('[Memory Bank API] GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}

// ─── POST: Save Pattern or Update Weights ──────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const operation = body.operation || 'save_pattern';

    // ── Save a Learned Pattern ──
    if (operation === 'save_pattern') {
      if (!body.patternType || !body.denialCategory || !body.payer) {
        return NextResponse.json(
          {
            success: false,
            error: 'Missing required fields: patternType, denialCategory, payer',
          },
          { status: 400 },
        );
      }

      const pattern: LearnedPattern = {
        id: body.id || `pattern-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        patternType: body.patternType as PatternType,
        denialCategory: body.denialCategory,
        payer: body.payer,
        data: body.data || {},
        confidence: body.confidence || 0.5,
        sourceOutcomes: body.sourceOutcomes || [],
        createdAt: body.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await memoryBank.saveLearnedPattern(pattern);

      return NextResponse.json({
        success: result.success,
        patternId: pattern.id,
        store: result.store,
        durationMs: result.durationMs,
      });
    }

    // ── Update Outcome Weights ──
    if (operation === 'update_weights') {
      if (!body.weightUpdates || !Array.isArray(body.weightUpdates)) {
        return NextResponse.json(
          { success: false, error: 'weightUpdates array required' },
          { status: 400 },
        );
      }

      const weightUpdates: WeightUpdate[] = body.weightUpdates.map((u: any) => ({
        evidenceId: u.evidenceId,
        oldWeight: u.oldWeight,
        newWeight: u.newWeight,
        delta: u.delta,
        reason: u.reason || 'Manual weight update',
        outcomeId: u.outcomeId || 'manual',
      }));

      const result = await memoryBank.updateOutcomeWeights(weightUpdates);

      return NextResponse.json({
        success: result.success,
        store: result.store,
        updatesApplied: result.updatesApplied,
        durationMs: result.durationMs,
      });
    }

    // ── Save Case State ──
    if (operation === 'save_case_state') {
      if (!body.caseId) {
        return NextResponse.json(
          { success: false, error: 'caseId required' },
          { status: 400 },
        );
      }

      const caseState: CaseState = {
        caseId: body.caseId,
        state: body.state || 'intake',
        denialCategory: body.denialCategory,
        payer: body.payer,
        deadline: body.deadline,
        hitlGates: body.hitlGates || { gate1: false, gate2: false },
        agentResults: body.agentResults || {},
        decisionTrace: body.decisionTrace || [],
        createdAt: body.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await memoryBank.saveCaseState(body.caseId, caseState);

      const status = memoryBank.getStatus();
      return NextResponse.json({
        success: true,
        caseId: body.caseId,
        store: status.caseMemory.store,
      });
    }

    // ── Update Case State ──
    if (operation === 'update_case_state') {
      if (!body.caseId) {
        return NextResponse.json(
          { success: false, error: 'caseId required' },
          { status: 400 },
        );
      }

      const updates: Partial<CaseState> = {};
      if (body.state) updates.state = body.state;
      if (body.denialCategory !== undefined) updates.denialCategory = body.denialCategory;
      if (body.payer !== undefined) updates.payer = body.payer;
      if (body.deadline !== undefined) updates.deadline = body.deadline;
      if (body.hitlGates) updates.hitlGates = body.hitlGates;
      if (body.agentResults) updates.agentResults = body.agentResults;
      if (body.decisionTrace) updates.decisionTrace = body.decisionTrace;

      await memoryBank.updateCaseState(body.caseId, updates);

      const status = memoryBank.getStatus();
      return NextResponse.json({
        success: true,
        caseId: body.caseId,
        store: status.caseMemory.store,
      });
    }

    // ── Session Memory Operations ──
    if (operation === 'set_session') {
      if (!body.key || body.value === undefined) {
        return NextResponse.json(
          { success: false, error: 'key and value required' },
          { status: 400 },
        );
      }

      memoryBank.setSession(body.key, body.value, body.ttl);
      return NextResponse.json({ success: true, key: body.key, ttl: body.ttl || null });
    }

    if (operation === 'get_session') {
      if (!body.key) {
        return NextResponse.json(
          { success: false, error: 'key required' },
          { status: 400 },
        );
      }

      const value = memoryBank.getSession(body.key);
      return NextResponse.json({ success: true, key: body.key, value, found: value !== null });
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Invalid operation. Use: save_pattern, update_weights, save_case_state, update_case_state, set_session, get_session',
      },
      { status: 400 },
    );
  } catch (error: any) {
    console.error('[Memory Bank API] POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
