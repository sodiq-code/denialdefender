# Task 5: GEAP Agent Registry with Discovery/Versioning

## Summary
Built a proper GEAP Agent Registry as one of the 7 GEAP components for the Fortified Enterprise Fleet track.

## Files Created/Modified

### Created
- **`src/lib/agent-registry.ts`** — Full Agent Registry library with:
  - `AgentRegistration` interface with all required fields (name, displayName, version, description, category, capabilities, tools, inputSchema, outputSchema, permissions, healthStatus, lastExecution, endpoint, model)
  - Auto-registration of all 8 DenialDefender agents on module import
  - `registerAgent()` — Register/update an agent
  - `getAgent()` — Get agent by name
  - `listAgents()` — List agents with category/capability filtering
  - `searchByCapability()` — Search agents by capability (sorted by health)
  - `searchByTool()` / `searchByPermission()` — Additional discovery methods
  - `updateHealthStatus()` / `bulkHealthUpdate()` — Health tracking
  - `areVersionCompatible()` / `getVersionCompatibility()` — Semver version compatibility checks
  - `getRegistrySummary()` — Registry state summary
  - `getAllCapabilities()` / `getAllTools()` — Catalog all capabilities/tools
  - `runRegistryDemo()` — Demo moment for governance demo route
  - Registry events emitted to decision trace

- **`src/app/api/governance/registry/route.ts`** — API route:
  - GET: Query registry with params: `?agent=`, `?category=`, `?capability=`, `?format=summary|capabilities|tools|events|demo`, `?version_compat=`
  - POST: Update agent health status

### Modified
- **`src/app/api/governance/demo/route.ts`** — Added agent registry demo to governance demo response

## Agent Catalog (8 agents registered)
1. Patient Advocate (core, v1.0.0) — 5 capabilities
2. Denial Triage (core, v1.0.0) — 6 capabilities
3. Policy Research (core, v1.0.0) — 5 capabilities
4. Evidence Assembly (core, v1.0.0) — 5 capabilities
5. Letter Drafting (core, v1.1.0) — 5 capabilities
6. Quality Review (governance, v1.1.0) — 6 capabilities
7. Outcome Learning (learning, v1.0.0) — 5 capabilities
8. Compliance & Deadline (governance, v1.0.0) — 6 capabilities

Total: 41 unique capabilities across 8 agents

## Verification
- Lint: ✅ Pass (0 errors)
- API `/api/governance/registry`: ✅ Returns all 8 agents
- API `/api/governance/registry?format=summary`: ✅ Returns summary (8 agents, 5 core/2 governance/1 learning)
- API `/api/governance/registry?agent=denial-triage`: ✅ Returns specific agent
- API `/api/governance/registry?category=governance`: ✅ Returns 2 governance agents
- API `/api/governance/registry?format=capabilities`: ✅ Returns 41 unique capabilities
- API `/api/governance/registry?format=demo`: ✅ Returns full demo with discovery examples and version compatibility
