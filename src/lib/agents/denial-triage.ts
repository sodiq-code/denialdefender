/**
 * DenialDefender — Denial Triage Agent (Day 4 — Agent 2)
 *
 * Owns the multimodal parse and the structured denial JSON.
 * - Parses denial letter into structured denial JSON
 * - Classifies denial type, extracts codes, assesses confidence
 * - Determines appealability and strategy
 * - Generates the human confirmation prompt for HITL Gate 1
 *
 * Reuses parsing logic from vertical-slice-agent.ts parseDenialLetter()
 */

import { BaseAgent, type TraceEvent } from './base-agent';
import type { AdvocateResult } from './patient-advocate';

// ─── Types ────────────────────────────────────────────────────────────────

export interface DenialTriageInput {
  denialText: string;
  payer: string;
  advocateResult: AdvocateResult;
}

export interface DenialJson {
  payer: string;
  reasonCode: string;
  denialType: string;          // medical_necessity, prior_auth, coding, experimental, out_of_network
  denialTypeLabel: string;
  category: string;
  confidence: number;          // 0-1
  cptCodes: string[];
  icdCodes: string[];
  amountDenied: number;
  deadline: string | null;
}

export interface DenialClassification {
  isAppealable: boolean;
  appealStrategy: string;
  estimatedSuccessRate: number;
  keyFactors: string[];
}

export interface TriageResult {
  denialJson: DenialJson;
  classification: DenialClassification;
  humanConfirmPrompt: string;
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

// ─── CPT Description Mapping ──────────────────────────────────────────────

const CPT_DESCRIPTIONS: Record<string, string> = {
  '27447': 'Total Knee Arthroplasty',
  '27130': 'Total Hip Arthroplasty',
  '99213': 'Office Visit, Established Patient, Level 3',
  '99214': 'Office Visit, Established Patient, Level 4',
  '70553': 'MRI Brain With and Without Contrast',
  '43239': 'Upper GI Endoscopy with Biopsy',
  '93306': 'Transthoracic Echocardiography',
  '64483': 'Epidural Steroid Injection',
  '90837': 'Psychotherapy, 60-minute Session',
};

// ─── ICD Description Mapping ──────────────────────────────────────────────

const ICD_DESCRIPTIONS: Record<string, string> = {
  'M17.11': 'Primary Osteoarthritis, Right Knee',
  'M16.11': 'Primary Osteoarthritis, Right Hip',
  'K21.0': 'GERD with Esophagitis',
  'I25.10': 'Atherosclerotic CAD',
  'G43.909': 'Migraine, Unspecified',
  'F32.1': 'MDD, Single Episode, Moderate',
  'J18.9': 'Pneumonia, Unspecified',
  'E11.9': 'Type 2 DM Without Complications',
  'I10': 'Essential Hypertension',
  'M54.5': 'Low Back Pain',
};

// ─── Appeal Strategy Map ──────────────────────────────────────────────────

const APPEAL_STRATEGIES: Record<string, { strategy: string; successRate: number; keyFactors: string[] }> = {
  medical_necessity: {
    strategy: 'Medical Necessity — cite clinical guidelines and peer-reviewed evidence demonstrating the treatment meets the standard of care for the documented diagnosis',
    successRate: 0.65,
    keyFactors: ['Clinical guidelines support the treatment', 'Peer-reviewed evidence of efficacy', 'Documentation of conservative treatment failure', 'Treating physician letter of medical necessity'],
  },
  prior_auth: {
    strategy: 'Prior Authorization — demonstrate emergency/urgent exception criteria or retroactive authorization eligibility',
    successRate: 0.55,
    keyFactors: ['Emergency or urgent care exception applies', 'Retroactive authorization criteria met', 'Clinical necessity documented at time of service', 'Payer policy on prior auth exceptions'],
  },
  coding: {
    strategy: 'Coding Correction — provide corrected codes with supporting documentation and modifier justification',
    successRate: 0.70,
    keyFactors: ['Correct coding supported by medical record', 'Modifier documentation', 'CCI edit analysis', 'Coding guidelines reference'],
  },
  experimental: {
    strategy: 'Experimental/Investigational — cite peer-reviewed literature, clinical trial data, and other payers\' coverage decisions',
    successRate: 0.40,
    keyFactors: ['Peer-reviewed literature supports efficacy', 'Clinical trial evidence', 'Other payers cover the treatment', 'Professional society endorsement'],
  },
  out_of_network: {
    strategy: 'Out-of-Network Exception — demonstrate no in-network alternative was available or emergency/urgency exception applies',
    successRate: 0.45,
    keyFactors: ['No in-network provider with equivalent specialization', 'Emergency or urgent care exception', 'Continuity of care argument', 'Access standard violation'],
  },
};

// ─── Denial Type Classification ───────────────────────────────────────────

function classifyDenialType(text: string): string {
  const lower = text.toLowerCase();

  if (
    lower.includes('prior auth') || lower.includes('preauth') || lower.includes('precert') ||
    lower.includes('authorization required') || lower.includes('precertification') || lower.includes('preauthorization')
  ) {
    return 'prior_auth';
  }
  if (
    lower.includes('coding') || lower.includes('bundl') || lower.includes('modifier') ||
    lower.includes('code error') || lower.includes('unbundl') || lower.includes('inconsistent with the modifier')
  ) {
    return 'coding';
  }
  if (
    lower.includes('experimental') || lower.includes('investigational') ||
    lower.includes('not proven') || lower.includes('insufficient evidence')
  ) {
    return 'experimental';
  }
  if (
    lower.includes('out-of-network') || lower.includes('out of network') ||
    lower.includes('non-participating') || lower.includes('non-network')
  ) {
    return 'out_of_network';
  }
  if (
    lower.includes('not medically necessary') || lower.includes('medical necessity') ||
    lower.includes('not reasonable')
  ) {
    return 'medical_necessity';
  }

  return 'medical_necessity'; // Default
}

// ─── Reason Code Extraction ───────────────────────────────────────────────

function extractReasonCodes(text: string): string[] {
  const codes: string[] = [];
  const patterns = [
    /\b(CO|PR|OA|PI|CR)(\d{2,5})\b/g,
    /\b(RARC)\s*[:\-]?\s*([A-Z0-9]+)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      codes.push(`${match[1]}${match[2]}`);
    }
  }
  return [...new Set(codes)];
}

