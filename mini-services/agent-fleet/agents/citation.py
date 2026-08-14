"""
Citation Agent — Verifies and formats citations with provenance tiers.

Ensures all evidence citations are properly formatted, traceable,
and assigned the correct provenance tier. Adds DOI/PMID references
where available and formats for the appeal letter.
"""

from __future__ import annotations

from agents.base import BaseAgent


class CitationAgent(BaseAgent):
    name = "citation"
    role = "Citation Agent — Citation verification and provenance tier assignment"

    system_prompt = """You are the Citation Agent in DenialDefender, a medical insurance denial appeal system.

Your role: Verify, format, and assign provenance tiers to all citations used in the appeal.

You will receive a JSON object with:
- evidence: { evidence_items: [{ id, title, description, source, provenance_tier, relevance_score, key_findings, year }] }
- policy: { contradictions_found, policy_references }
- draft: { citations_used } (if a draft has already been generated)

Your tasks:

1. VERIFY: Check that each citation is:
   - Traceable to a real or plausible source
   - Properly categorized by provenance tier
   - Not duplicated or redundant

2. FORMAT: Standardize citation format:
   - Author(s). Title. Source. Year;Volume(Issue):Pages. DOI/PMID if available.
   - For guidelines: Organization. Title. Year. URL if available.

3. TIER_VALIDATION: Ensure provenance tiers are correctly assigned:
   - TIER_1_SYSTEMATIC_REVIEW: Cochrane, systematic reviews, meta-analyses
   - TIER_2_RCT: Published randomized controlled trials
   - TIER_3_OBSERVATIONAL: Cohort, case-control, cross-sectional studies
   - TIER_4_GUIDELINE: Clinical practice guidelines from recognized bodies
   - TIER_5_EXPERT_OPINION: Consensus statements, expert opinions

4. PROVENANCE_SCORING: Assign a combined score based on:
   - Tier weight (Tier 1 = 1.0, Tier 2 = 0.8, Tier 3 = 0.6, Tier 4 = 0.7, Tier 5 = 0.4)
   - Relevance to the specific denial
   - Recency (newer = higher)
   - Source authority

Output STRICTLY as JSON:
{
  "verified_citations": [
    {
      "number": 1,
      "id": "ev-1",
      "formatted_citation": "properly formatted citation string",
      "provenance_tier": "TIER_X_...",
      "tier_weight": 0.0-1.0,
      "relevance_score": 0.0-1.0,
      "combined_score": 0.0-1.0,
      "year": 2024,
      "source_type": "journal|guideline|regulation",
      "doi": "DOI if available or null",
      "pmid": "PMID if available or null",
      "verified": true/false,
      "verification_note": "note about verification status"
    }
  ],
  "tier_distribution": {
    "TIER_1_SYSTEMATIC_REVIEW": 0,
    "TIER_2_RCT": 0,
    "TIER_3_OBSERVATIONAL": 0,
    "TIER_4_GUIDELINE": 0,
    "TIER_5_EXPERT_OPINION": 0
  },
  "overall_citation_quality": "excellent|good|adequate|weak",
  "recommendations": ["any issues or suggestions"]
}"""

    async def mock_run(self, input_data: dict) -> dict:
        """Return a simulated citation verification for demo purposes."""
        evidence = input_data.get("evidence", {})
        evidence_items = evidence.get("evidence_items", [])

        tier_weights = {
            "TIER_1_SYSTEMATIC_REVIEW": 1.0,
            "TIER_2_RCT": 0.8,
            "TIER_3_OBSERVATIONAL": 0.6,
            "TIER_4_GUIDELINE": 0.7,
            "TIER_5_EXPERT_OPINION": 0.4,
        }

        tier_distribution = {
            "TIER_1_SYSTEMATIC_REVIEW": 0,
            "TIER_2_RCT": 0,
            "TIER_3_OBSERVATIONAL": 0,
            "TIER_4_GUIDELINE": 0,
            "TIER_5_EXPERT_OPINION": 0,
        }

        # Build verified citations from evidence items
        if not evidence_items:
            # Use default mock evidence
            evidence_items = [
                {"id": "ev-1", "title": "Clinical Practice Guideline", "source": "AMA CPT Assistant", "provenance_tier": "TIER_4_GUIDELINE", "relevance_score": 0.92, "year": 2024},
                {"id": "ev-2", "title": "Systematic Review of Treatment Efficacy", "source": "JAMA", "provenance_tier": "TIER_1_SYSTEMATIC_REVIEW", "relevance_score": 0.88, "year": 2023},
                {"id": "ev-3", "title": "RCT of Procedure vs. Usual Care", "source": "NEJM", "provenance_tier": "TIER_2_RCT", "relevance_score": 0.85, "year": 2023},
            ]

        verified = []
        for idx, item in enumerate(evidence_items, start=1):
            tier = item.get("provenance_tier", "TIER_5_EXPERT_OPINION")
            relevance = item.get("relevance_score", 0.5)
            year = item.get("year", 2023)
            weight = tier_weights.get(tier, 0.4)

            # Recency bonus: 2024 = +0.05, 2023 = +0.0, older = -0.05 per year
            recency_bonus = max(-0.15, (year - 2023) * 0.05)
            combined = min(1.0, weight * relevance + recency_bonus)

            tier_distribution[tier] = tier_distribution.get(tier, 0) + 1

            verified.append({
                "number": idx,
                "id": item.get("id", f"ev-{idx}"),
                "formatted_citation": f"{item.get('source', 'Unknown')}. {item.get('title', 'Untitled')}. {year}.",
                "provenance_tier": tier,
                "tier_weight": weight,
                "relevance_score": relevance,
                "combined_score": round(combined, 3),
                "year": year,
                "source_type": "guideline" if "TIER_4" in tier else "journal",
                "doi": None,
                "pmid": None,
                "verified": True,
                "verification_note": "Citation format verified; provenance tier confirmed",
            })

        # Also add policy citations
        policy = input_data.get("policy", {})
        for pol_ref in policy.get("policy_references", []):
            idx += 1
            verified.append({
                "number": idx,
                "id": f"pol-{idx}",
                "formatted_citation": f"{pol_ref.get('title', 'Policy Reference')}. Section: {pol_ref.get('section', 'N/A')}.",
                "provenance_tier": "TIER_4_GUIDELINE",
                "tier_weight": 0.7,
                "relevance_score": 0.80,
                "combined_score": 0.56,
                "year": 2024,
                "source_type": "regulation",
                "doi": None,
                "pmid": None,
                "verified": True,
                "verification_note": "Policy reference included; direct link may be available",
            })
            tier_distribution["TIER_4_GUIDELINE"] += 1

        # Quality assessment
        avg_combined = sum(v["combined_score"] for v in verified) / len(verified) if verified else 0
        if avg_combined >= 0.8:
            quality = "excellent"
        elif avg_combined >= 0.6:
            quality = "good"
        elif avg_combined >= 0.4:
            quality = "adequate"
        else:
            quality = "weak"

        return {
            "verified_citations": verified,
            "tier_distribution": tier_distribution,
            "overall_citation_quality": quality,
            "recommendations": [
                "Consider adding DOI/PMID references for journal citations",
                "Policy references should include direct URLs where available",
                "All citations meet minimum provenance standards for appeal",
            ],
        }
