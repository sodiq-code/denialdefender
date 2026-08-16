/**
 * DenialDefender — SynPUF-Based Synthetic Case Generator
 * Day 2: Generates realistic synthetic denial cases WITHOUT any PHI.
 *
 * Based on CMS SynPUFs (Synthetic Public Use Files) which CMS explicitly
 * created so developers can work with realistic Medicare claims structures
 * while protecting beneficiary privacy. No PHI/PII. No DUA required.
 *
 * All patient IDs are hashed. All names are synthetic.
 */

import { createHash } from 'crypto';
import { db } from './db';

// ─── Synthetic Data Pools ─────────────────────────────────────────────────

const PAYER_NAMES = [
  'UnitedHealthcare', 'Anthem BlueCross', 'Aetna', 'Cigna',
  'Humana', 'Kaiser Permanente', 'Blue Shield of CA',
  'Molina Healthcare', 'Centene', 'WellCare',
];

const DENIAL_REASONS = [
  { code: 'CO16', category: 'medical_necessity' as const, description: 'Claim/service lacks information or has submission/billing error(s)', payerText: 'Service not medically necessary based on clinical guidelines' },
  { code: 'CO50', category: 'medical_necessity' as const, description: 'Non-covered services because it is not deemed medically necessary', payerText: 'The requested service is not medically necessary for the diagnosed condition' },
  { code: 'CO29', category: 'prior_auth' as const, description: 'The time limit for filing has expired', payerText: 'Prior authorization was not obtained prior to service delivery' },
  { code: 'CO4', category: 'coding' as const, description: 'The procedure code is inconsistent with the modifier used', payerText: 'Procedure code inconsistent with the modifier or does not match the diagnosis' },
  { code: 'CO11', category: 'coding' as const, description: 'The diagnosis is inconsistent with the procedure', payerText: 'Diagnosis code does not support the medical necessity of the procedure' },
  { code: 'CO197', category: 'prior_auth' as const, description: 'Precertification/authorization/notification/pre-treatment absent', payerText: 'Precertification was not obtained prior to service delivery' },
  { code: 'CO96', category: 'other' as const, description: 'Non-covered charge(s)', payerText: 'Service is not covered under the patient\'s benefit plan' },
  { code: 'CO22', category: 'other' as const, description: 'This care may be covered by another payer per coordination of benefits', payerText: 'Payment adjusted per coordination of benefits rules' },
  { code: 'PR1', category: 'other' as const, description: 'Deductible amount', payerText: 'Patient responsibility: deductible amount applies' },
  { code: 'CO27', category: 'experimental' as const, description: 'Expenses not covered under the patient\'s plan', payerText: 'Service classified as experimental/investigational and not covered' },
];

const CPT_CODES = [
  { code: '99213', description: 'Office visit, established patient, level 3', specialty: 'Primary Care' },
  { code: '99214', description: 'Office visit, established patient, level 4', specialty: 'Primary Care' },
  { code: '27447', description: 'Total knee arthroplasty', specialty: 'Orthopedics' },
  { code: '27130', description: 'Total hip arthroplasty', specialty: 'Orthopedics' },
  { code: '43239', description: 'Upper GI endoscopy with biopsy', specialty: 'Gastroenterology' },
  { code: '93306', description: 'Transthoracic echocardiography', specialty: 'Cardiology' },
  { code: '70553', description: 'MRI brain with contrast', specialty: 'Radiology' },
  { code: '71260', description: 'CT chest with contrast', specialty: 'Radiology' },
  { code: '99223', description: 'Initial hospital care, high complexity', specialty: 'Hospitalist' },
  { code: '36556', description: 'Central venous catheter insertion', specialty: 'Surgery' },
  { code: '64483', description: 'Epidural steroid injection', specialty: 'Pain Management' },
  { code: '90837', description: 'Psychotherapy, 60 min', specialty: 'Psychiatry' },
];

