# Task 2 — Fix "Good Draft FAIL" Content Hash Mismatch

## Summary
Fixed the Gate Test "Good Draft FAIL" bug where the letter-drafting agent's `mockExecute()` used hardcoded content hashes that didn't match the evidence-assembly mock's computed hashes from `generateContentHash()`.

## Changes Made

### 1. `/home/z/my-project/src/lib/agents/evidence-assembly.ts`
- Added `export` keyword to `generateContentHash` function (line 59) so it can be imported by letter-drafting.ts

### 2. `/home/z/my-project/src/lib/agents/letter-drafting.ts`
- Added import: `import { generateContentHash } from './evidence-assembly';`
- Replaced 5 hardcoded content hashes in `mockExecute()` with `generateContentHash()` calls using the same source strings as the evidence-assembly mock:
  - `'a1b2c3d4'` → `generateContentHash('CMS Medicare Policy Manual Section 1862')`
  - `'e5f6g7h8'` → `generateContentHash('AAOS Clinical Practice Guidelines Chapter 4')`
  - `'i9j0k1l2'` → `generateContentHash('JBJS Long-term outcomes TKA')`
  - `'m3n4o5p6'` → `generateContentHash('AHRQ Evidence Report TKA')`
  - `'q7r8s9t0'` → `generateContentHash('LCD coverage criteria mock')`

## Verification
- `bun run lint`: 0 errors (only pre-existing warnings)
- Content hashes now match exactly between evidence-assembly mock and letter-drafting mock, so quality review agent's `execute()` will find matching `evidenceId` + `contentHash` pairs and Gate Test should pass.
