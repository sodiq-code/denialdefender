/**
 * DenialDefender — GEAP Memory Bank (Day 6)
 *
 * Per the Ultimate Blueprint (Section 11 — Memory & State Architecture):
 *   - Long-term memory: Vertex AI Memory Bank → KEEP if stable
 *   - Case state: Firestore
 *   - Evidence & citations: Cloud SQL pgvector
 *
 * Blueprint says: "Vertex AI Memory Bank → KEEP if stable, fall back to Firestore"
 *
 * This implements the three-tier GEAP Memory Bank pattern:
 *
 *   1. Session Memory   — Short-term, per-request (in-memory Map with TTL)
 *   2. Case Memory      — Medium-term, per-case state (Firestore → SQLite fallback)
 *   3. Long-Term Memory — Cross-case patterns, learned weights
 *                         (Vertex AI Memory Bank → Firestore fallback → SQLite fallback)
 *
 * Each tier degrades gracefully: if the primary store is unavailable, the
 * next fallback is used transparently. All operations log which tier/store
 * was actually used for auditability.
 */

import { db } from './db';
import { createHash } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────

export type CaseStateName =
  | 'intake'
  | 'triaged'
  | 'researched'
  | 'drafted'
  | 'verified'
  | 'approved'
  | 'submitted'
  | 'outcome_recorded'
  | 'learned';

export type PatternType =
  | 'strategy_weight'
  | 'citation_relevance'
  | 'payer_behavior'
  | 'outcome_prediction';

export interface TraceEvent {
  timestamp: string;
  agent: string;
  step: string;
  status: string;
  detail?: string;
}

