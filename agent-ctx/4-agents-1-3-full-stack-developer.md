# Task 4: Agents 1–3 — Advocate, Triage, Policy Research

## Summary
Implemented Day 4 of DenialDefender: three formal ADK-style agents with a pipeline that stops at HITL Gate 1.

## Files Created
- `src/lib/agents/base-agent.ts` — Abstract base class with typed generics, latency, traces, mock fallback
- `src/lib/agents/patient-advocate.ts` — Empathetic intake, urgency assessment, deadline extraction
- `src/lib/agents/denial-triage.ts` — Denial parsing, structured JSON, classification, humanConfirmPrompt
- `src/lib/agents/policy-research-agent.ts` — Policy clause retrieval with provenance cards (topK:3)
- `src/lib/three-agent-pipeline.ts` — Pipeline: Advocate → Triage → [Gate 1] → Policy Research
- `src/app/api/three-agent-pipeline/route.ts` — POST (run pipeline), GET (info)
- `src/app/api/three-agent-pipeline/resume/route.ts` — POST (resolve Gate 1)
- `src/components/three-agent-pipeline-panel.tsx` — Full UI panel

## Files Modified
- `src/app/page.tsx` — Added "Day 4: Agents 1-3" tab

## Key Behaviors
- Pipeline STOPS at Gate 1 — Policy Research ONLY runs after human approves
- Gate 1 rejected → pipeline stops (policyResearch = null, pipelineStatus = 'gate1_rejected')
- Case states transition: created → triage_active → hitl_gate_1 → evidence_active → triage_complete
- Decision traces written to DB at every step
- Policy Research returns real clauses from evidence corpus with provenance cards

## API Verification
- POST /api/three-agent-pipeline → runs Advocate+Triage, creates Gate 1, returns awaiting_gate1
- POST /api/three-agent-pipeline/resume (approved) → runs Policy Research, returns 3 clauses
- POST /api/three-agent-pipeline/resume (rejected) → pipeline stops
