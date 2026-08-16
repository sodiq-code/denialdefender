'use client';

/**
 * DenialDefender — Day 7 Panel: Outcome Learning + Eval Service + Execution Paths
 *
 * Day 7 features:
 * 1. Eval Service — 10 held-out cases, 5 metrics, determinism gate
 * 2. Outcome Ingestion — weight updates, Memory Bank status
 * 3. Execution Paths — Live / Fallback / Demo-safe with reliability test
 * 4. Before-Scores Snapshot — baseline measurements
 */

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  FlaskConical, CheckCircle2, XCircle, Clock, Activity, Shield,
  ArrowRight, Play, Database, Zap, Server, AlertTriangle,
  BarChart3, Target, FileCheck, GitBranch, Loader2,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface MetricScore {
  metric: string;
  value: number;
  details: string;
}

interface CaseResult {
  caseId: string;
  caseName: string;
  metrics: Record<string, number>;
  error: string | null;
  latencyMs: number;
}

interface EvalSnapshot {
  runId: string;
  timestamp: string;
  temperature: number;
  totalCases: number;
  determinismHash: string;
  aggregateMetrics: Record<string, number>;
  caseSummaries: CaseResult[];
}

interface DeterminismResult {
  gatePassed: boolean;
  hashes: string[];
  detail: string;
  aggregateMetrics: Record<string, number>;
}

interface OutcomeIngestResult {
  success: boolean;
  outcomeId?: string;
  weightUpdates?: number;
  memoryBankStatus?: string;
  durationMs?: number;
}

interface ExecutionPathResult {
  path: string;
  success: boolean;
  appealLetterLength: number;
  citationCount: number;
  qualityScore: number;
  latencyMs: number;
  strategy: string;
  error: string | null;
}

interface DemoReliabilityResult {
  gateResult: string;
  gateDetail: string;
  livePath: { passed: boolean; latencyMs: number; error: string | null };
  fallbackPath: { passed: boolean; latencyMs: number; engagedWithin5s: boolean; error: string | null };
  demoSafePath: { passed: boolean; latencyMs: number; under10s: boolean; error: string | null };
  allPathsProduceUsableAppeal: boolean;
}

// ─── Metric Labels ──────────────────────────────────────────────────────────

const METRIC_LABELS: Record<string, string> = {
  top1_accuracy: 'Top-1 Accuracy',
  top3_accuracy: 'Top-3 Accuracy',
  citation_grounding: 'Citation Grounding',
  argument_selection: 'Argument Selection',
  appeal_quality: 'Appeal Quality',
};

const METRIC_COLORS: Record<string, string> = {
  top1_accuracy: 'text-emerald-600',
  top3_accuracy: 'text-blue-600',
  citation_grounding: 'text-amber-600',
  argument_selection: 'text-purple-600',
  appeal_quality: 'text-rose-600',
};

// ─── Main Component ────────────────────────────────────────────────────────