// ─── CPT Code Extraction ──────────────────────────────────────────────────

function extractCptCodes(text: string): string[] {
  const codes: string[] = [];
  const pattern = /\b(\d{5}[A-Z]?)\b/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const code = match[1];
    if (/^\d{5}$/.test(code) && parseInt(code) >= 100 && parseInt(code) <= 99499) {
      codes.push(code);
    }
  }
  return [...new Set(codes)];
}

// ─── ICD Code Extraction ──────────────────────────────────────────────────

function extractIcdCodes(text: string): string[] {
  const codes: string[] = [];
  const pattern = /\b([A-Z]\d{2}(\.\d{1,4})?)\b/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const code = match[1];
    if (code.length >= 3 && code.length <= 8) {
      codes.push(code);
    }
  }
  return [...new Set(codes)];
}

// ─── Amount Extraction ────────────────────────────────────────────────────

function extractAmountDenied(text: string): number {
  const patterns = [
    /amount[:\s]*\$?([\d,]+(?:\.\d{2})?)/i,
    /denied[:\s]*\$?([\d,]+(?:\.\d{2})?)/i,
    /\$([\d,]+(?:\.\d{2})?)/,
    /total[:\s]*\$?([\d,]+(?:\.\d{2})?)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''));
    }
  }
  return 0;
}

// ─── Deadline Extraction ──────────────────────────────────────────────────

