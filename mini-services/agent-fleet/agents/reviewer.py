"""
Reviewer Agent — Quality review of draft appeal letters.

Checks the appeal letter for completeness, compliance, tone,
citation accuracy, and overall persuasiveness. Flags issues
that require revision before the HITL gate.
"""

from __future__ import annotations

from agents.base import BaseAgent


class ReviewerAgent(BaseAgent):
    name = "reviewer"
    role = "Quality Review Agent — Draft quality and compliance assessment"

    system_prompt = """You are the Reviewer Agent in DenialDefender, a medical insurance denial appeal system.

Your role: Perform quality review of the drafted appeal letter to ensure it meets standards before presenting to the human reviewer.

You will receive a JSON object with:
- denial: { denial_code, denial_reason, cpt_code, icd10_code, carrier_name, amount_denied }
- triage: { classification, strategy, factors, confidence }
- evidence: { evidence_items, overall_evidence_strength, evidence_summary }
- draft: { appeal_letter, sections, citations_used, word_count, tone, strengths, potential_weaknesses }

Your review must check for:

1. COMPLETENESS: All required sections present (HEADER, RE:, INTRODUCTION, DENIAL_SUMMARY, CLINICAL_RATIONALE, EVIDENCE_CITATIONS, POLICY_ARGUMENTS, CONCLUSION, SIGNATURE)
2. CITATION_ACCURACY: All evidence items are properly cited with provenance tiers
3. CLINICAL_ACCURACY: Clinical rationale is medically sound and supports the appeal strategy
4. TONE_APPROPRIATENESS: Language is professional, factual, non-adversarial
5. COMPLIANCE: No PHI (Protected Health Information) is exposed — only hashed patient IDs
6. PERSUASIVENESS: Arguments are logical, well-structured, and compelling
7. FORMATTING: Letter follows proper business letter format
8. SPECIFICITY: References specific denial codes, policy sections, and evidence

For each check, assign a pass/fail/needs_improvement status and a score (0-1).

If any CRITICAL issues are found, the draft needs revision.
If only MINOR issues are found, the draft can proceed with notes.

Output STRICTLY as JSON:
{
  "overall_verdict": "APPROVED|NEEDS_REVISION|REJECTED",
  "overall_score": 0.0-1.0,
  "checks": [
    {
      "category": "COMPLETENESS",
      "status": "pass|fail|needs_improvement",
      "score": 0.0-1.0,
      "details": "explanation",
      "severity": "critical|minor|info"
    }
  ],
  "critical_issues": ["issues that must be fixed"],
  "minor_issues": ["issues that should be addressed but aren't blockers"],
  "recommendations": ["suggestions for improvement"],
  "revision_instructions": "specific instructions for DraftAgent if revision needed, null if approved"
}"""

    async def mock_run(self, input_data: dict) -> dict:
        """Return a simulated review result for demo purposes."""
        draft = input_data.get("draft", {})
        evidence = input_data.get("evidence", {})
        citations_count = len(draft.get("citations_used", []))
        word_count = draft.get("word_count", 0)

        checks = [
            {
                "category": "COMPLETENESS",
                "status": "pass",
                "score": 0.95,
                "details": "All 9 required sections are present and contain substantive content.",
                "severity": "info",
            },
            {
                "category": "CITATION_ACCURACY",
                "status": "pass",
                "score": 0.90,
                "details": f"{citations_count} citations found with provenance tiers. All evidence items properly referenced.",
                "severity": "info",
            },
            {
                "category": "CLINICAL_ACCURACY",
                "status": "pass",
                "score": 0.88,
                "details": f"Clinical rationale aligns with evidence strength ({evidence.get('overall_evidence_strength', 'unknown')}). Medical arguments are sound.",
                "severity": "info",
            },
            {
                "category": "TONE_APPROPRIATENESS",
                "status": "pass",
                "score": 0.92,
                "details": "Tone is professional and factual. No adversarial or emotional language detected.",
                "severity": "info",
            },
            {
                "category": "COMPLIANCE",
                "status": "pass",
                "score": 0.95,
                "details": "No PHI detected. Patient identified by hash only. No SSN, DOB, or real names present.",
                "severity": "info",
            },
            {
                "category": "PERSUASIVENESS",
                "status": "pass",
                "score": 0.85,
                "details": "Arguments are logical and well-structured. Evidence hierarchy supports the case effectively.",
                "severity": "info",
            },
            {
                "category": "FORMATTING",
                "status": "pass",
                "score": 0.90,
                "details": "Business letter format followed. Clear section delineation and professional layout.",
                "severity": "info",
            },
            {
                "category": "SPECIFICITY",
                "status": "needs_improvement",
                "score": 0.75,
                "details": "Denial codes are referenced but payer-specific policy section numbers could be more precise.",
                "severity": "minor",
            },
        ]

        avg_score = sum(c["score"] for c in checks) / len(checks)
        critical = [c for c in checks if c["severity"] == "critical" and c["status"] == "fail"]
        minor = [c for c in checks if c["severity"] == "minor" and c["status"] != "pass"]

        verdict = "APPROVED"
        revision_instructions = None
        if critical:
            verdict = "NEEDS_REVISION"
            revision_instructions = "Fix critical issues: " + "; ".join(c["details"] for c in critical)
        elif len(minor) >= 2:
            verdict = "NEEDS_REVISION"
            revision_instructions = "Address minor issues for higher quality: " + "; ".join(c["details"] for c in minor)

        return {
            "overall_verdict": verdict,
            "overall_score": round(avg_score, 3),
            "checks": checks,
            "critical_issues": [c["details"] for c in critical],
            "minor_issues": [c["details"] for c in minor],
            "recommendations": [
                "Add specific payer medical policy section references",
                "Consider including a provider attestation statement",
                "Strengthen the policy contradiction arguments with direct quotes",
            ],
            "revision_instructions": revision_instructions,
        }
