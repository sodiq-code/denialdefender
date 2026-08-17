'use client';

/**
 * DenialDefender — Outcome Learning Panel
 *
 * Visualizes the outcome learning loop:
 *   Learning Status → Before/After Metrics → Behavioral Demo → Outcome Ingestion → Learned Weights
 *
 * The learning loop ingests real appeal outcomes and adjusts strategy weights
 * per payer/category so subsequent appeals improve over time.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Brain,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Play,
  CheckCircle,
  AlertCircle,
  Loader2,
  Minus,
  Database,
  Scale,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────

interface LearningStatus {
  active: boolean;
  outcomesStored: number;
  learnedPatterns: number;
  lastUpdated: string | null;
  version: string;
}

interface MetricRow {
  name: string;
  before: number;
  after: number;
}

interface BeforeAfterResult {
  metrics: MetricRow[];
  experimentId: string;
  timestamp: string;
}

interface BehavioralCase {
  caseId: string;
  payer: string;
  denialCategory: string;
  strategyUsed: string;
  successProbability: number;
  estimatedOverturnRate: number;
  keyFactors: string[];
  outcome: 'win' | 'loss' | 'pending';
  learnedAdjustment?: string;
}

interface BehavioralDemoResult {
  case1: BehavioralCase;
  case2: BehavioralCase;
  behavioralChange: string;
  improvementPct: number;
}

interface StrategyWeight {
  strategy: string;
  successRate: number;
  sampleSize: number;
  trend: 'up' | 'down' | 'stable';
}

interface WeightsResult {
  payer: string;
  denialCategory: string;
  weights: StrategyWeight[];
  lastOutcomeDate: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function deltaColor(before: number, after: number): string {
  const diff = after - before;
  if (diff > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (diff < 0) return 'text-red-600 dark:text-red-400';
  return 'text-amber-500 dark:text-amber-400';
}

function deltaIcon(before: number, after: number) {
  const diff = after - before;
  if (diff > 0) return <TrendingUp className="size-3.5" />;
  if (diff < 0) return <TrendingDown className="size-3.5" />;
  return <Minus className="size-3.5" />;
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDelta(before: number, after: number): string {
  const diff = after - before;
  const pct = before !== 0 ? (diff / before) * 100 : 0;
  const sign = diff > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function trendBadge(trend: 'up' | 'down' | 'stable') {
  switch (trend) {
    case 'up':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0">
          <TrendingUp className="size-3 mr-1" /> Up
        </Badge>
      );
    case 'down':
      return (
        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0">
          <TrendingDown className="size-3 mr-1" /> Down
        </Badge>
      );
    case 'stable':
      return (
        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-0">
          <Minus className="size-3 mr-1" /> Stable
        </Badge>
      );
  }
}

function outcomeBadge(outcome: 'win' | 'loss' | 'pending') {
  switch (outcome) {
    case 'win':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0">
          <CheckCircle className="size-3 mr-1" /> Win
        </Badge>
      );
    case 'loss':
      return (
        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0">
          <AlertCircle className="size-3 mr-1" /> Loss
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="secondary">
          <Loader2 className="size-3 mr-1 animate-spin" /> Pending
        </Badge>
      );
  }
}

// ─── Spinner ──────────────────────────────────────────────────────────────

function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

// ─── API helpers ──────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Component ────────────────────────────────────────────────────────────

export function OutcomeLearningPanel() {
  // ── State ─────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<LearningStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [beforeAfter, setBeforeAfter] = useState<BeforeAfterResult | null>(null);
  const [baLoading, setBaLoading] = useState(false);
  const [baError, setBaError] = useState<string | null>(null);

  const [demoResult, setDemoResult] = useState<BehavioralDemoResult | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  const [ingestLoading, setIngestLoading] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [ingestCount, setIngestCount] = useState<number | null>(null);

  const [weights, setWeights] = useState<WeightsResult | null>(null);
  const [weightsLoading, setWeightsLoading] = useState(false);
  const [weightsError, setWeightsError] = useState<string | null>(null);

  // Default payer / category for demo and weights
  const [selectedPayer] = useState('UnitedHealthcare');
  const [selectedCategory] = useState('medical_necessity');

  // ── Load status on mount ───────────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const data = await fetchJson<LearningStatus>('/api/outcome-learning');
      setStatus(data);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Failed to load status');
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // ── Before / After ────────────────────────────────────────────────────
  const runBeforeAfter = useCallback(async () => {
    setBaLoading(true);
    setBaError(null);
    try {
      const data = await fetchJson<BeforeAfterResult>('/api/eval/before-after', {
        method: 'POST',
        body: JSON.stringify({ quick: true }),
      });
      setBeforeAfter(data);
    } catch (err) {
      setBaError(err instanceof Error ? err.message : 'Before/After failed');
    } finally {
      setBaLoading(false);
    }
  }, []);

  // ── Behavioral Demo ───────────────────────────────────────────────────
  const runBehavioralDemo = useCallback(async () => {
    setDemoLoading(true);
    setDemoError(null);
    setDemoResult(null);
    try {
      const data = await fetchJson<BehavioralDemoResult>('/api/outcome-learning', {
        method: 'POST',
        body: JSON.stringify({
          action: 'behavioral_demo',
          payer: selectedPayer,
          denialCategory: selectedCategory,
        }),
      });
      setDemoResult(data);
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : 'Behavioral demo failed');
    } finally {
      setDemoLoading(false);
    }
  }, [selectedPayer, selectedCategory]);

  // ── Ingest Batch ──────────────────────────────────────────────────────
  const ingestBatch = useCallback(async () => {
    setIngestLoading(true);
    setIngestError(null);
    setIngestCount(null);
    try {
      const data = await fetchJson<{ ingested: number }>('/api/outcome-learning', {
        method: 'POST',
        body: JSON.stringify({ action: 'ingest_batch' }),
      });
      setIngestCount(data.ingested);
      // Refresh status to reflect new outcomes
      loadStatus();
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : 'Ingestion failed');
    } finally {
      setIngestLoading(false);
    }
  }, [loadStatus]);

  // ── Get Weights ───────────────────────────────────────────────────────
  const loadWeights = useCallback(async () => {
    setWeightsLoading(true);
    setWeightsError(null);
    try {
      const data = await fetchJson<WeightsResult>('/api/outcome-learning', {
        method: 'POST',
        body: JSON.stringify({
          action: 'get_weights',
          payer: selectedPayer,
          denialCategory: selectedCategory,
        }),
      });
      setWeights(data);
    } catch (err) {
      setWeightsError(err instanceof Error ? err.message : 'Failed to load weights');
    } finally {
      setWeightsLoading(false);
    }
  }, [selectedPayer, selectedCategory]);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 w-full">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="size-5 text-violet-600 dark:text-violet-400" />
          <h2 className="text-lg font-semibold">Outcome Learning</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={loadStatus} disabled={statusLoading}>
          <RefreshCw className={`size-4 ${statusLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* ── 1. Learning Status Card ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="size-4 text-violet-500" />
            Learning Loop Status
          </CardTitle>
          <CardDescription>
            Real-time status of the outcome-driven learning feedback loop
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statusLoading && <Spinner label="Loading status…" />}
          {statusError && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="size-4" />
              {statusError}
            </div>
          )}
          {status && !statusLoading && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Active */}
              <div className="flex flex-col items-center gap-1 rounded-lg border p-3">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Loop
                </span>
                {status.active ? (
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0">
                    <CheckCircle className="size-3 mr-1" /> Active
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <AlertCircle className="size-3 mr-1" /> Inactive
                  </Badge>
                )}
              </div>

              {/* Outcomes Stored */}
              <div className="flex flex-col items-center gap-1 rounded-lg border p-3">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Outcomes
                </span>
                <span className="text-2xl font-bold tabular-nums">
                  {status.outcomesStored.toLocaleString()}
                </span>
              </div>

              {/* Learned Patterns */}
              <div className="flex flex-col items-center gap-1 rounded-lg border p-3">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Patterns
                </span>
                <span className="text-2xl font-bold tabular-nums">
                  {status.learnedPatterns.toLocaleString()}
                </span>
              </div>

              {/* Last Updated */}
              <div className="flex flex-col items-center gap-1 rounded-lg border p-3">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Updated
                </span>
                <span className="text-sm font-medium">
                  {status.lastUpdated
                    ? new Date(status.lastUpdated).toLocaleTimeString()
                    : '—'}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Tabbed Sections ────────────────────────────────────────────── */}
      <Tabs defaultValue="metrics" className="w-full">
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="metrics">Before / After</TabsTrigger>
          <TabsTrigger value="demo">Behavioral Demo</TabsTrigger>
          <TabsTrigger value="ingest">Ingestion</TabsTrigger>
          <TabsTrigger value="weights">Learned Weights</TabsTrigger>
        </TabsList>

        {/* ── 2. Before / After Metrics ──────────────────────────────── */}
        <TabsContent value="metrics">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Scale className="size-4 text-blue-500" />
                    Before / After Metrics
                  </CardTitle>
                  <CardDescription>
                    Eval metrics comparing baseline vs. outcome-learned strategies
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={runBeforeAfter}
                  disabled={baLoading}
                >
                  {baLoading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Play className="size-3.5" />
                  )}
                  Run
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {baLoading && <Spinner label="Running before/after experiment…" />}
              {baError && (
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="size-4" />
                  {baError}
                </div>
              )}
              {beforeAfter && !baLoading && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Metric</th>
                        <th className="pb-2 pr-4 font-medium text-right">Before</th>
                        <th className="pb-2 pr-4 font-medium text-right">After</th>
                        <th className="pb-2 font-medium text-right">Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {beforeAfter.metrics.map((m) => (
                        <tr key={m.name} className="border-b last:border-0">
                          <td className="py-2.5 pr-4 font-medium">{m.name}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                            {formatPct(m.before)}
                          </td>
                          <td className="py-2.5 pr-4 text-right tabular-nums font-semibold">
                            {formatPct(m.after)}
                          </td>
                          <td className="py-2.5 text-right">
                            <span
                              className={`inline-flex items-center gap-1 font-semibold tabular-nums ${deltaColor(m.before, m.after)}`}
                            >
                              {deltaIcon(m.before, m.after)}
                              {formatDelta(m.before, m.after)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {beforeAfter.experimentId && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Experiment {beforeAfter.experimentId} ·{' '}
                      {new Date(beforeAfter.timestamp).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
              {!beforeAfter && !baLoading && !baError && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Click <strong>Run</strong> to execute the quick before/after experiment.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 3. Behavioral Demo ──────────────────────────────────────── */}
        <TabsContent value="demo">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Play className="size-4 text-violet-500" />
                    Behavioral Demo
                  </CardTitle>
                  <CardDescription>
                    Case 1 loss → learning adjustment → Case 2 improvement
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={runBehavioralDemo}
                  disabled={demoLoading}
                >
                  {demoLoading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Play className="size-3.5" />
                  )}
                  Run Demo
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {demoLoading && <Spinner label="Running behavioral demo…" />}
              {demoError && (
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="size-4" />
                  {demoError}
                </div>
              )}
              {demoResult && !demoLoading && (
                <div className="space-y-4">
                  {/* Cases side by side */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Case 1 */}
                    <div className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">Case 1 — Initial</span>
                        {outcomeBadge(demoResult.case1.outcome)}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="text-muted-foreground">Payer</div>
                        <div className="font-medium">{demoResult.case1.payer}</div>
                        <div className="text-muted-foreground">Category</div>
                        <div className="font-medium">{demoResult.case1.denialCategory}</div>
                        <div className="text-muted-foreground">Strategy</div>
                        <div className="font-medium">{demoResult.case1.strategyUsed}</div>
                        <div className="text-muted-foreground">P(success)</div>
                        <div className="font-medium tabular-nums">
                          {formatPct(demoResult.case1.successProbability)}
                        </div>
                        <div className="text-muted-foreground">Est. Overturn</div>
                        <div className="font-medium tabular-nums">
                          {formatPct(demoResult.case1.estimatedOverturnRate)}
                        </div>
                      </div>
                      {demoResult.case1.keyFactors.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {demoResult.case1.keyFactors.map((f) => (
                            <Badge key={f} variant="outline" className="text-xs">
                              {f}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Case 2 */}
                    <div className="rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">
                          Case 2 — After Learning
                        </span>
                        {outcomeBadge(demoResult.case2.outcome)}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="text-muted-foreground">Payer</div>
                        <div className="font-medium">{demoResult.case2.payer}</div>
                        <div className="text-muted-foreground">Category</div>
                        <div className="font-medium">{demoResult.case2.denialCategory}</div>
                        <div className="text-muted-foreground">Strategy</div>
                        <div className="font-medium text-emerald-700 dark:text-emerald-400">
                          {demoResult.case2.strategyUsed}
                        </div>
                        <div className="text-muted-foreground">P(success)</div>
                        <div className="font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                          {formatPct(demoResult.case2.successProbability)}
                        </div>
                        <div className="text-muted-foreground">Est. Overturn</div>
                        <div className="font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                          {formatPct(demoResult.case2.estimatedOverturnRate)}
                        </div>
                      </div>
                      {demoResult.case2.keyFactors.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {demoResult.case2.keyFactors.map((f) => (
                            <Badge
                              key={f}
                              variant="outline"
                              className="text-xs border-emerald-300 dark:border-emerald-700"
                            >
                              {f}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {demoResult.case2.learnedAdjustment && (
                        <p className="text-xs text-emerald-700 dark:text-emerald-400 border-t border-emerald-200 dark:border-emerald-800 pt-2 mt-1">
                          <strong>Learned:</strong> {demoResult.case2.learnedAdjustment}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Behavioral Change Summary */}
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">Behavioral Change</span>
                      <span
                        className={`inline-flex items-center gap-1 text-sm font-bold tabular-nums ${
                          demoResult.improvementPct > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : demoResult.improvementPct < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-amber-500 dark:text-amber-400'
                        }`}
                      >
                        {demoResult.improvementPct > 0 ? (
                          <TrendingUp className="size-4" />
                        ) : demoResult.improvementPct < 0 ? (
                          <TrendingDown className="size-4" />
                        ) : (
                          <Minus className="size-4" />
                        )}
                        {demoResult.improvementPct > 0 ? '+' : ''}
                        {demoResult.improvementPct.toFixed(1)}%
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {demoResult.behavioralChange}
                    </p>
                  </div>
                </div>
              )}
              {!demoResult && !demoLoading && !demoError && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Click <strong>Run Demo</strong> to see the loss → learning → improvement loop
                  for {selectedPayer} / {selectedCategory}.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 4. Outcome Ingestion ────────────────────────────────────── */}
        <TabsContent value="ingest">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="size-4 text-blue-500" />
                Outcome Ingestion
              </CardTitle>
              <CardDescription>
                Ingest a batch of 50 historical appeal outcomes to seed the learning loop
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <Button
                  onClick={ingestBatch}
                  disabled={ingestLoading}
                  className="min-w-[180px]"
                >
                  {ingestLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Ingesting…
                    </>
                  ) : (
                    <>
                      <Database className="size-4" /> Ingest 50 Outcomes
                    </>
                  )}
                </Button>

                {ingestCount !== null && (
                  <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle className="size-4" />
                    <span>
                      Successfully ingested <strong>{ingestCount}</strong> outcome records.
                    </span>
                  </div>
                )}

                {ingestError && (
                  <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                    <AlertCircle className="size-4" />
                    {ingestError}
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-lg border p-3 text-xs text-muted-foreground space-y-1">
                <p>
                  <strong>What this does:</strong> Sends{' '}
                  <code className="bg-muted px-1 rounded">{'{ action: "ingest_batch" }'}</code>{' '}
                  to the outcome learning endpoint, which generates and stores 50 synthetic appeal
                  outcomes (wins and losses with realistic payer/category distributions).
                </p>
                <p>
                  These outcomes feed the learning loop, which adjusts strategy selection weights
                  per payer × denial-category so that future appeals use better-informed strategies.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 5. Current Learned Weights ──────────────────────────────── */}
        <TabsContent value="weights">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Brain className="size-4 text-violet-500" />
                    Learned Weights
                  </CardTitle>
                  <CardDescription>
                    Strategy success rates for {selectedPayer} / {selectedCategory}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadWeights}
                  disabled={weightsLoading}
                >
                  {weightsLoading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  Load
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {weightsLoading && <Spinner label="Loading weights…" />}
              {weightsError && (
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="size-4" />
                  {weightsError}
                </div>
              )}
              {weights && !weightsLoading && (
                <div className="space-y-4">
                  {/* Weights Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 pr-4 font-medium">Strategy</th>
                          <th className="pb-2 pr-4 font-medium text-right">Success Rate</th>
                          <th className="pb-2 pr-4 font-medium text-right">Samples</th>
                          <th className="pb-2 font-medium text-right">Trend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weights.weights.map((w) => (
                          <tr key={w.strategy} className="border-b last:border-0">
                            <td className="py-2.5 pr-4 font-medium">{w.strategy}</td>
                            <td className="py-2.5 pr-4 text-right tabular-nums">
                              <span
                                className={`font-semibold ${
                                  w.successRate >= 0.7
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : w.successRate >= 0.4
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-red-600 dark:text-red-400'
                                }`}
                              >
                                {formatPct(w.successRate)}
                              </span>
                            </td>
                            <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                              {w.sampleSize}
                            </td>
                            <td className="py-2.5 text-right">{trendBadge(w.trend)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Success rate bars */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Success Rate Distribution
                    </h4>
                    {weights.weights.map((w) => (
                      <div key={w.strategy} className="flex items-center gap-2">
                        <span className="w-36 text-xs font-medium truncate">
                          {w.strategy}
                        </span>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              w.successRate >= 0.7
                                ? 'bg-emerald-500'
                                : w.successRate >= 0.4
                                  ? 'bg-amber-500'
                                  : 'bg-red-500'
                            }`}
                            style={{ width: `${w.successRate * 100}%` }}
                          />
                        </div>
                        <span className="w-14 text-xs tabular-nums text-right text-muted-foreground">
                          {formatPct(w.successRate)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {weights.lastOutcomeDate && (
                    <p className="text-xs text-muted-foreground">
                      Last outcome ingested:{' '}
                      {new Date(weights.lastOutcomeDate).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
              {!weights && !weightsLoading && !weightsError && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Click <strong>Load</strong> to fetch learned strategy weights for{' '}
                  {selectedPayer} / {selectedCategory}.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
