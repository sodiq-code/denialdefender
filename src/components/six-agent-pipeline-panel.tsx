'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  FileText,
  FlaskConical,
  PenTool,
  ShieldCheck,
  Database,
  Beaker,
  Activity,
} from 'lucide-react';
import { toast } from 'sonner';

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

interface TriageResult {
  denialJson: DenialJson;
  classification: {
    isAppealable: boolean;
    appealStrategy: string;
    estimatedSuccessRate: number;
    keyFactors: string[];
  };
  humanConfirmPrompt: string;
}

interface PolicyResearchResult {
  clauses: Array<{
    number: number;
    clauseId: string | null;
    source: string;
    documentName: string;
    section: string | null;
    contentPreview: string;
    provenanceTier: string;
    relevanceScore: number;
    retrievalWeight: number;
  }>;
  retrievalLatencyMs: number;
  withinSla: boolean;
  summary: string;
}

interface EvidenceAssemblyResult {
  clinicalEvidence: Array<{
    id: string;
    source: string;
    documentName: string;
    section: string | null;
    contentPreview: string;
    provenanceTier: string;
    relevanceScore: number;
    matchesDenialReason: boolean;
    contentHash: string;
  }>;
  deduplicatedClauses: Array<{
    clauseId: string | null;
    source: string;
    documentName: string;
    section: string | null;
    contentPreview: string;
    provenanceTier: string;
    isDuplicate: boolean;
    duplicateOf: string | null;
  }>;
  evidenceStrength: 'strong' | 'moderate' | 'weak';
  totalEvidenceItems: number;
  duplicatesRemoved: number;
}

interface InlineCitation {
  number: number;
  evidenceId: string;
  source: string;
  documentName: string;
  contentHash: string;
  claimText: string;
  provenanceTier: string;
}

interface LetterDraftingResult {
  appealLetter: string;
  sections: { title: string; content: string }[];
  inlineCitations: InlineCitation[];
  wordCount: number;
  citationCount: number;
  tone: string;
  formatCompliant: boolean;
}

interface BatteryResult {
  attackQuestion: string;
  passCondition: string;
  passed: boolean;
  details: string;
  severity: 'critical' | 'warning' | 'info';
}

interface QualityReviewResult {
  overallVerdict: 'PASS' | 'FAIL';
  overallScore: number;
  batteryResults: BatteryResult[];
  citationsVerified: number;
  unsupportedClaims: number;
  issues: Array<{
    category: string;
    description: string;
    severity: 'critical' | 'warning';
    citation?: number;
    suggestion: string;
  }>;
  canProceed: boolean;
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
  evidenceAssembly: EvidenceAssemblyResult | null;
  letterDrafting: LetterDraftingResult | null;
  qualityReview: QualityReviewResult | null;
  pipelineStatus:
    | 'awaiting_gate1'
    | 'gate1_rejected'
    | 'quality_review_failed'
    | 'completed';
  caseId: string | null;
  latencyMs: number;
  traces: TraceEvent[];
}

interface GateTestResult {
  goodDraft: {
    passed: boolean;
    verdict: string;
    score: number;
    citationsVerified: number;
  };
  brokenDraft: {
    blocked: boolean;
    verdict: string;
    score: number;
    failedChecks: string[];
  };
  gateResult: 'PASS' | 'FAIL';
}

// ─── Sample data ──────────────────────────────────────────────────────────

const SAMPLES = [
  {
    id: 'sample-1',
    label: 'Medicare — Medical Necessity (CO-50, TKA)',
    payer: 'Medicare',
  },
  {
    id: 'sample-2',
    label: 'UHC — Prior Auth (CO-197, MRI)',
    payer: 'UnitedHealthcare',
  },
  {
    id: 'sample-3',
    label: 'Aetna — Coding (CO-4, E/M)',
    payer: 'Aetna',
  },
];

const PAYERS = [
  'Medicare',
  'UnitedHealthcare',
  'Aetna',
  'Cigna',
  'Humana',
  'Anthem',
  'Kaiser Permanente',
  'Medicaid',
];

