"""
Triage Agent — Analyzes denial codes and classifies appealability.

Examines CARC/RARC codes, CPT/ICD-10 codes, and denial reason text
to determine whether the denial is appealable and identify the
most promising appeal strategy.
"""

from __future__ import annotations

from agents.base import BaseAgent


class TriageAgent(BaseAgent):
    name = "triage"
    role = "Triage Agent — Denial classification and appealability assessment"

    system_prompt = """You are the Triage Agent in DenialDefender, a medical insurance denial appeal system.

Your role: Analyze the denial code (CPT, ICD-10, CARC/RARC codes) and reason text to classify the denial.

You will receive a JSON object with:
- denial_code: The CARC/RARC or internal denial code
- denial_reason: Free-text reason for the denial
- cpt_code: The CPT procedure code (if available)
- icd10_code: The ICD-10 diagnosis code (if available)
- carrier_name: The insurance carrier name
- amount_denied: The dollar amount denied

Your analysis must:

1. Classify the denial as exactly one of:
   - APPEALABLE: Strong grounds for appeal exist
   - PARTIALLY_APPEALABLE: Some aspects can be appealed
   - NOT_APPEALABLE: Denial appears justified (e.g., explicitly non-covered service)

2. Provide a confidence score (0.0 to 1.0) for your classification.

3. List key factors driving your classification (e.g., "Medical necessity not established", "Prior auth not obtained but obtainable retroactively").

4. Identify the most promising appeal strategy:
   - MEDICAL_NECESSITY: Argue the service was medically necessary
   - CODING_ERROR: Correct coding mistakes that caused the denial
   - POLICY_CONTRADICTION: Payer policy contradicts clinical guidelines
   - PRIOR_AUTH: Obtain or demonstrate retroactive prior authorization
   - EXPERIMENTAL: Challenge the "experimental/investigational" classification

5. Provide clear reasoning for your classification.

Output STRICTLY as JSON:
{
  "classification": "APPEALABLE|PARTIALLY_APPEALABLE|NOT_APPEALABLE",
  "confidence": 0.0-1.0,
  "factors": ["factor1", "factor2", ...],
  "strategy": "MEDICAL_NECESSITY|CODING_ERROR|POLICY_CONTRADICTION|PRIOR_AUTH|EXPERIMENTAL",
  "reasoning": "detailed explanation",
  "appeal_urgency": "high|medium|low",
  "estimated_success_rate": 0.0-1.0,
  "recommended_next_steps": ["step1", "step2", ...]
}"""

    async def mock_run(self, input_data: dict) -> dict:
        """Return a simulated triage response for demo purposes."""
        denial_code = input_data.get("denial_code", "CO-50")
        denial_reason = input_data.get("denial_reason", "Non-covered service")

        # Simulate classification based on common denial codes
        classification = "APPEALABLE"
        strategy = "MEDICAL_NECESSITY"
        confidence = 0.78

        if denial_code.startswith("CO-197"):
            classification = "NOT_APPEALABLE"
            strategy = "PRIOR_AUTH"
            confidence = 0.15
        elif denial_code.startswith("CO-4"):
            classification = "PARTIALLY_APPEALABLE"
            strategy = "CODING_ERROR"
            confidence = 0.65
        elif denial_code.startswith("CO-50") or denial_code.startswith("CO-236"):
            classification = "APPEALABLE"
            strategy = "MEDICAL_NECESSITY"
            confidence = 0.78

        return {
            "classification": classification,
            "confidence": confidence,
            "factors": [
                f"Denial code {denial_code} indicates {denial_reason}",
                "Clinical documentation may support medical necessity",
                "Payer policy may have internal contradictions with clinical guidelines",
            ],
            "strategy": strategy,
            "reasoning": (
                f"The denial code {denial_code} with reason '{denial_reason}' suggests "
                f"the payer has determined this service does not meet coverage criteria. "
                f"However, based on common appeal patterns for this code, the {strategy} "
                f"strategy has a reasonable chance of success when supported by "
                f"appropriate clinical evidence and documentation."
            ),
            "appeal_urgency": "high" if confidence > 0.6 else "medium",
            "estimated_success_rate": confidence * 0.9,
            "recommended_next_steps": [
                "Validate CPT/ICD-10 codes with MedicalCoderAgent",
                "Search payer policy for contradictions with PolicyAnalystAgent",
                "Gather clinical evidence with EvidenceAgent",
                "Generate appeal letter with DraftAgent",
            ],
        }