function extractDeadline(text: string): string | null {
  const patterns = [
    /appeal\s+deadline[:\s]+(\w+\s+\d{1,2},?\s+\d{4})/i,
    /deadline[:\s]+(\w+\s+\d{1,2},?\s+\d{4})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        const date = new Date(match[1]);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      } catch {
        // Date parsing failed
      }
    }
  }

  // Look for "X days" relative deadline
  const daysPattern = /(?:within|appeal.*?within)\s+(\d{1,3})\s+days/i;
  const daysMatch = text.match(daysPattern);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    if (!isNaN(days) && days > 0) {
      const date = new Date();
      date.setDate(date.getDate() + days);
      return date.toISOString().split('T')[0];
    }
  }

  return null;
}

// ─── Confidence Calculation ───────────────────────────────────────────────

function calculateConfidence(
  denialType: string,
  reasonCodes: string[],
  cptCodes: string[],
  icdCodes: string[],
): number {
  let confidence = 0.5; // Base

  // Reason codes found
  if (reasonCodes.length > 0) confidence += 0.15;

  // CPT codes found
  if (cptCodes.length > 0) confidence += 0.1;

  // ICD codes found
  if (icdCodes.length > 0) confidence += 0.1;

  // Well-known denial type
  if (['medical_necessity', 'prior_auth', 'coding'].includes(denialType)) {
    confidence += 0.05;
  }

  // Multiple codes provide stronger signal
  if (reasonCodes.length > 1) confidence += 0.05;
  if (cptCodes.length > 0 && icdCodes.length > 0) confidence += 0.05;

  return Math.min(1.0, Math.round(confidence * 100) / 100);
}

// ─── Human Confirm Prompt Builder ─────────────────────────────────────────

function buildHumanConfirmPrompt(
  denialJson: DenialJson,
  classification: DenialClassification,
): string {
  const cptDesc = denialJson.cptCodes.length > 0
    ? denialJson.cptCodes.map(c => CPT_DESCRIPTIONS[c] || `CPT ${c}`).join(', ')
    : 'the procedure';
  const icdDesc = denialJson.icdCodes.length > 0
    ? denialJson.icdCodes.map(c => ICD_DESCRIPTIONS[c] || `ICD-10 ${c}`).join(', ')
    : 'the documented diagnosis';

  const prompt = `${denialJson.payer} denied ${cptDesc} for patient with ${icdDesc} as ${denialJson.denialTypeLabel.toLowerCase()} (${denialJson.reasonCode}). ` +
    `Confidence: ${denialJson.confidence.toFixed(2)}. ` +
    `Estimated appeal success: ${Math.round(classification.estimatedSuccessRate * 100)}%. ` +
    `Strategy: ${classification.appealStrategy.split('—')[0].trim()}. ` +
    `Confirm this classification to proceed with Policy Research.`;

  return prompt;
}

// ─── Denial Triage Agent ──────────────────────────────────────────────────

export class DenialTriageAgent extends BaseAgent<DenialTriageInput, TriageResult> {
  name = 'denial-triage';
  description = 'Multimodal denial parsing and structured classification — produces denial JSON for HITL Gate 1 confirmation';