const SAMPLE_TEXTS: Record<string, string> = {
  'sample-1': `Medicare
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

APPEAL RIGHTS: You have the right to appeal this denial within 120 days of the date of this notice.`,
  'sample-2': `UnitedHealthcare
Prior Authorization Department

DATE: February 28, 2026

RE: Denial of Claim — 70553 (MRI Brain With and Without Contrast)

Dear Provider,

DENIAL REASON: CO197 — Precertification/authorization/notification/pre-treatment absent

PROCEDURE: 70553 — MRI brain with and without contrast
DIAGNOSIS: G43.909 — Migraine, unspecified
AMOUNT DENIED: $2,890.00

APPEAL RIGHTS: You have the right to appeal this denial within 180 days of the date of this notice.`,
  'sample-3': `Aetna
Claims Adjudication Department

DATE: March 10, 2026

RE: Denial of Claim — 99213 (Office Visit, Established Patient, Level 3)

Dear Provider,

DENIAL REASON: CO4 — The procedure code is inconsistent with the modifier used or is inconsistent with the diagnosis

PROCEDURE: 99213 — Office visit, established patient, level 3
DIAGNOSIS: K21.0 — Gastro-esophageal reflux disease with esophagitis
AMOUNT DENIED: $156.00

APPEAL RIGHTS: You have the right to appeal this denial within 60 days of the date of this notice.`,
};

// ─── Provenance badge ─────────────────────────────────────────────────────

function ProvenanceBadge({ tier }: { tier: string }) {
  switch (tier) {
    case 'primary_source':
      return (
        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700 text-[10px]">
          Primary
        </Badge>
      );
    case 'secondary_summary':
      return (
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-200 border-amber-300 dark:border-amber-700 text-[10px]">
          Secondary
        </Badge>
      );
    case 'tertiary_commentary':
      return (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          Tertiary
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-[10px]">
          {tier}
        </Badge>
      );
  }
}

// ─── Agent step ───────────────────────────────────────────────────────────

interface AgentStepProps {
  name: string;
  icon: React.ReactNode;
  color: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'blocked' | 'pending';
  detail?: string;
  latencyMs?: number;
}

