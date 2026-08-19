# Task 2-API — API Routes Port

## Status: COMPLETE

All 55 API routes ported from `/tmp/denialdefender-analyze/src/app/api/` into `/home/z/my-project/src/app/api/`, with Turso branches stripped and 8 minimal TypeScript adaptations applied. Lint clean, tsc clean (no errors in src/app/api/).

## Routes Ported (55 total)

### Turso-stripped (7 routes)
- `cases/route.ts`, `cases/[id]/route.ts`, `cases/[id]/trace/route.ts`, `cases/[id]/gates/route.ts`, `cases/[id]/denial/route.ts`, `evidence/route.ts`, `seed/route.ts`
  - Removed `const { isTurso, getTursoClient } = await import('@/lib/db')` and the entire `if (isTurso) { ...raw SQL... } else { ...Prisma... }` branch.
  - Kept ONLY the Prisma branch, replaced dynamic import with `import { db } from '@/lib/db'`.
  - Used `db.case`, `db.denial`, `db.evidence`, `db.decisionTraceEvent`, `db.hitlGate` exactly.

### Verbatim ports (48 routes)
All other routes — they call lib modules + agent-fleet directly, no DB calls. Copied nearly verbatim.

## TypeScript Adaptations (8 minimal — all matching original TS bugs)
1. `execution-paths/route.ts` — removed `ExecutionPath` type import (doesn't include 'auto'); changed `const path: ExecutionPath = body.path || 'auto'` → `const path = (body.path as string) || 'auto'`.
2. `citation-classifier/route.ts` — initialized `let result: Record<string, unknown> = {}`; cast `runCitationClassifierDemo()` and `classifyCitations(inputs)` returns via `as unknown as Record<string, unknown>`.
3. `npi-lookup/route.ts` — widened `dataSource: 'live' | 'mock'` → `dataSource: string` (lib can return 'fallback'); initialized `let result: Record<string, unknown> = {}`; cast `localResult as unknown as Record<string, unknown>`.
4. `outcome-learning/route.ts` — rewrote two `memoryBank.getLearnedPatterns('strategy_weight', denialCategory, payer)` (3-arg form, TS2554) to object form `{ patternType: 'strategy_weight', denialCategory, payer }`. Changed `mbStatus.longTermMemory.store !== 'none'` → `mbStatus.longTermMemory.active`.
5. `six-agent-pipeline/route.ts` — same `getLearnedPatterns` fix; initialized `let result: Record<string, unknown> = {}`.
6. `three-agent-pipeline/route.ts` — initialized `let result: Record<string, unknown> = {}`.
7. `vertical-slice/route.ts` — initialized `let result: Record<string, unknown> = {}`.
8. `full-pipeline/route.ts` — initialized `let result: Record<string, unknown> = {}`.

NO response shape changes — every route returns the exact same JSON envelope as the reference repo.

## Verification
- `bun run lint` → 0 errors, 3 warnings (ALL in src/components/, owned by UI subagent).
- `bunx tsc --noEmit` → 0 errors in src/app/api/. Remaining errors are in examples/, mini-services/, next.config.ts, skills/ — owned by other subagents.
- Spot-check 3 routes via curl against live dev server:
  - GET /api/health → 200 `{"status":"healthy","service":"denialdefender-web",...,"version":"0.2.1"}`
  - GET /api/cases → 200 `{"cases":[],"total":0}` (empty DB, expected)
  - GET /api/full-pipeline → 200 `{"pipeline":"full-pipeline","dataSource":"live",...}` (agent-fleet detected on port 3004)
- Zero `isTurso`/`getTursoClient`/`@libsql`/`libsql` references in src/app/api/.

## Trace-stream contract
No routes fetch localhost:3003 directly. The lib's `emitTraceEvent` (@/lib/decision-trace-stream.ts) persists trace events to the DecisionTraceEvent DB table — already wrapped in try/catch + console.warn by the LIB subagent. The useTraceStream hook subscribes via socket.io to receive re-broadcasts. No additional broadcast code added to routes.