const ICD10_CODES = [
  { code: 'M17.11', description: 'Primary osteoarthritis, right knee' },
  { code: 'M16.11', description: 'Primary osteoarthritis, right hip' },
  { code: 'K21.0', description: 'Gastro-esophageal reflux disease with esophagitis' },
  { code: 'I25.10', description: 'Atherosclerotic coronary artery disease' },
  { code: 'G43.909', description: 'Migraine, unspecified, not intractable' },
  { code: 'F32.1', description: 'Major depressive disorder, single episode, moderate' },
  { code: 'J18.9', description: 'Pneumonia, unspecified organism' },
  { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' },
  { code: 'I10', description: 'Essential (primary) hypertension' },
  { code: 'M54.5', description: 'Low back pain' },
];

const APPEAL_LEVELS = [
  'Redetermination (MAC)',
  'Reconsideration (QIC)',
  'Administrative Law Judge (ALJ)',
  'Appeals Council (DAB)',
  'Judicial Review',
];

const FIRST_NAMES = ['James', 'Maria', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];

// ─── Hashing for Patient IDs (PHI Guard) ──────────────────────────────────

function hashPatientId(syntheticId: string): string {
  return createHash('sha256')
    .update(`synthetic:${syntheticId}`)
    .digest('hex')
    .slice(0, 16);
}

// ─── Synthetic Case Generator ─────────────────────────────────────────────

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(start: Date, end: Date): Date {
  const s = start.getTime();
  const e = end.getTime();
  return new Date(s + Math.random() * (e - s));
}

export interface SyntheticCase {
  patientHash: string;
  patientLabel: string; // e.g., "SynPUF-Patient-001" (not real name)
  payer: string;
  denialReason: typeof DENIAL_REASONS[number];
  cptCode: typeof CPT_CODES[number];
  icd10Code: typeof ICD10_CODES[number];
  denialDate: Date;
  appealDeadline: Date;
  appealLevel: string;
  denialLetterText: string;
  confidence: number;
  persona: string;
}

export function generateSyntheticCase(index: number): SyntheticCase {
  const patientNum = String(index + 1).padStart(3, '0');
  const patientLabel = `SynPUF-Patient-${patientNum}`;
  const patientHash = hashPatientId(patientLabel);

  const payer = randomItem(PAYER_NAMES);
  const denialReason = randomItem(DENIAL_REASONS);
  const cptCode = randomItem(CPT_CODES);
  const icd10Code = randomItem(ICD10_CODES);
  const denialDate = randomDate(new Date('2026-01-01'), new Date('2026-07-31'));

  // Calculate appeal deadline (120 days for redetermination)
  const appealDeadline = new Date(denialDate);
  appealDeadline.setDate(appealDeadline.getDate() + 120);

  const appealLevel = randomItem(APPEAL_LEVELS);
  const confidence = 0.6 + Math.random() * 0.35; // 0.60–0.95

  const persona = randomItem(['elderly', 'chronic_condition', 'post_surgical', 'routine_care', 'mental_health']);

  // Generate realistic denial letter text
  const denialLetterText = generateDenialLetter({
    payer, denialReason, cptCode, icd10Code, denialDate, appealDeadline,
  });

  return {
    patientHash,
    patientLabel,
    payer,
    denialReason,
    cptCode,
    icd10Code,
    denialDate,
    appealDeadline,
    appealLevel,
    denialLetterText,
    confidence,
    persona,
  };
}

function generateDenialLetter(params: {
  payer: string;
  denialReason: typeof DENIAL_REASONS[number];
  cptCode: typeof CPT_CODES[number];
  icd10Code: typeof ICD10_CODES[number];
  denialDate: Date;
  appealDeadline: Date;
}): string {
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `${params.payer}
Claims Adjudication Department

DATE: ${fmt(params.denialDate)}

RE: Denial of Claim — ${params.cptCode.code} (${params.cptCode.description})

Dear Provider,

This letter is to inform you that the claim submitted for the above-referenced service has been denied.

DENIAL REASON: ${params.denialReason.code} — ${params.denialReason.description}

PAYER STATEMENT: ${params.denialReason.payerText}

PROCEDURE: ${params.cptCode.code} — ${params.cptCode.description}
DIAGNOSIS: ${params.icd10Code.code} — ${params.icd10Code.description}

APPEAL RIGHTS: You have the right to appeal this denial within 120 days of the date of this notice. Your appeal must be submitted in writing and include any supporting medical documentation.

APPEAL DEADLINE: ${fmt(params.appealDeadline)}

If you believe this denial was made in error, please submit a redetermination request with supporting clinical evidence, including but not limited to:
- Medical records documenting the clinical necessity
- Relevant clinical guidelines or coverage criteria
- Peer-reviewed literature supporting the treatment
- Prior authorization documentation (if applicable)

Sincerely,
Claims Adjudication Department
${params.payer}`;
}

// ─── Batch Generation ─────────────────────────────────────────────────────

export interface SynthesisResult {
  totalCases: number;
  cases: SyntheticCase[];
  categories: Record<string, number>;
  payers: Record<string, number>;
  durationMs: number;
}

export function generateSyntheticCases(count: number): SynthesisResult {
  const startTime = Date.now();
  const cases: SyntheticCase[] = [];
  const categories: Record<string, number> = {};
  const payers: Record<string, number> = {};

  for (let i = 0; i < count; i++) {
    const c = generateSyntheticCase(i);
    cases.push(c);
    categories[c.denialReason.category] = (categories[c.denialReason.category] || 0) + 1;
    payers[c.payer] = (payers[c.payer] || 0) + 1;
  }

  return {
    totalCases: count,
    cases,
    categories,
    payers,
    durationMs: Date.now() - startTime,
  };
}

// ─── Store Synthetic Cases in Database ────────────────────────────────────

export async function storeSyntheticCases(count: number): Promise<{
  created: number;
  errors: string[];
}> {
  const result = { created: 0, errors: [] as string[] };
  const synthesis = generateSyntheticCases(count);

  for (const c of synthesis.cases) {
    try {
      // Create case
      const newCase = await db.case.create({
        data: {
          patient_id: c.patientHash,
          state: 'created',
          deadline: c.appealDeadline,
          persona: c.persona,
        },
      });

      // Create denial
      await db.denial.create({
        data: {
          case_id: newCase.id,
          payer: c.payer,
          reason_code: c.denialReason.code,
          category: c.denialReason.category as any,
          denial_letter_text: c.denialLetterText,
          deadline: c.appealDeadline,
          confidence: c.confidence,
          structured_json: JSON.stringify({
            patientLabel: c.patientLabel,
            cptCode: c.cptCode,
            icd10Code: c.icd10Code,
            denialDate: c.denialDate,
            appealLevel: c.appealLevel,
            denialDescription: c.denialReason.description,
            payerStatement: c.denialReason.payerText,
          }),
        },
      });

      result.created++;
    } catch (error: any) {
      result.errors.push(`Case ${c.patientLabel}: ${error.message}`);
    }
  }

  return result;
}
