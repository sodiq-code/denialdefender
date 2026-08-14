"""
DenialDefender Agent Fleet — FastAPI Application.

8-Agent Fleet Service running on port 3004.
Uses Google ADK (Gemini API) for AI-powered medical insurance denial appeals.

Endpoints:
    GET  /health                    — Health check
    POST /agents/triage             — Triage Agent
    POST /agents/evidence           — Evidence Agent
    POST /agents/drafter            — Draft Agent
    POST /agents/reviewer           — Reviewer Agent
    POST /agents/coder              — Medical Coder Agent
    POST /agents/policy             — Policy Analyst Agent
    POST /agents/citation           — Citation Agent
    POST /agents/orchestrator       — Orchestrator Agent (full workflow)
    POST /workflow/run              — Run full appeal workflow
    GET  /workflow/status/{case_id} — Get workflow status
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from config import (
    AGENT_FLEET_PORT,
    CORS_ORIGINS,
    MOCK_MODE,
    SERVICE_NAME,
    SERVICE_VERSION,
)
from agents.triage import TriageAgent
from agents.evidence import EvidenceAgent
from agents.drafter import DraftAgent
from agents.reviewer import ReviewerAgent
from agents.coder import MedicalCoderAgent
from agents.policy import PolicyAnalystAgent
from agents.citation import CitationAgent
from agents.orchestrator import OrchestratorAgent

# ─── Logging Setup ──────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ─── FastAPI App ────────────────────────────────────────────────────
app = FastAPI(
    title=SERVICE_NAME,
    version=SERVICE_VERSION,
    description="8-Agent Fleet for Medical Insurance Denial Appeals using Google ADK + Gemini",
)

# ─── CORS Middleware ────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Agent Instances ────────────────────────────────────────────────
triage_agent = TriageAgent()
evidence_agent = EvidenceAgent()
drafter_agent = DraftAgent()
reviewer_agent = ReviewerAgent()
coder_agent = MedicalCoderAgent()
policy_agent = PolicyAnalystAgent()
citation_agent = CitationAgent()
orchestrator_agent = OrchestratorAgent()

# ─── In-Memory Workflow Status Store ────────────────────────────────
workflow_store: dict[str, dict[str, Any]] = {}


# ═══════════════════════════════════════════════════════════════════
# Pydantic Models
# ═══════════════════════════════════════════════════════════════════

class DenialInput(BaseModel):
    denial_code: str = Field(..., description="CARC/RARC or internal denial code")
    denial_reason: str = Field(..., description="Free-text reason for the denial")
    cpt_code: str = Field(default="", description="CPT procedure code")
    icd10_code: str = Field(default="", description="ICD-10 diagnosis code")
    carrier_name: str = Field(default="", description="Insurance carrier name")
    amount_denied: float = Field(default=0.0, description="Dollar amount denied")


class PatientContext(BaseModel):
    diagnosis: str = Field(default="", description="Patient diagnosis description")
    treatment_history: str = Field(default="", description="Summary of treatment history")
    prior_authorizations: list[str] = Field(default_factory=list, description="List of prior auth reference numbers")


class TriageRequest(BaseModel):
    denial: DenialInput
    patient_context: PatientContext = Field(default_factory=PatientContext)


class EvidenceRequest(BaseModel):
    denial: DenialInput
    patient_context: PatientContext = Field(default_factory=PatientContext)
    triage: dict[str, Any] = Field(default_factory=dict, description="TriageAgent output (if available)")


class DraftRequest(BaseModel):
    denial: DenialInput
    patient_context: PatientContext = Field(default_factory=PatientContext)
    triage: dict[str, Any] = Field(default_factory=dict)
    evidence: dict[str, Any] = Field(default_factory=dict)
    policy: dict[str, Any] = Field(default_factory=dict)
    citations: dict[str, Any] = Field(default_factory=dict)
    coding: dict[str, Any] = Field(default_factory=dict)
    revision_instructions: Optional[str] = Field(default=None, description="Revision instructions from ReviewerAgent")


class ReviewRequest(BaseModel):
    denial: DenialInput
    triage: dict[str, Any] = Field(default_factory=dict)
    evidence: dict[str, Any] = Field(default_factory=dict)
    draft: dict[str, Any] = Field(default_factory=dict)


class CoderRequest(BaseModel):
    denial: DenialInput
    patient_context: PatientContext = Field(default_factory=PatientContext)


class PolicyRequest(BaseModel):
    denial: DenialInput
    patient_context: PatientContext = Field(default_factory=PatientContext)
    triage: dict[str, Any] = Field(default_factory=dict)
    coding: dict[str, Any] = Field(default_factory=dict)


class CitationRequest(BaseModel):
    evidence: dict[str, Any] = Field(default_factory=dict, description="EvidenceAgent output")
    policy: dict[str, Any] = Field(default_factory=dict, description="PolicyAnalystAgent output")
    draft: dict[str, Any] = Field(default_factory=dict, description="DraftAgent output (optional)")


class WorkflowRequest(BaseModel):
    case_id: str = Field(..., description="Unique case identifier")
    denial: DenialInput
    patient_context: PatientContext = Field(default_factory=PatientContext)


class AgentResponse(BaseModel):
    agent: str
    status: str = "success"
    data: dict[str, Any]
    trace: Optional[dict[str, Any]] = None


# ═══════════════════════════════════════════════════════════════════
# Health Check
# ═══════════════════════════════════════════════════════════════════

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": SERVICE_NAME,
        "version": SERVICE_VERSION,
        "mock_mode": MOCK_MODE,
        "port": AGENT_FLEET_PORT,
        "agents": [
            "triage", "evidence", "drafter", "reviewer",
            "coder", "policy", "citation", "orchestrator",
        ],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ═══════════════════════════════════════════════════════════════════
# Individual Agent Endpoints
# ═══════════════════════════════════════════════════════════════════

@app.post("/agents/triage", response_model=AgentResponse)
async def run_triage(request: TriageRequest):
    """Triage Agent: Analyzes denial code + reason, classifies appealability."""
    try:
        input_data = {**request.denial.model_dump()}
        result = await triage_agent.run(input_data)
        trace = result.pop("_trace", None)
        return AgentResponse(agent="triage", data=result, trace=trace)
    except Exception as e:
        logger.error(f"[triage] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agents/evidence", response_model=AgentResponse)
async def run_evidence(request: EvidenceRequest):
    """Evidence Agent: Searches for clinical evidence supporting appeal."""
    try:
        input_data = {
            "denial": request.denial.model_dump(),
            "patient_context": request.patient_context.model_dump(),
            "triage": request.triage,
        }
        result = await evidence_agent.run(input_data)
        trace = result.pop("_trace", None)
        return AgentResponse(agent="evidence", data=result, trace=trace)
    except Exception as e:
        logger.error(f"[evidence] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agents/drafter", response_model=AgentResponse)
async def run_drafter(request: DraftRequest):
    """Draft Agent: Generates appeal letter with citations."""
    try:
        input_data = {
            "denial": request.denial.model_dump(),
            "patient_context": request.patient_context.model_dump(),
            "triage": request.triage,
            "evidence": request.evidence,
            "policy": request.policy,
            "citations": request.citations,
            "coding": request.coding,
        }
        if request.revision_instructions:
            input_data["revision_instructions"] = request.revision_instructions
        result = await drafter_agent.run(input_data)
        trace = result.pop("_trace", None)
        return AgentResponse(agent="drafter", data=result, trace=trace)
    except Exception as e:
        logger.error(f"[drafter] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agents/reviewer", response_model=AgentResponse)
async def run_reviewer(request: ReviewRequest):
    """Quality Review Agent: Reviews draft for completeness and compliance."""
    try:
        input_data = {
            "denial": request.denial.model_dump(),
            "triage": request.triage,
            "evidence": request.evidence,
            "draft": request.draft,
        }
        result = await reviewer_agent.run(input_data)
        trace = result.pop("_trace", None)
        return AgentResponse(agent="reviewer", data=result, trace=trace)
    except Exception as e:
        logger.error(f"[reviewer] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agents/coder", response_model=AgentResponse)
async def run_coder(request: CoderRequest):
    """Medical Coder Agent: Validates CPT/ICD-10 codes against denial."""
    try:
        input_data = {
            "denial": request.denial.model_dump(),
            "patient_context": request.patient_context.model_dump(),
        }
        result = await coder_agent.run(input_data)
        trace = result.pop("_trace", None)
        return AgentResponse(agent="coder", data=result, trace=trace)
    except Exception as e:
        logger.error(f"[coder] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agents/policy", response_model=AgentResponse)
async def run_policy(request: PolicyRequest):
    """Policy Analyst Agent: Searches payer policy for contradictions."""
    try:
        input_data = {
            "denial": request.denial.model_dump(),
            "patient_context": request.patient_context.model_dump(),
            "triage": request.triage,
            "coding": request.coding,
        }
        result = await policy_agent.run(input_data)
        trace = result.pop("_trace", None)
        return AgentResponse(agent="policy", data=result, trace=trace)
    except Exception as e:
        logger.error(f"[policy] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agents/citation", response_model=AgentResponse)
async def run_citation(request: CitationRequest):
    """Citation Agent: Verifies and formats citations with provenance tiers."""
    try:
        input_data = {
            "evidence": request.evidence,
            "policy": request.policy,
            "draft": request.draft,
        }
        result = await citation_agent.run(input_data)
        trace = result.pop("_trace", None)
        return AgentResponse(agent="citation", data=result, trace=trace)
    except Exception as e:
        logger.error(f"[citation] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agents/orchestrator")
async def run_orchestrator(request: WorkflowRequest):
    """Orchestrator Agent: Coordinates the full 8-agent workflow."""
    try:
        input_data = {
            "case_id": request.case_id,
            "denial": request.denial.model_dump(),
            "patient_context": request.patient_context.model_dump(),
        }
        result = await orchestrator_agent.run(input_data)

        # Store workflow status
        workflow_store[request.case_id] = {
            "case_id": request.case_id,
            "workflow_id": result.get("workflow_id"),
            "status": result.get("status"),
            "started_at": result.get("_trace", {}).get("timestamp"),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        return result
    except Exception as e:
        logger.error(f"[orchestrator] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════
# Workflow Endpoints
# ═══════════════════════════════════════════════════════════════════

@app.post("/workflow/run")
async def run_workflow(request: WorkflowRequest):
    """Run the full appeal workflow (orchestrates all 8 agents in sequence)."""
    try:
        input_data = {
            "case_id": request.case_id,
            "denial": request.denial.model_dump(),
            "patient_context": request.patient_context.model_dump(),
        }
        result = await orchestrator_agent.run(input_data)

        # Store workflow status
        workflow_store[request.case_id] = {
            "case_id": request.case_id,
            "workflow_id": result.get("workflow_id"),
            "status": result.get("status"),
            "started_at": result.get("_trace", {}).get("timestamp"),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        return result
    except Exception as e:
        logger.error(f"[workflow] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/workflow/status/{case_id}")
async def get_workflow_status(case_id: str):
    """Get workflow status for a case."""
    if case_id in workflow_store:
        return workflow_store[case_id]
    raise HTTPException(status_code=404, detail=f"Workflow not found for case_id: {case_id}")


# ═══════════════════════════════════════════════════════════════════
# Startup Event
# ═══════════════════════════════════════════════════════════════════

@app.on_event("startup")
async def startup_event():
    mode_label = "MOCK MODE (no Gemini API key)" if MOCK_MODE else "LIVE MODE (Gemini API connected)"
    logger.info(f"🚀 {SERVICE_NAME} v{SERVICE_VERSION} starting on port {AGENT_FLEET_PORT}")
    logger.info(f"   Mode: {mode_label}")
    logger.info(f"   Agents: triage, evidence, drafter, reviewer, coder, policy, citation, orchestrator")
    logger.info(f"   Endpoints: /health, /agents/*, /workflow/run, /workflow/status/{{case_id}}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=AGENT_FLEET_PORT)