export default function Day7Panel() {
  // Eval state
  const [heldOutCases, setHeldOutCases] = useState<any[]>([]);
  const [evalSnapshot, setEvalSnapshot] = useState<EvalSnapshot | null>(null);
  const [evalRunning, setEvalRunning] = useState(false);
  const [determinismResult, setDeterminismResult] = useState<DeterminismResult | null>(null);
  const [determinismRunning, setDeterminismRunning] = useState(false);

  // Outcome state
  const [outcomeResult, setOutcomeResult] = useState<OutcomeIngestResult | null>(null);
  const [outcomeRunning, setOutcomeRunning] = useState(false);

  // Execution paths state
  const [pathResult, setPathResult] = useState<ExecutionPathResult | null>(null);
  const [pathRunning, setPathRunning] = useState(false);
  const [demoReliability, setDemoReliability] = useState<DemoReliabilityResult | null>(null);
  const [demoRunning, setDemoRunning] = useState(false);
  const [appealLetter, setAppealLetter] = useState('');

  // ─── Load Held-Out Cases ──────────────────────────────────────────────

  const loadCases = useCallback(async () => {
    try {
      const res = await fetch('/api/eval');
      const data = await res.json();
      if (data.success) setHeldOutCases(data.cases || []);
    } catch (e) {
      console.error('Failed to load held-out cases:', e);
    }
  }, []);

  // ─── Run Full Eval ────────────────────────────────────────────────────

  const runEval = useCallback(async () => {
    setEvalRunning(true);
    try {
      const res = await fetch('/api/eval', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saveToDisk: true }) });
      const data = await res.json();
      if (data.success) {
        setEvalSnapshot(data.snapshot);
      }
    } catch (e: any) {
      console.error('Eval failed:', e);
    } finally {
      setEvalRunning(false);
    }
  }, []);

  // ─── Verify Determinism ───────────────────────────────────────────────

  const verifyDeterminism = useCallback(async () => {
    setDeterminismRunning(true);
    try {
      const res = await fetch('/api/eval/determinism', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runs: 2 }) });
      const data = await res.json();
      if (data.success) {
        setDeterminismResult(data);
      }
    } catch (e: any) {
      console.error('Determinism check failed:', e);
    } finally {
      setDeterminismRunning(false);
    }
  }, []);

  // ─── Ingest Outcomes ──────────────────────────────────────────────────

  const ingestPublicOutcomes = useCallback(async () => {
    setOutcomeRunning(true);
    try {
      const res = await fetch('/api/outcome-ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ingestPublic: true }) });
      const data = await res.json();
      setOutcomeResult(data);
    } catch (e: any) {
      setOutcomeResult({ success: false });
    } finally {
      setOutcomeRunning(false);
    }
  }, []);

  const ingestSyntheticOutcomes = useCallback(async () => {
    setOutcomeRunning(true);
    try {
      const res = await fetch('/api/outcome-ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ingestSynthetic: true, count: 10 }) });
      const data = await res.json();
      setOutcomeResult(data);
    } catch (e: any) {
      setOutcomeResult({ success: false });
    } finally {
      setOutcomeRunning(false);
    }
  }, []);

  // ─── Test Execution Paths ─────────────────────────────────────────────

  const testPath = useCallback(async (path: string) => {
    setPathRunning(true);
    try {
      const res = await fetch('/api/execution-paths', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path,
          denialText: 'UnitedHealthcare\nClaims Adjudication Department\n\nDATE: January 15, 2026\n\nRE: Denial of Claim — 27447\n\nDENIAL REASON: CO50 — Not medically necessary',
          payer: 'UnitedHealthcare',
          denialCategory: 'medical_necessity',
          cptCode: '27447',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPathResult(data.result);
        setAppealLetter(data.appealLetter || '');
      }
    } catch (e: any) {
      console.error('Path test failed:', e);
    } finally {
      setPathRunning(false);
    }
  }, []);

  // ─── Test Demo Reliability ────────────────────────────────────────────

  const testDemoReliabilityGate = useCallback(async () => {
    setDemoRunning(true);
    try {
      const res = await fetch('/api/execution-paths/demo-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          denialText: 'UnitedHealthcare\n\nDENIAL REASON: CO50 — Not medically necessary',
          payer: 'UnitedHealthcare',
          denialCategory: 'medical_necessity',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDemoReliability(data);
      }
    } catch (e: any) {
      console.error('Demo reliability test failed:', e);
    } finally {
      setDemoRunning(false);
    }
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FlaskConical className="h-6 w-6 text-emerald-600" />
        <div>
          <h2 className="text-xl font-semibold">Day 7: Outcome Learning + Eval + Execution Paths</h2>
          <p className="text-sm text-muted-foreground">
            Evaluation harness, outcome ingestion, demo reliability — 3 execution paths
          </p>
        </div>
      </div>

      <Tabs defaultValue="eval" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="eval">
            <BarChart3 className="h-4 w-4 mr-1" />
            Eval Service
          </TabsTrigger>
          <TabsTrigger value="outcome">
            <GitBranch className="h-4 w-4 mr-1" />
            Outcome Learning
          </TabsTrigger>
          <TabsTrigger value="paths">
            <Server className="h-4 w-4 mr-1" />
            Execution Paths
          </TabsTrigger>
        </TabsList>

        {/* ─── EVAL SERVICE TAB ─────────────────────────────────────────── */}
        <TabsContent value="eval" className="space-y-4">
          {/* Held-Out Cases */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4" />
                10 Held-Out Cases
              </CardTitle>
              <CardDescription>
                Fixed, deterministic test cases — not randomly generated
              </CardDescription>
            </CardHeader>
            <CardContent>
              {heldOutCases.length === 0 ? (
                <Button onClick={loadCases} variant="outline" size="sm">
                  Load Held-Out Cases
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="outline">{heldOutCases.length} cases loaded</Badge>
                    <Badge variant="outline">temperature = 0</Badge>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {heldOutCases.map((c, i) => (
                      <div key={c.id} className="flex items-center gap-3 p-2 rounded-md bg-muted/50 text-sm">
                        <span className="font-mono text-xs text-muted-foreground w-6">{i + 1}.</span>
                        <span className="font-medium flex-1">{c.name}</span>
                        <Badge variant="secondary" className="text-xs">{c.payer}</Badge>
                        <Badge variant="outline" className="text-xs">{c.category}</Badge>
                        <Badge className={`text-xs ${c.shouldAppeal ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                          {c.shouldAppeal ? 'Appealable' : 'Not Appealable'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Run Eval */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Play className="h-4 w-4" />
                Before-Scores Eval Run
              </CardTitle>
              <CardDescription>
                Run the evaluation pipeline on all 10 held-out cases (temp=0)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button onClick={runEval} disabled={evalRunning} size="sm">
                  {evalRunning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                  {evalRunning ? 'Running Eval...' : 'Run Full Eval'}
                </Button>
                <Button onClick={verifyDeterminism} disabled={determinismRunning} variant="outline" size="sm">
                  {determinismRunning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Shield className="h-4 w-4 mr-1" />}
                  {determinismRunning ? 'Checking...' : 'Verify Determinism'}
                </Button>
              </div>

              {/* Determinism Result */}
              {determinismResult && (
                <Alert variant={determinismResult.gatePassed ? 'default' : 'destructive'}>
                  {determinismResult.gatePassed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  <AlertTitle>Determinism Gate {determinismResult.gatePassed ? 'PASSED' : 'FAILED'}</AlertTitle>
                  <AlertDescription className="text-xs mt-1">
                    {determinismResult.detail}
                    <div className="mt-1 font-mono">
                      Hashes: {determinismResult.hashes.join(' | ')}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Aggregate Metrics */}
              {evalSnapshot && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Run: {evalSnapshot.runId}</Badge>
                    <Badge variant="outline">Hash: {evalSnapshot.determinismHash}</Badge>
                    <Badge variant="outline">Temp: {evalSnapshot.temperature}</Badge>
                  </div>

                  <div className="grid grid-cols-5 gap-3">
                    {Object.entries(evalSnapshot.aggregateMetrics).map(([metric, value]) => (
                      <div key={metric} className="text-center p-3 rounded-lg bg-muted/50">
                        <div className={`text-lg font-bold ${METRIC_COLORS[metric] || 'text-foreground'}`}>
                          {(value as number * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {METRIC_LABELS[metric] || metric}
                        </div>
                        <Progress value={(value as number) * 100} className="h-1.5 mt-2" />
                      </div>
                    ))}
                  </div>

                  {/* Per-Case Breakdown */}
                  <div className="space-y-2 mt-4">
                    <h4 className="text-sm font-medium">Per-Case Breakdown</h4>
                    <div className="max-h-48 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-1 pr-2">Case</th>
                            <th className="text-center py-1 px-1">Top-1</th>
                            <th className="text-center py-1 px-1">Top-3</th>
                            <th className="text-center py-1 px-1">Cite</th>
                            <th className="text-center py-1 px-1">Arg</th>
                            <th className="text-center py-1 px-1">Quality</th>
                            <th className="text-right py-1 pl-1">ms</th>
                          </tr>
                        </thead>
                        <tbody>
                          {evalSnapshot.caseSummaries.map((c) => (
                            <tr key={c.caseId} className="border-b border-muted/50">
                              <td className="py-1 pr-2 font-medium max-w-[200px] truncate">{c.caseName}</td>
                              <td className="text-center py-1 px-1">{((c.metrics.top1_accuracy || 0) * 100).toFixed(0)}%</td>
                              <td className="text-center py-1 px-1">{((c.metrics.top3_accuracy || 0) * 100).toFixed(0)}%</td>
                              <td className="text-center py-1 px-1">{((c.metrics.citation_grounding || 0) * 100).toFixed(0)}%</td>
                              <td className="text-center py-1 px-1">{((c.metrics.argument_selection || 0) * 100).toFixed(0)}%</td>
                              <td className="text-center py-1 px-1">{((c.metrics.appeal_quality || 0) * 100).toFixed(0)}%</td>
                              <td className="text-right py-1 pl-1 text-muted-foreground">{c.latencyMs}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── OUTCOME LEARNING TAB ────────────────────────────────────── */}
        <TabsContent value="outcome" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                Outcome Ingestion Path
              </CardTitle>
              <CardDescription>
                Outcome record → Memory Bank weight update (Firestore fallback)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Architecture diagram */}
              <div className="flex items-center gap-2 text-sm bg-muted/50 p-3 rounded-lg">
                <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs font-medium">Verdict</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">Weight Delta</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded text-xs font-medium">Memory Bank</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-medium">Better Retrieval</span>
              </div>

              {/* Weight rules */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="text-lg font-bold text-emerald-700">+0.05</div>
                  <div className="text-xs text-emerald-600">WON</div>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="text-lg font-bold text-amber-700">+0.02</div>
                  <div className="text-xs text-amber-600">PARTIAL</div>
                </div>
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <div className="text-lg font-bold text-red-700">-0.03</div>
                  <div className="text-xs text-red-600">LOST</div>
                </div>
              </div>

              <Separator />

              {/* Ingest buttons */}
              <div className="flex gap-2">
                <Button onClick={ingestPublicOutcomes} disabled={outcomeRunning} size="sm">
                  {outcomeRunning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileCheck className="h-4 w-4 mr-1" />}
                  Ingest Public Records (5)
                </Button>
                <Button onClick={ingestSyntheticOutcomes} disabled={outcomeRunning} variant="outline" size="sm">
                  Ingest Synthetic (10)
                </Button>
              </div>

              {/* Result */}
              {outcomeResult && (
                <Alert variant={outcomeResult.success ? 'default' : 'destructive'}>
                  {outcomeResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  <AlertTitle>Outcome Ingestion {outcomeResult.success ? 'Complete' : 'Failed'}</AlertTitle>
                  <AlertDescription className="text-xs mt-1">
                    {outcomeResult.success && (
                      <div className="space-y-1">
                        <div>Weight Updates: {outcomeResult.weightUpdates}</div>
                        <div>Memory Bank: <Badge variant="outline" className="text-xs">{outcomeResult.memoryBankStatus}</Badge></div>
                        <div>Duration: {outcomeResult.durationMs}ms</div>
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Outcome Loop Explanation */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Outcome Learning Loop</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 text-sm flex-wrap">
                <div className="flex items-center gap-1">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-xs font-bold">1</span>
                  <span>Case → Pipeline</span>
                </div>
                <ArrowRight className="h-3 w-3" />
                <div className="flex items-center gap-1">
                  <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-xs font-bold">2</span>
                  <span>Appeal Submitted</span>
                </div>
                <ArrowRight className="h-3 w-3" />
                <div className="flex items-center gap-1">
                  <span className="w-6 h-6 rounded-full bg-rose-100 text-rose-800 flex items-center justify-center text-xs font-bold">3</span>
                  <span>Real-World Verdict</span>
                </div>
                <ArrowRight className="h-3 w-3" />
                <div className="flex items-center gap-1">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold">4</span>
                  <span>Outcome Ingested</span>
                </div>
                <ArrowRight className="h-3 w-3" />
                <div className="flex items-center gap-1">
                  <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-800 flex items-center justify-center text-xs font-bold">5</span>
                  <span>Better Retrieval</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── EXECUTION PATHS TAB ─────────────────────────────────────── */}
        <TabsContent value="paths" className="space-y-4">
          {/* Three Paths */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Server className="h-4 w-4" />
                Three Execution Paths
              </CardTitle>
              <CardDescription>
                Live → Fallback → Demo-safe — automatic degradation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 rounded-lg border-2 border-emerald-200 bg-emerald-50">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="h-4 w-4 text-emerald-600" />
                    <span className="font-semibold text-emerald-800">LIVE</span>
                  </div>
                  <div className="text-xs text-emerald-700 space-y-1">
                    <div>Full Gemini API pipeline</div>
                    <div>Real agent orchestration</div>
                    <div className="font-medium">Max: 90s</div>
                  </div>
                  <Button onClick={() => testPath('live')} disabled={pathRunning} size="sm" className="mt-3 w-full" variant="outline">
                    Test Live
                  </Button>
                </div>

                <div className="p-4 rounded-lg border-2 border-amber-200 bg-amber-50">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-4 w-4 text-amber-600" />
                    <span className="font-semibold text-amber-800">FALLBACK</span>
                  </div>
                  <div className="text-xs text-amber-700 space-y-1">
                    <div>Template-based appeal</div>
                    <div>Pre-built for payer×denial</div>
                    <div className="font-medium">Max: 5s</div>
                  </div>
                  <Button onClick={() => testPath('fallback')} disabled={pathRunning} size="sm" className="mt-3 w-full" variant="outline">
                    Test Fallback
                  </Button>
                </div>

                <div className="p-4 rounded-lg border-2 border-blue-200 bg-blue-50">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-4 w-4 text-blue-600" />
                    <span className="font-semibold text-blue-800">DEMO-SAFE</span>
                  </div>
                  <div className="text-xs text-blue-700 space-y-1">
                    <div>Canned data + pre-written</div>
                    <div>Instant, offline-safe</div>
                    <div className="font-medium">Max: 10s</div>
                  </div>
                  <Button onClick={() => testPath('demo_safe')} disabled={pathRunning} size="sm" className="mt-3 w-full" variant="outline">
                    Test Demo-Safe
                  </Button>
                </div>
              </div>

              {/* Auto-select */}
              <div className="flex gap-2">
                <Button onClick={() => testPath('auto')} disabled={pathRunning}>
                  {pathRunning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                  Auto-Select (Best Available)
                </Button>
              </div>

              {/* Path Result */}
              {pathResult && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="text-center p-2 rounded-lg bg-muted/50">
                      <div className="text-lg font-bold">{pathResult.path.toUpperCase()}</div>
                      <div className="text-xs text-muted-foreground">Path</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/50">
                      <div className="text-lg font-bold">{pathResult.latencyMs}ms</div>
                      <div className="text-xs text-muted-foreground">Latency</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/50">
                      <div className="text-lg font-bold">{pathResult.citationCount}</div>
                      <div className="text-xs text-muted-foreground">Citations</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/50">
                      <div className="text-lg font-bold">{(pathResult.qualityScore * 100).toFixed(0)}%</div>
                      <div className="text-xs text-muted-foreground">Quality</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/50">
                      <div className="text-lg font-bold">{pathResult.appealLetterLength}</div>
                      <div className="text-xs text-muted-foreground">Chars</div>
                    </div>
                  </div>

                  {appealLetter && (
                    <div className="p-3 rounded-lg bg-muted/50 border max-h-48 overflow-y-auto">
                      <h4 className="text-xs font-medium mb-2 text-muted-foreground">Generated Appeal Letter</h4>
                      <pre className="text-xs whitespace-pre-wrap font-mono">{appealLetter}</pre>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Demo Reliability Test */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Validation Gate 3: Demo Reliability
              </CardTitle>
              <CardDescription>
                Does the demo survive a failed API call? Does the 90s wow moment hold up?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={testDemoReliabilityGate} disabled={demoRunning} size="sm">
                {demoRunning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Target className="h-4 w-4 mr-1" />}
                {demoRunning ? 'Testing...' : 'Run Demo Reliability Test'}
              </Button>

              {demoReliability && (
                <div className="space-y-3">
                  {/* GO/NO-GO */}
                  <Alert variant={demoReliability.gateResult === 'GO' ? 'default' : 'destructive'}>
                    {demoReliability.gateResult === 'GO' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    <AlertTitle>Gate Result: {demoReliability.gateResult}</AlertTitle>
                    <AlertDescription className="text-xs mt-1">{demoReliability.gateDetail}</AlertDescription>
                  </Alert>

                  {/* Path results */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className={`p-3 rounded-lg border ${demoReliability.livePath.passed ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                      <div className="font-semibold text-sm mb-1">Live Path</div>
                      <div className="text-xs">
                        <div>Passed: {demoReliability.livePath.passed ? '✓' : '✗'}</div>
                        <div>Latency: {demoReliability.livePath.latencyMs}ms</div>
                        <div>Target: &lt;90s</div>
                      </div>
                    </div>
                    <div className={`p-3 rounded-lg border ${demoReliability.fallbackPath.passed ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                      <div className="font-semibold text-sm mb-1">Fallback Path</div>
                      <div className="text-xs">
                        <div>Passed: {demoReliability.fallbackPath.passed ? '✓' : '✗'}</div>
                        <div>Engaged &lt;5s: {demoReliability.fallbackPath.engagedWithin5s ? '✓' : '✗'}</div>
                        <div>Latency: {demoReliability.fallbackPath.latencyMs}ms</div>
                      </div>
                    </div>
                    <div className={`p-3 rounded-lg border ${demoReliability.demoSafePath.passed ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                      <div className="font-semibold text-sm mb-1">Demo-Safe Path</div>
                      <div className="text-xs">
                        <div>Passed: {demoReliability.demoSafePath.passed ? '✓' : '✗'}</div>
                        <div>&lt;10s: {demoReliability.demoSafePath.under10s ? '✓' : '✗'}</div>
                        <div>Latency: {demoReliability.demoSafePath.latencyMs}ms</div>
                      </div>
                    </div>
                  </div>

                  <div className="text-sm">
                    All paths produce usable appeal: <Badge variant={demoReliability.allPathsProduceUsableAppeal ? 'default' : 'destructive'}>
                      {demoReliability.allPathsProduceUsableAppeal ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
