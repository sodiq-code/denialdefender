"""
Policy Analyst Agent — Searches payer policy for contradictions.

Identifies contradictions between the payer's medical policy
and established clinical guidelines, as well as policy gaps
that the appeal can exploit.
"""

from __future__ import annotations

from agents.base import BaseAgent


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
  "overall_policy_assessment": "summary of policy analysis"
}"""

    async def mock_run(self, input_data: dict) -> dict:
        """Return a simulated policy analysis for demo purposes."""
        denial = input_data.get("denial", {})
        carrier = denial.get("carrier_name", "Insurance Carrier")
        cpt = denial.get("cpt_code", "99213")
        icd10 = denial.get("icd10_code", "M54.5")
        triage = input_data.get("triage", {})
        strategy = triage.get("strategy", "MEDICAL_NECESSITY")

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
                f"The policy analysis reveals {len('contradictions_found')} contradictions "
                f"between {carrier}'s medical policy and authoritative clinical guidelines. "
                f"The strongest argument is that the payer's conservative therapy requirement "
                f"exceeds the standard of care established by ACR 2024. Combined with the "
                f"policy gap for this specific diagnosis-procedure combination, these findings "
                f"substantially support the {strategy} appeal strategy."
            ),
        }
