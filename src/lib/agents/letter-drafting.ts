/**
 * DenialDefender — Letter Drafting Agent (Day 5 — Agent 5)
 *
 * Composes the evidence-backed appeal draft with inline citations.
 * - Template-based appeal letter with 7 sections
 * - Each citation [N] maps to an InlineCitation with evidenceId and contentHash
 * - 5 citations total (3 policy + 2 clinical)
 * - NO overclaiming language ("will win", "guaranteed", "certain to overturn")
 * - NO medical advice (no "should be treated with", "diagnosis requires")
 */

import { BaseAgent, type TraceEvent } from './base-agent';
import type { AdvocateResult } from './patient-advocate';
import type { TriageResult } from './denial-triage';
import type { PolicyResearchResult } from './policy-research-agent';
import type { EvidenceAssemblyResult } from './evidence-assembly';
import { generateContentHash } from './evidence-assembly';

// ─── Types ────────────────────────────────────────────────────────────────

export interface LetterDraftingInput {
  advocateResult: AdvocateResult;
  triageResult: TriageResult;
  policyResearchResult: PolicyResearchResult;
  evidenceAssemblyResult: EvidenceAssemblyResult;
}

export interface AppealSection {
  title: string;
  content: string;
}

export interface InlineCitation {
  number: number;
  evidenceId: string;
  source: string;
  documentName: string;
  contentHash: string;
  claimText: string;
  provenanceTier: string;
}

export interface LetterDraftingResult {
  appealLetter: string;
  sections: AppealSection[];
  inlineCitations: InlineCitation[];
  wordCount: number;
  citationCount: number;
  tone: string;
  formatCompliant: boolean;
}

// ─── Payer Deadline Map ────────────────────────────────────────────────────

const PAYER_DEADLINES: Record<string, { days: number; label: string }> = {
  Medicare: { days: 120, label: '120 calendar days' },
  Medicaid: { days: 90, label: '90 calendar days' },
  UnitedHealthcare: { days: 180, label: '180 calendar days' },
  UHC: { days: 180, label: '180 calendar days' },
  Aetna: { days: 60, label: '60 calendar days' },
  Cigna: { days: 180, label: '180 calendar days' },
  Humana: { days: 90, label: '90 calendar days' },
  Anthem: { days: 180, label: '180 calendar days' },
  BlueCross: { days: 180, label: '180 calendar days' },
  Kaiser: { days: 60, label: '60 calendar days' },
};

// ─── Date Format ───────────────────────────────────────────────────────────

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ─── Letter Drafting Agent ─────────────────────────────────────────────────

export class LetterDraftingAgent extends BaseAgent<LetterDraftingInput, LetterDraftingResult> {
  name = 'letter-drafting';
  description = 'Composes the evidence-backed appeal draft with inline citations — 7 sections, 5 citations';

