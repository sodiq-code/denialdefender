/**
 * DenialDefender — Patient Advocate Agent (Day 4 — Agent 1)
 *
 * Owns empathetic intake and case framing.
 * - Extracts deadlines from denial letters
 * - Assesses urgency based on CPT codes and treatment timeline
 * - Generates empathetic framing for the case file
 * - Recommends actions for the patient/advocate
 */

import { BaseAgent, type TraceEvent } from './base-agent';

// ─── Types ────────────────────────────────────────────────────────────────

export interface PatientAdvocateInput {
  denialText: string;
  patientContext?: {
    diagnosis?: string;
    treatmentHistory?: string;
  };
}

export interface CaseFraming {
  patientSummary: string;
  denialImpact: string;
  urgencyLevel: 'critical' | 'high' | 'standard';
  recommendedActions: string[];
  deadline: string | null;
  deadlineDaysRemaining: number | null;
}

export interface AdvocateResult {
  caseFraming: CaseFraming;
  empatheticNote: string;
}

// ─── CPT Urgency Mapping ──────────────────────────────────────────────────

const CRITICAL_CPT_RANGES: Array<[number, number]> = [
  [99281, 99289], // Emergency department services
  [93000, 93050], // ECG/EKG
  [93224, 93299], // Pacemaker/ICD
  [70553, 70791], // Advanced imaging (MRI/CT/PET)
];

const HIGH_URGENCY_CPT_RANGES: Array<[number, number]> = [
  [27130, 27499], // Major joint arthroplasty (hip, knee)
  [33510, 33999], // Cardiac surgery
  [43239, 44999], // GI/endoscopy procedures
  [64483, 64493], // Epidural injections
  [90837, 90899], // Psychotherapy/psychiatric
];

function isCptInRange(code: string, ranges: Array<[number, number]>): boolean {
  const num = parseInt(code, 10);
  if (isNaN(num)) return false;
  return ranges.some(([low, high]) => num >= low && num <= high);
}

// ─── Deadline Extraction ──────────────────────────────────────────────────

function extractDeadline(text: string): { deadline: string | null; daysRemaining: number | null } {
  // Look for explicit deadline patterns
  const deadlinePatterns = [
    /appeal\s+deadline[:\s]+(\w+\s+\d{1,2},?\s+\d{4})/i,
    /deadline[:\s]+(\w+\s+\d{1,2},?\s+\d{4})/i,
    /must\s+(?:be\s+)?(?:submitted|received|filed)\s+(?:by|within|no\s+later\s+than)[:\s]+(\w+\s+\d{1,2},?\s+\d{4})/i,
    /(\d{1,2})\s+(days?)\s+(?:from|after)\s+(?:the\s+)?(?:date\s+of\s+)?(?:this|the)\s+(?:notice|determination|decision)/i,
    /within\s+(\d{1,3})\s+(days?)\s+of/i,
  ];

  for (const pattern of deadlinePatterns) {
    const match = text.match(pattern);
    if (match) {
      // Check if it's a named date (e.g., "July 2, 2026")
      if (match[0].includes('20')) {
        const dateStr = match[1] || match[0];
        try {
          const deadlineDate = new Date(dateStr);
          if (!isNaN(deadlineDate.getTime())) {
            const now = new Date();
            const diffMs = deadlineDate.getTime() - now.getTime();
            const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            return {
              deadline: deadlineDate.toISOString().split('T')[0],
              daysRemaining: Math.max(0, daysRemaining),
            };
          }
        } catch {
          // Date parsing failed, continue
        }
      }
      // Check if it's a relative deadline (e.g., "120 days")
      if (match[2]?.startsWith('day') && match[1]) {
        const days = parseInt(match[1], 10);
        if (!isNaN(days) && days > 0) {
          const deadlineDate = new Date();
          deadlineDate.setDate(deadlineDate.getDate() + days);
          return {
            deadline: deadlineDate.toISOString().split('T')[0],
            daysRemaining: days,
          };
        }
      }
    }
  }

  // Look for "X days" patterns
  const daysPattern = /(?:within|appeal.*?within)\s+(\d{1,3})\s+days/i;
  const daysMatch = text.match(daysPattern);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    if (!isNaN(days) && days > 0) {
      const deadlineDate = new Date();
      deadlineDate.setDate(deadlineDate.getDate() + days);
      return {
        deadline: deadlineDate.toISOString().split('T')[0],
        daysRemaining: days,
      };
    }
  }

  return { deadline: null, daysRemaining: null };
}

// ─── Urgency Assessment ───────────────────────────────────────────────────

