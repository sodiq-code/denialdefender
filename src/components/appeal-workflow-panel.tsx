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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  AgentPipelineProgress,
  PIPELINE_STEPS,
} from '@/components/agent-step-indicator';
import { AppealLetterViewer } from '@/components/appeal-letter-viewer';
import { DecisionTraceFeed, type DecisionTraceEvent } from '@/components/decision-trace-feed';
import {
  ShieldCheck,
  Play,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  FileText,
  Send,
  PenTool,
  Beaker,
  Heart,
  Database,
  Scale,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────

interface PipelineTrace {
  agent: string;
  step: string;
  timestamp: string;
  status: 'started' | 'completed' | 'error' | 'blocked';
  detail: string;
  references?: string[];
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

interface LetterDrafting {
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

interface QualityReview {
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

interface Gate1Info {
  status: 'pending' | 'approved' | 'rejected';
  gateId: string | null;
  confirmPrompt: string;
}

interface Gate2Info {
  status: 'pending' | 'approved' | 'rejected';
  gateId: string | null;
}

interface PipelineResult {
  pipelineStatus:
    | 'awaiting_gate1'
    | 'gate1_rejected'
    | 'quality_review_failed'
    | 'completed'
    | 'awaiting_gate2';
  caseId: string | null;
  gate1: Gate1Info;
  gate2?: Gate2Info;
  advocate?: {
    urgencyLevel?: string;
    deadline?: string | null;
  };
  triage?: {
    denialType?: string;
    reasonCode?: string;
    payer?: string;
    confidence?: number;
    isAppealable?: boolean;
    appealStrategy?: string;
    humanConfirmPrompt?: string;
  };
  policyResearch?: {
    clauses?: Array<{ clauseId: string | null; documentName: string }>;
    retrievalLatencyMs?: number;
  } | null;
  evidenceAssembly?: {
    totalEvidenceItems?: number;
    evidenceStrength?: string;
    duplicatesRemoved?: number;
  } | null;
  letterDrafting?: LetterDrafting | null;
  qualityReview?: QualityReview | null;
  traces: PipelineTrace[];
  latencyMs?: number;
  dataSource?: 'live' | 'mock';
}

interface AppealWorkflowPanelProps {
  /** Optional callback when the pipeline completes (after Gate 2). */
  onPipelineComplete?: (caseId: string | null) => void;
}

// ─── Sample data ──────────────────────────────────────────────────────────

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

const SAMPLE_LETTER = `Medicare
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

APPEAL RIGHTS: You have the right to appeal this denial within 120 days of the date of this notice.`;

// ─── Component ────────────────────────────────────────────────────────────

export function AppealWorkflowPanel({
  onPipelineComplete,
}: AppealWorkflowPanelProps = {}) {
  const [denialText, setDenialText] = useState('');
  const [payer, setPayer] = useState('Medicare');
  const [running, setRunning] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [gate2Loading, setGate2Loading] = useState(false);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Run pipeline ────────────────────────────────────────────────────
  const runPipeline = useCallback(async () => {
    if (!denialText.trim() || !payer.trim()) {
      toast.error('Denial letter and payer are required');
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/full-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ denialText, payer }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Pipeline failed (${res.status})`);
      }
      const data: PipelineResult = await res.json();
      setResult(data);
      toast.success('Pipeline reached Gate 1', {
        description: data.caseId
          ? `Case ${data.caseId.slice(0, 12)}… awaiting human confirmation.`
          : 'Awaiting human confirmation.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      toast.error('Pipeline failed', { description: message.slice(0, 100) });
    } finally {
      setRunning(false);
    }
  }, [denialText, payer]);

  // ── Resume after Gate 1 ──────────────────────────────────────────────
  const handleGate1 = useCallback(
    async (action: 'approved' | 'rejected') => {
      if (!result?.caseId) {
        setError(
          'Cannot resume: case was not created. Re-run the pipeline and check the trace for the database error.',
        );
        toast.error('Cannot resume — no case ID');
        return;
      }
      setResuming(true);
      setError(null);
      try {
        const res = await fetch('/api/full-pipeline/resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caseId: result.caseId,
            gateStatus: action,
            cachedTriageResult: result.triage,
            cachedAdvocateResult: result.advocate,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Resume failed (${res.status})`);
        }
        const data: PipelineResult = await res.json();
        console.log('[resume] response keys:', Object.keys(data), '| letterDrafting?', !!data.letterDrafting, '| appealLetter len:', data.letterDrafting?.appealLetter?.length ?? 'n/a', '| wordCount:', data.letterDrafting?.wordCount ?? 'n/a');
        setResult((prev) => ({
          ...prev,
          ...data,
          // Preserve gate1 status (resume returns the new gate1 state too)
        }));
        if (action === 'approved') {
          toast.success('Gate 1 approved — agents 4–6 running', {
            description: data.letterDrafting
              ? `Appeal letter ready: ${data.letterDrafting.wordCount} words, ${data.letterDrafting.citationCount} citations.`
              : undefined,
          });
        } else {
          toast.warning('Gate 1 rejected — pipeline halted');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        toast.error('Resume failed', { description: message.slice(0, 100) });
      } finally {
        setResuming(false);
      }
    },
    [result],
  );

  // ── Gate 2 resolution ────────────────────────────────────────────────
  const handleGate2 = useCallback(
    async (resolution: 'approved' | 'rejected', submit = false) => {
      if (!result?.caseId) {
        toast.error('Cannot resolve Gate 2 — no case ID');
        return;
      }
      setGate2Loading(true);
      setError(null);
      try {
        // First resolve Gate 2
        const res = await fetch('/api/full-pipeline/gate2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caseId: result.caseId,
            resolution,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Gate 2 failed (${res.status})`);
        }
        const data = await res.json();

        if (submit && resolution === 'approved') {
          // Then submit
          const submitRes = await fetch('/api/full-pipeline/gate2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caseId: result.caseId, action: 'submit' }),
          });
          if (!submitRes.ok) {
            const submitData = await submitRes.json().catch(() => ({}));
            throw new Error(
              submitData.error ?? `Submit failed (${submitRes.status})`,
            );
          }
        }

        setResult((prev) =>
          prev
            ? {
                ...prev,
                gate2: {
                  status: resolution,
                  gateId: prev.gate2?.gateId ?? null,
                },
                pipelineStatus: submit
                  ? 'completed'
                  : prev.pipelineStatus,
              }
            : prev,
        );
        toast.success(
          resolution === 'approved'
            ? submit
              ? 'Appeal submitted to payer'
              : 'Gate 2 approved'
            : 'Gate 2 rejected — draft not submitted',
        );
        if (submit && resolution === 'approved') {
          onPipelineComplete?.(result.caseId);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        toast.error('Gate 2 failed', { description: message.slice(0, 100) });
      } finally {
        setGate2Loading(false);
      }
    },
    [result, onPipelineComplete],
  );

  // ── Pipeline progress (current step) ────────────────────────────────
  const currentStep = useMemo(() => {
    if (!result) return 0;
    if (result.pipelineStatus === 'awaiting_gate1') return 3;
    if (result.pipelineStatus === 'gate1_rejected') return 3;
    if (result.pipelineStatus === 'awaiting_gate2') return 7;
    if (result.pipelineStatus === 'completed') return 8;
    if (result.pipelineStatus === 'quality_review_failed') return 6;
    return 0;
  }, [result]);

  // ── Map pipeline traces to DecisionTraceEvent[] ────────────────────
  const traceEvents: DecisionTraceEvent[] = useMemo(() => {
    if (!result?.traces?.length) return [];
    return result.traces.map((t, idx) => ({
      id: `${t.agent}-${t.step}-${idx}`,
      case_id: result.caseId ?? '',
      agent_name: t.agent,
      step: t.step,
      status: t.status,
      details: t.detail,
      references: t.references?.join(', ') ?? null,
      timestamp: t.timestamp,
    }));
  }, [result]);

  return (
    <section
      aria-label="Appeal workflow"
      className="relative space-y-6"
    >
      {/* ── Hero / input ─────────────────────────────────────────────── */}
      <Card className="card-premium relative overflow-hidden border-primary/20">
        <div
          className="pointer-events-none absolute inset-0 gradient-hero opacity-70"
          aria-hidden
        />
        <CardHeader className="relative pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                <ShieldCheck className="h-6 w-6 text-primary" />
                New Appeal
              </CardTitle>
              <CardDescription className="mt-1 text-sm">
                Paste a denial letter — the 8-agent fleet will produce an
                evidence-grounded, citation-linked appeal.
              </CardDescription>
            </div>
            {result?.dataSource && (
              <Badge
                variant="outline"
                className="text-[10px] gap-1 border-primary/30 text-primary"
              >
                <Activity className="h-2.5 w-2.5" />
                {result.dataSource === 'live' ? 'Live (Gemini)' : 'Mock mode'}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="relative space-y-4">
          {/* Payer select + sample button */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <label
                htmlFor="payer-select"
                className="text-xs font-medium text-muted-foreground"
              >
                Payer
              </label>
              <Select value={payer} onValueChange={setPayer}>
                <SelectTrigger id="payer-select" className="h-11">
                  <SelectValue placeholder="Select payer" />
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDenialText(SAMPLE_LETTER);
                setPayer('Medicare');
              }}
              className="h-11 gap-1.5"
            >
              <PenTool className="h-3.5 w-3.5" />
              Load sample letter
            </Button>
          </div>

          {/* Denial letter textarea */}
          <div className="space-y-1.5">
            <label
              htmlFor="denial-text"
              className="text-xs font-medium text-muted-foreground"
            >
              Denial letter
            </label>
            <Textarea
              id="denial-text"
              value={denialText}
              onChange={(e) => setDenialText(e.target.value)}
              placeholder="Paste the denial letter text here…"
              className="min-h-[160px] text-sm font-mono bg-background leading-relaxed"
            />
            <p className="text-[11px] text-muted-foreground">
              {denialText.trim().split(/\s+/).filter(Boolean).length} words •
              PHI is automatically redacted by the PHI Guard before reaching
              the agents.
            </p>
          </div>

          {/* Run button */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={runPipeline}
              disabled={running || !denialText.trim() || !payer.trim()}
              size="lg"
              className="gap-2 h-11"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running pipeline…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run pipeline
                </>
              )}
            </Button>
            {error && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg p-3 flex-1 min-w-[200px]"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Pipeline error</p>
                  <p className="text-xs mt-0.5">{error}</p>
                </div>
              </motion.div>
            )}
          </div>

          {/* Pipeline progress indicator */}
          {(running || result) && (
            <div className="pt-2">
              <AgentPipelineProgress
                currentStep={running ? 1 : currentStep}
                steps={PIPELINE_STEPS}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Gate 1 card ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {result?.gate1?.status === 'pending' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <Card className="card-premium border-amber-300/70 dark:border-amber-700/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-xl font-semibold tracking-tight flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Gate 1 — Confirm denial classification
                </CardTitle>
                <CardDescription className="text-sm">
                  A human must confirm the triage classification before
                  agents 4–6 (Policy, Evidence, Drafting, Quality) can run.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {result.triage && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {result.triage.reasonCode ?? '—'}
                      </Badge>
                      <span className="text-muted-foreground">
                        {result.triage.denialType ?? ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        className={
                          result.triage.isAppealable
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/70 dark:text-red-200'
                        }
                      >
                        {result.triage.isAppealable ? 'Appealable' : 'Not appealable'}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {result.triage.confidence != null
                          ? `${(result.triage.confidence * 100).toFixed(0)}% confidence`
                          : ''}
                      </span>
                    </div>
                  </div>
                )}
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                  <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
                    {result.gate1.confirmPrompt ||
                      result.triage?.humanConfirmPrompt ||
                      'Review the triage classification above and confirm to proceed.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    size="lg"
                    onClick={() => handleGate1('approved')}
                    disabled={resuming || !result.caseId}
                    className="gap-2 h-11 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {resuming ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Approve — run agents 4–6
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => handleGate1('rejected')}
                    disabled={resuming || !result.caseId}
                    className="gap-2 h-11 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </Button>
                  {!result.caseId && (
                    <p className="text-xs text-red-600 dark:text-red-400 self-center">
                      Case creation failed — check the trace below.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Triage + advocate summary ─────────────────────────────────── */}
      {result?.triage && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <Card className="card-premium">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Search className="h-4 w-4 text-teal-500" />
                Denial Triage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Classification</span>
                <Badge
                  className={
                    result.triage.isAppealable
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/70 dark:text-red-200'
                  }
                >
                  {result.triage.isAppealable ? 'Appealable' : 'Not appealable'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Strategy</span>
                <span className="text-xs font-medium capitalize">
                  {result.triage.appealStrategy?.replace(/_/g, ' ') ?? '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Confidence</span>
                <span className="font-mono text-xs">
                  {result.triage.confidence != null
                    ? `${(result.triage.confidence * 100).toFixed(0)}%`
                    : '—'}
                </span>
              </div>
            </CardContent>
          </Card>
          <Card className="card-premium">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Heart className="h-4 w-4 text-rose-500" />
                Patient Advocate
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Urgency</span>
                <Badge variant="outline" className="capitalize text-[10px]">
                  {result.advocate?.urgencyLevel ?? 'standard'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Deadline</span>
                <span className="text-xs">
                  {(() => {
                    const d = result.advocate?.deadline;
                    if (!d) return '—';
                    const dt = new Date(d);
                    // Reject implausible dates (e.g. "120" parsed as year 0120)
                    if (isNaN(dt.getTime()) || dt.getFullYear() < 2000) {
                      const days = result.advocate?.deadlineDaysRemaining;
                      return days ? `${days} days remaining` : '—';
                    }
                    return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                  })()}
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Policy + evidence + quality summary cards ────────────────── */}
      {result?.policyResearch && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <SummaryCard
            icon={<Database className="h-4 w-4 text-teal-500" />}
            title="Policy Research"
            metrics={[
              ['Clauses retrieved', `${result.policyResearch.clauses?.length ?? 0}`],
              [
                'Retrieval latency',
                `${result.policyResearch.retrievalLatencyMs ?? 0}ms`,
              ],
            ]}
          />
          {result.evidenceAssembly && (
            <SummaryCard
              icon={<FileText className="h-4 w-4 text-emerald-500" />}
              title="Evidence Assembly"
              metrics={[
                ['Items', `${result.evidenceAssembly.totalEvidenceItems ?? 0}`],
                ['Strength', result.evidenceAssembly.evidenceStrength ?? '—'],
                [
                  'Duplicates removed',
                  `${result.evidenceAssembly.duplicatesRemoved ?? 0}`,
                ],
              ]}
            />
          )}
          {result.qualityReview && (
            <SummaryCard
              icon={<Scale className="h-4 w-4 text-amber-500" />}
              title="Quality Review"
              metrics={[
                [
                  'Verdict',
                  result.qualityReview.overallVerdict ?? '—',
                  result.qualityReview.overallVerdict === 'PASS',
                ],
                [
                  'Score',
                  `${(result.qualityReview.overallScore ?? 0).toFixed(1)}`,
                ],
                [
                  'Citations verified',
                  `${result.qualityReview.citationsVerified ?? 0}/5`,
                ],
              ]}
            />
          )}
        </motion.div>
      )}

      {/* ── Appeal letter ─────────────────────────────────────────────── */}
      {result?.letterDrafting && (
        <AppealLetterViewer
          letter={result.letterDrafting.appealLetter}
          sections={result.letterDrafting.sections}
          wordCount={result.letterDrafting.wordCount}
          tone={result.letterDrafting.tone}
          citationsUsed={result.letterDrafting.inlineCitations.map((c) => ({
            number: c.number,
            id: c.evidenceId,
            provenance_tier: c.provenanceTier,
            short_ref: c.source,
          }))}
          provenanceRecords={Object.fromEntries(
            result.letterDrafting.inlineCitations.map((c) => [
              c.number,
              {
                id: c.evidenceId,
                source: c.source,
                document: c.documentName,
                section: undefined,
                provenance:
                  c.provenanceTier === 'primary_source'
                    ? 'primary_source'
                    : c.provenanceTier === 'secondary_summary'
                      ? 'secondary_summary'
                      : 'tertiary_commentary',
                contentHash: c.contentHash,
                contentPreview: c.claimText,
                retrievedDate: null,
                effectiveDate: null,
                url: undefined,
                status: undefined,
              },
            ]),
          )}
        />
      )}

      {/* ── Gate 2 card ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {result?.pipelineStatus === 'awaiting_gate2' &&
          (!result.gate2 || result.gate2.status === 'pending') && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <Card className="card-premium border-amber-300/70 dark:border-amber-700/70">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xl font-semibold tracking-tight flex items-center gap-2">
                    <Scale className="h-5 w-5 text-amber-500" />
                    Gate 2 — Approve appeal letter
                  </CardTitle>
                  <CardDescription className="text-sm">
                    A human must approve the appeal letter before it can be
                    submitted to the payer.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      size="lg"
                      onClick={() => handleGate2('approved', true)}
                      disabled={gate2Loading}
                      className="gap-2 h-11 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {gate2Loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Approve &amp; submit
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={() => handleGate2('rejected')}
                      disabled={gate2Loading}
                      className="gap-2 h-11 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
      </AnimatePresence>

      {/* ── Decision trace feed ───────────────────────────────────────── */}
      {result && traceEvents.length > 0 && (
        <Card className="card-premium">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-teal-500" />
                Decision trace
              </CardTitle>
              <Badge variant="outline" className="text-[10px] gap-1">
                <Beaker className="h-2.5 w-2.5" />
                {traceEvents.length} events
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <DecisionTraceFeed events={traceEvents} />
          </CardContent>
        </Card>
      )}

      {/* ── Pipeline status footer ───────────────────────────────────── */}
      {result && (
        <Separator />
      )}
      {result && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span>Status:</span>
          <Badge
            variant={
              result.pipelineStatus === 'completed'
                ? 'default'
                : result.pipelineStatus === 'gate1_rejected' ||
                    result.pipelineStatus === 'quality_review_failed'
                  ? 'destructive'
                  : 'outline'
            }
            className="capitalize"
          >
            {result.pipelineStatus.replace(/_/g, ' ')}
          </Badge>
          {result.latencyMs != null && (
            <span className="ml-auto flex items-center gap-1">
              <Activity className="h-3 w-3" />
              {result.latencyMs}ms total
            </span>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Helper: small summary card ────────────────────────────────────────

function SummaryCard({
  icon,
  title,
  metrics,
}: {
  icon: React.ReactNode;
  title: string;
  metrics: Array<[string, string, boolean?]>;
}) {
  return (
    <Card className="card-premium h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        {metrics.map(([label, value, positive]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-2"
          >
            <span className="text-muted-foreground text-xs">{label}</span>
            <span
              className={`text-xs font-medium font-mono ${
                positive === true
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : positive === false
                    ? 'text-red-600 dark:text-red-400'
                    : ''
              }`}
            >
              {value}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Optional: keep a Progress export for callers that want just the bar ─

export { Progress };
export default AppealWorkflowPanel;