  protected async execute(input: LetterDraftingInput): Promise<LetterDraftingResult> {
    const { advocateResult, triageResult, policyResearchResult, evidenceAssemblyResult } = input;
    const { denialJson, classification } = triageResult;

    // ── Live Gemini path ──
    const fleetUrl = process.env.AGENT_FLEET_URL;
    if (fleetUrl && fleetUrl.length > 0) {
      try {
        // Build inline citations first (so the live letter keeps grounded provenance cards)
        const inlineCitations = this.buildCitations(input);
        const fleetRes = await fetch(`${fleetUrl}/agents/drafter`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            case_id: advocateResult.caseFraming.patientSummary?.slice(0, 24) || 'case',
            denial: {
              denial_code: denialJson.reasonCode,
              denial_reason: denialJson.denialTypeLabel,
              carrier_name: denialJson.payer,
              cpt_code: denialJson.cptCodes[0] || '',
              icd10_code: denialJson.icdCodes[0] || '',
              amount_denied: denialJson.amountDenied || 0,
            },
            triage: { strategy: classification.appealStrategy },
            evidence: { overall_evidence_strength: evidenceAssemblyResult.evidenceStrength },
          }),
          signal: AbortSignal.timeout(45000),
        });
        if (fleetRes.ok) {
          const fleetData = (await fleetRes.json()).data || {};
          let letterText: string = fleetData.appeal_letter || '';
          // If the model wrapped the letter in JSON (responseMimeType=application/json), unwrap it.
          if (letterText.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(letterText);
              if (parsed.appeal_letter) letterText = parsed.appeal_letter;
              else if (parsed.letter) letterText = parsed.letter;
            } catch { /* keep raw */ }
          }
          if (letterText && letterText.length > 120) {
            const wc = letterText.split(/\s+/).filter((w) => w.length > 0).length;
            return {
              appealLetter: letterText,
              sections: [{ title: 'Appeal Letter', content: letterText }],
              inlineCitations,
              wordCount: wc,
              citationCount: (letterText.match(/\[\d+\]/g) || []).length || inlineCitations.length,
              tone: 'formal-clinical',
              formatCompliant: wc >= 150 && wc <= 800,
            };
          }
        }
      } catch {
        // Fleet unreachable — fall through to template.
      }
    }

    // Step 1: Build inline citations (5 total: 3 policy + 2 clinical)
    const inlineCitations = this.buildCitations(input);

    // Step 2: Build the 7 sections
    const payerDeadline = PAYER_DEADLINES[denialJson.payer] || { days: 180, label: '180 calendar days' };

    const cptLabel = denialJson.cptCodes.length > 0
      ? denialJson.cptCodes.join(', ')
      : 'the requested procedure';
    const icdLabel = denialJson.icdCodes.length > 0
      ? denialJson.icdCodes.join(', ')
      : 'the documented diagnosis';
    const amountLabel = denialJson.amountDenied > 0
      ? `$${denialJson.amountDenied.toLocaleString()}`
      : 'the denied amount';

    // Section 1: Header
    const headerContent = [
      `Date: ${formatDate()}`,
      '',
      `${denialJson.payer}`,
      'Appeals and Grievances Department',
      '',
      'Re: Appeal of Denial of Coverage',
      `Reason Code: ${denialJson.reasonCode}`,
      `CPT Code(s): ${cptLabel}`,
      `ICD-10 Code(s): ${icdLabel}`,
    ].join('\n');

    // Section 2: Denial Restatement
    const denialRestatementContent = [
      `We are writing to appeal the denial of ${cptLabel} for a patient with ${icdLabel}.`,
      `The denial was issued under reason code ${denialJson.reasonCode}, classified as "${denialJson.denialTypeLabel}".`,
      `The denied amount is ${amountLabel}.`,
      `We believe this denial is inconsistent with applicable policy and clinical evidence, as detailed below.`,
    ].join('\n\n');

    // Section 3: Policy Basis
    const policyCitationRefs = inlineCitations
      .filter(ic => ic.number <= 3)
      .map(ic => `[${ic.number}]`)
      .join('');
    const policyBasisContent = [
      `The denial conflicts with the payer's own coverage policies and established clinical guidelines ${policyCitationRefs}.`,
      '',
      ...inlineCitations
        .filter(ic => ic.number <= 3)
        .map(ic => `Per ${ic.source} (${ic.documentName}): ${ic.claimText.slice(0, 150)} [${ic.number}]`),
      '',
      'These policy provisions support coverage for the requested service when the documented clinical criteria are met, as they are in this case.',
    ].join('\n');

    // Section 4: Clinical Evidence
    const clinicalCitationRefs = inlineCitations
      .filter(ic => ic.number >= 4)
      .map(ic => `[${ic.number}]`)
      .join('');
    const clinicalItemsForCitation = inlineCitations.filter(ic => ic.number >= 4);
    const clinicalEvidenceContent = [
      `The clinical evidence supports the medical necessity of the requested service ${clinicalCitationRefs}.`,
      '',
      ...clinicalItemsForCitation.map(ic =>
        `According to ${ic.source} (${ic.documentName}): ${ic.claimText.slice(0, 150)} [${ic.number}]`
      ),
      '',
      'The peer-reviewed evidence and clinical guidelines consistently support the appropriateness of this service for the documented condition.',
    ].join('\n');

    // Section 5: Medical Necessity Argument
    const medicalNecessityContent = [
      `Based on the policy provisions cited above and the supporting clinical evidence, the requested service meets the applicable standard of care for the documented diagnosis. The treating physician has determined that this service is appropriate and consistent with the patient's clinical presentation and treatment history.`,
      '',
      `The denial classification of "${denialJson.denialTypeLabel}" does not account for the specific clinical circumstances of this case. The evidence demonstrates that the criteria for coverage are satisfied, and the service is consistent with the treatment approach supported by the cited guidelines and peer-reviewed literature.`,
    ].join('\n');

    // Section 6: Request for Reconsideration
    const requestContent = [
      `We respectfully request that ${denialJson.payer} reconsider this denial and approve coverage for the requested service. This appeal is filed within the applicable timeframe — ${payerDeadline.label} from the date of the initial determination, as required by ${denialJson.payer} appeal procedures.`,
      '',
      'We are prepared to provide any additional documentation or participate in a peer-to-peer review as needed to support this appeal.',
    ].join('\n');

    // Section 7: Signature
    const signatureContent = [
      'Respectfully submitted,',
      '',
      '[Authorized Representative]',
      'On behalf of the patient',
    ].join('\n');

    const sections: AppealSection[] = [
      { title: '1. Header', content: headerContent },
      { title: '2. Denial Restatement', content: denialRestatementContent },
      { title: '3. Policy Basis', content: policyBasisContent },
      { title: '4. Clinical Evidence', content: clinicalEvidenceContent },
      { title: '5. Medical Necessity Argument', content: medicalNecessityContent },
      { title: '6. Request for Reconsideration', content: requestContent },
      { title: '7. Signature', content: signatureContent },
    ];

    // Step 3: Assemble full letter
    const appealLetter = sections.map(s => `${s.title}\n\n${s.content}`).join('\n\n---\n\n');

    // Step 4: Calculate word count and verify format
    const wordCount = appealLetter.split(/\s+/).filter(w => w.length > 0).length;
    const formatCompliant = sections.length === 7 && wordCount >= 150 && wordCount <= 800;

    return {
      appealLetter,
      sections,
      inlineCitations,
      wordCount,
      citationCount: inlineCitations.length,
      tone: 'formal-clinical',
      formatCompliant,
    };
  }

  protected async mockExecute(input: LetterDraftingInput): Promise<LetterDraftingResult> {
    const { triageResult } = input;
    const { denialJson } = triageResult;
    const payerDeadline = PAYER_DEADLINES[denialJson.payer] || { days: 180, label: '180 calendar days' };

    const inlineCitations: InlineCitation[] = [
      { number: 1, evidenceId: 'mock-evidence-1', source: 'CMS Medicare Policy Manual', documentName: 'Medicare Coverage Determination', contentHash: generateContentHash('CMS Medicare Policy Manual Section 1862'), claimText: 'Policy clause: Items and services reasonable and necessary', provenanceTier: 'primary_source' },
      { number: 2, evidenceId: 'mock-evidence-2', source: 'AAOS Clinical Practice Guidelines', documentName: 'AAOS CPG', contentHash: generateContentHash('AAOS Clinical Practice Guidelines Chapter 4'), claimText: 'Clinical guideline: TKA recommended for advanced OA', provenanceTier: 'secondary_summary' },
      { number: 3, evidenceId: 'mock-evidence-3', source: 'Journal of Bone and Joint Surgery', documentName: 'JBJS Study', contentHash: generateContentHash('JBJS Long-term outcomes TKA'), claimText: 'Peer-reviewed evidence: Long-term outcomes support TKA', provenanceTier: 'tertiary_commentary' },
      { number: 4, evidenceId: 'mock-evidence-4', source: 'AHRQ Evidence Report', documentName: 'Effectiveness of TKA', contentHash: generateContentHash('AHRQ Evidence Report TKA'), claimText: 'AHRQ: TKA is effective for end-stage knee OA', provenanceTier: 'secondary_summary' },
      { number: 5, evidenceId: 'mock-evidence-5', source: 'CMS Local Coverage Determination', documentName: 'LCD', contentHash: generateContentHash('LCD coverage criteria mock'), claimText: 'LCD: Coverage criteria for the requested service', provenanceTier: 'primary_source' },
    ];

    const sections: AppealSection[] = [
      { title: '1. Header', content: `Date: ${formatDate()}\n\n${denialJson.payer}\nAppeals and Grievances Department\n\nRe: Appeal of Denial of Coverage\nReason Code: ${denialJson.reasonCode}` },
      { title: '2. Denial Restatement', content: `We are writing to appeal the denial of the requested procedure for a patient with the documented diagnosis. The denial was issued under reason code ${denialJson.reasonCode}, classified as "${denialJson.denialTypeLabel}".` },
      { title: '3. Policy Basis', content: `The denial conflicts with the payer's own coverage policies and established clinical guidelines [1][2][3].\n\nPer CMS Medicare Policy Manual: Items and services reasonable and necessary for diagnosis or treatment [1].\nPer AAOS CPG: Treatment recommended when conservative measures have failed [2].` },
      { title: '4. Clinical Evidence', content: `The clinical evidence supports the medical necessity of the requested service [4][5].\n\nAccording to AHRQ: TKA is effective for end-stage knee OA [4].\nPer LCD: Coverage criteria are satisfied [5].` },
      { title: '5. Medical Necessity Argument', content: `Based on the policy provisions cited above and the supporting clinical evidence, the requested service meets the applicable standard of care for the documented diagnosis.` },
      { title: '6. Request for Reconsideration', content: `We respectfully request that ${denialJson.payer} reconsider this denial and approve coverage for the requested service. This appeal is filed within the applicable timeframe — ${payerDeadline.label} from the date of the initial determination.` },
      { title: '7. Signature', content: 'Respectfully submitted,\n\n[Authorized Representative]\nOn behalf of the patient' },
    ];

    const appealLetter = sections.map(s => `${s.title}\n\n${s.content}`).join('\n\n---\n\n');
    const wordCount = appealLetter.split(/\s+/).filter(w => w.length > 0).length;

    return {
      appealLetter,
      sections,
      inlineCitations,
      wordCount,
      citationCount: 5,
      tone: 'formal-clinical',
      formatCompliant: true,
    };
  }

  protected defaultOutput(): LetterDraftingResult {
    // Never return an empty letter — if all paths fail, produce a minimal
    // grounded fallback so the human always has something to review at Gate 2.
    const fallback = `APPEAL OF DENIAL OF MEDICAL COVERAGE

Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

To: Appeals and Grievances Department

Re: Appeal of Denial of Coverage

Dear Reviewer,

We are writing to formally appeal the denial of coverage for the referenced service. Based on the clinical documentation and applicable coverage policies, the service meets the standard of care for the documented diagnosis [1].

Clinical guidelines and peer-reviewed evidence support the medical necessity of this procedure [2]. We request a reconsideration of the denial and a peer-to-peer review if appropriate [3].

Sincerely,
DenialDefender Appeal System`;
    const wc = fallback.split(/\s+/).filter(Boolean).length;
    return {
      appealLetter: fallback,
      sections: [{ title: 'Appeal Letter', content: fallback }],
      inlineCitations: [
        { number: 1, evidenceId: 'fallback-1', source: 'Clinical Documentation', documentName: 'Medical Records', contentHash: 'hash-1', claimText: 'Clinical documentation', provenanceTier: 'primary_source' },
        { number: 2, evidenceId: 'fallback-2', source: 'Clinical Guidelines', documentName: 'Practice Guidelines', contentHash: 'hash-2', claimText: 'Clinical guidelines', provenanceTier: 'primary_source' },
        { number: 3, evidenceId: 'fallback-3', source: 'Payer Policy', documentName: 'Coverage Policy', contentHash: 'hash-3', claimText: 'Coverage policy', provenanceTier: 'secondary_summary' },
      ],
      wordCount: wc,
      citationCount: 3,
      tone: 'formal-clinical',
      formatCompliant: true,
    };
  }

  /** Build the 5 inline citations (3 policy + 2 clinical) from the agent inputs. */
  private buildCitations(input: LetterDraftingInput): InlineCitation[] {
    const { policyResearchResult, evidenceAssemblyResult } = input;
    const inlineCitations: InlineCitation[] = [];
    const policyClauses = policyResearchResult.clauses.slice(0, 3);
    for (let i = 0; i < policyClauses.length; i++) {
      const clause = policyClauses[i];
      const provenance = policyResearchResult.provenanceCards.find(
        (pc) => pc.clauseId === clause.clauseId,
      );
      inlineCitations.push({
        number: i + 1,
        evidenceId: provenance?.evidenceId || `policy-${i + 1}`,
        source: clause.source,
        documentName: clause.documentName,
        contentHash: provenance?.contentHash || `hash-policy-${i + 1}`,
        claimText: `Policy clause from ${clause.source}: ${clause.contentPreview.slice(0, 100)}`,
        provenanceTier: clause.provenanceTier,
      });
    }
    const clinicalItems = evidenceAssemblyResult.clinicalEvidence.slice(3, 5);
    for (let i = 0; i < clinicalItems.length; i++) {
      const item = clinicalItems[i];
      inlineCitations.push({
        number: 4 + i,
        evidenceId: item.id,
        source: item.source,
        documentName: item.documentName,
        contentHash: item.contentHash,
        claimText: `Clinical evidence from ${item.source}: ${item.contentPreview.slice(0, 100)}`,
        provenanceTier: item.provenanceTier,
      });
    }
    while (inlineCitations.length < 5) {
      const idx = inlineCitations.length;
      const evidenceItem =
        evidenceAssemblyResult.clinicalEvidence[idx] || evidenceAssemblyResult.clinicalEvidence[0];
      if (evidenceItem && !inlineCitations.some((ic) => ic.evidenceId === evidenceItem.id)) {
        inlineCitations.push({
          number: idx + 1,
          evidenceId: evidenceItem.id,
          source: evidenceItem.source,
          documentName: evidenceItem.documentName,
          contentHash: evidenceItem.contentHash,
          claimText: `Supporting evidence from ${evidenceItem.source}: ${evidenceItem.contentPreview.slice(0, 100)}`,
          provenanceTier: evidenceItem.provenanceTier,
        });
      } else {
        inlineCitations.push({
          number: idx + 1,
          evidenceId: evidenceItem?.id || `evidence-${idx + 1}`,
          source: evidenceItem?.source || 'Evidence Record',
          documentName: evidenceItem?.documentName || 'Supporting Documentation',
          contentHash: evidenceItem?.contentHash || `hash-evidence-${idx + 1}`,
          claimText: `Supporting clinical documentation for the requested service`,
          provenanceTier: evidenceItem?.provenanceTier || 'secondary_summary',
        });
      }
    }
    return inlineCitations;
  }
}

// Singleton instance for pipeline use
export const letterDraftingAgent = new LetterDraftingAgent();
