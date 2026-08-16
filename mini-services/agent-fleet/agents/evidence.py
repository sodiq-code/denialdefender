"""
Evidence Agent — Searches for clinical evidence supporting the appeal.

Identifies relevant clinical guidelines, peer-reviewed studies,
and authoritative references that support the medical necessity
of the denied service.
"""

from __future__ import annotations

from agents.base import BaseAgent


class EvidenceAgent(BaseAgent):
    name = "evidence"
    role = "Evidence Agent — Clinical evidence search and compilation"

    system_prompt = """You are the Evidence Agent in DenialDefender, a medical insurance denial appeal system.

Your role: Search for and compile clinical evidence that supports the medical necessity of the denied service.

You will receive a JSON object with:
- denial: { denial_code, denial_reason, cpt_code, icd10_code, carrier_name, amount_denied }
- patient_context: { diagnosis, treatment_history, prior_authorizations }
- triage: { classification, strategy, factors } (from TriageAgent)

Your tasks:
1. Identify the clinical question at the heart of the denial
2. Search for relevant clinical guidelines (e.g., AHA, ACC, NCCN, ACOG, AMA)
3. Find peer-reviewed evidence supporting the service for this diagnosis
4. Identify authoritative references (systematic reviews, meta-analyses, clinical trials)
5. Assess the strength of evidence for each finding
6. Map evidence to the specific denial reason and appeal strategy

For each piece of evidence, assign a provenance tier:
- TIER_1_SYSTEMATIC_REVIEW: Systematic review or meta-analysis
- TIER_2_RCT: Randomized controlled trial
- TIER_3_OBSERVATIONAL: Observational study or cohort study
- TIER_4_GUIDELINE: Clinical practice guideline
- TIER_5_EXPERT_OPINION: Expert opinion or consensus statement

Output STRICTLY as JSON:
{
  "clinical_question": "the question the evidence addresses",
  "evidence_items": [
    {
      "id": "ev-1",
      "title": "short title",
      "description": "brief description of the evidence",
      "source": "journal or organization name",
      "provenance_tier": "TIER_X_...",
      "relevance_score": 0.0-1.0,
      "supports_appeal": true/false,
      "key_findings": ["finding1", "finding2"],
      "year": 2024
    }
  ],
  "guideline_references": ["ref1", "ref2"],
  "overall_evidence_strength": "strong|moderate|limited|weak",
  "evidence_summary": "narrative summary of how evidence supports the appeal",
  "gaps": ["areas where evidence is lacking"]
}"""

    async def mock_run(self, input_data: dict) -> dict:
        """Return simulated clinical evidence for demo purposes."""
        denial = input_data.get("denial", {})
        triage = input_data.get("triage", {})
        strategy = triage.get("strategy", "MEDICAL_NECESSITY")

        cpt = denial.get("cpt_code", "99213")
        icd10 = denial.get("icd10_code", "M54.5")

        return {
            "clinical_question": f"Is the procedure {cpt} medically necessary for diagnosis {icd10}?",
            "evidence_items": [
                {
                    "id": "ev-1",
                    "title": "Clinical Practice Guideline for Diagnosis Management",
                    "description": (
                        f"National guideline recommends {cpt} as first-line intervention "
                        f"for patients with {icd10} when conservative measures have failed."
                    ),
                    "source": "American Medical Association - CPT Assistant",
                    "provenance_tier": "TIER_4_GUIDELINE",
                    "relevance_score": 0.92,
                    "supports_appeal": True,
                    "key_findings": [
                        f"{cpt} is indicated for {icd10} per clinical guidelines",
                        "Conservative treatment failure documented",
                        "Procedure aligned with standard of care",
                    ],
                    "year": 2024,
                },
                {
                    "id": "ev-2",
                    "title": "Systematic Review of Treatment Efficacy",
                    "description": (
                        "Multi-center systematic review demonstrating significant "
                        "improvement in patient outcomes with this intervention."
                    ),
                    "source": "Journal of the American Medical Association (JAMA)",
                    "provenance_tier": "TIER_1_SYSTEMATIC_REVIEW",
                    "relevance_score": 0.88,
                    "supports_appeal": True,
                    "key_findings": [
                        "Pooled analysis shows 78% improvement rate",
                        "Number needed to treat (NNT) of 4.2",
                        "Statistically significant vs. conservative management (p<0.001)",
                    ],
                    "year": 2023,
                },
                {
                    "id": "ev-3",
                    "title": "Randomized Controlled Trial of Procedure vs. Usual Care",
                    "description": (
                        "Phase III RCT comparing the procedure to usual care "
                        "demonstrating superiority in the target population."
                    ),
                    "source": "New England Journal of Medicine (NEJM)",
                    "provenance_tier": "TIER_2_RCT",
                    "relevance_score": 0.85,
                    "supports_appeal": True,
                    "key_findings": [
                        "Primary endpoint met with p<0.001",
                        "Mean difference in outcome: 2.4 (95% CI: 1.8-3.0)",
                        "Safety profile favorable with no serious adverse events",
                    ],
                    "year": 2023,
                },
            ],
            "guideline_references": [
                "AMA CPT Assistant, 2024 edition",
                "ACR Appropriateness Criteria",
                "NICE Clinical Guideline NG235",
            ],
            "overall_evidence_strength": "strong",
            "evidence_summary": (
                f"The clinical evidence strongly supports the medical necessity of {cpt} "
                f"for diagnosis {icd10}. Multiple high-quality sources including a systematic "
                f"review (JAMA 2023), RCT (NEJM 2023), and clinical practice guidelines "
                f"consistently recommend this intervention. The evidence aligns with the "
                f"{strategy} appeal strategy."
            ),
            "gaps": [
                "No payer-specific medical policy found — need PolicyAnalystAgent to verify",
                "Long-term outcome data (>2 years) is limited",
            ],
        }
