"""
Policy Analyst Agent — Searches payer policy for contradictions.

Identifies contradictions between the payer's medical policy
and established clinical guidelines, as well as policy gaps
that the appeal can exploit.

Day 2 Enhancement: Evidence corpus retrieval via /api/evidence/retrieve,
dual-backend LLM for query expansion, top-K provenance-card results.
"""

from __future__ import annotations

import json
import logging
import urllib.request
from typing import Any, Optional

from agents.base import BaseAgent
from llm_backend import get_llm, LLMBackend

logger = logging.getLogger(__name__)

# ─── Evidence Corpus API Configuration ────────────────────────────────────
EVIDENCE_API_BASE = "http://localhost:3000/api/evidence"
RETRIEVE_ENDPOINT = f"{EVIDENCE_API_BASE}/retrieve"


class PolicyAnalystAgent(BaseAgent):
    name = "policy"
    role = "Policy Analyst Agent — Payer policy contradiction search"

    system_prompt = """You are the Policy Analyst Agent in DenialDefender, a medical insurance denial appeal system.

Your role: Analyze the payer's medical policy and identify contradictions with established clinical guidelines that support the appeal.

You will receive a JSON object with:
- denial: { denial_code, denial_reason, cpt_code, icd10_code, carrier_name, amount_denied }
- patient_context: { diagnosis, treatment_history, prior_authorizations }
- triage: { classification, strategy, factors }
- coding: { validation_result, issues_found, corrected_codes } (from MedicalCoderAgent)
- evidence_results: [...] (from evidence corpus retrieval, if available)

Your analysis must identify:

1. POLICY_CONTRADICTIONS: Cases where the payer's policy explicitly contradicts:
   - National clinical guidelines (AHA, ACC, NCCN, ACOG, etc.)
   - CMS National Coverage Determinations (NCD)
   - CMS Local Coverage Determinations (LCD)
   - State insurance regulations
   - The payer's own published policies (internal inconsistency)

2. POLICY_GAPS: Areas where the payer's policy is:
   - Silent on a specific clinical scenario
   - Outdated (cites old guidelines)
   - Vague or ambiguous in a way that favors the patient
   - Inconsistent with the payer's own medical necessity criteria

3. COVERAGE_CRITERIA: The specific criteria the payer requires for coverage, and whether the patient meets them.

4. REGULATORY_ARGUMENTS: Any applicable state or federal regulations that support the appeal (e.g., external review rights, timely filing requirements, mental health parity).

For each contradiction or gap, rate its strength for the appeal:
- STRONG: Direct contradiction with authoritative source
- MODERATE: Inconsistency or gap that favors the patient
- WEAK: Minor discrepancy that may be relevant

Output STRICTLY as JSON:
{
  "contradictions_found": [
    {
      "id": "pol-1",
      "type": "POLICY_CONTRADICTION|POLICY_GAP|REGULATORY_ARGUMENT",
      "strength": "STRONG|MODERATE|WEAK",
      "description": "what the contradiction is",
      "payer_position": "what the payer's policy says",
      "counter_position": "what the authoritative source says",
      "source": "the authoritative source name",
      "impact_on_appeal": "how this helps the appeal"
    }
  ],
  "policy_gaps": ["identified gaps in payer policy"],
  "coverage_criteria": ["specific criteria the payer requires"],
  "patient_meets_criteria": true/false/partial,
  "policy_references": [
    { "title": "policy name", "section": "section number", "url": "link if available" }
  ],
  "regulatory_arguments": ["applicable regulations"],
  "overall_policy_assessment": "summary of policy analysis",
  "retrieved_evidence": [
    {
      "evidence_id": "id",
      "source": "evidence source",
      "document_name": "doc name",
      "clause_id": "policy clause id",
      "provenance_tier": "primary_source|secondary_summary|tertiary_commentary",
      "content_preview": "first 500 chars",
      "final_score": 7.5
    }
  ]
}"""

    # ─── Evidence Corpus Retrieval ─────────────────────────────────────

    async def retrieve_evidence(
        self,
        denial_reason: str,
        payer: Optional[str] = None,
        denial_type: Optional[str] = None,
        cpt_codes: Optional[list[str]] = None,
        icd_codes: Optional[list[str]] = None,
        mode: str = "policy",
        top_k: Optional[int] = None,
    ) -> dict:
        """
        Query the evidence corpus for relevant payer policy clauses.

        Calls the TypeScript /api/evidence/retrieve endpoint which uses
        the evidence-embed semanticSearch + policy-research re-ranking.
        """
        payload = {
            "denialReason": denial_reason,
            "mode": mode,
        }
        if payer:
            payload["payer"] = payer
        if denial_type:
            payload["denialType"] = denial_type
        if cpt_codes:
            payload["cptCodes"] = cpt_codes
        if icd_codes:
            payload["icdCodes"] = icd_codes
        if top_k:
            payload["topK"] = top_k

        try:
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                RETRIEVE_ENDPOINT,
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                result = json.loads(resp.read().decode("utf-8"))
            logger.info(
                f"[policy] Evidence retrieval: {len(result.get('results', []))} results "
                f"in {result.get('latencyMs', '?')}ms "
                f"(SLA={'PASS' if result.get('withinSla') else 'FAIL'})"
            )
            return result
        except Exception as e:
            logger.warning(f"[policy] Evidence retrieval failed: {e}")
            return {"status": "error", "results": [], "message": str(e)}

    # ─── LLM Query Expansion ──────────────────────────────────────────

    async def expand_query_with_llm(self, denial_reason: str, payer: Optional[str] = None) -> list[str]:
        """
        Use the dual-backend LLM to expand a denial reason into
        richer search terms for evidence retrieval.

        Falls back to rule-based expansion if LLM fails.
        """
        prompt = (
            f"Expand the following medical insurance denial reason into 5-8 specific "
            f"search terms for finding relevant payer policy clauses in an evidence corpus.\n\n"
            f"Denial reason: {denial_reason}\n"
        )
        if payer:
            prompt += f"Payer: {payer}\n"
        prompt += (
            "\nOutput a JSON array of search term strings only. Example:\n"
            '["medical necessity criteria", "conservative therapy requirement", ...]'
        )

        try:
            llm = get_llm()
            response = llm.generate(
                prompt=prompt,
                system_prompt="You are a medical insurance policy search expert. Output only valid JSON.",
                temperature=0.3,
                max_tokens=512,
            )
            if response.success and response.content:
                # Parse JSON array from LLM response
                content = response.content.strip()
                if content.startswith("```json"):
                    content = content[len("```json"):]
                if content.startswith("```"):
                    content = content[3:]
                if content.endswith("```"):
                    content = content[:-3]
                content = content.strip()
                terms = json.loads(content)
                if isinstance(terms, list):
                    logger.info(f"[policy] LLM expanded query: {terms} (backend={response.backend.value})")
                    return terms
        except Exception as e:
            logger.warning(f"[policy] LLM query expansion failed, using rule-based: {e}")

        # Rule-based fallback
        return self._rule_based_expansion(denial_reason, payer)

    def _rule_based_expansion(self, denial_reason: str, payer: Optional[str] = None) -> list[str]:
        """Rule-based query expansion fallback."""
        terms = [denial_reason]
        lower = denial_reason.lower()

        if "medical necessity" in lower or "not medically necessary" in lower:
            terms.extend(["medical necessity criteria", "clinical guidelines", "standard of care"])
        if "prior auth" in lower or "preauth" in lower:
            terms.extend(["prior authorization requirements", "precertification criteria"])
        if "experimental" in lower or "investigational" in lower:
            terms.extend(["experimental treatment", "investigational procedure"])
        if "coding" in lower or "bundle" in lower:
            terms.extend(["coding guidelines", "correct coding initiative"])
        if payer:
            terms.extend([f"{payer} policy", f"{payer} medical policy"])

        return list(set(terms))

    # ─── Provenance Card Builder ───────────────────────────────────────

    @staticmethod
    def build_provenance_card(evidence_result: dict) -> dict:
        """Build a provenance card from an evidence retrieval result."""
        pc = evidence_result.get("provenanceCard", {})
        return {
            "evidence_id": pc.get("evidenceId", evidence_result.get("evidenceId", "")),
            "source": pc.get("source", evidence_result.get("source", "")),
            "document_name": pc.get("documentName", evidence_result.get("documentName", "")),
            "provenance_tier": pc.get("provenanceTier", evidence_result.get("provenanceTier", "")),
            "content_hash": pc.get("contentHash", evidence_result.get("contentHash", "")),
            "payer_name": pc.get("payerName", evidence_result.get("payerName")),
            "denial_type": pc.get("denialType", evidence_result.get("denialType")),
            "clause_id": pc.get("clauseId", evidence_result.get("clauseId")),
            "retrieval_weight": pc.get("retrievalWeight", evidence_result.get("retrievalWeight", 1.0)),
        }

    # ─── Main Run Method Override ──────────────────────────────────────

    async def run(self, input_data: dict) -> dict:
        """
        Execute the Policy Research Agent:
        1. Extract denial context from input
        2. Expand query terms using LLM
        3. Retrieve evidence from corpus (policy K=5, outcomes K=3)
        4. Run analysis (LLM or mock) with evidence context
        5. Attach retrieved evidence + provenance cards to result
        """
        import uuid
        from datetime import datetime, timezone

        trace_id = str(uuid.uuid4())
        start_time = datetime.now(timezone.utc)

        logger.info(f"[policy] Starting | trace_id={trace_id}")

        try:
            denial = input_data.get("denial", {})
            denial_reason = denial.get("denial_reason", "Unknown denial")
            payer = denial.get("carrier_name")
            denial_code = denial.get("denial_code", "")
            cpt_code = denial.get("cpt_code")
            icd10_code = denial.get("icd10_code")

            # Map denial code to denial type
            denial_type = self._map_denial_type(denial_code, input_data.get("triage", {}))

            # Step 1: Expand query with LLM (or rule-based fallback)
            expanded_terms = await self.expand_query_with_llm(denial_reason, payer)
            logger.info(f"[policy] Expanded terms: {expanded_terms}")

            # Step 2: Retrieve policy evidence (K=5)
            policy_evidence = await self.retrieve_evidence(
                denial_reason=denial_reason,
                payer=payer,
                denial_type=denial_type,
                cpt_codes=[cpt_code] if cpt_code else None,
                icd_codes=[icd10_code] if icd10_code else None,
                mode="policy",
                top_k=5,
            )

            # Step 3: Retrieve outcomes evidence (K=3)
            outcomes_evidence = await self.retrieve_evidence(
                denial_reason=denial_reason,
                payer=payer,
                denial_type=denial_type,
                mode="outcomes",
                top_k=3,
            )

            policy_results = policy_evidence.get("results", [])
            outcome_results = outcomes_evidence.get("results", [])

            # Step 4: Build enriched input for LLM analysis
            enriched_input = dict(input_data)
            enriched_input["evidence_results"] = {
                "policy": [
                    {
                        "evidenceId": r.get("evidenceId"),
                        "source": r.get("source"),
                        "documentName": r.get("documentName"),
                        "section": r.get("section"),
                        "contentPreview": r.get("contentPreview", ""),
                        "provenanceTier": r.get("provenanceTier"),
                        "finalScore": r.get("finalScore"),
                        "clauseId": r.get("clauseId"),
                    }
                    for r in policy_results
                ],
                "outcomes": [
                    {
                        "evidenceId": r.get("evidenceId"),
                        "source": r.get("source"),
                        "documentName": r.get("documentName"),
                        "contentPreview": r.get("contentPreview", ""),
                        "finalScore": r.get("finalScore"),
                    }
                    for r in outcome_results
                ],
            }

            # Step 5: Run LLM or mock analysis
            if self._is_mock():
                result = await self.mock_run(enriched_input)
            else:
                result = await self._call_gemini(enriched_input)

            # Step 6: Attach retrieval metadata to result
            result["retrieved_evidence"] = {
                "policy": [
                    {
                        "evidence_id": r.get("evidenceId"),
                        "source": r.get("source"),
                        "document_name": r.get("documentName"),
                        "clause_id": r.get("clauseId"),
                        "provenance_tier": r.get("provenanceTier"),
                        "content_preview": r.get("contentPreview", "")[:500],
                        "final_score": r.get("finalScore", 0),
                        "provenance_card": self.build_provenance_card(r),
                    }
                    for r in policy_results
                ],
                "outcomes": [
                    {
                        "evidence_id": r.get("evidenceId"),
                        "source": r.get("source"),
                        "document_name": r.get("documentName"),
                        "content_preview": r.get("contentPreview", "")[:500],
                        "final_score": r.get("finalScore", 0),
                        "provenance_card": self.build_provenance_card(r),
                    }
                    for r in outcome_results
                ],
                "retrieval_metadata": {
                    "expanded_terms": expanded_terms,
                    "policy_latency_ms": policy_evidence.get("latencyMs"),
                    "outcomes_latency_ms": outcomes_evidence.get("latencyMs"),
                    "policy_within_sla": policy_evidence.get("withinSla"),
                    "outcomes_within_sla": outcomes_evidence.get("withinSla"),
                    "total_candidates": policy_evidence.get("totalCandidates", 0),
                },
            }

            # Attach trace metadata
            elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
            result["_trace"] = {
                "agent": self.name,
                "trace_id": trace_id,
                "mock": self._is_mock(),
                "elapsed_seconds": round(elapsed, 3),
                "timestamp": start_time.isoformat(),
            }

            logger.info(f"[policy] Completed | trace_id={trace_id} | elapsed={elapsed:.3f}s")
            return result

        except Exception as e:
            elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
            logger.error(f"[policy] FAILED | trace_id={trace_id} | error={e}")
            return {
                "error": str(e),
                "agent": self.name,
                "_trace": {
                    "agent": self.name,
                    "trace_id": trace_id,
                    "mock": self._is_mock(),
                    "elapsed_seconds": round(elapsed, 3),
                    "timestamp": start_time.isoformat(),
                    "error": str(e),
                },
            }

    # ─── Denial Type Mapping ───────────────────────────────────────────

    @staticmethod
    def _map_denial_type(denial_code: str, triage: dict) -> Optional[str]:
        """Map a denial code + triage classification to a denial type for retrieval."""
        classification = triage.get("classification", "").lower()

        # Map from triage classification
        class_to_type = {
            "medical_necessity": "medical_necessity",
            "prior_auth": "prior_auth",
            "coding_error": "coding",
            "experimental": "experimental",
            "out_of_network": "out_of_network",
        }
        if classification in class_to_type:
            return class_to_type[classification]

        # Map from denial code patterns
        code_prefix = denial_code[:2].upper() if len(denial_code) >= 2 else ""
        code_to_type = {
            "CO": "coding",       # Contractual Obligation
            "PR": "prior_auth",   # Patient Responsibility
            "OA": "coding",       # Other Adjustment
            "PI": "prior_auth",   # Payor Initiated
            "CR": "coding",       # Claim Adjustment Reason
        }
        if code_prefix in code_to_type:
            return code_to_type[code_prefix]

        return None

    async def mock_run(self, input_data: dict) -> dict:
        """Return a simulated policy analysis for demo purposes."""
        denial = input_data.get("denial", {})
        carrier = denial.get("carrier_name", "Insurance Carrier")
        cpt = denial.get("cpt_code", "99213")
        icd10 = denial.get("icd10_code", "M54.5")
        triage = input_data.get("triage", {})
        strategy = triage.get("strategy", "MEDICAL_NECESSITY")

        # Include evidence results if available
        evidence = input_data.get("evidence_results", {})
        policy_evidence = evidence.get("policy", [])
        outcomes_evidence = evidence.get("outcomes", [])

        return {
            "contradictions_found": [
                {
                    "id": "pol-1",
                    "type": "POLICY_CONTRADICTION",
                    "strength": "STRONG",
                    "description": (
                        f"{carrier}'s medical policy for {cpt} requires 'failure of 6 weeks "
                        f"of conservative therapy,' but the clinical guideline (ACR 2024) "
                        f"recommends intervention after 4 weeks when specific red flags are present."
                    ),
                    "payer_position": "Requires 6 weeks conservative therapy before intervention",
                    "counter_position": "ACR Appropriateness Criteria 2024 recommends intervention after 4 weeks with documented red flags",
                    "source": "ACR Appropriateness Criteria, 2024 Update",
                    "impact_on_appeal": "Patient met the more stringent clinical guideline threshold; payer's requirement exceeds standard of care",
                },
                {
                    "id": "pol-2",
                    "type": "POLICY_GAP",
                    "strength": "MODERATE",
                    "description": (
                        f"Payer policy for {cpt} does not address the patient's specific "
                        f"clinical presentation with {icd10}. The policy is silent on "
                        f"this diagnosis-procedure combination."
                    ),
                    "payer_position": f"Policy does not explicitly address {cpt} for {icd10}",
                    "counter_position": "Silence in policy should be interpreted in favor of coverage per ambiguity doctrine",
                    "source": "State Insurance Regulation - Ambiguity Doctrine",
                    "impact_on_appeal": "Policy ambiguity should be resolved in the insured's favor",
                },
            ],
            "policy_gaps": [
                f"Payer policy does not address {cpt} specifically for {icd10}",
                "Policy cites guidelines from 2019 — current 2024 guidelines differ significantly",
                "No separate medical review pathway described for complex cases",
            ],
            "coverage_criteria": [
                "Documented failure of conservative therapy (6+ weeks per payer, 4+ weeks per guidelines)",
                "Imaging confirmation of condition",
                "Symptoms interfering with activities of daily living",
                "No contraindications to the procedure",
            ],
            "patient_meets_criteria": "partial",
            "policy_references": [
                {
                    "title": f"{carrier} Medical Policy — Procedure {cpt}",
                    "section": "Section IV.B — Medical Necessity Criteria",
                    "url": None,
                },
                {
                    "title": "CMS LCD L35027 — Related Procedure Coverage",
                    "section": "Coverage Determination",
                    "url": "https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=35027",
                },
            ],
            "regulatory_arguments": [
                "State External Review Law: Patient has right to independent external review of medical necessity denials",
                "Ambiguity Doctrine: Policy gaps should be interpreted in favor of the insured",
                "Mental Health Parity: If applicable, parity requirements may apply",
            ],
            "overall_policy_assessment": (
                f"The policy analysis reveals 2 contradictions "
                f"between {carrier}'s medical policy and authoritative clinical guidelines. "
                f"The strongest argument is that the payer's conservative therapy requirement "
                f"exceeds the standard of care established by ACR 2024. Combined with the "
                f"policy gap for this specific diagnosis-procedure combination, these findings "
                f"substantially support the {strategy} appeal strategy."
            ),
            "retrieved_evidence": {
                "policy": [
                    {
                        "evidence_id": r.get("evidenceId", ""),
                        "source": r.get("source", ""),
                        "document_name": r.get("documentName", ""),
                        "clause_id": r.get("clauseId"),
                        "provenance_tier": r.get("provenanceTier", ""),
                        "content_preview": r.get("contentPreview", "")[:500],
                        "final_score": r.get("finalScore", 0),
                    }
                    for r in policy_evidence
                ],
                "outcomes": [
                    {
                        "evidence_id": r.get("evidenceId", ""),
                        "source": r.get("source", ""),
                        "document_name": r.get("documentName", ""),
                        "content_preview": r.get("contentPreview", "")[:500],
                        "final_score": r.get("finalScore", 0),
                    }
                    for r in outcomes_evidence
                ],
            },
        }
