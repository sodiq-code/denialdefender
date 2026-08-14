# DenialDefender Data Directory

## Structure
```
data/
├── corpus/
│   └── raw/           # Frozen, versioned CMS + payer sources
│       # Contents (downloaded Day 0/1):
│       # - CMS Reason Statements / eMDR codes
│       # - CMS SynPUFs samples  
│       # - Medicare Appeals guidance
│       # - 3-5 frozen payer medical-policy PDFs
│       # Each file is version-stamped with retrieval date
├── cases/
│   ├── synthetic/     # Synthetic case definitions for testing
│   └── held_out/      # 10 held-out cases for evaluation (never used for weight updates)
```

## Evidence Sources (per blueprint Section 8)
| Source | Type | Provenance Tier |
|--------|------|-----------------|
| CMS Reason Statements | Denial reason codes + descriptions | primary_source |
| CMS eMDR codes | Medical device reason codes | primary_source |
| CMS SynPUFs | Synthetic public use files (no PHI) | primary_source |
| Medicare Appeals Guidance | Appeals process + timelines | primary_source |
| Payer Medical Policies | 3-5 frozen PDFs from major payers | secondary_summary |

## Provenance Tagging
Every document is:
1. Content-hashed (SHA-256) for deduplication
2. Tagged with: source, document, section, effective_date, retrieved_date, provenance_tier, status
3. Embedded with Gemini text-embedding-001
4. Written to pgvector with full provenance metadata