  protected async execute(input: DenialTriageInput): Promise<TriageResult> {
    const { denialText, payer, advocateResult } = input;

    // Step 1: Classify denial type
    const denialType = classifyDenialType(denialText);

    // Step 2: Extract reason codes
    const reasonCodes = extractReasonCodes(denialText);

    // Step 3: Extract CPT codes
    const cptCodes = extractCptCodes(denialText);

    // Step 4: Extract ICD codes
    const icdCodes = extractIcdCodes(denialText);

    // Step 5: Extract amount denied
    const amountDenied = extractAmountDenied(denialText);

    // Step 6: Extract deadline
    const deadline = extractDeadline(denialText) || advocateResult.caseFraming.deadline;

    // Step 7: Calculate confidence
    const confidence = calculateConfidence(denialType, reasonCodes, cptCodes, icdCodes);

    // Step 8: Build denial JSON
    const denialJson: DenialJson = {
      payer,
      reasonCode: reasonCodes.length > 0 ? reasonCodes[0] : 'UNKNOWN',
      denialType,
      denialTypeLabel: denialTypeLabel(denialType),
      category: denialType,
      confidence,
      cptCodes,
      icdCodes,
      amountDenied,
      deadline,
    };

    // Step 9: Classification
    const strategyInfo = APPEAL_STRATEGIES[denialType] || APPEAL_STRATEGIES.medical_necessity;
    const classification: DenialClassification = {
      isAppealable: true, // All denials are potentially appealable
      appealStrategy: strategyInfo.strategy,
      estimatedSuccessRate: strategyInfo.successRate,
      keyFactors: strategyInfo.keyFactors,
    };

    // ── Live Gemini enrichment: ask the fleet's triage agent for a real classification ──
    const fleetUrl = process.env.AGENT_FLEET_URL;
    if (fleetUrl && fleetUrl.length > 0) {
      try {
        const fleetRes = await fetch(`${fleetUrl}/agents/triage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            case_id: 'triage-' + Date.now(),
            denial: {
              denial_code: denialJson.reasonCode,
              denial_reason: denialText.slice(0, 500),
              carrier_name: payer,
              cpt_code: cptCodes[0] || '',
              icd10_code: icdCodes[0] || '',
            },
          }),
          signal: AbortSignal.timeout(30000),
        });
        if (fleetRes.ok) {
          const fdata = (await fleetRes.json()).data || {};
          // Merge live Gemini classification into the local one (keep code extraction).
          if (fdata.estimated_success_rate != null) classification.estimatedSuccessRate = fdata.estimated_success_rate;
          if (Array.isArray(fdata.factors) && fdata.factors.length > 0) classification.keyFactors = fdata.factors;
          if (fdata.classification) classification.isAppealable = String(fdata.classification).toUpperCase().includes('APPEALABLE');
          if (fdata.reasoning) (classification as { liveReasoning?: string }).liveReasoning = String(fdata.reasoning);
          // Update confidence to reflect the live assessment.
          if (fdata.confidence != null) denialJson.confidence = Math.round(Number(fdata.confidence) * 100) / 100;
        }
      } catch {
        // Fleet unreachable — keep the deterministic classification.
      }
    }

    // Step 10: Build human confirm prompt
    const humanConfirmPrompt = buildHumanConfirmPrompt(denialJson, classification);

    return {
      denialJson,
      classification,
      humanConfirmPrompt,
    };
  }

  protected async mockExecute(input: DenialTriageInput): Promise<TriageResult> {
    const { payer } = input;
    return {
      denialJson: {
        payer,
        reasonCode: 'UNKNOWN',
        denialType: 'medical_necessity',
        denialTypeLabel: 'Medical Necessity',
        category: 'medical_necessity',
        confidence: 0.5,
        cptCodes: [],
        icdCodes: [],
        amountDenied: 0,
        deadline: null,
      },
      classification: {
        isAppealable: true,
        appealStrategy: 'Review payer policy and gather supporting documentation (Mock)',
        estimatedSuccessRate: 0.50,
        keyFactors: ['Clinical documentation review needed'],
      },
      humanConfirmPrompt: `${payer} denial classified as Medical Necessity (Mock). Confirm to proceed with Policy Research.`,
    };
  }

  protected defaultOutput(): TriageResult {
    return {
      denialJson: {
        payer: 'Unknown',
        reasonCode: 'UNKNOWN',
        denialType: 'medical_necessity',
        denialTypeLabel: 'Medical Necessity',
        category: 'unknown',
        confidence: 0,
        cptCodes: [],
        icdCodes: [],
        amountDenied: 0,
        deadline: null,
      },
      classification: {
        isAppealable: true,
        appealStrategy: 'Unable to classify — manual review required',
        estimatedSuccessRate: 0,
        keyFactors: [],
      },
      humanConfirmPrompt: 'Triage failed — manual classification required.',
    };
  }
}

// Singleton instance for pipeline use
export const denialTriageAgent = new DenialTriageAgent();