function assessUrgency(
  denialText: string,
  deadlineDays: number | null,
): 'critical' | 'high' | 'standard' {
  const lower = denialText.toLowerCase();

  // Extract CPT codes for urgency check
  const cptPattern = /\b(\d{5})\b/g;
  let cptMatch;
  const cptCodes: string[] = [];
  while ((cptMatch = cptPattern.exec(denialText)) !== null) {
    const code = cptMatch[1];
    if (parseInt(code) >= 100 && parseInt(code) <= 99499) {
      cptCodes.push(code);
    }
  }

  // Critical: emergency procedures, life-threatening conditions
  if (cptCodes.some(c => isCptInRange(c, CRITICAL_CPT_RANGES))) {
    return 'critical';
  }
  if (lower.includes('emergency') || lower.includes('life-threatening') || lower.includes('urgent')) {
    return 'critical';
  }

  // High: surgical procedures, major interventions, short deadline
  if (cptCodes.some(c => isCptInRange(c, HIGH_URGENCY_CPT_RANGES))) {
    return 'high';
  }
  if (deadlineDays !== null && deadlineDays <= 30) {
    return 'high';
  }

  // Standard: everything else
  return 'standard';
}

// ─── Patient Summary Builder ──────────────────────────────────────────────

function buildPatientSummary(
  denialText: string,
  patientContext?: { diagnosis?: string; treatmentHistory?: string },
): string {
  const lower = denialText.toLowerCase();
  const parts: string[] = [];

  // Extract procedure description
  const procedureMatch = denialText.match(/procedure[:\s]+(.+?)(?:\n|$)/i)
    || denialText.match(/service[:\s]+(.+?)(?:\n|$)/i);
  if (procedureMatch) {
    parts.push(`Procedure denied: ${procedureMatch[1].trim()}`);
  }

  // Extract diagnosis
  const diagnosisMatch = denialText.match(/diagnosis[:\s]+(.+?)(?:\n|$)/i);
  if (diagnosisMatch) {
    parts.push(`Diagnosis: ${diagnosisMatch[1].trim()}`);
  } else if (patientContext?.diagnosis) {
    parts.push(`Diagnosis: ${patientContext.diagnosis}`);
  }

  // Extract payer
  const payerMatch = denialText.match(/\b(UnitedHealthcare|Aetna|Cigna|Humana|Medicare|Medicaid|Anthem|Kaiser|BlueCross)\b/i);
  if (payerMatch) {
    parts.push(`Insurance: ${payerMatch[0]}`);
  }

  // Treatment history
  if (patientContext?.treatmentHistory) {
    parts.push(`Prior treatment: ${patientContext.treatmentHistory}`);
  }

  return parts.length > 0
    ? parts.join('. ') + '.'
    : 'Patient has received a denial that requires appeal review.';
}

// ─── Denial Impact Assessment ─────────────────────────────────────────────

function assessDenialImpact(
  urgencyLevel: 'critical' | 'high' | 'standard',
  deadlineDays: number | null,
  denialText: string,
): string {
  // Extract denied amount
  const amountMatch = denialText.match(/\$([\d,]+(?:\.\d{2})?)/);
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null;

  const impactParts: string[] = [];

  switch (urgencyLevel) {
    case 'critical':
      impactParts.push('This denial involves a time-sensitive or emergency service');
      break;
    case 'high':
      impactParts.push('This denial involves a significant medical procedure');
      break;
    default:
      impactParts.push('This denial affects a standard medical service');
  }

  if (amount !== null) {
    if (amount >= 10000) {
      impactParts.push(`with a substantial financial impact of $${amount.toLocaleString()}`);
    } else if (amount >= 1000) {
      impactParts.push(`with a financial impact of $${amount.toLocaleString()}`);
    } else {
      impactParts.push(`involving $${amount.toLocaleString()}`);
    }
  }

  if (deadlineDays !== null) {
    if (deadlineDays <= 30) {
      impactParts.push(`The appeal deadline is urgent — only ${deadlineDays} days remain`);
    } else if (deadlineDays <= 60) {
      impactParts.push(`${deadlineDays} days remain to file an appeal`);
    } else {
      impactParts.push(`${deadlineDays} days remain to file an appeal`);
    }
  }

  return impactParts.join('. ') + '.';
}

// ─── Recommended Actions ──────────────────────────────────────────────────

function buildRecommendedActions(
  urgencyLevel: 'critical' | 'high' | 'standard',
  deadlineDays: number | null,
): string[] {
  const actions: string[] = [];

  // Always recommend these
  actions.push('Review the denial letter carefully and identify the specific reason for denial');
  actions.push('Gather all supporting medical documentation from the treating provider');

  // Urgency-specific actions
  if (urgencyLevel === 'critical') {
    actions.push('Request an expedited appeal due to the urgent/emergency nature of the service');
    actions.push('Contact the payer immediately to discuss peer-to-peer review option');
  } else if (urgencyLevel === 'high') {
    actions.push('Request a peer-to-peer review with the payer medical director');
    actions.push('Obtain a letter of medical necessity from the treating physician');
  }

  actions.push('Submit the appeal with all supporting evidence before the deadline');

  if (deadlineDays !== null && deadlineDays <= 30) {
    actions.push('⚠️ URGENT: Deadline approaching — prioritize immediate appeal submission');
  }

  return actions;
}

