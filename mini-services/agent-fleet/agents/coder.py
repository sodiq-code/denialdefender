"""
Medical Coder Agent — Validates CPT/ICD-10 codes against the denial.

Checks for coding errors, modifier issues, bundling problems,
and code-dx mismatches that may have contributed to the denial.
"""

from __future__ import annotations

from agents.base import BaseAgent


class MedicalCoderAgent(BaseAgent):
    name = "coder"
    role = "Medical Coder Agent — CPT/ICD-10 validation and correction"

    system_prompt = """You are the Medical Coder Agent in DenialDefender, a medical insurance denial appeal system.

Your role: Validate the CPT and ICD-10 codes on the denied claim and identify any coding issues that may have caused or contributed to the denial.

You will receive a JSON object with:
- denial: { denial_code, denial_reason, cpt_code, icd10_code, carrier_name, amount_denied }
- patient_context: { diagnosis, treatment_history }

Your analysis must check for:

1. CODE_DX_MATCH: Does the CPT code appropriately map to the ICD-10 diagnosis?
2. MODIFIER_ISSUES: Are required modifiers missing? Are inappropriate modifiers applied?
3. BUNDLING_ISSUES: Is the code bundled with another procedure that was also billed?
4. CODE_SPECIFICITY: Is the ICD-10 code specific enough? Could a more specific code change coverage?
5. PLACE_OF_SERVICE: Does the place of service code match the procedure setting?
6. UNLISTED_CODE: Is the CPT code unlisted? Can a specific code be used instead?
7. SEQUENCING: Is the diagnosis code sequencing correct for the payer's rules?

For each issue found, classify its impact on the denial:
- DIRECT_CAUSE: This coding issue directly caused the denial
- CONTRIBUTING: This issue may have contributed to the denial
- UNRELATED: This issue exists but didn't cause this denial

If coding corrections are identified, provide:
- The corrected code(s)
- The rationale for the correction
- Whether the correction alone would likely reverse the denial

Output STRICTLY as JSON:
{
  "validation_result": "VALID|CORRECTABLE|INVALID",
  "overall_assessment": "summary of coding validation",
  "issues_found": [
    {
      "category": "CODE_DX_MATCH|MODIFIER_ISSUES|BUNDLING|...",
      "severity": "DIRECT_CAUSE|CONTRIBUTING|UNRELATED",
      "description": "what the issue is",
      "original_code": "the code as billed",
      "corrected_code": "the corrected code (if applicable)",
      "correction_rationale": "why the correction is needed",
      "would_reverse_denial": true/false
    }
  ],
  "corrected_codes": {
    "cpt": "corrected CPT or null",
    "icd10": "corrected ICD-10 or null",
    "modifiers": ["corrected modifiers or empty"],
  },
  "coding_action_required": true/false,
  "confidence": 0.0-1.0
}"""

    async def mock_run(self, input_data: dict) -> dict:
        """Return a simulated coding validation for demo purposes."""
        denial = input_data.get("denial", {})
        cpt = denial.get("cpt_code", "99213")
        icd10 = denial.get("icd10_code", "M54.5")
        denial_code = denial.get("denial_code", "CO-50")

        # Simulate: most denials are not primarily coding errors
        issues = []
        corrected_cpt = None
        corrected_icd10 = None

        # Check for common coding-related denial codes
        if denial_code.startswith("CO-4") or denial_code.startswith("CO-11"):
            issues.append({
                "category": "CODE_DX_MATCH",
                "severity": "DIRECT_CAUSE",
                "description": f"The ICD-10 code {icd10} may not be a supported diagnosis for CPT {cpt}. A more specific code may resolve the denial.",
                "original_code": icd10,
                "corrected_code": "M54.16",  # More specific version
                "correction_rationale": "Increasing ICD-10 specificity to the appropriate subcategory",
                "would_reverse_denial": True,
            })
            corrected_icd10 = "M54.16"

        if denial_code.startswith("CO-97"):
            issues.append({
                "category": "BUNDLING_ISSUES",
                "severity": "CONTRIBUTING",
                "description": f"CPT {cpt} may be bundled with another procedure. Adding modifier -59 may be appropriate.",
                "original_code": cpt,
                "corrected_code": f"{cpt}-59",
                "correction_rationale": "Distinct procedural service modifier to unbundle appropriately",
                "would_reverse_denial": True,
            })
            corrected_cpt = f"{cpt}-59"

        validation_result = "VALID"
        if any(i["severity"] == "DIRECT_CAUSE" for i in issues):
            validation_result = "CORRECTABLE"
        elif issues:
            validation_result = "CORRECTABLE"

        if not issues:
            issues.append({
                "category": "CODE_SPECIFICITY",
                "severity": "UNRELATED",
                "description": f"ICD-10 code {icd10} could be more specific but this is not the primary cause of denial.",
                "original_code": icd10,
                "corrected_code": None,
                "correction_rationale": "Increased specificity may strengthen the appeal but won't reverse the denial alone",
                "would_reverse_denial": False,
            })

        return {
            "validation_result": validation_result,
            "overall_assessment": (
                f"CPT {cpt} with ICD-10 {icd10}: "
                + ("Coding corrections available that may help the appeal." if corrected_cpt or corrected_icd10
                   else "Codes appear valid. Denial is likely based on medical necessity rather than coding.")
            ),
            "issues_found": issues,
            "corrected_codes": {
                "cpt": corrected_cpt,
                "icd10": corrected_icd10,
                "modifiers": ["59"] if corrected_cpt and "-59" in corrected_cpt else [],
            },
            "coding_action_required": corrected_cpt is not None or corrected_icd10 is not None,
            "confidence": 0.87,
        }
