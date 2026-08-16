/**
 * DenialDefender — Vertical Slice Agent (Day 3)
 *
 * A SINGLE MONOLITHIC agent that proves the thinnest possible end-to-end path:
 *   Upload denial → Parse to structured JSON → Retrieve 3 citations → Draft appeal → Render
 *
 * This is deliberately NOT the final architecture; it is the vertical slice that
 * proves the plumbing (UI → api → DB → retrieval → drafting → UI) works before
 * any multi-agent complexity is added.
 *
 * Gate: A synthetic denial produces a draft with 3 real citations, 5× in a row.
 */

import { retrievePolicyClauses, type PolicyQuery } from './policy-research';

// ─── Types ────────────────────────────────────────────────────────────────

export interface ParsedDenial {
  denial_code: string;
  denial_type: string;       // medical_necessity, prior_auth, coding, experimental, out_of_network
  denial_type_label: string;
  payer: string;
  reason_codes: string[];
  cpt_codes: string[];
  icd_codes: string[];
  amount_denied: number;
  confidence: number;
  summary: string;
}

export interface VerticalSliceCitation {
  number: number;
  evidenceId: string;
  source: string;
  documentName: string;
  section: string | null;
  contentPreview: string;    // First 200 chars
  provenanceTier: string;    // primary_source, secondary_summary, tertiary_commentary
  provenanceColor: string;   // teal for primary, amber for secondary, gray for tertiary
  clauseId: string | null;
  retrievalWeight: number;
  relevanceScore: number;
}

export interface AppealDraft {
  paragraph: string;          // The one-paragraph appeal
  wordCount: number;
  citationsUsed: number[];    // Citation numbers referenced
  tone: string;               // "formal-clinical"
  strengths: string[];        // What makes this appeal strong
}

export interface VerticalSliceResult {
  parsedDenial: ParsedDenial;
  citations: VerticalSliceCitation[];
  appealDraft: AppealDraft;
  latencyMs: number;
  success: boolean;
  gatePassed: boolean;        // true if citations.length >= 3
  trace: {                    // Decision trace for the vertical slice
    step: string;
    agent: string;
    timestamp: string;
    detail: string;
  }[];
}

// ─── Denial Type Mapping ──────────────────────────────────────────────────

const DENIAL_TYPE_MAP: Record<string, string> = {
  medical_necessity: 'Medical Necessity',
  prior_auth: 'Prior Authorization',
  coding: 'Coding/Billing',
  experimental: 'Experimental/Investigational',
  out_of_network: 'Out-of-Network',
};