function AgentStep({
  name,
  icon,
  color,
  status,
  detail,
  latencyMs,
}: AgentStepProps) {
  const statusIcon: Record<typeof status, React.ReactNode> = {
    idle: <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />,
    running: <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />,
    completed: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
    failed: <XCircle className="h-3.5 w-3.5 text-red-500" />,
    blocked: <AlertCircle className="h-3.5 w-3.5 text-red-500" />,
    pending: <Clock className="h-3.5 w-3.5 text-amber-500" />,
  };
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="flex items-center gap-2 py-1.5"
    >
      <div
        className={`flex items-center justify-center h-7 w-7 rounded-md ${color}`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{name}</span>
          {statusIcon[status]}
          {latencyMs !== undefined && status === 'completed' && (
            <span className="text-[10px] text-muted-foreground font-mono">
              {latencyMs}ms
            </span>
          )}
        </div>
        {detail && (
          <p className="text-xs text-muted-foreground truncate">{detail}</p>
        )}
      </div>
    </motion.div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────

export function SixAgentPipelinePanel() {
  const [denialText, setDenialText] = useState('');
  const [payer, setPayer] = useState('Medicare');
  const [loading, setLoading] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [gateTestLoading, setGateTestLoading] = useState(false);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [gateTestResult, setGateTestResult] = useState<GateTestResult | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [activeCitation, setActiveCitation] = useState<number | null>(null);

  // ── Run pipeline ──────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    if (!denialText.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setGateTestResult(null);
    try {
      const res = await fetch('/api/six-agent-pipeline', {
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
      toast.success('Pipeline reached Gate 1');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      toast.error('Pipeline failed', { description: message.slice(0, 80) });
    } finally {
      setLoading(false);
    }
  }, [denialText, payer]);

  const handleLoadSample = useCallback((sampleId: string) => {
    const local = SAMPLES.find((s) => s.id === sampleId);
    if (local) setPayer(local.payer);
    setDenialText(SAMPLE_TEXTS[sampleId] || '');
  }, []);

  // ── Gate 1 action ──────────────────────────────────────────────────────
  const handleGate1 = useCallback(
    async (action: 'approved' | 'rejected') => {
      if (!result?.caseId) {
        setError(
          'Cannot resume pipeline: case was not created in the database. Check the Decision Trace for the database error and re-run the pipeline.',
        );
        toast.error('Cannot resume — no case ID');
        return;
      }
      setResuming(true);
      setError(null);
      try {
        const res = await fetch('/api/six-agent-pipeline/resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caseId: result.caseId,
            gateStatus: action,
            triageResult: result.triage,
            advocateResult: result.advocate,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Resume failed');
        }
        const data: PipelineResult = await res.json();
        setResult(data);
        if (action === 'approved') {
          toast.success('Gate 1 approved — agents 4–6 complete');
        } else {
          toast.warning('Gate 1 rejected — pipeline halted');
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        toast.error('Resume failed', { description: message.slice(0, 80) });
      } finally {
        setResuming(false);
      }
    },
    [result],
  );

  // ── Gate test ─────────────────────────────────────────────────────────
  const handleGateTest = useCallback(async () => {
    if (!denialText.trim()) return;
    setGateTestLoading(true);
    setError(null);
    setGateTestResult(null);
    try {
      const res = await fetch('/api/six-agent-pipeline/gate-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ denialText, payer }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Gate test failed');
      }
      const data: GateTestResult = await res.json();
      setGateTestResult(data);
      toast.success(`Gate test: ${data.gateResult}`, {
        description: data.gateResult === 'PASS'
          ? 'Adversarial battery correctly blocked broken draft'
          : 'Battery failed to block broken draft',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      toast.error('Gate test failed', { description: message.slice(0, 80) });
    } finally {
      setGateTestLoading(false);
    }
  }, [denialText, payer]);

  // ── Derived state ──────────────────────────────────────────────────────
  const hasResult = result !== null;
  const gate1Status = result?.gate1.status;
  const hasPolicy = result !== null && result.policyResearch !== null;
  const hasEvidence = result !== null && result.evidenceAssembly !== null;
  const hasDraft = result !== null && result.letterDrafting !== null;
  const hasQuality = result !== null && result.qualityReview !== null;
  const qualityPassed = result?.qualityReview?.overallVerdict === 'PASS';

  const letterParts = useMemo(() => {
    if (!result?.letterDrafting?.appealLetter) return [];
    return result.letterDrafting.appealLetter.split(/(\[\d+\])/);
  }, [result?.letterDrafting?.appealLetter]);

  return (
    <section className="space-y-6" aria-label="Six-agent pipeline">
      {/* ── Input ───────────────────────────────────────────────────── */}
      <Card className="card-premium relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 gradient-hero opacity-60"
          aria-hidden
        />
        <CardHeader className="relative pb-3">
          <CardTitle className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Appeal Generation Pipeline
          </CardTitle>
          <CardDescription className="text-sm">
            Advocate → Triage → [Gate 1] → Policy → Evidence → Draft → Quality
            Review.
          </CardDescription>
        </CardHeader>
        <CardContent className="relative space-y-4">
          {/* Samples */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground">Samples:</span>
            {SAMPLES.map((sample) => (
              <Button
                key={sample.id}
                variant="outline"
                size="sm"
                onClick={() => handleLoadSample(sample.id)}
                className="text-xs h-8"
              >
                {sample.label}
              </Button>
            ))}
          </div>

          {/* Payer + Denial text */}
          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Payer
              </label>
              <Select value={payer} onValueChange={setPayer}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYERS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Denial letter
              </label>
              <Textarea
                value={denialText}
                onChange={(e) => setDenialText(e.target.value)}
                placeholder="Paste the denial letter text here…"
                className="min-h-[120px] text-sm font-mono h-11 sm:min-h-[120px] sm:h-auto"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleRun}
              disabled={loading || !denialText.trim()}
              className="gap-2 h-11"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running…
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  Run pipeline
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleGateTest}
              disabled={gateTestLoading || !denialText.trim()}
              className="gap-2 h-11"
            >
              {gateTestLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Testing…
                </>
              ) : (
                <>
                  <Beaker className="h-4 w-4" />
                  Gate test
                </>
              )}
            </Button>
          </div>

          {error && (
            <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Pipeline steps ─────────────────────────────────────────── */}
      {hasResult && (
        <Card className="card-premium">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Pipeline Steps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <AgentStep
              name="Patient Advocate"
              icon={<Heart className="h-4 w-4 text-white" />}
              color="bg-rose-500"
              status={hasResult ? 'completed' : 'idle'}
              detail={
                result?.advocate.caseFraming.urgencyLevel
                  ? `Urgency: ${result.advocate.caseFraming.urgencyLevel}`
                  : undefined
              }
            />
            <AgentStep
              name="Denial Triage"
              icon={<Search className="h-4 w-4 text-white" />}
              color="bg-teal-500"
              status={hasResult ? 'completed' : 'idle'}
              detail={result?.triage.denialJson.denialTypeLabel}
            />
            <AgentStep
              name="HITL Gate 1"
              icon={<Shield className="h-4 w-4 text-white" />}
              color={
                gate1Status === 'approved'
                  ? 'bg-emerald-500'
                  : gate1Status === 'rejected'
                    ? 'bg-red-500'
                    : 'bg-amber-500'
              }
              status={
                gate1Status === 'pending'
                  ? 'pending'
                  : gate1Status === 'approved'
                    ? 'completed'
                    : gate1Status === 'rejected'
                      ? 'failed'
                      : 'idle'
              }
              detail={
                gate1Status === 'pending'
                  ? 'Awaiting human confirmation'
                  : gate1Status === 'approved'
                    ? 'Approved'
                    : gate1Status === 'rejected'
                      ? 'Rejected'
                      : undefined
              }
            />
            <AgentStep
              name="Policy Research"
              icon={<BookOpen className="h-4 w-4 text-white" />}
              color="bg-emerald-500"
              status={
                hasPolicy
                  ? 'completed'
                  : gate1Status === 'approved'
                    ? 'running'
                    : 'idle'
              }
              detail={
                hasPolicy
                  ? `${result!.policyResearch!.clauses.length} clauses retrieved`
                  : undefined
              }
              latencyMs={
                hasPolicy ? result!.policyResearch!.retrievalLatencyMs : undefined
              }
            />
            <AgentStep
              name="Evidence Assembly"
              icon={<Database className="h-4 w-4 text-white" />}
              color="bg-teal-600"
              status={
                hasEvidence ? 'completed' : hasPolicy ? 'running' : 'idle'
              }
              detail={
                hasEvidence
                  ? `${result!.evidenceAssembly!.totalEvidenceItems} items, ${result!.evidenceAssembly!.evidenceStrength} strength`
                  : undefined
              }
            />
            <AgentStep
              name="Letter Drafting"
              icon={<PenTool className="h-4 w-4 text-white" />}
              color="bg-emerald-600"
              status={hasDraft ? 'completed' : hasEvidence ? 'running' : 'idle'}
              detail={
                hasDraft
                  ? `${result!.letterDrafting!.wordCount} words, ${result!.letterDrafting!.citationCount} citations`
                  : undefined
              }
            />
            <AgentStep
              name="Quality Review"
              icon={<ShieldCheck className="h-4 w-4 text-white" />}
              color={
                hasQuality && qualityPassed
                  ? 'bg-emerald-500'
                  : hasQuality && !qualityPassed
                    ? 'bg-red-500'
                    : 'bg-amber-600'
              }
              status={
                hasQuality
                  ? qualityPassed
                    ? 'completed'
                    : 'failed'
                  : hasDraft
                    ? 'running'
                    : 'idle'
              }
              detail={
                hasQuality
                  ? `${result!.qualityReview!.overallVerdict} (${result!.qualityReview!.citationsVerified}/5 citations verified)`
                  : undefined
              }
            />

            {/* Gate 1 actions */}
            {gate1Status === 'pending' && (
              <div className="mt-4 space-y-3">
                <Separator />
                {!result!.caseId && (
                  <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                      <p className="text-sm font-medium text-red-800 dark:text-red-200">
                        Database Error — Pipeline Cannot Resume
                      </p>
                    </div>
                    <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">
                      Case creation failed. The Approve/Reject buttons are
                      disabled because there is no case record in the database.
                      Check the Decision Trace below for the error details.
                    </p>
                  </div>
                )}
                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-200 dark:border-amber-800">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">
                    HITL Gate 1 — Confirm Denial Classification
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mb-3 leading-relaxed">
                    {result!.gate1.confirmPrompt}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      size="sm"
                      onClick={() => handleGate1('approved')}
                      disabled={resuming || !result!.caseId}
                      title={
                        !result?.caseId
                          ? 'Disabled: Case creation failed'
                          : resuming
                            ? 'Resuming pipeline…'
                            : 'Approve and run Agents 4-6'
                      }
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-9"
                    >
                      {resuming ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Approve — run agents 4–6
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleGate1('rejected')}
                      disabled={resuming || !result!.caseId}
                      className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30 gap-1.5 h-9"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Pipeline status */}
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Status:</span>
              <Badge
                variant={
                  result!.pipelineStatus === 'completed'
                    ? 'default'
                    : result!.pipelineStatus === 'gate1_rejected' ||
                        result!.pipelineStatus === 'quality_review_failed'
                      ? 'destructive'
                      : 'outline'
                }
                className="capitalize"
              >
                {result!.pipelineStatus.replace(/_/g, ' ')}
              </Badge>
              <span className="text-xs text-muted-foreground font-mono">
                ({result!.latencyMs}ms)
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Appeal letter ──────────────────────────────────────────── */}
      {hasDraft && (
        <Card className="card-premium border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <FileText className="h-5 w-5 text-primary" />
              Appeal Letter Draft
            </CardTitle>
            <CardDescription className="text-xs">
              {result!.letterDrafting!.wordCount} words ·{' '}
              {result!.letterDrafting!.citationCount} citations ·{' '}
              {result!.letterDrafting!.tone}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Letter text with clickable citations */}
            <div className="p-4 rounded-lg bg-muted/30 border border-border/70 text-sm whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto scrollbar-premium font-serif">
              {letterParts.map((part, idx) => {
                const citationMatch = part.match(/^\[(\d+)\]$/);
                if (citationMatch) {
                  const num = parseInt(citationMatch[1], 10);
                  return (
                    <button
                      key={idx}
                      onClick={() =>
                        setActiveCitation(activeCitation === num ? null : num)
                      }
                      aria-label={`Citation ${num}`}
                      className={`inline-flex items-center justify-center px-1.5 py-0 mx-0.5 rounded text-xs font-bold transition-all hover:scale-110 ${
                        activeCitation === num
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-800'
                      }`}
                    >
                      [{num}]
                    </button>
                  );
                }
                return <span key={idx}>{part}</span>;
              })}
            </div>

            {/* Citation details popover-like card */}
            <AnimatePresence>
              {activeCitation !== null &&
                (() => {
                  const citation = result!.letterDrafting!.inlineCitations.find(
                    (ic) => ic.number === activeCitation,
                  );
                  if (!citation) return null;
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-sm"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-bold text-emerald-700 dark:text-emerald-300">
                          [{citation.number}]
                        </span>
                        <ProvenanceBadge tier={citation.provenanceTier} />
                        <button
                          onClick={() => setActiveCitation(null)}
                          aria-label="Close citation"
                          className="ml-auto p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900 rounded"
                        >
                          <XCircle className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" />
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">
                        <span className="font-medium">Source:</span>{' '}
                        {citation.source}
                      </p>
                      <p className="text-xs text-muted-foreground mb-1">
                        <span className="font-medium">Document:</span>{' '}
                        {citation.documentName}
                      </p>
                      <p className="text-xs text-muted-foreground mb-1">
                        <span className="font-medium">Claim:</span>{' '}
                        {citation.claimText}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        Hash: {citation.contentHash}
                      </p>
                    </motion.div>
                  );
                })()}
            </AnimatePresence>

            {/* Inline citations summary */}
            <div className="flex flex-wrap gap-2">
              {result!.letterDrafting!.inlineCitations.map((ic) => (
                <div
                  key={ic.number}
                  role="button"
                  tabIndex={0}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs cursor-pointer hover:bg-muted/70 transition-colors"
                  onClick={() =>
                    setActiveCitation(
                      activeCitation === ic.number ? null : ic.number,
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveCitation(
                        activeCitation === ic.number ? null : ic.number,
                      );
                    }
                  }}
                  aria-label={`Citation ${ic.number}`}
                >
                  <span className="font-bold">[{ic.number}]</span>
                  <span className="text-muted-foreground truncate max-w-[120px]">
                    {ic.source}
                  </span>
                  <ProvenanceBadge tier={ic.provenanceTier} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Quality Review battery ───────────────────────────────── */}
      {hasQuality && (
        <Card className="card-premium">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <ShieldCheck className="h-5 w-5 text-amber-600" />
              Quality Review — Adversarial Battery
            </CardTitle>
            <CardDescription className="text-xs">
              {result!.qualityReview!.overallVerdict} · Score:{' '}
              {result!.qualityReview!.overallScore} ·{' '}
              {result!.qualityReview!.citationsVerified}/5 citations verified
              · {result!.qualityReview!.unsupportedClaims} unsupported claims
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={`p-3 rounded-lg ${
                qualityPassed
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
              }`}
            >
              <div className="flex items-center gap-2">
                {qualityPassed ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                <span
                  className={`font-semibold ${
                    qualityPassed
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-red-700 dark:text-red-300'
                  }`}
                >
                  {qualityPassed
                    ? 'ALL CHECKS PASSED — Draft can proceed to Gate 2'
                    : 'QUALITY REVIEW FAILED — Draft blocked'}
                </span>
              </div>
            </div>

            {/* Battery results table */}
            <div className="overflow-x-auto scrollbar-premium">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70">
                    <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">
                      #
                    </th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">
                      Attack question
                    </th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">
                      Pass condition
                    </th>
                    <th className="text-center py-2 px-2 text-xs font-medium text-muted-foreground">
                      Result
                    </th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">
                      Severity
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result!.qualityReview!.batteryResults.map((br, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-border/50 last:border-0"
                    >
                      <td className="py-2 px-2 text-xs text-muted-foreground">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-2 text-xs max-w-[200px]">
                        {br.attackQuestion}
                      </td>
                      <td className="py-2 px-2 text-xs text-muted-foreground max-w-[150px]">
                        {br.passCondition}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {br.passed ? (
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200 text-[10px]">
                            PASS
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/70 dark:text-red-200 text-[10px]">
                            FAIL
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className="text-[10px]">
                          {br.severity === 'critical'
                            ? 'CRIT'
                            : br.severity === 'warning'
                              ? 'WARN'
                              : 'INFO'}{' '}
                          {br.severity}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Details accordion */}
            <Accordion type="multiple" className="w-full">
              {result!.qualityReview!.batteryResults.map((br, idx) => (
                <AccordionItem key={idx} value={`check-${idx}`}>
                  <AccordionTrigger className="text-xs py-2">
                    <span className="flex items-center gap-2">
                      {br.passed ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <XCircle className="h-3 w-3 text-red-500" />
                      )}
                      Check {idx + 1}: {br.attackQuestion.slice(0, 50)}…
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="text-xs text-muted-foreground leading-relaxed">
                    <p>
                      <span className="font-medium">Details:</span> {br.details}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            {/* Issues */}
            {result!.qualityReview!.issues.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">
                  Issues ({result!.qualityReview!.issues.length})
                </h4>
                {result!.qualityReview!.issues.map((issue, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded-md text-xs ${
                      issue.severity === 'critical'
                        ? 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
                        : 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge
                        variant={
                          issue.severity === 'critical'
                            ? 'destructive'
                            : 'outline'
                        }
                        className="text-[10px]"
                      >
                        {issue.severity}
                      </Badge>
                      <span className="font-medium">{issue.category}</span>
                      {issue.citation && (
                        <span className="text-muted-foreground">[{issue.citation}]</span>
                      )}
                    </div>
                    <p className="text-muted-foreground mb-1 leading-relaxed">
                      {issue.description}
                    </p>
                    <p className="text-muted-foreground">
                      <span className="font-medium">Suggestion:</span>{' '}
                      {issue.suggestion}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Evidence assembly detail ──────────────────────────────── */}
      {hasEvidence && (
        <Card className="card-premium">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Database className="h-5 w-5 text-teal-600" />
              Evidence Assembly
            </CardTitle>
            <CardDescription className="text-xs">
              {result!.evidenceAssembly!.totalEvidenceItems} items ·{' '}
              {result!.evidenceAssembly!.evidenceStrength} strength ·{' '}
              {result!.evidenceAssembly!.duplicatesRemoved} duplicates removed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-premium">
              {result!.evidenceAssembly!.clinicalEvidence.map((ev, idx) => (
                <motion.div
                  key={ev.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(idx * 0.04, 0.3) }}
                  className="flex items-start gap-2 p-2 rounded-md bg-muted/40 text-xs"
                >
                  <span className="font-bold text-muted-foreground min-w-[16px]">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-medium truncate">
                        {ev.source}
                      </span>
                      <ProvenanceBadge tier={ev.provenanceTier} />
                      {ev.matchesDenialReason && (
                        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200 text-[10px]">
                          Match
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground truncate">
                      {ev.contentPreview}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                      Hash: {ev.contentHash}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>

            {result!.evidenceAssembly!.deduplicatedClauses.length > 0 && (
              <div className="mt-3">
                <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                  Deduplicated policy clauses
                </h4>
                <div className="space-y-1">
                  {result!.evidenceAssembly!.deduplicatedClauses.map(
                    (dc, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 text-xs"
                      >
                        {dc.isDuplicate ? (
                          <XCircle className="h-3 w-3 text-amber-500" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        )}
                        <span className="truncate">{dc.source}</span>
                        {dc.isDuplicate && (
                          <span className="text-amber-600 dark:text-amber-400 text-[10px]">
                            dup of {dc.duplicateOf?.slice(0, 12)}
                          </span>
                        )}
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Gate test results ──────────────────────────────────────── */}
      {gateTestResult && (
        <Card className="card-premium">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <FlaskConical className="h-5 w-5 text-amber-600" />
              Gate Test Results
            </CardTitle>
            <CardDescription className="text-xs">
              Adversarial gate test: verifies Quality Review blocks a
              deliberately-broken draft.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={`p-3 rounded-md ${
                gateTestResult.goodDraft.passed
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {gateTestResult.goodDraft.passed ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <span className="font-semibold text-sm">Good draft</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Verdict: {gateTestResult.goodDraft.verdict} · Score:{' '}
                {gateTestResult.goodDraft.score} · Citations:{' '}
                {gateTestResult.goodDraft.citationsVerified}/5
              </p>
            </div>

            <div
              className={`p-3 rounded-md ${
                gateTestResult.brokenDraft.blocked
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {gateTestResult.brokenDraft.blocked ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <span className="font-semibold text-sm">
                  Broken draft (fake citation injected)
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-1">
                Verdict: {gateTestResult.brokenDraft.verdict} · Score:{' '}
                {gateTestResult.brokenDraft.score}
              </p>
              {gateTestResult.brokenDraft.failedChecks.length > 0 && (
                <div className="mt-1">
                  <p className="text-[10px] font-medium text-muted-foreground mb-0.5 uppercase tracking-wider">
                    Failed checks:
                  </p>
                  <ul className="list-disc list-inside text-[10px] text-muted-foreground space-y-0.5">
                    {gateTestResult.brokenDraft.failedChecks.map((fc, idx) => (
                      <li key={idx}>{fc}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div
              className={`p-4 rounded-md ${
                gateTestResult.gateResult === 'PASS'
                  ? 'bg-emerald-100 dark:bg-emerald-950/50 border-2 border-emerald-300 dark:border-emerald-700'
                  : 'bg-red-100 dark:bg-red-950/50 border-2 border-red-300 dark:border-red-700'
              }`}
            >
              <div className="flex items-center gap-3">
                {gateTestResult.gateResult === 'PASS' ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                ) : (
                  <XCircle className="h-6 w-6 text-red-600" />
                )}
                <div>
                  <p
                    className={`font-bold ${
                      gateTestResult.gateResult === 'PASS'
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-red-700 dark:text-red-300'
                    }`}
                  >
                    Gate result: {gateTestResult.gateResult}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {gateTestResult.gateResult === 'PASS'
                      ? 'The adversarial battery correctly blocked the broken draft. Quality Review is working as intended.'
                      : 'The adversarial battery FAILED to block the broken draft. The battery needs to be tightened before deployment.'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Decision trace ────────────────────────────────────────── */}
      {hasResult && result!.traces.length > 0 && (
        <Card className="card-premium">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-teal-500" />
              Decision trace
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-64 overflow-y-auto scrollbar-premium">
              {result!.traces.map((trace, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-start gap-2 text-xs border-l-2 border-border pl-2 py-1"
                >
                  <Badge
                    variant="outline"
                    className="text-[10px] min-w-[80px] justify-center font-mono"
                  >
                    {trace.agent.slice(0, 14)}
                  </Badge>
                  <span className="text-muted-foreground min-w-[60px] font-mono">
                    {trace.step.slice(0, 20)}
                  </span>
                  <span
                    className={
                      trace.status === 'completed'
                        ? 'text-emerald-600'
                        : trace.status === 'error' ||
                            trace.status === 'blocked'
                          ? 'text-red-600'
                          : 'text-amber-600'
                    }
                  >
                    {trace.status}
                  </span>
                  <span className="text-muted-foreground flex-1 truncate">
                    {trace.detail.slice(0, 80)}
                  </span>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

// Re-export for convenience.
export { Activity, ShieldCheck, Beaker };

export default SixAgentPipelinePanel;
