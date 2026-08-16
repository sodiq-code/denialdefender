'use client';

/**
 * DenialDefender — Day 6 Panel: Decision Trace + HITL Gates + UI Stream
 *
 * Full interactive UI2 showing:
 * - Input: denial letter + payer + Run button
 * - Live decision-trace stream (Figure 14.1 format)
 * - Both HITL gates with Confirm/Reject/Approve/Edit
 * - Appeal letter display with clickable provenance cards
 * - Letter edit with version history
 * - Triage edit → re-runs Policy Research
 * - Quality Review battery
 * - Gate test button
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Heart, Search, BookOpen, CheckCircle2, XCircle, Clock,
  Loader2, Shield, AlertCircle, FileText, PenTool,
  ShieldCheck, Database, Radio, Zap, Eye,
  Send, Edit3, History, ChevronDown, ChevronRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────

interface TraceChecklistItem {
  agent: string;
  label: string;
  completed: boolean;
  detail?: string;
}

interface StructuredTraceEvent {
  id?: string;
  caseId: string;
  agent: string;
  step: string;
  status: 'started' | 'completed' | 'error' | 'blocked';
  detail: string;
  timestamp: string;
  latencyMs?: number;
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

interface AppealSection {
  title: string;
  content: string;
}

interface BatteryResult {
  attackQuestion: string;
  passCondition: string;
  passed: boolean;
  details: string;
  severity: 'critical' | 'warning' | 'info';
}

interface PipelineState {
  phase: 'idle' | 'running-phase1' | 'awaiting-gate1' | 'running-phase2' | 'awaiting-gate2' | 'completed' | 'gate1-rejected' | 'quality-failed';
  caseId: string | null;
  pipelineStatus: string;
  traces: StructuredTraceEvent[];
  traceChecklist: TraceChecklistItem[];
  gate1: { status: string; gateId: string | null; confirmPrompt: string } | null;
  gate2: {
    status: string; gateId: string | null; reviewNote: string;
    appealLetter: string; citationCount: number; qualityScore: number;
  } | null;
  triage: {
    denialType: string; reasonCode: string; payer: string;
    confidence: number; isAppealable: boolean; appealStrategy: string;
    humanConfirmPrompt: string;
  } | null;
  policyResearch: { clauses: unknown[]; retrievalLatencyMs: number } | null;
  evidenceAssembly: { totalEvidenceItems: number; evidenceStrength: string; duplicatesRemoved: number } | null;
  letterDrafting: {
    appealLetter: string; sections: AppealSection[]; inlineCitations: InlineCitation[];
    wordCount: number; citationCount: number; formatCompliant: boolean;
  } | null;
  qualityReview: {
    overallVerdict: string; overallScore: number; citationsVerified: number;
    unsupportedClaims: number; canProceed: boolean; batteryResults: BatteryResult[];
    issues: { category: string; description: string; severity: string; suggestion: string }[];
  } | null;
  letterVersion: number;
  latencyMs: number;
  cachedTriageResult: unknown;
  cachedAdvocateResult: unknown;
}

// ─── Sample Denial Letters ─────────────────────────────────────────────────

const SAMPLE_LETTERS = [
  {
    label: 'Medicare — CO-50 TKA Denial',
    payer: 'Medicare',
    text: `DETERMINATION OF COVERAGE\n\nDate: August 20, 2026\nPatient ID: XXX-XX-4321\nClaim ID: CLM-2026-0815\n\nYour claim for CPT 27447 (Total Knee Arthroplasty) has been denied as not medically necessary.\n\nReason Code: CO-50\nDenial Category: Medical Necessity\nDiagnosis: M17.11 (Primary osteoarthritis, right knee)\nAmount Denied: $34,567.89\n\nPer Medicare Coverage Determination, the requested service does not meet the criteria for coverage under 42 CFR § 410.32.\n\nYou have 120 calendar days from the date of this determination to file an appeal.`,
  },
  {
    label: 'UnitedHealthcare — CO-15 Prior Auth',
    payer: 'UnitedHealthcare',
    text: `DENIAL NOTICE\n\nDate: August 18, 2026\nMember ID: UHC-987654\nClaim ID: UHC-2026-0818\n\nYour claim for CPT 70553 (MRI Brain with contrast) has been denied. Prior authorization was not obtained.\n\nReason Code: CO-15\nDenial Category: Prior Authorization Required\nDiagnosis: G43.909 (Migraine, unspecified)\nAmount Denied: $2,450.00\n\nPer UnitedHealthcare Medical Policy, this service requires prior authorization. No prior auth was on file.\n\nYou have 180 calendar days to file an appeal.`,
  },
  {
    label: 'Aetna — CO-4 Coding Error',
    payer: 'Aetna',
    text: `CLAIM DENIAL\n\nDate: August 15, 2026\nMember ID: AET-456789\nClaim ID: AET-2026-0815\n\nYour claim for CPT 99215 (Office Visit, Established Patient) has been denied. The procedure code is inconsistent with the modifier or diagnosis.\n\nReason Code: CO-4\nDenial Category: Coding/Billing Error\nDiagnosis: M54.5 (Low back pain)\nAmount Denied: $285.00\n\nPer Aetna Clinical Policy, the submitted code-modifier combination is not payable for the reported diagnosis.\n\nYou have 60 calendar days to file an appeal.`,
  },
];

// ─── Agent Step Config ─────────────────────────────────────────────────────

const AGENT_STEPS = [
  { agent: 'patient-advocate', label: 'Patient Advocate', icon: Heart, color: 'text-rose-600 dark:text-rose-400' },
  { agent: 'denial-triage', label: 'Denial Triage', icon: Search, color: 'text-teal-600 dark:text-teal-400' },
  { agent: 'policy-research', label: 'Policy Research', icon: BookOpen, color: 'text-emerald-600 dark:text-emerald-400' },
  { agent: 'evidence-assembly', label: 'Evidence Assembly', icon: Database, color: 'text-cyan-600 dark:text-cyan-400' },
  { agent: 'letter-drafting', label: 'Letter Drafting', icon: PenTool, color: 'text-violet-600 dark:text-violet-400' },
  { agent: 'quality-review', label: 'Quality Review', icon: ShieldCheck, color: 'text-purple-600 dark:text-purple-400' },
];

// ─── Component ─────────────────────────────────────────────────────────────

export function Day6PipelinePanel() {
  const [denialText, setDenialText] = useState(SAMPLE_LETTERS[0].text);
  const [payer, setPayer] = useState('Medicare');
  const [selectedSample, setSelectedSample] = useState('0');
  const [state, setState] = useState<PipelineState>({
    phase: 'idle', caseId: null, pipelineStatus: '', traces: [], traceChecklist: [],
    gate1: null, gate2: null, triage: null, policyResearch: null, evidenceAssembly: null,
    letterDrafting: null, qualityReview: null, letterVersion: 0, latencyMs: 0,
    cachedTriageResult: null, cachedAdvocateResult: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editedLetter, setEditedLetter] = useState('');
  const [editReason, setEditReason] = useState('');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [gateTestResult, setGateTestResult] = useState<Record<string, unknown> | null>(null);
  const [gateTestLoading, setGateTestLoading] = useState(false);

  const traceEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { traceEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [state.traces.length]);

  // ── Run Phase 1 (up to Gate 1) ───────────────────────────────────────
  const runPhase1 = useCallback(async () => {
    setLoading(true);
    setError(null);
    setState(prev => ({ ...prev, phase: 'running-phase1', traces: [], traceChecklist: [] }));

    try {
      const res = await fetch('/api/full-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ denialText, payer }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Pipeline failed');

      setState(prev => ({
        ...prev,
        phase: 'awaiting-gate1',
        caseId: data.caseId,
        pipelineStatus: data.pipelineStatus,
        traces: data.traces || [],
        traceChecklist: data.traceChecklist || [],
        gate1: data.gate1,
        triage: data.triage,
        latencyMs: data.latencyMs,
        cachedTriageResult: data.triage,
        cachedAdvocateResult: data.advocate,
      }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setState(prev => ({ ...prev, phase: 'idle' }));
    } finally {
      setLoading(false);
    }
  }, [denialText, payer]);

  // ── Resolve Gate 1 ───────────────────────────────────────────────────
  const resolveGate1 = useCallback(async (status: 'approved' | 'rejected') => {
    if (!state.caseId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/full-pipeline/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: state.caseId,
          gateStatus: status,
          cachedTriageResult: state.cachedTriageResult,
          cachedAdvocateResult: state.cachedAdvocateResult,
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Resume failed');

      const newPhase = data.pipelineStatus === 'awaiting_gate2' ? 'awaiting-gate2'
        : data.pipelineStatus === 'gate1_rejected' ? 'gate1-rejected'
        : data.pipelineStatus === 'quality_review_failed' ? 'quality-failed'
        : 'idle';

      setState(prev => ({
        ...prev,
        phase: newPhase,
        pipelineStatus: data.pipelineStatus,
        traces: [...prev.traces, ...(data.traces || [])],
        traceChecklist: data.traceChecklist || [],
        gate1: data.gate1,
        gate2: data.gate2,
        policyResearch: data.policyResearch,
        evidenceAssembly: data.evidenceAssembly,
        letterDrafting: data.letterDrafting,
        qualityReview: data.qualityReview,
        letterVersion: data.letterVersion || 0,
        latencyMs: data.latencyMs,
      }));

      if (data.letterDrafting?.appealLetter) {
        setEditedLetter(data.letterDrafting.appealLetter);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [state.caseId, state.cachedTriageResult, state.cachedAdvocateResult]);

  // ── Resolve Gate 2 ───────────────────────────────────────────────────
  const resolveGate2 = useCallback(async (resolution: 'approved' | 'rejected') => {
    if (!state.caseId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/full-pipeline/gate2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: state.caseId,
          resolution,
          editedLetter: editedLetter !== state.letterDrafting?.appealLetter ? editedLetter : undefined,
          editReason: editReason || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Gate 2 resolution failed');

      setState(prev => ({
        ...prev,
        phase: data.gate2Status === 'approved' ? 'completed' : 'awaiting-gate2',
        gate2: prev.gate2 ? { ...prev.gate2, status: data.gate2Status } : null,
        letterVersion: data.letterVersion || prev.letterVersion,
      }));

      if (data.gate2Status === 'approved') {
        // Submit the appeal automatically after approval
        await fetch('/api/full-pipeline/gate2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caseId: state.caseId, action: 'submit' }),
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [state.caseId, editedLetter, editReason, state.letterDrafting]);

  // ── Run Gate Test ────────────────────────────────────────────────────
  const runGateTest = useCallback(async () => {
    setGateTestLoading(true);
    setGateTestResult(null);
    try {
      const res = await fetch('/api/full-pipeline/gate-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ denialText, payer }),
      });
      const data = await res.json();
      setGateTestResult(data);
    } catch (err: unknown) {
      setGateTestResult({ error: err instanceof Error ? err.message : 'Gate test failed' });
    } finally {
      setGateTestLoading(false);
    }
  }, [denialText, payer]);

  // ── Sample letter selection ──────────────────────────────────────────
  const handleSampleSelect = useCallback((idx: string) => {
    setSelectedSample(idx);
    const sample = SAMPLE_LETTERS[parseInt(idx)];
    if (sample) {
      setDenialText(sample.text);
      setPayer(sample.payer);
    }
  }, []);

  // ── Derived state ────────────────────────────────────────────────────
  const isRunning = loading;
  const agentStepStatus = (agent: string): 'pending' | 'running' | 'completed' | 'error' => {
    const hasCompleted = state.traces.some(t => t.agent === agent && t.status === 'completed');
    const hasError = state.traces.some(t => t.agent === agent && t.status === 'error');
    const hasStarted = state.traces.some(t => t.agent === agent && t.status === 'started');
    if (hasError) return 'error';
    if (hasCompleted) return 'completed';
    if (hasStarted) return 'running';
    // For Gate 1 agents (advocate + triage), show running during phase 1
    if (agent === 'patient-advocate' && state.phase === 'running-phase1') return 'running';
    if (agent === 'denial-triage' && state.phase === 'running-phase1') return 'running';
    // For post-Gate 1 agents, show running during phase 2
    if (['policy-research', 'evidence-assembly', 'letter-drafting', 'quality-review'].includes(agent) && state.phase === 'running-phase2') return 'running';
    return 'pending';
  };

  const provenanceTierColor = (tier: string) => {
    switch (tier) {
      case 'primary_source': return 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200';
      case 'secondary_summary': return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Input Section ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-teal-600" />
            Day 6: Decision Trace + HITL Gates + UI Stream
          </CardTitle>
          <CardDescription>
            Full pipeline with live trace streaming, both HITL gates, letter editing with version history
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Sample Denial Letter</Label>
              <Select value={selectedSample} onValueChange={handleSampleSelect}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Select sample..." />
                </SelectTrigger>
                <SelectContent>
                  {SAMPLE_LETTERS.map((s, i) => (
                    <SelectItem key={i} value={String(i)}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Payer</Label>
              <Select value={payer} onValueChange={setPayer}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Medicare">Medicare</SelectItem>
                  <SelectItem value="UnitedHealthcare">UnitedHealthcare</SelectItem>
                  <SelectItem value="Aetna">Aetna</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Textarea
            value={denialText}
            onChange={(e) => setDenialText(e.target.value)}
            placeholder="Paste denial letter text here..."
            className="min-h-[120px] text-sm font-mono"
          />
          <div className="flex gap-3 flex-wrap">
            <Button
              onClick={runPhase1}
              disabled={isRunning || state.phase !== 'idle'}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {isRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Radio className="h-4 w-4 mr-2" />}
              Run Full Pipeline
            </Button>
            <Button
              onClick={runGateTest}
              disabled={gateTestLoading}
              variant="outline"
              className="border-purple-300 text-purple-700 hover:bg-purple-50"
            >
              {gateTestLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />}
              Gate Test
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Agent Step Progress ────────────────────────────────────────── */}
      {state.phase !== 'idle' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Pipeline Progress
              <Badge variant="outline" className="text-xs ml-auto">
                {state.latencyMs}ms
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {AGENT_STEPS.map((step) => {
                const status = agentStepStatus(step.agent);
                const Icon = step.icon;
                return (
                  <div
                    key={step.agent}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border ${
                      status === 'completed' ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950' :
                      status === 'running' ? 'border-teal-300 bg-teal-50 dark:border-teal-700 dark:bg-teal-950' :
                      status === 'error' ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950' :
                      'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${step.color} ${status === 'running' ? 'animate-pulse' : ''}`} />
                    <span className="text-[10px] font-medium text-center leading-tight">{step.label}</span>
                    {status === 'completed' && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                    {status === 'running' && <Loader2 className="h-3 w-3 text-teal-500 animate-spin" />}
                    {status === 'error' && <XCircle className="h-3 w-3 text-red-500" />}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Live Decision Trace Stream (Figure 14.1) ──────────────────── */}
      {state.traces.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4 text-cyan-500" />
              Live Decision Trace
              <Badge variant="outline" className="text-xs">{state.traces.length} events</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Figure 14.1 Checklist Format */}
            {state.traceChecklist.length > 0 && (
              <div className="bg-muted/30 rounded-lg p-4 space-y-3 border border-dashed border-muted-foreground/20">
                <p className="text-xs font-medium text-muted-foreground mb-2">Figure 14.1 — Decision Trace Checklist</p>
                {(() => {
                  const agents = [...new Set(state.traceChecklist.map(i => i.agent))];
                  return agents.map(agent => (
                    <div key={agent}>
                      <p className="text-sm font-semibold mb-1">{agent}</p>
                      <div className="ml-4 space-y-0.5">
                        {state.traceChecklist.filter(i => i.agent === agent).map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm">
                            {item.completed ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            ) : (
                              <div className="h-3.5 w-3.5 rounded-full border border-gray-300 shrink-0" />
                            )}
                            <span className={item.completed ? 'text-foreground' : 'text-muted-foreground'}>
                              {item.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}

            {/* Raw Trace Events Stream */}
            <Accordion type="single" collapsible>
              <AccordionItem value="raw-traces">
                <AccordionTrigger className="text-xs py-2">
                  Raw Trace Events ({state.traces.length})
                </AccordionTrigger>
                <AccordionContent>
                  <ScrollArea className="max-h-64 overflow-y-auto">
                    <div className="space-y-1.5 pr-4">
                      {state.traces.map((trace, idx) => (
                        <div
                          key={trace.id ?? idx}
                          className="flex items-start gap-2 rounded border bg-card p-2 text-xs hover:bg-accent/50 transition-colors"
                        >
                          <div className="mt-0.5 shrink-0">
                            {trace.status === 'completed' && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                            {trace.status === 'error' && <XCircle className="h-3 w-3 text-red-500" />}
                            {trace.status === 'blocked' && <AlertCircle className="h-3 w-3 text-amber-500" />}
                            {trace.status === 'started' && <Loader2 className="h-3 w-3 text-teal-500 animate-spin" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-teal-700 dark:text-teal-300">{trace.agent}</span>
                            <span className="text-muted-foreground mx-1">·</span>
                            <span className="text-muted-foreground">{trace.step}</span>
                            <p className="text-[10px] text-muted-foreground truncate mt-0.5">{trace.detail}</p>
                          </div>
                          {trace.latencyMs && (
                            <Badge variant="outline" className="text-[9px] px-1 shrink-0">{trace.latencyMs}ms</Badge>
                          )}
                        </div>
                      ))}
                      <div ref={traceEndRef} />
                    </div>
                  </ScrollArea>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* ── HITL Gate 1 ────────────────────────────────────────────────── */}
      {state.gate1 && state.phase === 'awaiting-gate1' && (
        <Card className="border-2 border-amber-300 dark:border-amber-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-500" />
              HITL Gate 1: Confirm Denial
              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 ml-auto">
                Pending Review
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {state.triage && (
              <div className="bg-muted/30 rounded p-3 text-sm space-y-1">
                <p><strong>Payer:</strong> {state.triage.payer}</p>
                <p><strong>Denial Type:</strong> {state.triage.denialType}</p>
                <p><strong>Reason Code:</strong> {state.triage.reasonCode}</p>
                <p><strong>Confidence:</strong> {(state.triage.confidence * 100).toFixed(0)}%</p>
                <p><strong>Appealable:</strong> {state.triage.isAppealable ? 'Yes' : 'No'}</p>
                <p><strong>Strategy:</strong> {state.triage.appealStrategy}</p>
              </div>
            )}
            <div className="flex gap-3">
              <Button
                onClick={() => resolveGate1('approved')}
                disabled={isRunning}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirm & Continue
              </Button>
              <Button
                onClick={() => resolveGate1('rejected')}
                disabled={isRunning}
                variant="destructive"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject & Stop
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Gate 1 Rejected ────────────────────────────────────────────── */}
      {state.phase === 'gate1-rejected' && (
        <Card className="border-2 border-red-300 dark:border-red-700">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <XCircle className="h-5 w-5" />
              <p className="font-medium">Pipeline Stopped — Gate 1 Rejected</p>
            </div>
            <p className="text-sm text-muted-foreground mt-1">The denial classification was rejected. No further processing.</p>
          </CardContent>
        </Card>
      )}

      {/* ── Quality Review Failed ──────────────────────────────────────── */}
      {state.phase === 'quality-failed' && state.qualityReview && (
        <Card className="border-2 border-red-300 dark:border-red-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-red-700">
              <XCircle className="h-4 w-4" />
              Quality Review FAILED — Pipeline Blocked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm mb-3">Score: {state.qualityReview.overallScore} — {state.qualityReview.issues.length} issues found</p>
            {state.qualityReview.issues.length > 0 && (
              <div className="space-y-2">
                {state.qualityReview.issues.map((issue, i) => (
                  <div key={i} className="text-xs bg-red-50 dark:bg-red-950 rounded p-2">
                    <Badge variant="destructive" className="text-[9px] mr-1">{issue.severity}</Badge>
                    <span className="font-medium">{issue.category}:</span> {issue.description}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Quality Review Battery Results ─────────────────────────────── */}
      {state.qualityReview && state.qualityReview.overallVerdict === 'PASS' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              Quality Review: PASS
              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 ml-auto">
                Score: {state.qualityReview.overallScore}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              {state.qualityReview.batteryResults.map((br, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs p-2 rounded ${br.passed ? 'bg-emerald-50 dark:bg-emerald-950' : 'bg-red-50 dark:bg-red-950'}`}>
                  {br.passed ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
                  <span className="font-medium flex-1">{br.attackQuestion.slice(0, 60)}</span>
                  <Badge variant="outline" className={`text-[9px] ${br.severity === 'critical' ? 'border-red-300 text-red-700' : 'border-amber-300 text-amber-700'}`}>
                    {br.severity}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── HITL Gate 2: Approve Appeal ────────────────────────────────── */}
      {state.phase === 'awaiting-gate2' && state.gate2 && (
        <Card className="border-2 border-amber-300 dark:border-amber-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-500" />
              HITL Gate 2: Approve Appeal
              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 ml-auto">
                Pending Review
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              Review the appeal letter with citation cards. Edit if needed, then approve or reject.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Appeal Letter Display */}
            {state.letterDrafting && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-violet-600" />
                  <span className="text-sm font-medium">Appeal Letter</span>
                  <Badge variant="outline" className="text-xs">{state.letterDrafting.wordCount} words</Badge>
                  <Badge variant="outline" className="text-xs">{state.letterDrafting.citationCount} citations</Badge>
                  <Badge variant="outline" className="text-xs">v{state.letterVersion}</Badge>
                </div>

                {/* Clickable Provenance Cards */}
                {state.letterDrafting.inlineCitations.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {state.letterDrafting.inlineCitations.map((cit) => (
                      <div
                        key={cit.number}
                        className="rounded border p-2.5 hover:shadow-md transition-shadow cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <Badge variant="outline" className="text-xs font-mono">[{cit.number}]</Badge>
                          <Badge className={`text-[9px] ${provenanceTierColor(cit.provenanceTier)}`}>
                            {cit.provenanceTier.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        <p className="text-xs font-medium truncate">{cit.source}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{cit.documentName}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{cit.claimText.slice(0, 100)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Editable Letter Text */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium flex items-center gap-1">
                    <Edit3 className="h-3 w-3" />
                    Edit Appeal Letter (optional)
                  </Label>
                  <Textarea
                    value={editedLetter}
                    onChange={(e) => setEditedLetter(e.target.value)}
                    className="text-sm font-serif min-h-[200px]"
                  />
                  {editedLetter !== state.letterDrafting.appealLetter && (
                    <div className="space-y-2">
                      <Input
                        value={editReason}
                        onChange={(e) => setEditReason(e.target.value)}
                        placeholder="Edit reason (for version history)..."
                        className="text-xs"
                      />
                      <p className="text-[10px] text-amber-600">
                        Letter has been edited. Changes will be tracked in version history.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <Separator />

            {/* Gate 2 Actions */}
            <div className="flex gap-3">
              <Button
                onClick={() => resolveGate2('approved')}
                disabled={isRunning}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Approve & Submit
              </Button>
              <Button
                onClick={() => resolveGate2('rejected')}
                disabled={isRunning}
                variant="destructive"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject & Revise
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Pipeline Completed ─────────────────────────────────────────── */}
      {state.phase === 'completed' && (
        <Card className="border-2 border-emerald-300 dark:border-emerald-700">
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
              <p className="font-medium">Gates Passed — Appeal Submitted Successfully</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="bg-muted/30 rounded p-2">
                <p className="text-[10px] text-muted-foreground">Case ID</p>
                <p className="font-mono text-xs">{state.caseId?.slice(0, 12)}...</p>
              </div>
              <div className="bg-muted/30 rounded p-2">
                <p className="text-[10px] text-muted-foreground">Trace Events</p>
                <p className="font-medium">{state.traces.length}</p>
              </div>
              <div className="bg-muted/30 rounded p-2">
                <p className="text-[10px] text-muted-foreground">Letter Version</p>
                <p className="font-medium">v{state.letterVersion}</p>
              </div>
              <div className="bg-muted/30 rounded p-2">
                <p className="text-[10px] text-muted-foreground">Total Latency</p>
                <p className="font-medium">{state.latencyMs}ms</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Gate Test Result ───────────────────────────────────────────── */}
      {gateTestResult && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-purple-500" />
              Day 6 Gate Test Result
              <Badge className={`ml-2 ${String(gateTestResult.gateResult) === 'PASS' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                {String(gateTestResult.gateResult)}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {gateTestResult.checks && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                {Object.entries(gateTestResult.checks as Record<string, unknown>).map(([key, value]) => (
                  <div key={key} className="bg-muted/30 rounded p-2">
                    <p className="text-[10px] text-muted-foreground">{key.replace(/([A-Z])/g, ' $1')}</p>
                    <p className="font-medium">{String(value)}</p>
                  </div>
                ))}
              </div>
            )}
            {gateTestResult.summary && (
              <p className="text-xs text-muted-foreground mt-3">{String(gateTestResult.summary)}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Error Display ──────────────────────────────────────────────── */}
      {error && (
        <Card className="border-red-300">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="h-4 w-4" />
              <p className="text-sm">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
