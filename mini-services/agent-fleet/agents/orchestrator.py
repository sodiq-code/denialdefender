"""
Orchestrator Agent — Coordinates the full 8-agent workflow.

Manages the sequential execution of all agents in the DenialDefender
pipeline, including revision loops and HITL gate management.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from agents.base import BaseAgent
from agents.triage import TriageAgent
from agents.evidence import EvidenceAgent
from agents.drafter import DraftAgent
from agents.reviewer import ReviewerAgent
from agents.coder import MedicalCoderAgent
from agents.policy import PolicyAnalystAgent
from agents.citation import CitationAgent
from config import MAX_REVISION_LOOPS

logger = logging.getLogger(__name__)


class OrchestratorAgent(BaseAgent):
    name = "orchestrator"
    role = "Orchestrator Agent — Full 8-agent workflow coordination"

    system_prompt = """You are the Orchestrator Agent in DenialDefender.
You coordinate the full 8-agent appeal workflow. You do not generate content yourself —
you manage the pipeline of specialized agents and ensure quality through revision loops.
You present the final result to the human via HITL Gate 2 for approval."""

    def __init__(self) -> None:
        super().__init__()
        # Initialize all sub-agents
        self.triage = TriageAgent()
        self.coder = MedicalCoderAgent()
        self.policy = PolicyAnalystAgent()
        self.evidence = EvidenceAgent()
        self.citation = CitationAgent()
        self.drafter = DraftAgent()
        self.reviewer = ReviewerAgent()

    async def mock_run(self, input_data: dict) -> dict:
        """Orchestrator doesn't have its own mock — it runs the full pipeline."""
        return await self.run_workflow(input_data)

    async def run(self, input_data: dict) -> dict:
        """Override base run to use workflow instead of Gemini call."""
        trace_id = str(uuid.uuid4())
        start_time = datetime.now(timezone.utc)

        try:
            result = await self.run_workflow(input_data)
            elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
            result["_trace"] = {
                "agent": self.name,
                "trace_id": trace_id,
                "elapsed_seconds": round(elapsed, 3),
                "timestamp": start_time.isoformat(),
            }
            return result
        except Exception as e:
            elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
            logger.error(f"[orchestrator] Workflow FAILED: {e}")
            return {
                "status": "failed",
                "error": str(e),
                "_trace": {
                    "agent": self.name,
                    "trace_id": trace_id,
                    "elapsed_seconds": round(elapsed, 3),
                    "timestamp": start_time.isoformat(),
                    "error": str(e),
                },
            }

    async def run_workflow(self, input_data: dict) -> dict:
        """
        Execute the full 8-agent workflow:
        1. Triage → if NOT_APPEALABLE, stop and flag for human
        2. MedicalCoder → validate codes
        3. PolicyAnalyst → find policy contradictions
        4. Evidence → gather clinical evidence
        5. Citation → verify and format citations
        6. Draft → generate appeal letter
        7. Review → quality check
        8. If review flags issues, loop back to step 6 (max 3 times)
        9. Present to human via HITL Gate 2
        """
        case_id = input_data.get("case_id", str(uuid.uuid4()))
        workflow_id = str(uuid.uuid4())
        decision_traces: list[dict[str, Any]] = []

        denial = input_data.get("denial", {})
        patient_context = input_data.get("patient_context", {})

        logger.info(f"[orchestrator] Starting workflow | case_id={case_id} | workflow_id={workflow_id}")

        # ── Step 1: Triage ──────────────────────────────────────────
        logger.info(f"[orchestrator] Step 1/8: Running TriageAgent")
        triage_input = {**denial}
        triage_result = await self.triage.run(triage_input)
        decision_traces.append({
            "step": 1,
            "agent": "triage",
            "timestamp": self._now_iso(),
            "result_summary": {
                "classification": triage_result.get("classification"),
                "confidence": triage_result.get("confidence"),
                "strategy": triage_result.get("strategy"),
            },
        })

        # If NOT_APPEALABLE, stop and flag for human
        if triage_result.get("classification") == "NOT_APPEALABLE":
            logger.info(f"[orchestrator] Denial classified as NOT_APPEALABLE — stopping workflow")
            return {
                "case_id": case_id,
                "workflow_id": workflow_id,
                "status": "needs_review",
                "triage": triage_result,
                "workflow_stopped_at": "triage",
                "stop_reason": "Denial classified as NOT_APPEALABLE — requires human judgment",
                "decision_traces": decision_traces,
                "hitl_gate": {
                    "gate_type": "gate_1",
                    "status": "pending_approval",
                    "content": "Triage classified this denial as NOT_APPEALABLE. Human review required to determine if appeal should proceed.",
                },
            }

        # ── Step 2: Medical Coder ───────────────────────────────────
        logger.info(f"[orchestrator] Step 2/8: Running MedicalCoderAgent")
        coder_input = {"denial": denial, "patient_context": patient_context}
        coder_result = await self.coder.run(coder_input)
        decision_traces.append({
            "step": 2,
            "agent": "coder",
            "timestamp": self._now_iso(),
            "result_summary": {
                "validation_result": coder_result.get("validation_result"),
                "coding_action_required": coder_result.get("coding_action_required"),
            },
        })

        # ── Step 3: Policy Analyst ──────────────────────────────────
        logger.info(f"[orchestrator] Step 3/8: Running PolicyAnalystAgent")
        policy_input = {
            "denial": denial,
            "patient_context": patient_context,
            "triage": triage_result,
            "coding": coder_result,
        }
        policy_result = await self.policy.run(policy_input)
        decision_traces.append({
            "step": 3,
            "agent": "policy",
            "timestamp": self._now_iso(),
            "result_summary": {
                "contradictions_count": len(policy_result.get("contradictions_found", [])),
                "patient_meets_criteria": policy_result.get("patient_meets_criteria"),
            },
        })

        # ── Step 4: Evidence ────────────────────────────────────────
        logger.info(f"[orchestrator] Step 4/8: Running EvidenceAgent")
        evidence_input = {
            "denial": denial,
            "patient_context": patient_context,
            "triage": triage_result,
        }
        evidence_result = await self.evidence.run(evidence_input)
        decision_traces.append({
            "step": 4,
            "agent": "evidence",
            "timestamp": self._now_iso(),
            "result_summary": {
                "evidence_count": len(evidence_result.get("evidence_items", [])),
                "overall_strength": evidence_result.get("overall_evidence_strength"),
            },
        })

        # ── Step 5: Citation ────────────────────────────────────────
        logger.info(f"[orchestrator] Step 5/8: Running CitationAgent")
        citation_input = {
            "evidence": evidence_result,
            "policy": policy_result,
        }
        citation_result = await self.citation.run(citation_input)
        decision_traces.append({
            "step": 5,
            "agent": "citation",
            "timestamp": self._now_iso(),
            "result_summary": {
                "verified_count": len(citation_result.get("verified_citations", [])),
                "overall_quality": citation_result.get("overall_citation_quality"),
            },
        })

        # ── Step 6-8: Draft → Review → (revise if needed) ──────────
        draft_result = None
        review_result = None

        for revision_loop in range(MAX_REVISION_LOOPS):
            loop_label = f"revision_{revision_loop}" if revision_loop > 0 else "initial"

            # Step 6: Draft
            logger.info(f"[orchestrator] Step 6/8: Running DraftAgent ({loop_label})")
            draft_input = {
                "denial": denial,
                "patient_context": patient_context,
                "triage": triage_result,
                "evidence": evidence_result,
                "policy": policy_result,
                "citations": citation_result,
                "coding": coder_result,
            }
            if review_result and review_result.get("revision_instructions"):
                draft_input["revision_instructions"] = review_result["revision_instructions"]

            draft_result = await self.drafter.run(draft_input)
            decision_traces.append({
                "step": 6,
                "agent": "drafter",
                "timestamp": self._now_iso(),
                "revision_loop": revision_loop,
                "result_summary": {
                    "word_count": draft_result.get("word_count"),
                    "citations_count": len(draft_result.get("citations_used", [])),
                },
            })

            # Step 7: Review
            logger.info(f"[orchestrator] Step 7/8: Running ReviewerAgent ({loop_label})")
            review_input = {
                "denial": denial,
                "triage": triage_result,
                "evidence": evidence_result,
                "draft": draft_result,
            }
            review_result = await self.reviewer.run(review_input)
            decision_traces.append({
                "step": 7,
                "agent": "reviewer",
                "timestamp": self._now_iso(),
                "revision_loop": revision_loop,
                "result_summary": {
                    "verdict": review_result.get("overall_verdict"),
                    "score": review_result.get("overall_score"),
                },
            })

            # Step 8: Check if revision needed
            if review_result.get("overall_verdict") == "APPROVED":
                logger.info(f"[orchestrator] Draft APPROVED by reviewer (loop {revision_loop})")
                break
            elif review_result.get("overall_verdict") == "REJECTED":
                logger.warning(f"[orchestrator] Draft REJECTED by reviewer (loop {revision_loop})")
                break
            else:
                logger.info(f"[orchestrator] Draft NEEDS_REVISION (loop {revision_loop}), will retry")
                if revision_loop == MAX_REVISION_LOOPS - 1:
                    logger.warning(f"[orchestrator] Max revision loops reached, proceeding with current draft")

        # ── Step 9: Present to Human via HITL Gate 2 ───────────────
        final_status = "completed"
        if review_result and review_result.get("overall_verdict") == "NEEDS_REVISION":
            final_status = "needs_review"

        logger.info(f"[orchestrator] Workflow complete | case_id={case_id} | status={final_status}")

        return {
            "case_id": case_id,
            "workflow_id": workflow_id,
            "status": final_status,
            "triage": triage_result,
            "coder": coder_result,
            "policy": policy_result,
            "evidence": evidence_result,
            "citation": citation_result,
            "draft": draft_result,
            "review": review_result,
            "decision_traces": decision_traces,
            "hitl_gate": {
                "gate_type": "gate_2",
                "status": "pending_approval",
                "content": (
                    "Appeal letter generated and reviewed. "
                    "Human approval required before submission. "
                    f"Review verdict: {review_result.get('overall_verdict', 'N/A') if review_result else 'N/A'}, "
                    f"Score: {review_result.get('overall_score', 'N/A') if review_result else 'N/A'}"
                ),
            },
        }