export interface CaseState {
  caseId: string;
  state: CaseStateName;
  denialCategory?: string;
  payer?: string;
  deadline?: string;
  hitlGates: { gate1: boolean; gate2: boolean };
  agentResults: Record<string, any>;
  decisionTrace: TraceEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface LearnedPattern {
  id: string;
  patternType: PatternType;
  denialCategory: string;
  payer: string;
  data: Record<string, any>;
  confidence: number;
  sourceOutcomes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PatternQuery {
  patternType?: PatternType;
  denialCategory?: string;
  payer?: string;
  minConfidence?: number;
  limit?: number;
}

export interface OutcomeWeights {
  denialCategory: string;
  payer: string;
  weights: Record<string, number>;
  sampleSize: number;
  lastUpdated: string;
}

export interface WeightUpdate {
  evidenceId: string;
  oldWeight: number;
  newWeight: number;
  delta: number;
  reason: string;
  outcomeId: string;
}

export interface MemoryBankResult {
  success: boolean;
  store: string;
  updatesApplied: number;
  durationMs: number;
}

export interface MemoryBankStatus {
  sessionMemory: { active: boolean; entries: number };
  caseMemory: { active: boolean; store: 'firestore' | 'sqlite' };
  longTermMemory: {
    active: boolean;
    store: 'vertex_ai_memory_bank' | 'firestore_fallback' | 'sqlite_fallback';
  };
}

// ─── Environment Detection ────────────────────────────────────────────────

function isOnGCP(): boolean {
  return !!process.env.GCP_PROJECT_ID;
}

function getGCPProjectId(): string {
  return process.env.GCP_PROJECT_ID || '';
}

function getGCPRegion(): string {
  return process.env.GCP_REGION || 'us-central1';
}

function getMemoryBankName(): string {
  return process.env.VERTEX_MEMORY_BANK_NAME || 'denialdefender-memory';
}

// ─── Session Memory Entry ─────────────────────────────────────────────────

interface SessionEntry {
  value: any;
  expiresAt: number | null; // null = no TTL
}

// ─── GEAP Memory Bank Class ───────────────────────────────────────────────

export class GEAPMemoryBank {
  // Session memory (in-memory, per request)
  private sessionStore: Map<string, SessionEntry> = new Map();

  // Detected stores
  private caseMemoryStore: 'firestore' | 'sqlite' = 'sqlite';
  private longTermStore: 'vertex_ai_memory_bank' | 'firestore_fallback' | 'sqlite_fallback' = 'sqlite_fallback';

  // Firestore admin (lazy-initialized)
  private firestoreApp: any = null;
  private firestoreInstance: any = null;

  constructor() {
    // Detect which stores are available
    this.detectStores();
  }

  // ─── Store Detection ───────────────────────────────────────────────────

  private detectStores(): void {
    // Long-term memory tier
    if (isOnGCP()) {
      this.longTermStore = 'vertex_ai_memory_bank';
      console.log('[GEAP Memory Bank] Long-term: Vertex AI Memory Bank (GCP detected)');
    } else if (this.canUseFirestore()) {
      this.longTermStore = 'firestore_fallback';
      console.log('[GEAP Memory Bank] Long-term: Firestore fallback (firebase-admin available)');
    } else {
      this.longTermStore = 'sqlite_fallback';
      console.log('[GEAP Memory Bank] Long-term: SQLite fallback (local dev)');
    }

    // Case memory tier
    if (this.canUseFirestore()) {
      this.caseMemoryStore = 'firestore';
      console.log('[GEAP Memory Bank] Case: Firestore');
    } else {
      this.caseMemoryStore = 'sqlite';
      console.log('[GEAP Memory Bank] Case: SQLite (local dev)');
    }
  }

  private canUseFirestore(): boolean {
    try {
      // Check if firebase-admin is importable
      require.resolve('firebase-admin');
      return true;
    } catch {
      return false;
    }
  }

  private async getFirestore(): Promise<any> {
    if (this.firestoreInstance) return this.firestoreInstance;

    try {
      // @ts-expect-error — firebase-admin is only available in Cloud Run production.
      // The sandbox does not install it; this dynamic import is guarded by try/catch.
      const { getFirestore } = await import('firebase-admin/firestore');
      // @ts-expect-error — see above
      const admin = await import('firebase-admin');

      try {
        this.firestoreApp = admin.app('denialdefender-geap');
      } catch {
        this.firestoreApp = admin.initializeApp(
          {
            credential: admin.credential.applicationDefault(),
            projectId: process.env.GCP_PROJECT_ID,
          },
          'denialdefender-geap',
        );
      }

      this.firestoreInstance = getFirestore(this.firestoreApp);
      return this.firestoreInstance;
    } catch (e: any) {
      console.error('[GEAP Memory Bank] Firestore init failed:', e.message);
      throw e;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TIER 1: Session Memory (in-memory, per request)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Set a session-scoped value with optional TTL (in seconds).
   * Session memory is ephemeral — cleared on process restart.
   */
  setSession(key: string, value: any, ttl?: number): void {
    const expiresAt = ttl ? Date.now() + ttl * 1000 : null;
    this.sessionStore.set(key, { value, expiresAt });
  }

  /**
   * Get a session-scoped value. Returns null if expired or not found.
   */
  getSession<T>(key: string): T | null {
    const entry = this.sessionStore.get(key);
    if (!entry) return null;

    // Check TTL
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.sessionStore.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Clear all session memory entries.
   */
  clearSession(): void {
    this.sessionStore.clear();
  }

  /**
   * Clean up expired session entries.
   */
  purgeExpiredSession(): number {
    let purged = 0;
    const now = Date.now();
    for (const [key, entry] of this.sessionStore.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.sessionStore.delete(key);
        purged++;
      }
    }
    return purged;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TIER 2: Case Memory (Firestore → SQLite fallback)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Save complete case state to the case memory tier.
   */
  async saveCaseState(caseId: string, state: CaseState): Promise<void> {
    if (this.caseMemoryStore === 'firestore') {
      try {
        await this.saveCaseStateToFirestore(caseId, state);
        return;
      } catch (e: any) {
        console.warn('[GEAP Memory Bank] Firestore save failed, falling back to SQLite:', e.message);
      }
    }

    // SQLite fallback (or primary if not on Firestore)
    await this.saveCaseStateToSQLite(caseId, state);
  }

  /**
   * Get case state from the case memory tier.
   */
  async getCaseState(caseId: string): Promise<CaseState | null> {
    if (this.caseMemoryStore === 'firestore') {
      try {
        const result = await this.getCaseStateFromFirestore(caseId);
        if (result) return result;
      } catch (e: any) {
        console.warn('[GEAP Memory Bank] Firestore read failed, falling back to SQLite:', e.message);
      }
    }

    return this.getCaseStateFromSQLite(caseId);
  }

  /**
   * Update specific fields of case state.
   */
  async updateCaseState(caseId: string, updates: Partial<CaseState>): Promise<void> {
    const existing = await this.getCaseState(caseId);
    if (!existing) {
      // Create with defaults + updates
      const newState: CaseState = {
        caseId,
        state: updates.state || 'intake',
        denialCategory: updates.denialCategory,
        payer: updates.payer,
        deadline: updates.deadline,
        hitlGates: updates.hitlGates || { gate1: false, gate2: false },
        agentResults: updates.agentResults || {},
        decisionTrace: updates.decisionTrace || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await this.saveCaseState(caseId, newState);
      return;
    }

    const merged: CaseState = {
      ...existing,
      ...updates,
      caseId, // never overwrite caseId
      updatedAt: new Date().toISOString(),
    };

    await this.saveCaseState(caseId, merged);
  }

  // ── Case Memory: SQLite Implementation ────────────────────────────────

  private async saveCaseStateToSQLite(caseId: string, state: CaseState): Promise<void> {
    await db.caseMemoryState.upsert({
      where: { case_id: caseId },
      create: {
        case_id: caseId,
        state: state.state,
        denial_category: state.denialCategory,
        payer: state.payer,
        deadline: state.deadline ? new Date(state.deadline) : null,
        hitl_gates: JSON.stringify(state.hitlGates),
        agent_results: JSON.stringify(state.agentResults),
        decision_trace: JSON.stringify(state.decisionTrace),
      },
      update: {
        state: state.state,
        denial_category: state.denialCategory,
        payer: state.payer,
        deadline: state.deadline ? new Date(state.deadline) : null,
        hitl_gates: JSON.stringify(state.hitlGates),
        agent_results: JSON.stringify(state.agentResults),
        decision_trace: JSON.stringify(state.decisionTrace),
      },
    });
  }

  private async getCaseStateFromSQLite(caseId: string): Promise<CaseState | null> {
    const row = await db.caseMemoryState.findUnique({
      where: { case_id: caseId },
    });

    if (!row) return null;

    return {
      caseId: row.case_id,
      state: row.state as CaseStateName,
      denialCategory: row.denial_category || undefined,
      payer: row.payer || undefined,
      deadline: row.deadline?.toISOString(),
      hitlGates: JSON.parse(row.hitl_gates),
      agentResults: JSON.parse(row.agent_results),
      decisionTrace: JSON.parse(row.decision_trace),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  // ── Case Memory: Firestore Implementation ──────────────────────────────

  private async saveCaseStateToFirestore(caseId: string, state: CaseState): Promise<void> {
    const firestore = await this.getFirestore();
    const docRef = firestore.collection('case_memory_states').doc(caseId);

    await docRef.set(
      {
        state: state.state,
        denialCategory: state.denialCategory || null,
        payer: state.payer || null,
        deadline: state.deadline || null,
        hitlGates: state.hitlGates,
        agentResults: state.agentResults,
        decisionTrace: state.decisionTrace,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  }

  private async getCaseStateFromFirestore(caseId: string): Promise<CaseState | null> {
    const firestore = await this.getFirestore();
    const docRef = firestore.collection('case_memory_states').doc(caseId);
    const doc = await docRef.get();

    if (!doc.exists) return null;

    const data = doc.data();
    return {
      caseId,
      state: data.state as CaseStateName,
      denialCategory: data.denialCategory || undefined,
      payer: data.payer || undefined,
      deadline: data.deadline || undefined,
      hitlGates: data.hitlGates || { gate1: false, gate2: false },
      agentResults: data.agentResults || {},
      decisionTrace: data.decisionTrace || [],
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TIER 3: Long-Term Memory
  //   (Vertex AI Memory Bank → Firestore fallback → SQLite fallback)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Save a learned pattern to long-term memory.
   *
   * Tries Vertex AI Memory Bank first (if on GCP), then Firestore, then SQLite.
   */
  async saveLearnedPattern(pattern: LearnedPattern): Promise<MemoryBankResult> {
    const start = Date.now();

    // Try Vertex AI Memory Bank first
    if (this.longTermStore === 'vertex_ai_memory_bank') {
      try {
        await this.savePatternToVertexAI(pattern);
        return {
          success: true,
          store: 'vertex_ai_memory_bank',
          updatesApplied: 1,
          durationMs: Date.now() - start,
        };
      } catch (e: any) {
        console.warn('[GEAP Memory Bank] Vertex AI save failed, trying Firestore fallback:', e.message);
      }
    }

    // Try Firestore fallback
    if (this.longTermStore === 'vertex_ai_memory_bank' || this.longTermStore === 'firestore_fallback') {
      try {
        await this.savePatternToFirestore(pattern);
        return {
          success: true,
          store: 'firestore_fallback',
          updatesApplied: 1,
          durationMs: Date.now() - start,
        };
      } catch (e: any) {
        console.warn('[GEAP Memory Bank] Firestore save failed, trying SQLite fallback:', e.message);
      }
    }

    // SQLite fallback (always available)
    try {
      await this.savePatternToSQLite(pattern);
      return {
        success: true,
        store: 'sqlite_fallback',
        updatesApplied: 1,
        durationMs: Date.now() - start,
      };
    } catch (e: any) {
      console.error('[GEAP Memory Bank] All long-term memory tiers failed:', e.message);
      return {
        success: false,
        store: 'none',
        updatesApplied: 0,
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Get learned patterns matching a query.
   */
  async getLearnedPatterns(query: PatternQuery): Promise<LearnedPattern[]> {
    // Try Vertex AI first
    if (this.longTermStore === 'vertex_ai_memory_bank') {
      try {
        const results = await this.getPatternsFromVertexAI(query);
        if (results.length > 0) return results;
      } catch (e: any) {
        console.warn('[GEAP Memory Bank] Vertex AI query failed, trying Firestore:', e.message);
      }
    }

    // Try Firestore
    if (this.longTermStore === 'vertex_ai_memory_bank' || this.longTermStore === 'firestore_fallback') {
      try {
        const results = await this.getPatternsFromFirestore(query);
        if (results.length > 0) return results;
      } catch (e: any) {
        console.warn('[GEAP Memory Bank] Firestore query failed, trying SQLite:', e.message);
      }
    }

    // SQLite fallback
    return this.getPatternsFromSQLite(query);
  }

  /**
   * Update outcome weights in long-term memory.
   * This is the core of the Outcome Learning loop.
   *
   * Weight adjustment rules:
   *   - WON: +0.05 to all citations used (capped at 1.0)
   *   - LOST: -0.03 to all citations used (floored at 0.1)
   *   - PARTIAL: +0.02 to citations used
   *   - Per denial_category + payer: strategy-specific adjustments
   */
  async updateOutcomeWeights(weightUpdates: WeightUpdate[]): Promise<MemoryBankResult> {
    const start = Date.now();

    if (weightUpdates.length === 0) {
      return { success: true, store: 'none', updatesApplied: 0, durationMs: 0 };
    }

    // Try Vertex AI first
    if (this.longTermStore === 'vertex_ai_memory_bank') {
      try {
        const result = await this.updateWeightsInVertexAI(weightUpdates);
        if (result) {
          return {
            success: true,
            store: 'vertex_ai_memory_bank',
            updatesApplied: weightUpdates.length,
            durationMs: Date.now() - start,
          };
        }
      } catch (e: any) {
        console.warn('[GEAP Memory Bank] Vertex AI weight update failed, trying Firestore:', e.message);
      }
    }

    // Try Firestore
    if (this.longTermStore === 'vertex_ai_memory_bank' || this.longTermStore === 'firestore_fallback') {
      try {
        const result = await this.updateWeightsInFirestore(weightUpdates);
        if (result) {
          return {
            success: true,
            store: 'firestore_fallback',
            updatesApplied: weightUpdates.length,
            durationMs: Date.now() - start,
          };
        }
      } catch (e: any) {
        console.warn('[GEAP Memory Bank] Firestore weight update failed, trying SQLite:', e.message);
      }
    }

    // SQLite fallback
    try {
      await this.updateWeightsInSQLite(weightUpdates);
      return {
        success: true,
        store: 'sqlite_fallback',
        updatesApplied: weightUpdates.length,
        durationMs: Date.now() - start,
      };
    } catch (e: any) {
      console.error('[GEAP Memory Bank] All weight update tiers failed:', e.message);
      return {
        success: false,
        store: 'none',
        updatesApplied: 0,
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Get outcome weights for a specific denial category + payer.
   */
  async getOutcomeWeights(denialCategory: string, payer: string): Promise<OutcomeWeights> {
    const patterns = await this.getLearnedPatterns({
      patternType: 'strategy_weight',
      denialCategory,
      payer,
    });

    const weights: Record<string, number> = {};
    let sampleSize = 0;
    let lastUpdated = new Date().toISOString();

    for (const pattern of patterns) {
      // Merge weights from each pattern
      for (const [key, value] of Object.entries(pattern.data)) {
        if (typeof value === 'number') {
          weights[key] = value;
        }
      }
      sampleSize += pattern.sourceOutcomes.length;
      if (pattern.updatedAt > lastUpdated) {
        lastUpdated = pattern.updatedAt;
      }
    }

    return {
      denialCategory,
      payer,
      weights,
      sampleSize,
      lastUpdated,
    };
  }

  // ── Long-Term: SQLite Implementation ──────────────────────────────────

  private async savePatternToSQLite(pattern: LearnedPattern): Promise<void> {
    await db.learnedPattern.upsert({
      where: { id: pattern.id },
      create: {
        id: pattern.id,
        pattern_type: pattern.patternType,
        denial_category: pattern.denialCategory,
        payer: pattern.payer,
        data: JSON.stringify(pattern.data),
        confidence: pattern.confidence,
        source_outcomes: JSON.stringify(pattern.sourceOutcomes),
      },
      update: {
        data: JSON.stringify(pattern.data),
        confidence: pattern.confidence,
        source_outcomes: JSON.stringify(pattern.sourceOutcomes),
      },
    });
  }

  private async getPatternsFromSQLite(query: PatternQuery): Promise<LearnedPattern[]> {
    const where: any = {};

    if (query.patternType) where.pattern_type = query.patternType;
    if (query.denialCategory) where.denial_category = query.denialCategory;
    if (query.payer) where.payer = query.payer;
    if (query.minConfidence) where.confidence = { gte: query.minConfidence };

    const rows = await db.learnedPattern.findMany({
      where,
      orderBy: { confidence: 'desc' },
      take: query.limit || 50,
    });

    return rows.map((row) => ({
      id: row.id,
      patternType: row.pattern_type as PatternType,
      denialCategory: row.denial_category,
      payer: row.payer,
      data: JSON.parse(row.data),
      confidence: row.confidence,
      sourceOutcomes: JSON.parse(row.source_outcomes),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  private async updateWeightsInSQLite(updates: WeightUpdate[]): Promise<void> {
    // Group updates by evidence ID and apply to the evidence table
    for (const update of updates) {
      try {
        await db.evidence.update({
          where: { id: update.evidenceId },
          data: { retrieval_weight: update.newWeight },
        });
      } catch (e: any) {
        // Skip individual failures
        console.warn(`[GEAP Memory Bank] SQLite weight update failed for ${update.evidenceId}:`, e.message);
      }
    }

    // Also record as a learned pattern
    if (updates.length > 0) {
      const firstUpdate = updates[0];
      const patternId = createHash('sha256')
        .update(`weight-${firstUpdate.evidenceId}-${Date.now()}`)
        .digest('hex')
        .slice(0, 24);

      const category = firstUpdate.reason.match(/for (\w+)\/(\w+)/);
      const denialCategory = category ? category[1] : 'unknown';
      const payer = category ? category[2] : 'unknown';

      const weightsMap: Record<string, number> = {};
      for (const u of updates) {
        weightsMap[u.evidenceId] = u.newWeight;
      }

      await db.learnedPattern.upsert({
        where: { id: patternId },
        create: {
          id: patternId,
          pattern_type: 'strategy_weight',
          denial_category: denialCategory,
          payer,
          data: JSON.stringify(weightsMap),
          confidence: 0.5,
          source_outcomes: JSON.stringify(updates.map((u) => u.outcomeId)),
        },
        update: {
          data: JSON.stringify(weightsMap),
          source_outcomes: JSON.stringify(updates.map((u) => u.outcomeId)),
        },
      });
    }
  }

  // ── Long-Term: Firestore Implementation ───────────────────────────────

  private async savePatternToFirestore(pattern: LearnedPattern): Promise<void> {
    const firestore = await this.getFirestore();
    const docRef = firestore.collection('learned_patterns').doc(pattern.id);

    await docRef.set(
      {
        patternType: pattern.patternType,
        denialCategory: pattern.denialCategory,
        payer: pattern.payer,
        data: pattern.data,
        confidence: pattern.confidence,
        sourceOutcomes: pattern.sourceOutcomes,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  }

  private async getPatternsFromFirestore(query: PatternQuery): Promise<LearnedPattern[]> {
    const firestore = await this.getFirestore();
    let collectionQuery = firestore.collection('learned_patterns');

    if (query.patternType) {
      collectionQuery = collectionQuery.where('patternType', '==', query.patternType);
    }
    if (query.denialCategory) {
      collectionQuery = collectionQuery.where('denialCategory', '==', query.denialCategory);
    }
    if (query.payer) {
      collectionQuery = collectionQuery.where('payer', '==', query.payer);
    }

    collectionQuery = collectionQuery.orderBy('confidence', 'desc').limit(query.limit || 50);

    const snapshot = await collectionQuery.get();

    return snapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        patternType: data.patternType as PatternType,
        denialCategory: data.denialCategory,
        payer: data.payer,
        data: data.data || {},
        confidence: data.confidence || 0.5,
        sourceOutcomes: data.sourceOutcomes || [],
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
      };
    });
  }

  private async updateWeightsInFirestore(updates: WeightUpdate[]): Promise<boolean> {
    const firestore = await this.getFirestore();
    const weightsCollection = firestore.collection('procedural_evidence_weights');

    for (const update of updates) {
      const docRef = weightsCollection.doc(update.evidenceId);
      await docRef.set(
        {
          weight: update.newWeight,
          lastOutcomeId: update.outcomeId,
          reason: update.reason,
          lastUpdated: new Date().toISOString(),
        },
        { merge: true },
      );
    }

    return true;
  }

  // ── Long-Term: Vertex AI Memory Bank Implementation ───────────────────

  private getVertexAIMemoryBankUrl(): string {
    const projectId = getGCPProjectId();
    const region = getGCPRegion();
    const memoryBank = getMemoryBankName();
    return `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/memoryBanks/${memoryBank}/memories`;
  }

  private async getVertexAIAuthToken(): Promise<string> {
    // Use the Google Cloud default credential to get an access token
    try {
      // @ts-expect-error — google-auth-library is only available in Cloud Run production.
      const { GoogleAuth } = await import('google-auth-library');
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      const client = await auth.getClient();
      const token = await client.getAccessToken();
      if (!token.token) throw new Error('No access token');
      return token.token;
    } catch (e: any) {
      // Fallback: try using gcloud CLI
      console.warn('[GEAP Memory Bank] google-auth-library not available, trying gcloud CLI:', e.message);
      const { execSync } = await import('child_process');
      const output = execSync('gcloud auth print-access-token', { encoding: 'utf-8' }).trim();
      return output;
    }
  }

  private async savePatternToVertexAI(pattern: LearnedPattern): Promise<void> {
    const url = this.getVertexAIMemoryBankUrl();
    const token = await this.getVertexAIAuthToken();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        memoryId: pattern.id,
        content: JSON.stringify({
          patternType: pattern.patternType,
          denialCategory: pattern.denialCategory,
          payer: pattern.payer,
          data: pattern.data,
          confidence: pattern.confidence,
          sourceOutcomes: pattern.sourceOutcomes,
        }),
        metadata: {
          patternType: pattern.patternType,
          denialCategory: pattern.denialCategory,
          payer: pattern.payer,
          confidence: String(pattern.confidence),
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Vertex AI Memory Bank API error: ${response.status} ${errorText}`);
    }

    console.log(`[GEAP Memory Bank] Pattern ${pattern.id} saved to Vertex AI Memory Bank`);
  }

  private async getPatternsFromVertexAI(query: PatternQuery): Promise<LearnedPattern[]> {
    const url = this.getVertexAIMemoryBankUrl();
    const token = await this.getVertexAIAuthToken();

    // Vertex AI Memory Bank supports query/filter parameters
    const params = new URLSearchParams();
    if (query.patternType) params.set('filter', `metadata.patternType="${query.patternType}"`);
    if (query.denialCategory) params.append('filter', `metadata.denialCategory="${query.denialCategory}"`);
    if (query.payer) params.append('filter', `metadata.payer="${query.payer}"`);
    if (query.limit) params.set('pageSize', String(query.limit));

    const response = await fetch(`${url}?${params.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Vertex AI Memory Bank API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const memories = data.memories || [];

    return memories
      .map((memory: any) => {
        try {
          const content = JSON.parse(memory.content);
          return {
            id: memory.memoryId || memory.name?.split('/').pop(),
            patternType: content.patternType as PatternType,
            denialCategory: content.denialCategory,
            payer: content.payer,
            data: content.data || {},
            confidence: content.confidence || 0.5,
            sourceOutcomes: content.sourceOutcomes || [],
            createdAt: memory.createTime || new Date().toISOString(),
            updatedAt: memory.updateTime || new Date().toISOString(),
          } as LearnedPattern;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as LearnedPattern[];
  }

  private async updateWeightsInVertexAI(updates: WeightUpdate[]): Promise<boolean> {
    // Save each weight update as a memory in Vertex AI Memory Bank
    const url = this.getVertexAIMemoryBankUrl();
    const token = await this.getVertexAIAuthToken();

    for (const update of updates) {
      const memoryId = `weight-${update.evidenceId}-${Date.now()}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          memoryId,
          content: JSON.stringify({
            type: 'weight_update',
            evidenceId: update.evidenceId,
            oldWeight: update.oldWeight,
            newWeight: update.newWeight,
            delta: update.delta,
            reason: update.reason,
            outcomeId: update.outcomeId,
          }),
          metadata: {
            type: 'weight_update',
            evidenceId: update.evidenceId,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Vertex AI Memory Bank weight update failed: ${response.status}`);
      }
    }

    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Memory Bank Status
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get the current status of all memory tiers.
   */
  getStatus(): MemoryBankStatus {
    // Clean up expired entries first
    this.purgeExpiredSession();

    return {
      sessionMemory: {
        active: true,
        entries: this.sessionStore.size,
      },
      caseMemory: {
        active: true,
        store: this.caseMemoryStore,
      },
      longTermMemory: {
        active: true,
        store: this.longTermStore,
      },
    };
  }

  /**
   * Get detailed statistics from the SQLite store.
   */
  async getDetailedStats(): Promise<{
    learnedPatternCount: number;
    caseMemoryCount: number;
    patternsByType: Record<string, number>;
    patternsByCategory: Record<string, number>;
    avgConfidence: number;
  }> {
    try {
      const learnedPatternCount = await db.learnedPattern.count();
      const caseMemoryCount = await db.caseMemoryState.count();

      const patternsByTypeRows = await db.learnedPattern.groupBy({
        by: ['pattern_type'],
        _count: true,
      });
      const patternsByType: Record<string, number> = {};
      for (const row of patternsByTypeRows) {
        patternsByType[row.pattern_type] = row._count;
      }

      const patternsByCategoryRows = await db.learnedPattern.groupBy({
        by: ['denial_category'],
        _count: true,
      });
      const patternsByCategory: Record<string, number> = {};
      for (const row of patternsByCategoryRows) {
        patternsByCategory[row.denial_category] = row._count;
      }

      const avgResult = await db.learnedPattern.aggregate({
        _avg: { confidence: true },
      });

      return {
        learnedPatternCount,
        caseMemoryCount,
        patternsByType,
        patternsByCategory,
        avgConfidence: avgResult._avg.confidence || 0,
      };
    } catch (e: any) {
      console.warn('[GEAP Memory Bank] Stats query failed:', e.message);
      return {
        learnedPatternCount: 0,
        caseMemoryCount: 0,
        patternsByType: {},
        patternsByCategory: {},
        avgConfidence: 0,
      };
    }
  }
}

// ─── Singleton Instance ───────────────────────────────────────────────────

// Global singleton so the Memory Bank persists across requests in the same process
const globalForMemoryBank = globalThis as unknown as {
  geapMemoryBank: GEAPMemoryBank | undefined;
};

export const memoryBank = globalForMemoryBank.geapMemoryBank ?? new GEAPMemoryBank();

if (process.env.NODE_ENV !== 'production') {
  globalForMemoryBank.geapMemoryBank = memoryBank;
}