// ─── Empathetic Note Generator ────────────────────────────────────────────

function generateEmpatheticNote(
  urgencyLevel: 'critical' | 'high' | 'standard',
  deadlineDays: number | null,
): string {
  const notes: Record<string, string[]> = {
    critical: [
      'We understand this is a stressful situation, especially when urgent medical care is at stake.',
      'Your health and well-being are the top priority. We will work to resolve this as quickly as possible.',
      'Emergency and urgent care denials can often be overturned with the right evidence and persistence.',
    ],
    high: [
      'Facing a denial for a significant medical procedure can be overwhelming — we are here to help navigate this process.',
      'Many denials for major procedures are successfully appealed with proper documentation and clinical evidence.',
      'We will build the strongest possible appeal to support your access to this treatment.',
    ],
    standard: [
      'Denials can be frustrating, but most are successfully appealed with the right supporting evidence.',
      'We will carefully review the denial and prepare a thorough appeal on your behalf.',
      'You have the right to appeal, and we will make sure that right is exercised effectively.',
    ],
  };

  const pool = notes[urgencyLevel] || notes.standard;
  const selected = pool[Math.floor(Math.random() * pool.length)];

  if (deadlineDays !== null && deadlineDays <= 30) {
    return `${selected} Given the approaching deadline, we recommend acting promptly.`;
  }
  return selected;
}

// ─── Patient Advocate Agent ───────────────────────────────────────────────

export class PatientAdvocateAgent extends BaseAgent<PatientAdvocateInput, AdvocateResult> {
  name = 'patient-advocate';
  description = 'Empathetic intake and case framing — assesses urgency, extracts deadlines, recommends actions for the patient/advocate';

  protected async execute(input: PatientAdvocateInput): Promise<AdvocateResult> {
    const { denialText, patientContext } = input;

    // Step 1: Extract deadline
    const { deadline, daysRemaining } = extractDeadline(denialText);

    // Step 2: Assess urgency
    const urgencyLevel = assessUrgency(denialText, daysRemaining);

    // Step 3: Build patient summary
    const patientSummary = buildPatientSummary(denialText, patientContext);

    // Step 4: Assess denial impact
    const denialImpact = assessDenialImpact(urgencyLevel, daysRemaining, denialText);

    // Step 5: Build recommended actions
    const recommendedActions = buildRecommendedActions(urgencyLevel, daysRemaining);

    // Step 6: Generate empathetic note
    const empatheticNote = generateEmpatheticNote(urgencyLevel, daysRemaining);

    return {
      caseFraming: {
        patientSummary,
        denialImpact,
        urgencyLevel,
        recommendedActions,
        deadline,
        deadlineDaysRemaining: daysRemaining,
      },
      empatheticNote,
    };
  }

  protected async mockExecute(input: PatientAdvocateInput): Promise<AdvocateResult> {
    // Mock fallback: simplified analysis without deep parsing
    const { denialText } = input;
    const { deadline, daysRemaining } = extractDeadline(denialText);
    const urgencyLevel = assessUrgency(denialText, daysRemaining);

    return {
      caseFraming: {
        patientSummary: 'Patient has received a denial that requires appeal review. (Mock)',
        denialImpact: urgencyLevel === 'critical'
          ? 'Time-sensitive denial requiring immediate action.'
          : 'Denial affecting a medical service that requires appeal.',
        urgencyLevel,
        recommendedActions: [
          'Review the denial letter',
          'Gather supporting medical documentation',
          'Submit the appeal before the deadline',
        ],
        deadline,
        deadlineDaysRemaining: daysRemaining,
      },
      empatheticNote: 'We understand this is a difficult situation and will work to resolve it promptly. (Mock)',
    };
  }

  protected defaultOutput(): AdvocateResult {
    return {
      caseFraming: {
        patientSummary: 'Unable to analyze denial — default framing.',
        denialImpact: 'Impact assessment unavailable.',
        urgencyLevel: 'standard',
        recommendedActions: ['Review the denial letter', 'Consult with your healthcare provider'],
        deadline: null,
        deadlineDaysRemaining: null,
      },
      empatheticNote: 'We are here to help. Please consult with your healthcare provider about next steps.',
    };
  }
}

// Singleton instance for pipeline use
export const patientAdvocateAgent = new PatientAdvocateAgent();
