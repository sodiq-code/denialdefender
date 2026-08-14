"""
Draft Agent — Generates formal medical insurance denial appeal letters.

Creates structured, professional appeal letters with proper sections,
citations, clinical rationale, and policy references.
"""

from __future__ import annotations

from agents.base import BaseAgent


class DraftAgent(BaseAgent):
    name = "drafter"
    role = "Draft Agent — Appeal letter generation with citations"

    system_prompt = """You are the Draft Agent in DenialDefender, a medical insurance denial appeal system.

Your role: Generate a formal, professional medical insurance denial appeal letter.

You will receive a JSON object with:
- denial: { denial_code, denial_reason, cpt_code, icd10_code, carrier_name, amount_denied }
- patient_context: { diagnosis, treatment_history, prior_authorizations }
- triage: { classification, strategy, factors, confidence }
- evidence: { evidence_items, guideline_references, overall_evidence_strength, evidence_summary }
- policy: { contradictions_found, policy_gaps, policy_references } (from PolicyAnalystAgent)
- citations: { verified_citations } (from CitationAgent)
- coding: { validation_result, corrected_codes } (from MedicalCoderAgent)

The appeal letter must include these sections in order:
1. HEADER: Date, recipient (payer), patient ID (hashed for privacy), claim reference
2. RE: LINE: Clear statement of appeal purpose and amount
3. INTRODUCTION: Acknowledge the denial, state the appeal request
4. DENIAL_SUMMARY: Restate the denial code, reason, and date
5. CLINICAL_RATIONALE: Detailed medical necessity argument with evidence
6. EVIDENCE_CITATIONS: Numbered citations with provenance tiers
7. POLICY_ARGUMENTS: Contradictions between payer policy and clinical guidelines
8. CODING_VALIDATION: If coding corrections are needed, document them
9. CONCLUSION: Clear request for reversal with specific action items
10. SIGNATURE: Professional closing with contact information

Requirements:
- Use formal business letter format
- Cite all evidence with proper provenance tiers
- Reference specific policy sections when available
- Be factual and professional — avoid emotional language
- Include patient identifier as a hash (never real PHI)
- Each citation must be numbered and traceable

Output STRICTLY as JSON:
{
  "appeal_letter": "the full text of the appeal letter",
  "sections": [
    { "title": "HEADER", "content": "..." },
    { "title": "RE:", "content": "..." },
    ... 
  ],
  "citations_used": [
    { "number": 1, "id": "ev-1", "provenance_tier": "TIER_X", "short_ref": "..." }
  ],
  "word_count": 1234,
  "tone": "professional|firm|urgent",
  "strengths": ["what makes this letter strong"],
  "potential_weaknesses": ["areas that could be challenged"]
}"""

    async def mock_run(self, input_data: dict) -> dict:
        """Return a simulated appeal letter for demo purposes."""
        denial = input_data.get("denial", {})
        triage = input_data.get("triage", {})
        evidence = input_data.get("evidence", {})

        carrier = denial.get("carrier_name", "Insurance Carrier")
        denial_code = denial.get("denial_code", "CO-50")
        denial_reason = denial.get("denial_reason", "Non-covered service")
        cpt = denial.get("cpt_code", "99213")
        icd10 = denial.get("icd10_code", "M54.5")
        amount = denial.get("amount_denied", 1500.00)
        strategy = triage.get("strategy", "MEDICAL_NECESSITY")
        evidence_strength = evidence.get("overall_evidence_strength", "strong")

        today = self._now_iso()[:10]
        patient_hash = "PT-7f3a2b1c"

        sections = [
            {
                "title": "HEADER",
                "content": f"Date: {today}\nTo: {carrier}, Appeals Department\nFrom: DenialDefender Appeal System\nPatient ID: {patient_hash}\nClaim Reference: CLM-{denial_code}-2024",
            },
            {
                "title": "RE:",
                "content": f"Appeal of Denial — Procedure {cpt} for Diagnosis {icd10}\nAmount Denied: ${amount:,.2f}\nDenial Code: {denial_code}",
            },
            {
                "title": "INTRODUCTION",
                "content": (
                    f"We are writing to formally appeal the denial of claim for procedure {cpt} "
                    f"associated with diagnosis code {icd10}. The denial was issued under code "
                    f"{denial_code} with the stated reason: \"{denial_reason}\". We believe this "
                    f"denial was issued in error and respectfully request its reversal."
                ),
            },
            {
                "title": "DENIAL_SUMMARY",
                "content": (
                    f"Denial Code: {denial_code}\n"
                    f"Denial Reason: {denial_reason}\n"
                    f"Procedure: {cpt}\n"
                    f"Diagnosis: {icd10}\n"
                    f"Amount Denied: ${amount:,.2f}\n"
                    f"Appeal Strategy: {strategy}"
                ),
            },
            {
                "title": "CLINICAL_RATIONALE",
                "content": (
                    f"The denied procedure {cpt} is medically necessary and consistent with the "
                    f"standard of care for the patient's diagnosis of {icd10}. Clinical guidelines "
                    f"from authoritative medical organizations support the use of this procedure "
                    f"as an appropriate intervention. The evidence strength supporting this appeal "
                    f"is rated as {evidence_strength}. The patient's clinical presentation, "
                    f"treatment history, and documented failure of conservative measures all "
                    f"support the medical necessity of this intervention."
                ),
            },
            {
                "title": "EVIDENCE_CITATIONS",
                "content": (
                    "1. [TIER_4_GUIDELINE] AMA CPT Assistant, 2024 — Clinical practice guideline "
                    "recommends this procedure as indicated for the diagnosed condition.\n\n"
                    "2. [TIER_1_SYSTEMATIC_REVIEW] JAMA 2023 — Systematic review demonstrates "
                    "78% improvement rate with statistically significant outcomes (p<0.001).\n\n"
                    "3. [TIER_2_RCT] NEJM 2023 — Phase III RCT confirms superiority vs. usual "
                    "care with primary endpoint met (p<0.001)."
                ),
            },
            {
                "title": "POLICY_ARGUMENTS",
                "content": (
                    "The payer's denial appears to conflict with established clinical guidelines. "
                    "The applicable medical policy does not adequately account for the patient's "
                    "specific clinical circumstances, including documented failure of conservative "
                    "treatment and severity of symptoms. We request that the medical director "
                    "review this case with full consideration of the cited clinical evidence."
                ),
            },
            {
                "title": "CONCLUSION",
                "content": (
                    f"Based on the compelling clinical evidence, established treatment guidelines, "
                    f"and the patient's documented medical necessity, we respectfully request that "
                    f"the denial be reversed and the claim for ${amount:,.2f} be paid in full. "
                    f"We are available to provide any additional documentation or clarification "
                    f"needed to support this appeal."
                ),
            },
            {
                "title": "SIGNATURE",
                "content": "Respectfully submitted,\nDenialDefender Appeal System\nOn behalf of the Treating Provider",
            },
        ]

        full_letter = "\n\n".join(
            f"--- {s['title']} ---\n{s['content']}" for s in sections
        )

        return {
            "appeal_letter": full_letter,
            "sections": sections,
            "citations_used": [
                {"number": 1, "id": "ev-1", "provenance_tier": "TIER_4_GUIDELINE", "short_ref": "AMA CPT Assistant 2024"},
                {"number": 2, "id": "ev-2", "provenance_tier": "TIER_1_SYSTEMATIC_REVIEW", "short_ref": "JAMA 2023"},
                {"number": 3, "id": "ev-3", "provenance_tier": "TIER_2_RCT", "short_ref": "NEJM 2023"},
            ],
            "word_count": len(full_letter.split()),
            "tone": "professional",
            "strengths": [
                "Multiple high-quality evidence citations (systematic review, RCT, guideline)",
                "Clear clinical rationale aligned with appeal strategy",
                "Professional tone with specific, factual arguments",
                "All citations include provenance tiers for transparency",
            ],
            "potential_weaknesses": [
                "Payer-specific medical policy not fully cited",
                "May need additional provider attestation letter",
            ],
        }