function denialTypeLabel(normalized: string): string {
  return DENIAL_TYPE_MAP[normalized] || normalized.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Provenance Color Helper ──────────────────────────────────────────────

function provenanceColor(tier: string): string {
  switch (tier) {
    case 'primary_source': return 'teal';
    case 'secondary_summary': return 'amber';
    case 'tertiary_commentary': return 'gray';
    default: return 'gray';
  }
}

// ─── Step 1: Parse Denial Letter (Rule-Based) ────────────────────────────

/**
 * Parse a raw denial letter into structured JSON using rule-based extraction.
 * This uses the same patterns as the two-agent-pipeline ruleBasedTriage,
 * extended with amount extraction and denial code detection.
 */
export function parseDenialLetter(denialText: string, payerOverride?: string): ParsedDenial {
  const lower = denialText.toLowerCase();

  // ── Classify denial type by keywords ──
  let denialType = 'medical_necessity';
  if (
    lower.includes('prior auth') ||
    lower.includes('preauth') ||
    lower.includes('precert') ||
    lower.includes('authorization required') ||
    lower.includes('precertification') ||
    lower.includes('preauthorization')
  ) {
    denialType = 'prior_auth';
  } else if (
    lower.includes('coding') ||
    lower.includes('bundl') ||
    lower.includes('modifier') ||
    lower.includes('code error') ||
    lower.includes('unbundl') ||
    lower.includes('inconsistent with the modifier')
  ) {
    denialType = 'coding';
  } else if (
    lower.includes('experimental') ||
    lower.includes('investigational') ||
    lower.includes('not proven') ||
    lower.includes('insufficient evidence')
  ) {
    denialType = 'experimental';
  } else if (
    lower.includes('out-of-network') ||
    lower.includes('out of network') ||
    lower.includes('non-participating') ||
    lower.includes('non-network')
  ) {
    denialType = 'out_of_network';
  } else if (
    lower.includes('not medically necessary') ||
    lower.includes('medical necessity') ||
    lower.includes('not reasonable')
  ) {
    denialType = 'medical_necessity';
  }

  // ── Extract reason codes (CARC/RARC patterns) ──
  const reasonCodes: string[] = [];
  const codePatterns = [
    /\b(CO|PR|OA|PI|CR)(\d{2,5})\b/g,
    /\b(RARC)\s*[:\-]?\s*([A-Z0-9]+)/g,
  ];
  for (const pattern of codePatterns) {
    let match;
    while ((match = pattern.exec(denialText)) !== null) {
      reasonCodes.push(`${match[1]}${match[2]}`);
    }
  }

  // ── Extract CPT codes ──
  const cptCodes: string[] = [];
  const cptPattern = /\b(\d{5}[A-Z]?)\b/g;
  let cptMatch;
  while ((cptMatch = cptPattern.exec(denialText)) !== null) {
    const code = cptMatch[1];
    if (/^\d{5}$/.test(code) && parseInt(code) >= 100 && parseInt(code) <= 99499) {
      cptCodes.push(code);
    }
  }

  // ── Extract ICD-10 codes ──
  const icdCodes: string[] = [];
  const icdPattern = /\b([A-Z]\d{2}(\.\d{1,4})?)\b/g;
  let icdMatch;
  while ((icdMatch = icdPattern.exec(denialText)) !== null) {
    const code = icdMatch[1];
    if (code.length >= 3 && code.length <= 8) {
      icdCodes.push(code);
    }
  }

  // ── Extract denied amount ──
  let amountDenied = 0;
  const amountPatterns = [
    /amount[:\s]*\$?([\d,]+(?:\.\d{2})?)/i,
    /denied[:\s]*\$?([\d,]+(?:\.\d{2})?)/i,
    /\$([\d,]+(?:\.\d{2})?)/,
    /total[:\s]*\$?([\d,]+(?:\.\d{2})?)/i,
  ];
  for (const pattern of amountPatterns) {
    const match = denialText.match(pattern);
    if (match) {
      amountDenied = parseFloat(match[1].replace(/,/g, ''));
      break;
    }
  }

  // ── Extract payer name ──
  let payer = payerOverride || '';
  if (!payer) {
    const payerPatterns = [
      /\b(UnitedHealthcare|UHC|United Health)\b/i,
      /\b(Anthem|BlueCross|Blue Shield|BlueCross BlueShield)\b/i,
      /\b(Aetna)\b/i,
      /\b(Cigna)\b/i,
      /\b(Humana)\b/i,
      /\b(Kaiser Permanente|Kaiser)\b/i,
      /\b(Medicare)\b/i,
      /\b(Medicaid)\b/i,
      /\b(Molina Healthcare|Molina)\b/i,
      /\b(Centene)\b/i,
      /\b(WellCare)\b/i,
    ];
    for (const pattern of payerPatterns) {
      const match = denialText.match(pattern);
      if (match) {
        payer = match[1];
        break;
      }
    }
    if (!payer) payer = 'Unknown Payer';
  }

  // ── Determine primary denial code ──
  const denialCode = reasonCodes.length > 0 ? reasonCodes[0] : 'UNKNOWN';

  // ── Build summary ──
  const summaryParts: string[] = [];
  summaryParts.push(`${denialTypeLabel(denialType)} denial`);
  if (payer) summaryParts.push(`from ${payer}`);
  if (reasonCodes.length > 0) summaryParts.push(`(${reasonCodes.join(', ')})`);
  if (cptCodes.length > 0) summaryParts.push(`for CPT ${cptCodes.join(', ')}`);
  const summary = summaryParts.join(' ');

  return {
    denial_code: denialCode,
    denial_type: denialType,
    denial_type_label: denialTypeLabel(denialType),
    payer,
    reason_codes: [...new Set(reasonCodes)],
    cpt_codes: [...new Set(cptCodes)],
    icd_codes: [...new Set(icdCodes)],
    amount_denied: amountDenied,
    confidence: 0.7,
    summary,
  };
}

// ─── Step 2: Retrieve Citations ───────────────────────────────────────────

/**
 * Retrieve exactly 3 citations from the evidence corpus using
 * the policy-research.ts retrievePolicyClauses function.
 */
export async function retrieveCitations(parsed: ParsedDenial): Promise<VerticalSliceCitation[]> {
  const query: PolicyQuery = {
    denialReason: parsed.summary,
    payer: parsed.payer !== 'Unknown Payer' ? parsed.payer : undefined,
    denialType: parsed.denial_type,
    cptCodes: parsed.cpt_codes.length > 0 ? parsed.cpt_codes : undefined,
    icdCodes: parsed.icd_codes.length > 0 ? parsed.icd_codes : undefined,
    mode: 'outcomes',  // K=3 for outcomes mode
    topK: 3,
  };

  const response = await retrievePolicyClauses(query);

  // Map to VerticalSliceCitation format
  return response.results.map((r, idx) => ({
    number: idx + 1,
    evidenceId: r.evidenceId,
    source: r.source,
    documentName: r.documentName,
    section: r.section,
    contentPreview: r.content.slice(0, 200),
    provenanceTier: r.provenanceTier,
    provenanceColor: provenanceColor(r.provenanceTier),
    clauseId: r.clauseId,
    retrievalWeight: r.retrievalWeight,
    relevanceScore: Math.round(r.finalScore * 100) / 100,
  }));
}

// ─── Step 3: Draft Appeal (Template-Based) ────────────────────────────────

/**
 * Draft a one-paragraph appeal using a template approach.
 * No LLM needed for the vertical slice — this proves the plumbing works.
 */
export function draftAppeal(
  parsed: ParsedDenial,
  citations: VerticalSliceCitation[],
): AppealDraft {
  // CPT description mapping for common codes
  const cptDescriptions: Record<string, string> = {
    '27447': 'total knee arthroplasty (TKA)',
    '27130': 'total hip arthroplasty (THA)',
    '99213': 'office visit, established patient, level 3',
    '99214': 'office visit, established patient, level 4',
    '70553': 'MRI brain with and without contrast',
    '43239': 'upper GI endoscopy with biopsy',
    '93306': 'transthoracic echocardiography',
    '64483': 'epidural steroid injection',
    '90837': 'psychotherapy, 60-minute session',
  };

  // ICD description mapping for common codes
  const icdDescriptions: Record<string, string> = {
    'M17.11': 'primary osteoarthritis of the right knee',
    'M16.11': 'primary osteoarthritis of the right hip',
    'K21.0': 'gastro-esophageal reflux disease with esophagitis',
    'I25.10': 'atherosclerotic coronary artery disease',
    'G43.909': 'migraine, unspecified, not intractable',
    'F32.1': 'major depressive disorder, single episode, moderate',
    'J18.9': 'pneumonia, unspecified organism',
    'E11.9': 'type 2 diabetes mellitus without complications',
    'I10': 'essential hypertension',
    'M54.5': 'low back pain',
  };

  const cptDesc = parsed.cpt_codes.length > 0
    ? cptDescriptions[parsed.cpt_codes[0]] || `procedure ${parsed.cpt_codes[0]}`
    : 'the requested procedure';

  const icdDesc = parsed.icd_codes.length > 0
    ? icdDescriptions[parsed.icd_codes[0]] || `diagnosis ${parsed.icd_codes[0]}`
    : 'the documented diagnosis';

  // ── Build citation references ──
  const citationRefs = citations.length > 0
    ? citations.map((c, idx) => {
        const sourceLabel = c.documentName || c.source;
        return `[${idx + 1}]${sourceLabel ? ` (${sourceLabel})` : ''}`;
      }).join(', ')
    : 'the available clinical evidence';

  // ── Build opening ──
  const opening = `We are writing to appeal the denial of ${cptDesc} for ${icdDesc} submitted to ${parsed.payer}.`;

  // ── Build grounds ──
  const groundsMap: Record<string, string> = {
    medical_necessity: `The denial was issued under code ${parsed.denial_code} on grounds of medical necessity; however, the clinical record demonstrates that this treatment meets the applicable standard of care and is consistent with accepted clinical guidelines for the documented condition.`,
    prior_auth: `The denial was issued under code ${parsed.denial_code} for lack of prior authorization; however, the service met criteria for emergency or urgent care exception, and the treating physician's clinical judgment supported the immediacy of intervention.`,
    coding: `The denial was issued under code ${parsed.denial_code} citing a coding inconsistency; however, the submitted codes accurately reflect the service rendered and are supported by the medical record documentation.`,
    experimental: `The denial was issued under code ${parsed.denial_code} classifying the service as experimental or investigational; however, peer-reviewed literature and clinical guidelines support the efficacy of this treatment for the documented condition.`,
    out_of_network: `The denial was issued under code ${parsed.denial_code} based on out-of-network status; however, emergency or access standards exceptions apply, as no in-network provider with equivalent specialization was available within the required timeframe.`,
  };
  const grounds = groundsMap[parsed.denial_type] || `The denial was issued under code ${parsed.denial_code}; however, the clinical record and applicable policy support the medical necessity and appropriateness of this service.`;

  // ── Build evidence ──
  const evidence = citations.length >= 3
    ? `Clinical evidence and authoritative policy sources support the medical necessity of this service as documented in ${citationRefs}. These sources, representing primary payer policy, secondary clinical guidelines, and supporting evidence, collectively establish that the requested treatment is consistent with both the standard of care and ${parsed.payer}'s own coverage criteria.`
    : citations.length > 0
    ? `Clinical evidence supporting medical necessity is documented in ${citationRefs}.`
    : 'Clinical evidence supporting medical necessity is documented in the medical record.';

  // ── Build regulatory reference ──
  const regulatory = parsed.payer.toLowerCase().includes('medicare')
    ? '42 CFR §405.910 and the Medicare Appeals Process'
    : 'the applicable state insurance regulations and the Affordable Care Act external review provisions';

  // ── Build closing ──
  const closing = `We respectfully request reconsideration of this denial and grant of the claim. If the denial is upheld, we request an external review pursuant to ${regulatory}. All supporting clinical documentation, peer-reviewed evidence, and payer policy references are available upon request.`;

  // ── Compose paragraph ──
  const paragraph = `${opening} ${grounds} ${evidence} ${closing}`;

  // ── Compute strengths ──
  const strengths: string[] = [];
  strengths.push('Denial parsed with structured extraction of codes and type');
  if (citations.length >= 3) {
    strengths.push('Three or more citations retrieved with provenance tracking');
    const primaryCount = citations.filter(c => c.provenanceTier === 'primary_source').length;
    if (primaryCount > 0) strengths.push(`${primaryCount} primary source citation(s) — strongest evidentiary tier`);
  }
  if (parsed.cpt_codes.length > 0 && parsed.icd_codes.length > 0) {
    strengths.push('Both CPT and ICD codes extracted for precise policy matching');
  }
  strengths.push('Template-based draft ensures consistent formal-clinical tone');

  return {
    paragraph,
    wordCount: paragraph.split(/\s+/).length,
    citationsUsed: citations.map(c => c.number),
    tone: 'formal-clinical',
    strengths,
  };
}

// ─── Main Pipeline: Run Vertical Slice ────────────────────────────────────

/**
 * Run the complete vertical slice pipeline:
 *   1. Parse denial letter → structured JSON
 *   2. Retrieve 3 citations from evidence corpus
 *   3. Draft one-paragraph appeal
 *
 * Returns VerticalSliceResult with trace, latency, and gate status.
 */
export async function runVerticalSlice(
  denialText: string,
  payerOverride?: string,
): Promise<VerticalSliceResult> {
  const totalStart = Date.now();
  const trace: VerticalSliceResult['trace'] = [];

  // ── Step 1: Parse Denial ──
  const parseStart = Date.now();
  const parsedDenial = parseDenialLetter(denialText, payerOverride);
  const parseMs = Date.now() - parseStart;

  trace.push({
    step: 'parse_denial',
    agent: 'vertical-slice',
    timestamp: new Date().toISOString(),
    detail: `Parsed denial in ${parseMs}ms: type=${parsedDenial.denial_type}, code=${parsedDenial.denial_code}, payer=${parsedDenial.payer}, CPT=[${parsedDenial.cpt_codes.join(',')}], ICD=[${parsedDenial.icd_codes.join(',')}]`,
  });

  // ── Step 2: Retrieve Citations ──
  let citations: VerticalSliceCitation[] = [];
  try {
    const retrieveStart = Date.now();
    citations = await retrieveCitations(parsedDenial);
    const retrieveMs = Date.now() - retrieveStart;

    trace.push({
      step: 'retrieve_citations',
      agent: 'vertical-slice',
      timestamp: new Date().toISOString(),
      detail: `Retrieved ${citations.length} citations in ${retrieveMs}ms: tiers=[${citations.map(c => c.provenanceTier).join(', ')}]`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    trace.push({
      step: 'retrieve_citations',
      agent: 'vertical-slice',
      timestamp: new Date().toISOString(),
      detail: `Citation retrieval failed: ${msg}`,
    });
  }

  // ── Step 3: Draft Appeal ──
  const draftStart = Date.now();
  const appealDraft = draftAppeal(parsedDenial, citations);
  const draftMs = Date.now() - draftStart;

  trace.push({
    step: 'draft_appeal',
    agent: 'vertical-slice',
    timestamp: new Date().toISOString(),
    detail: `Drafted appeal in ${draftMs}ms: ${appealDraft.wordCount} words, ${appealDraft.citationsUsed.length} citations referenced`,
  });

  // ── Compute results ──
  const latencyMs = Date.now() - totalStart;
  const gatePassed = citations.length >= 3;
  const success = true; // Pipeline completed (even if citations < 3)

  trace.push({
    step: 'complete',
    agent: 'vertical-slice',
    timestamp: new Date().toISOString(),
    detail: `Vertical slice completed in ${latencyMs}ms. Gate ${gatePassed ? 'PASSED' : 'NOT PASSED'} (${citations.length}/3 citations)`,
  });

  return {
    parsedDenial,
    citations,
    appealDraft,
    latencyMs,
    success,
    gatePassed,
    trace,
  };
}

// ─── Sample Denial Letters ────────────────────────────────────────────────

export const SAMPLE_DENIAL_LETTERS = [
  {
    id: 'sample-1',
    label: 'Medicare — Medical Necessity (CO-50, TKA)',
    payer: 'Medicare',
    text: `Medicare
Claims Adjudication Department

DATE: March 4, 2026

RE: Denial of Claim — 27447 (Total Knee Arthroplasty)

Dear Provider,

This letter is to inform you that the claim submitted for the above-referenced service has been denied.

DENIAL REASON: CO50 — Non-covered services because it is not deemed medically necessary

PAYER STATEMENT: The requested service is not medically necessary for the diagnosed condition. Conservative treatment options have not been adequately documented as exhausted.

PROCEDURE: 27447 — Total Knee Arthroplasty
DIAGNOSIS: M17.11 — Primary osteoarthritis, right knee
AMOUNT DENIED: $34,250.00

APPEAL RIGHTS: You have the right to appeal this denial within 120 days of the date of this notice. Your appeal must be submitted in writing and include any supporting medical documentation.

APPEAL DEADLINE: July 2, 2026

If you believe this denial was made in error, please submit a redetermination request with supporting clinical evidence, including but not limited to:
- Medical records documenting the clinical necessity
- Relevant clinical guidelines or coverage criteria
- Peer-reviewed literature supporting the treatment
- Documentation of conservative treatment failure

Sincerely,
Claims Adjudication Department
Medicare`,
  },
  {
    id: 'sample-2',
    label: 'UnitedHealthcare — Prior Auth (CO-197, MRI)',
    payer: 'UnitedHealthcare',
    text: `UnitedHealthcare
Prior Authorization Department

DATE: February 28, 2026

RE: Denial of Claim — 70553 (MRI Brain With and Without Contrast)

Dear Provider,

This letter is to inform you that the claim submitted for the above-referenced service has been denied.

DENIAL REASON: CO197 — Precertification/authorization/notification/pre-treatment absent

PAYER STATEMENT: Precertification was not obtained prior to service delivery. This procedure requires prior authorization per UnitedHealthcare Medical Policy #UHC-MP-001.4.B.

PROCEDURE: 70553 — MRI brain with and without contrast
DIAGNOSIS: G43.909 — Migraine, unspecified, not intractable
AMOUNT DENIED: $2,890.00

APPEAL RIGHTS: You have the right to appeal this denial within 180 days of the date of this notice. Your appeal must be submitted in writing and include any supporting medical documentation.

APPEAL DEADLINE: August 27, 2026

If you believe this denial was made in error, please submit a reconsideration request with supporting clinical evidence, including but not limited to:
- Prior authorization documentation
- Medical records documenting clinical necessity
- Relevant clinical guidelines supporting advanced imaging
- Emergency or urgent care exception documentation

Sincerely,
Prior Authorization Department
UnitedHealthcare`,
  },
  {
    id: 'sample-3',
    label: 'Aetna — Coding (CO-4, E/M Level 3)',
    payer: 'Aetna',
    text: `Aetna
Claims Adjudication Department

DATE: March 10, 2026

RE: Denial of Claim — 99213 (Office Visit, Established Patient, Level 3)

Dear Provider,

This letter is to inform you that the claim submitted for the above-referenced service has been denied.

DENIAL REASON: CO4 — The procedure code is inconsistent with the modifier used or is inconsistent with the diagnosis

PAYER STATEMENT: Procedure code 99213 is inconsistent with the submitted diagnosis code. The level of service billed does not match the documentation provided for the stated diagnosis.

PROCEDURE: 99213 — Office visit, established patient, level 3
DIAGNOSIS: K21.0 — Gastro-esophageal reflux disease with esophagitis
AMOUNT DENIED: $156.00

APPEAL RIGHTS: You have the right to appeal this denial within 90 days of the date of this notice. Your appeal must be submitted in writing and include any supporting medical documentation.

APPEAL DEADLINE: June 8, 2026

If you believe this denial was made in error, please submit a reconsideration request with supporting clinical evidence, including but not limited to:
- Complete medical record for the date of service
- Documentation supporting medical decision-making complexity
- Correct coding initiative (CCI) edit explanation
- Modifier documentation if applicable

Sincerely,
Claims Adjudication Department
Aetna`,
  },
];
