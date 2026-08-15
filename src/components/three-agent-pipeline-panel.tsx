'use client';

/**
 * DenialDefender — Three-Agent Pipeline Panel (Day 4)
 *
 * Interactive UI showing:
 * - Input: denial letter + payer + Run button
 * - Step 1: Patient Advocate result
 * - Step 2: Denial Triage result (structured denial JSON)
 * - HITL Gate 1: Confirm/Reject buttons
 * - Step 3: Policy Research (only after Gate 1 approved)
 * - Pipeline status + decision trace
 */

import { useState, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Separator } from '@/components/ui/separator';
import {
  Heart,
  Search,
  BookOpen,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Shield,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────

interface CaseFraming {
  patientSummary: string;
  denialImpact: string;
  urgencyLevel: 'critical' | 'high' | 'standard';
  recommendedActions: string[];
  deadline: string | null;
  deadlineDaysRemaining: number | null;
}

interface AdvocateResult {
  caseFraming: CaseFraming;
  empatheticNote: string;
}

interface DenialJson {
  payer: string;
  reasonCode: string;
  denialType: string;
  denialTypeLabel: string;
  category: string;
  confidence: number;
  cptCodes: string[];
  icdCodes: string[];
  amountDenied: number;
  deadline: string | null;
}

interface DenialClassification {
  isAppealable: boolean;
  appealStrategy: string;
  estimatedSuccessRate: number;
  keyFactors: string[];
}

interface TriageResult {
  denialJson: DenialJson;
  classification: DenialClassification;
  humanConfirmPrompt: string;
}

interface PolicyClause {
  number: number;
  clauseId: string | null;
  source: string;
  documentName: string;
  section: string | null;
  contentPreview: string;
  provenanceTier: string;
  relevanceScore: number;
  retrievalWeight: number;
}

interface PolicyResearchResult {
  clauses: PolicyClause[];
  provenanceCards: ProvenanceCardData[];
  retrievalLatencyMs: number;
  withinSla: boolean;
  summary: string;
}

interface ProvenanceCardData {
  evidenceId: string;
  source: string;
  documentName: string;
  section: string | null;
  provenanceTier: string;
  contentHash: string;
  payerName: string | null;
  denialType: string | null;
  clauseId: string | null;
  retrievalWeight: number;
}

interface TraceEvent {
  agent: string;
  step: string;
  timestamp: string;
  status: 'started' | 'completed' | 'error' | 'blocked';
  detail: string;
  latencyMs?: number;
}

interface PipelineResult {
  advocate: AdvocateResult;
  triage: TriageResult;
  gate1: {
    status: 'pending' | 'approved' | 'rejected';
    gateId: string | null;
    confirmPrompt: string;
  };
  policyResearch: PolicyResearchResult | null;
  pipelineStatus: 'awaiting_gate1' | 'gate1_rejected' | 'completed';
  caseId: string | null;
  latencyMs: number;
  traces: TraceEvent[];
}

// ─── Sample Data ──────────────────────────────────────────────────────────

const SAMPLES = [
  {
    id: 'sample-1',
    label: 'Medicare — Medical Necessity (CO-50, TKA)',
    payer: 'Medicare',
  },
  {
    id: 'sample-2',
    label: 'UnitedHealthcare — Prior Auth (CO-197, MRI)',
    payer: 'UnitedHealthcare',
  },
  {
    id: 'sample-3',
    label: 'Aetna — Coding (CO-4, E/M Level 3)',
    payer: 'Aetna',
  },
];

const PAYERS = ['Medicare', 'UnitedHealthcare', 'Aetna', 'Cigna', 'Humana', 'Anthem', 'Kaiser Permanente', 'Medicaid'];

// ─── Provenance Tier Badge ────────────────────────────────────────────────

function ProvenanceBadge({ tier }: { tier: string }) {
  switch (tier) {
    case 'primary_source':
      return <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200 border-teal-300 dark:border-teal-700">Primary Source</Badge>;
    case 'secondary_summary':
      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700">Secondary Summary</Badge>;
    case 'tertiary_commentary':
      return <Badge variant="outline" className="text-muted-foreground">Tertiary Commentary</Badge>;
    default:
      return <Badge variant="outline">{tier}</Badge>;
  }
}

// ─── Urgency Badge ────────────────────────────────────────────────────────

function UrgencyBadge({ level }: { level: string }) {
  switch (level) {
    case 'critical':
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-300 dark:border-red-700">Critical</Badge>;
    case 'high':
      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700">High</Badge>;
    default:
      return <Badge variant="outline">Standard</Badge>;
  }
}

// ─── Component ────────────────────────────────────────────────────────────

export function ThreeAgentPipelinePanel() {
  const [denialText, setDenialText] = useState('');
  const [payer, setPayer] = useState('Medicare');
  const [loading, setLoading] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Run pipeline
  const handleRun = useCallback(async () => {
    if (!denialText.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/three-agent-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ denialText, payer }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Pipeline failed');
      }

      const data: PipelineResult = await res.json();
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [denialText, payer]);

  // Load sample
  const handleLoadSample = useCallback(async (sampleId: string) => {
    try {
      const res = await fetch('/api/three-agent-pipeline');
      if (res.ok) {
        const data = await res.json();
        const sample = data.samples?.find((s: { id: string }) => s.id === sampleId);
        if (sample) {
          setPayer(sample.payer);
        }
      }
    } catch {
      // Fallback — set payer from local data
      const local = SAMPLES.find(s => s.id === sampleId);
      if (local) setPayer(local.payer);
    }

    // Load sample denial text
    const sampleTexts: Record<string, string> = {
      'sample-1': `Medicare\nClaims Adjudication Department\n\nDATE: March 4, 2026\n\nRE: Denial of Claim — 27447 (Total Knee Arthroplasty)\n\nDear Provider,\n\nThis letter is to inform you that the claim submitted for the above-referenced service has been denied.\n\nDENIAL REASON: CO50 — Non-covered services because it is not deemed medically necessary\n\nPAYER STATEMENT: The requested service is not medically necessary for the diagnosed condition. Conservative treatment options have not been adequately documented as exhausted.\n\nPROCEDURE: 27447 — Total Knee Arthroplasty\nDIAGNOSIS: M17.11 — Primary osteoarthritis, right knee\nAMOUNT DENIED: $34,250.00\n\nAPPEAL RIGHTS: You have the right to appeal this denial within 120 days of the date of this notice.\n\nAPPEAL DEADLINE: July 2, 2026`,
      'sample-2': `UnitedHealthcare\nPrior Authorization Department\n\nDATE: February 28, 2026\n\nRE: Denial of Claim — 70553 (MRI Brain With and Without Contrast)\n\nDear Provider,\n\nThis letter is to inform you that the claim submitted for the above-referenced service has been denied.\n\nDENIAL REASON: CO197 — Precertification/authorization/notification/pre-treatment absent\n\nPAYER STATEMENT: Precertification was not obtained prior to service delivery.\n\nPROCEDURE: 70553 — MRI brain with and without contrast\nDIAGNOSIS: G43.909 — Migraine, unspecified, not intractable\nAMOUNT DENIED: $2,890.00\n\nAPPEAL RIGHTS: You have the right to appeal this denial within 180 days of the date of this notice.\n\nAPPEAL DEADLINE: August 27, 2026`,
      'sample-3': `Aetna\nClaims Adjudication Department\n\nDATE: March 10, 2026\n\nRE: Denial of Claim — 99213 (Office Visit, Established Patient, Level 3)\n\nDear Provider,\n\nThis letter is to inform you that the claim submitted for the above-referenced service has been denied.\n\nDENIAL REASON: CO4 — The procedure code is inconsistent with the modifier used or is inconsistent with the diagnosis\n\nPAYER STATEMENT: Procedure code 99213 is inconsistent with the submitted diagnosis code.\n\nPROCEDURE: 99213 — Office visit, established patient, level 3\nDIAGNOSIS: K21.0 — Gastro-esophageal reflux disease with esophagitis\nAMOUNT DENIED: $156.00\n\nAPPEAL RIGHTS: You have the right to appeal this denial within 90 days of the date of this notice.\n\nAPPEAL DEADLINE: June 8, 2026`,
    };
    setDenialText(sampleTexts[sampleId] || '');
  }, []);

  // Gate 1 action
  const handleGate1 = useCallback(async (action: 'approved' | 'rejected') => {
    if (!result?.caseId) return;
    setResuming(true);
    setError(null);

    try {
      const res = await fetch('/api/three-agent-pipeline/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: result.caseId,
          gateStatus: action,
          triageResult: result.triage,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Resume failed');
      }

      const data: PipelineResult = await res.json();
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setResuming(false);
    }
  }, [result]);

  // Pipeline phase indicator
  const pipelinePhase = result
    ? result.pipelineStatus === 'completed'
      ? 'completed'
      : result.pipelineStatus === 'gate1_rejected'
        ? 'rejected'
        : result.gate1.status === 'pending'
          ? 'awaiting_gate1'
          : 'running'
    : 'idle';

  return (
    <div className="space-y-6">
      {/* ── Input Section ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5 text-emerald-600" />
            Three-Agent Pipeline
          </CardTitle>
          <CardDescription>
            Advocate → Triage → [Gate 1] → Policy Research
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sample selector */}
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-muted-foreground self-center">Samples:</span>
            {SAMPLES.map(sample => (
              <Button
                key={sample.id}
                variant="outline"
                size="sm"
                onClick={() => handleLoadSample(sample.id)}
                className="text-xs"
              >
                {sample.label}
              </Button>
            ))}
          </div>

          {/* Payer selector */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="w-full sm:w-48">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Payer</label>
              <Select value={payer} onValueChange={setPayer}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYERS.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Denial text */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Denial Letter</label>
            <Textarea
              value={denialText}
              onChange={e => setDenialText(e.target.value)}
              placeholder="Paste the denial letter text here..."
              className="min-h-40 font-mono text-sm"
            />
          </div>

          {/* Run button */}
          <Button
            onClick={handleRun}
            disabled={loading || !denialText.trim()}
            className="w-full sm:w-auto"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Running Pipeline...
              </>
            ) : (
              <>
                <Shield className="h-4 w-4 mr-2" />
                Run Three-Agent Pipeline
              </>
            )}
          </Button>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Pipeline Status Indicator ─────────────────────────── */}
      {result && (
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Pipeline:</span>
                {pipelinePhase === 'idle' && <Badge variant="outline">Idle</Badge>}
                {pipelinePhase === 'running' && (
                  <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200">
                    <Loader2 className="h-3 w-3 animate-spin mr-1" /> Running
                  </Badge>
                )}
                {pipelinePhase === 'awaiting_gate1' && (
                  <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                    <Clock className="h-3 w-3 mr-1" /> Awaiting Gate 1
                  </Badge>
                )}
                {pipelinePhase === 'rejected' && (
                  <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                    <XCircle className="h-3 w-3 mr-1" /> Gate 1 Rejected
                  </Badge>
                )}
                {pipelinePhase === 'completed' && (
                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Completed
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {result.caseId && <span>Case: {result.caseId.slice(0, 8)}...</span>}
                <span>{result.latencyMs}ms</span>
              </div>
            </div>

            {/* Phase progress bar */}
            <div className="flex items-center gap-1 mt-3">
              {[
                { label: 'Advocate', active: true, color: 'rose' },
                { label: 'Triage', active: true, color: 'teal' },
                { label: 'Gate 1', active: result.gate1.status !== 'pending' || pipelinePhase === 'awaiting_gate1', color: result.gate1.status === 'approved' ? 'emerald' : result.gate1.status === 'rejected' ? 'red' : 'amber' },
                { label: 'Policy', active: pipelinePhase === 'completed', color: 'emerald' },
              ].map((phase, idx, arr) => (
                <div key={phase.label} className="flex items-center">
                  <div className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    phase.active
                      ? phase.color === 'rose' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300'
                        : phase.color === 'teal' ? 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300'
                          : phase.color === 'emerald' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                            : phase.color === 'red' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                      : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
                  }`}>
                    {phase.label}
                  </div>
                  {idx < arr.length - 1 && <ChevronDown className="h-3 w-3 text-muted-foreground mx-0.5 rotate-[-90deg]" />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 1: Patient Advocate ──────────────────────────── */}
      {result && (
        <Card className="border-rose-200 dark:border-rose-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Heart className="h-5 w-5 text-rose-500" />
              Patient Advocate
              <Badge variant="outline" className="ml-auto text-xs">
                {result.advocate.caseFraming.urgencyLevel === 'critical' ? '🚨' : result.advocate.caseFraming.urgencyLevel === 'high' ? '⚡' : '📋'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Patient Summary */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Patient Summary</label>
              <p className="text-sm mt-0.5">{result.advocate.caseFraming.patientSummary}</p>
            </div>

            {/* Urgency + Deadline */}
            <div className="flex flex-wrap gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Urgency</label>
                <div className="mt-0.5"><UrgencyBadge level={result.advocate.caseFraming.urgencyLevel} /></div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Deadline</label>
                <p className="text-sm mt-0.5">
                  {result.advocate.caseFraming.deadline
                    ? `${result.advocate.caseFraming.deadline}${result.advocate.caseFraming.deadlineDaysRemaining !== null ? ` (${result.advocate.caseFraming.deadlineDaysRemaining}d remaining)` : ''}`
                    : 'Not found'}
                </p>
              </div>
            </div>

            {/* Denial Impact */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Denial Impact</label>
              <p className="text-sm mt-0.5">{result.advocate.caseFraming.denialImpact}</p>
            </div>

            {/* Recommended Actions */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Recommended Actions</label>
              <ul className="mt-1 space-y-1">
                {result.advocate.caseFraming.recommendedActions.map((action, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <span className="text-rose-500 mt-0.5">•</span>
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Empathetic Note */}
            <div className="bg-rose-50 dark:bg-rose-950/30 rounded-md p-3 border border-rose-200 dark:border-rose-800">
              <label className="text-xs font-medium text-rose-600 dark:text-rose-400">Empathetic Note</label>
              <p className="text-sm mt-0.5 text-rose-800 dark:text-rose-200">{result.advocate.empatheticNote}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Denial Triage ─────────────────────────────── */}
      {result && (
        <Card className="border-teal-200 dark:border-teal-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-5 w-5 text-teal-500" />
              Denial Triage
              <Badge variant="outline" className="ml-auto text-xs">
                Confidence: {result.triage.denialJson.confidence.toFixed(2)}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Denial JSON Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Payer</label>
                <p className="text-sm mt-0.5 font-medium">{result.triage.denialJson.payer}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Reason Code</label>
                <p className="text-sm mt-0.5 font-mono">{result.triage.denialJson.reasonCode}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Denial Type</label>
                <p className="text-sm mt-0.5">{result.triage.denialJson.denialTypeLabel}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">CPT Codes</label>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {result.triage.denialJson.cptCodes.length > 0
                    ? result.triage.denialJson.cptCodes.map(c => (
                        <Badge key={c} variant="outline" className="text-xs font-mono">{c}</Badge>
                      ))
                    : <span className="text-xs text-muted-foreground">None</span>
                  }
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">ICD-10 Codes</label>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {result.triage.denialJson.icdCodes.length > 0
                    ? result.triage.denialJson.icdCodes.map(c => (
                        <Badge key={c} variant="outline" className="text-xs font-mono">{c}</Badge>
                      ))
                    : <span className="text-xs text-muted-foreground">None</span>
                  }
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Amount Denied</label>
                <p className="text-sm mt-0.5 font-medium">
                  {result.triage.denialJson.amountDenied > 0
                    ? `$${result.triage.denialJson.amountDenied.toLocaleString()}`
                    : 'Unknown'}
                </p>
              </div>
            </div>

            <Separator />

            {/* Classification */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground">Appealable:</label>
                {result.triage.classification.isAppealable ? (
                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-xs">Yes</Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 text-xs">No</Badge>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Appeal Strategy</label>
                <p className="text-sm mt-0.5">{result.triage.classification.appealStrategy}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Estimated Success Rate</label>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden max-w-32">
                    <div
                      className="h-full bg-teal-500 rounded-full"
                      style={{ width: `${result.triage.classification.estimatedSuccessRate * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{Math.round(result.triage.classification.estimatedSuccessRate * 100)}%</span>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Key Factors</label>
                <ul className="mt-1 space-y-1">
                  {result.triage.classification.keyFactors.map((factor, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <span className="text-teal-500 mt-0.5">•</span>
                      <span>{factor}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── HITL Gate 1 ──────────────────────────────────────── */}
      {result && (
        <Card className={`${
          result.gate1.status === 'pending'
            ? 'border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-950/10'
            : result.gate1.status === 'approved'
              ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/30 dark:bg-emerald-950/10'
              : 'border-red-300 dark:border-red-700 bg-red-50/30 dark:bg-red-950/10'
        }`}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-5 w-5 ${
                result.gate1.status === 'pending' ? 'text-amber-500' : result.gate1.status === 'approved' ? 'text-emerald-500' : 'text-red-500'
              }" />
              HITL Gate 1: Confirm Denial
              <Badge className={`ml-auto text-xs ${
                result.gate1.status === 'pending'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                  : result.gate1.status === 'approved'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              }`}>
                {result.gate1.status === 'pending' && <><Clock className="h-3 w-3 mr-1" /> Pending</>}
                {result.gate1.status === 'approved' && <><CheckCircle2 className="h-3 w-3 mr-1" /> Approved</>}
                {result.gate1.status === 'rejected' && <><XCircle className="h-3 w-3 mr-1" /> Rejected</>}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Confirm prompt */}
            <div className="rounded-md p-3 border border-current/10 bg-background/50">
              <p className="text-sm">{result.gate1.confirmPrompt}</p>
            </div>

            {/* Gate actions */}
            {result.gate1.status === 'pending' && (
              <div className="flex gap-3">
                <Button
                  onClick={() => handleGate1('approved')}
                  disabled={resuming}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1"
                >
                  {resuming ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Confirm Denial
                </Button>
                <Button
                  onClick={() => handleGate1('rejected')}
                  disabled={resuming}
                  variant="destructive"
                  className="flex-1"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
              </div>
            )}

            {result.gate1.status === 'approved' && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                Gate 1 approved — Policy Research completed below.
              </p>
            )}

            {result.gate1.status === 'rejected' && (
              <p className="text-sm text-red-600 dark:text-red-400">
                Gate 1 rejected — pipeline stopped. Policy Research will not run.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Policy Research ───────────────────────────── */}
      {result?.policyResearch && (
        <Card className="border-emerald-200 dark:border-emerald-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-5 w-5 text-emerald-500" />
              Policy Research
              <Badge variant="outline" className="ml-auto text-xs">
                {result.policyResearch.clauses.length} clauses • {result.policyResearch.retrievalLatencyMs}ms
                {result.policyResearch.withinSla ? ' (SLA met)' : ' (SLA missed)'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Summary */}
            <p className="text-sm text-muted-foreground">{result.policyResearch.summary}</p>

            {/* Clauses */}
            {result.policyResearch.clauses.length > 0 ? (
              <Accordion type="multiple" className="w-full">
                {result.policyResearch.clauses.map((clause) => (
                  <AccordionItem key={clause.number} value={`clause-${clause.number}`}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2 text-left">
                        <Badge variant="outline" className="text-xs font-mono shrink-0">#{clause.number}</Badge>
                        <ProvenanceBadge tier={clause.provenanceTier} />
                        <span className="text-sm truncate">{clause.documentName || clause.source}</span>
                        {clause.clauseId && (
                          <Badge variant="outline" className="text-[10px] font-mono shrink-0">{clause.clauseId}</Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div><span className="font-medium">Source:</span> {clause.source}</div>
                        <div><span className="font-medium">Section:</span> {clause.section || 'N/A'}</div>
                        <div><span className="font-medium">Relevance:</span> {clause.relevanceScore}</div>
                        <div><span className="font-medium">Weight:</span> {clause.retrievalWeight}</div>
                      </div>
                      <div className="bg-muted/50 rounded-md p-2 text-sm">
                        {clause.contentPreview}
                        {clause.contentPreview.length >= 200 && '...'}
                      </div>

                      {/* Provenance Card */}
                      {result.policyResearch!.provenanceCards[clause.number - 1] && (
                        <div className="border rounded-md p-2 text-xs space-y-1">
                          <div className="font-medium text-muted-foreground">Provenance Card</div>
                          {(() => {
                            const pc = result.policyResearch!.provenanceCards[clause.number - 1];
                            return (
                              <>
                                <div><span className="text-muted-foreground">Evidence ID:</span> {pc.evidenceId.slice(0, 12)}...</div>
                                <div><span className="text-muted-foreground">Content Hash:</span> {pc.contentHash.slice(0, 16)}...</div>
                                {pc.payerName && <div><span className="text-muted-foreground">Payer:</span> {pc.payerName}</div>}
                                {pc.denialType && <div><span className="text-muted-foreground">Denial Type:</span> {pc.denialType}</div>}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <p className="text-sm text-muted-foreground">No policy clauses found.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Decision Trace ────────────────────────────────────── */}
      {result && result.traces.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-5 w-5 text-muted-foreground" />
              Decision Trace
              <Badge variant="outline" className="ml-auto text-xs">{result.traces.length} events</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
              {result.traces.map((trace, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <Badge variant="outline" className={`shrink-0 text-[10px] ${
                    trace.status === 'completed' ? 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300'
                      : trace.status === 'error' ? 'border-red-300 text-red-700 dark:border-red-700 dark:text-red-300'
                        : trace.status === 'blocked' ? 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300'
                          : ''
                  }`}>
                    {trace.agent}
                  </Badge>
                  <span className="text-muted-foreground shrink-0">{trace.step}</span>
                  <span className="text-muted-foreground truncate">{trace.detail}</span>
                  {trace.latencyMs !== undefined && (
                    <span className="text-muted-foreground shrink-0 ml-auto">{trace.latencyMs}ms</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
