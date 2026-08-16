# Task 6: GEAP Memory Bank Pattern

## Summary
Implemented the proper GEAP Memory Bank pattern per the Ultimate Blueprint (Section 11 — Memory & State Architecture). Replaced the flat SQLite+Firestore approach with a proper three-tier memory architecture with graceful degradation.

## Architecture

### Three-Tier GEAP Memory Bank

| Tier | Scope | Primary Store | Fallback |
|------|-------|---------------|----------|
| Session Memory | Per-request, ephemeral | In-memory Map (with TTL) | N/A |
| Case Memory | Per-case state | Firestore | SQLite |
| Long-Term Memory | Cross-case patterns, learned weights | Vertex AI Memory Bank | Firestore → SQLite |

### Fallback Chain (Long-Term)
1. **Vertex AI Memory Bank** — when `GCP_PROJECT_ID` is set (production GCP)
2. **Firestore** — when `firebase-admin` is available but not on GCP
3. **SQLite** — always available as final fallback (local dev)

## Files Created

- **`src/lib/geap-memory-bank.ts`** — GEAPMemoryBank class with:
  - Session memory: `setSession()`, `getSession()`, `clearSession()`, `purgeExpiredSession()`
  - Case memory: `saveCaseState()`, `getCaseState()`, `updateCaseState()`
  - Long-term memory: `saveLearnedPattern()`, `getLearnedPatterns()`, `updateOutcomeWeights()`, `getOutcomeWeights()`
  - Status: `getStatus()`, `getDetailedStats()`
  - Vertex AI Memory Bank REST API integration
  - Firestore implementations for all three tiers
  - SQLite implementations (via Prisma) as final fallback
  - Singleton pattern for process persistence

- **`src/app/api/governance/memory-bank/route.ts`** — Next.js API route:
  - GET: Status, stats, patterns query, weights query, case state query
  - POST: Save pattern, update weights, save/update case state, session memory ops

## Files Modified

- **`prisma/schema.prisma`** — Added `LearnedPattern` and `CaseMemoryState` models with indexes
- **`src/lib/db.ts`** — Added DDL for `LearnedPattern` and `CaseMemoryState` tables
- **`src/lib/outcome-ingestion.ts`** — Replaced direct SQLite/Firestore weight updates with GEAP Memory Bank:
  - New `computeWeightUpdates()` replaces `updateWeightsInMemoryBank()` (computation only, no writes)
  - `ingestOutcome()` now uses `memoryBank.updateOutcomeWeights()` for tiered application
  - `IngestionResult.memoryBankStatus` expanded: `'vertex_ai_memory_bank' | 'firestore_fallback' | 'sqlite_fallback' | 'failed'`
  - `BatchIngestionResult.memoryBankStatus` expanded similarly, added `storesUsed[]`
  - Removed old `updateWeightsInFirestore()` (now handled internally by Memory Bank)
- **`src/app/api/outcome-ingest/route.ts`** — Added `storeDetail` to response

## API Verification

- `GET /api/governance/memory-bank` → Returns full status + stats + environment info
- `GET /api/governance/memory-bank?action=patterns&denialCategory=X&payer=Y` → Query learned patterns
- `GET /api/governance/memory-bank?action=weights&denialCategory=X&payer=Y` → Get outcome weights
- `GET /api/governance/memory-bank?action=case&caseId=X` → Get case state
- `POST /api/governance/memory-bank` with `operation: save_pattern` → Save learned pattern
- `POST /api/governance/memory-bank` with `operation: update_weights` → Update outcome weights
- `POST /api/governance/memory-bank` with `operation: save_case_state` → Save case state
- `POST /api/governance/memory-bank` with `operation: set_session/get_session` → Session memory ops

## Key Design Decisions

1. **Separation of computation and application**: `computeWeightUpdates()` only computes deltas; `memoryBank.updateOutcomeWeights()` applies them to the correct tier. This ensures the same weight computation logic works regardless of storage backend.
2. **Singleton pattern**: The Memory Bank instance persists across requests in the same process, preserving session memory.
3. **Graceful degradation**: Each tier attempt is logged. If Vertex AI fails, Firestore is tried. If Firestore fails, SQLite is always available.
4. **Environment detection**: Automatic detection of GCP environment, Firestore availability, and SQLite availability at construction time.
