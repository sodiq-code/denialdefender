# Task 2-b: Cloud Run Deployment Configurations

## Agent: Cloud Run Deployment Config
## Task ID: 2-b

### Summary
Created all Cloud Run deployment configurations proving production-readiness for GCP deployment.

### Files Created

1. **`infra/gcp/cloudrun/nextjs-service.yaml`** — Cloud Run service definition for Next.js
   - 2 vCPU / 1 GiB, concurrency 80, scale 0-4, public ingress
   - Health probes, VPC connector, secret refs for Gemini API key + DB connection

2. **`infra/gcp/cloudrun/agent-fleet-service.yaml`** — Cloud Run service for Python ADK agent fleet
   - 4 vCPU / 2 GiB, concurrency 10, scale 0-10, internal-only ingress
   - Pub/Sub push subscriber, health probes, PHI guard config secret

3. **`infra/gcp/cloudrun/deploy.sh`** — Production deployment script
   - Pre-flight checks, Cloud Build + Cloud Run deploy, Pub/Sub push subscription config
   - CLI flags: --web-only, --agents-only

4. **`Dockerfile`** (project root) — Multi-stage Next.js production build
   - node:20-alpine, standalone output, non-root user, healthcheck

5. **`mini-services/agent-fleet/Dockerfile`** — Multi-stage Python agent fleet build
   - python:3.12-slim, venv, uvicorn, non-root user, healthcheck

6. **`mini-services/agent-fleet/requirements.txt`** — Python dependencies

7. **`infra/gcp/architecture-diagram.md`** — 4 Mermaid diagrams + tables + cost estimate

### Files Updated

8. **`infra/gcp/cloud-sql-schema.sql`** — Updated embedding model comment to text-embedding-004

### Key Decisions
- Web service: Public ingress (users access via browser)
- Agent fleet: Internal-only ingress (invoked via Pub/Sub push from web service)
- Both services: Scale-to-zero for cost efficiency during hackathon
- VPC connector: Required for Cloud SQL pgvector access from Cloud Run
- Health probes: Configured for both services to ensure reliable routing
