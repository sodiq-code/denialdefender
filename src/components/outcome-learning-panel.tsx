'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  CartesianGrid,
} from 'recharts';
import {
  Brain,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Minus,
  Database,
  Scale,
  Sparkles,
  Trophy,
  Activity,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────

interface LearningStatus {
  active: boolean;
  outcomesStored: number;
  learnedPatterns: number;
  lastUpdated: string | null;
  version: string;
  memoryBankStore?: string;
  memoryBankStatus?: string;
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

interface TwoCaseDemoResult {
  case1: {
    payer: string;
    appealStrategy: string;
    argumentRanking: string[];
    citationsUsed: number;
    verdict: string;
    weightUpdateCount: number;
    memoryBankStatus?: string;
    durationMs: number;
  };
  case2: {
    payer: string;
    appealStrategy: string;
    argumentRanking: string[];
    citationsUsed: number;
    rankingChangeExplanation?: string;
    durationMs: number;
  };
  rankingChange: {
    promoted: string[];
    demoted: string[];
    unchanged: string[];
    isVisiblyDifferent: boolean;
  };
  beforeAfterMetrics: {
    before: Record<string, number>;
    after: Record<string, number>;
    deltas: Record<string, number>;
  } | null;
  gatePassed: boolean;
  gateDetails: string;
  behavioralSummary: string;
  durationMs: number;
  timestamp: string;
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

function deltaColor(before: number, after: number) {
  const diff = after - before;
  if (diff > 0)
    return 'text-emerald-600 dark:text-emerald-400';
  if (diff < 0) return 'text-red-600 dark:text-red-400';
  return 'text-amber-500 dark:text-amber-400';
}

function DeltaIcon({ before, after }: { before: number; after: number }) {
  const diff = after - before;
  if (diff > 0) return <TrendingUp className="h-3.5 w-3.5" />;
  if (diff < 0) return <TrendingDown className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5" />;
}

function formatPct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDelta(before: number, after: number) {
  const diff = after - before;
  const pct = before !== 0 ? (diff / before) * 100 : 0;
  const sign = diff > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function trendBadge(trend: 'up' | 'down' | 'stable') {
  switch (trend) {
    case 'up':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/70 dark:text-emerald-300 gap-1">
          <TrendingUp className="h-3 w-3" /> Up
        </Badge>
      );
    case 'down':
      return (
        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/70 dark:text-red-300 gap-1">
          <TrendingDown className="h-3 w-3" /> Down
        </Badge>
      );
    case 'stable':
      return (
        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/70 dark:text-amber-300 gap-1">
          <Minus className="h-3 w-3" /> Stable
        </Badge>
      );
  }
}

function outcomeBadge(outcome: string) {
  if (outcome === 'won' || outcome === 'win')
    return (
      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/70 dark:text-emerald-300 gap-1">
        <Trophy className="h-3 w-3" /> Win
      </Badge>
    );
  if (outcome === 'lost' || outcome === 'loss')
    return (
      <Badge className="bg-red-100 text-red-700 dark:bg-red-900/70 dark:text-red-300 gap-1">
        <AlertCircle className="h-3 w-3" /> Loss
      </Badge>
    );
  return (
    <Badge variant="secondary" className="gap-1">
      <Loader2 className="h-3 w-3 animate-spin" /> Pending
    </Badge>
  );
}

function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

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

export default function OutcomeLearningPanel() {
  const [status, setStatus] = useState<LearningStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [beforeAfter, setBeforeAfter] = useState<BeforeAfterResult | null>(null);
  const [baLoading, setBaLoading] = useState(false);
  const [baError, setBaError] = useState<string | null>(null);

  const [demoResult, setDemoResult] = useState<TwoCaseDemoResult | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  const [ingestLoading, setIngestLoading] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [ingestCount, setIngestCount] = useState<number | null>(null);

  const [weights, setWeights] = useState<WeightsResult | null>(null);
  const [weightsLoading, setWeightsLoading] = useState(false);
  const [weightsError, setWeightsError] = useState<string | null>(null);

  const selectedPayer = 'UnitedHealthcare';
  const selectedCategory = 'medical_necessity';

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const res = await fetchJson<{
        success: boolean;
        status: {
          outcomeRecordsStored?: number;
          learnedPatternsStored?: number;
          learningLoopActive?: boolean;
          memoryBank?: Record<string, unknown>;
        };
      }>('/api/outcome-learning');
      const s = res.status ?? (res as unknown as Record<string, unknown>);
      setStatus({
        active: s.learningLoopActive ?? false,
        outcomesStored: s.outcomeRecordsStored ?? 0,
        learnedPatterns: s.learnedPatternsStored ?? 0,
        lastUpdated: new Date().toISOString(),
        version: '1.0.0',
        memoryBankStore:
          (s.memoryBank?.storeUsed as string) ??
          'sqlite_fallback',
        memoryBankStatus: s.memoryBank?.status as string,
      });
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Failed to load status');
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const runBeforeAfter = useCallback(async () => {
    setBaLoading(true);
    setBaError(null);
    try {
      const data = await fetchJson<any>('/api/eval/before-after', {
        method: 'POST',
        body: JSON.stringify({ quick: true }),
      });
      // Map the API response (experiment.deltas) to the component's expected shape.
      const exp = data?.experiment ?? data;
      const deltas = exp?.deltas ?? [];
      setBeforeAfter({
        metrics: deltas.map((d: any) => ({
          name: d.metricLabel || d.metric || 'metric',
          before: Number(d.beforeValue ?? 0),
          after: Number(d.afterValue ?? 0),
        })),
        experimentId: exp?.runId || `ba-${Date.now()}`,
        timestamp: data?.timestamp || new Date().toISOString(),
      });
      toast.success('Before / after experiment complete');
    } catch (err) {
      setBaError(err instanceof Error ? err.message : 'Before/After failed');
      toast.error('Before / after experiment failed');
    } finally {
      setBaLoading(false);
    }
  }, []);

  const runBehavioralDemo = useCallback(async () => {
    setDemoLoading(true);
    setDemoError(null);
    setDemoResult(null);
    try {
      const data = await fetchJson<{ success: boolean; demo: TwoCaseDemoResult; error?: string }>(
        '/api/demo/two-case',
        {
          method: 'POST',
          body: JSON.stringify({ quick: true }),
        },
      );
      if (data.success && data.demo) {
        setDemoResult(data.demo);
        toast.success('Two-case behavioral demo complete', {
          description: data.demo.gatePassed ? 'Gate PASSED' : 'Gate FAILED',
        });
      } else {
        throw new Error(data.error ?? 'Demo did not return success');
      }
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : 'Behavioral demo failed');
      toast.error('Behavioral demo failed');
    } finally {
      setDemoLoading(false);
    }
  }, []);

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
      toast.success(`Ingested ${data.ingested} outcome records`);
      loadStatus();
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : 'Ingestion failed');
      toast.error('Outcome ingestion failed');
    } finally {
      setIngestLoading(false);
    }
  }, [loadStatus]);

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
      toast.success('Learned weights loaded');
    } catch (err) {
      setWeightsError(err instanceof Error ? err.message : 'Failed to load weights');
      toast.error('Failed to load learned weights');
    } finally {
      setWeightsLoading(false);
    }
  }, [selectedPayer, selectedCategory]);

  // ── Chart data ──
  const chartData = useMemo(() => {
    if (!beforeAfter) return [];
    return beforeAfter.metrics.map((m) => ({
      name: m.name.replace(/_/g, ' '),
      before: Math.round(m.before * 100),
      after: Math.round(m.after * 100),
    }));
  }, [beforeAfter]);

  return (
    <section className="flex flex-col gap-6 w-full" aria-label="Outcome learning">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">
            Outcome Learning
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={loadStatus}
          disabled={statusLoading}
          aria-label="Refresh status"
          className="size-9"
        >
          <RefreshCw className={`h-4 w-4 ${statusLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* ── Learning Status ───────────────────────────────────────── */}
      <Card className="card-premium">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Brain className="h-4 w-4 text-emerald-500" />
            Learning Loop Status
          </CardTitle>
          <CardDescription className="text-xs">
            Real-time status of the outcome-driven learning feedback loop.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statusLoading && <Spinner label="Loading status…" />}
          {statusError && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              {statusError}
            </div>
          )}
          {status && !statusLoading && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex flex-col items-center gap-1 rounded-lg border border-border/70 p-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Loop
                </span>
                {status.active ? (
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/70 dark:text-emerald-300 gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Active
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <AlertCircle className="h-3 w-3" /> Inactive
                  </Badge>
                )}
              </div>
              <div className="flex flex-col items-center gap-1 rounded-lg border border-border/70 p-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Outcomes
                </span>
                <span className="text-2xl font-bold tabular-nums">
                  {(status.outcomesStored ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-lg border border-border/70 p-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Patterns
                </span>
                <span className="text-2xl font-bold tabular-nums">
                  {(status.learnedPatterns ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-lg border border-border/70 p-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
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
          {status && !statusLoading && (
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px] gap-1">
                <Database className="h-2.5 w-2.5" />
                Memory Bank: {status.memoryBankStore ?? 'sqlite_fallback'}
              </Badge>
              {status.memoryBankStatus && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Activity className="h-2.5 w-2.5" />
                  {status.memoryBankStatus}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px] gap-1">
                <Sparkles className="h-2.5 w-2.5" />
                v{status.version}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Tabs ──────────────────────────────────────────────────── */}
      <Tabs defaultValue="metrics" className="w-full">
        <TabsList className="w-full md:w-auto flex-wrap h-auto">
          <TabsTrigger value="metrics">Before / After</TabsTrigger>
          <TabsTrigger value="demo">Behavioral Demo</TabsTrigger>
          <TabsTrigger value="ingest">Ingestion</TabsTrigger>
          <TabsTrigger value="weights">Learned Weights</TabsTrigger>
        </TabsList>

        {/* ── Before / After ────────────────────────────────────── */}
        <TabsContent value="metrics">
          <Card className="card-premium">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <Scale className="h-4 w-4 text-primary" />
                    Before / After Metrics
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Eval metrics comparing baseline vs. outcome-learned
                    strategies — top-3 accuracy, citation grounding deltas.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={runBeforeAfter}
                  disabled={baLoading}
                  className="gap-1.5 h-9"
                >
                  {baLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  Run
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {baLoading && <Spinner label="Running before/after experiment…" />}
              {baError && (
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="h-4 w-4" />
                  {baError}
                </div>
              )}
              {beforeAfter && !baLoading && (
                <div className="space-y-4">
                  <div className="overflow-x-auto scrollbar-premium">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 pr-4 font-medium">Metric</th>
                          <th className="pb-2 pr-4 font-medium text-right">
                            Before
                          </th>
                          <th className="pb-2 pr-4 font-medium text-right">
                            After
                          </th>
                          <th className="pb-2 font-medium text-right">Δ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {beforeAfter.metrics.map((m) => (
                          <tr key={m.name} className="border-b last:border-0">
                            <td className="py-2.5 pr-4 font-medium capitalize">
                              {m.name.replace(/_/g, ' ')}
                            </td>
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
                                <DeltaIcon before={m.before} after={m.after} />
                                {formatDelta(m.before, m.after)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Chart */}
                  {chartData.length > 0 && (
                    <div className="rounded-lg border border-border/70 p-3 bg-muted/20">
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                        Before / After comparison
                      </h4>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart
                          data={chartData}
                          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 10 }}
                            stroke="currentColor"
                            opacity={0.6}
                          />
                          <YAxis
                            tick={{ fontSize: 10 }}
                            stroke="currentColor"
                            opacity={0.6}
                            unit="%"
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'var(--popover)',
                              border: '1px solid var(--border)',
                              borderRadius: '8px',
                              fontSize: '12px',
                            }}
                            formatter={(value: number) => `${value}%`}
                          />
                          <Legend
                            wrapperStyle={{ fontSize: '11px' }}
                          />
                          <Bar dataKey="before" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="after" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {beforeAfter.experimentId && (
                    <p className="text-xs text-muted-foreground">
                      Experiment <span className="font-mono">{beforeAfter.experimentId}</span> ·{' '}
                      {new Date(beforeAfter.timestamp).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
              {!beforeAfter && !baLoading && !baError && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Click <strong>Run</strong> to execute the quick before/after
                  experiment.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Behavioral Demo ──────────────────────────────────── */}
        <TabsContent value="demo">
          <Card className="card-premium">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <Play className="h-4 w-4 text-emerald-500" />
                    Two-Case Behavioral Demo
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Case 1 loss → learning adjustment → Case 2 improvement.
                    Proves the loop is closed: outcome → weight update → better
                    decision.
                  </CardDescription>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={runBehavioralDemo}
                  disabled={demoLoading}
                  className="gap-1.5 h-9"
                >
                  {demoLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  Run demo
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {demoLoading && <Spinner label="Running two-case demo…" />}
              {demoError && (
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="h-4 w-4" />
                  {demoError}
                </div>
              )}
              {demoResult && !demoLoading && (
                <div className="space-y-4">
                  {/* Gate badge */}
                  <div
                    className={`p-3 rounded-lg border-2 ${
                      demoResult.gatePassed
                        ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20'
                        : 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {demoResult.gatePassed ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-red-600" />
                      )}
                      <div>
                        <p className="text-sm font-semibold">
                          Gate {demoResult.gatePassed ? 'PASSED' : 'FAILED'}
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {demoResult.gateDetails}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Cases side-by-side */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Case 1 */}
                    <div className="rounded-lg border border-border/70 p-4 space-y-3 bg-card">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">Case 1 — Initial</span>
                        {outcomeBadge(demoResult.case1.verdict)}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="text-muted-foreground">Payer</div>
                        <div className="font-medium">{demoResult.case1.payer}</div>
                        <div className="text-muted-foreground">Strategy</div>
                        <div className="font-medium capitalize">
                          {demoResult.case1.appealStrategy?.replace(/_/g, ' ')}
                        </div>
                        <div className="text-muted-foreground">Citations</div>
                        <div className="font-mono">
                          {demoResult.case1.citationsUsed}
                        </div>
                        <div className="text-muted-foreground">Weight updates</div>
                        <div className="font-mono">
                          {demoResult.case1.weightUpdateCount}
                        </div>
                      </div>
                      {demoResult.case1.argumentRanking.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                            Argument ranking
                          </p>
                          <ol className="text-xs space-y-0.5">
                            {demoResult.case1.argumentRanking.slice(0, 4).map((arg, i) => (
                              <li key={i} className="flex gap-1.5">
                                <span className="font-mono text-muted-foreground">
                                  {i + 1}.
                                </span>
                                <span className="truncate">{arg}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </div>

                    {/* Case 2 */}
                    <div className="rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">
                          Case 2 — After Learning
                        </span>
                        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/70 dark:text-emerald-300 gap-1">
                          <Sparkles className="h-3 w-3" /> Learned
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="text-muted-foreground">Payer</div>
                        <div className="font-medium">{demoResult.case2.payer}</div>
                        <div className="text-muted-foreground">Strategy</div>
                        <div className="font-medium capitalize text-emerald-700 dark:text-emerald-400">
                          {demoResult.case2.appealStrategy?.replace(/_/g, ' ')}
                        </div>
                        <div className="text-muted-foreground">Citations</div>
                        <div className="font-mono text-emerald-700 dark:text-emerald-400">
                          {demoResult.case2.citationsUsed}
                        </div>
                      </div>
                      {demoResult.case2.argumentRanking.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                            Argument ranking (after)
                          </p>
                          <ol className="text-xs space-y-0.5">
                            {demoResult.case2.argumentRanking.slice(0, 4).map((arg, i) => (
                              <li key={i} className="flex gap-1.5">
                                <span className="font-mono text-emerald-600 dark:text-emerald-400">
                                  {i + 1}.
                                </span>
                                <span className="truncate">{arg}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                      {demoResult.case2.rankingChangeExplanation && (
                        <p className="text-xs text-emerald-700 dark:text-emerald-400 border-t border-emerald-200 dark:border-emerald-800 pt-2 mt-1">
                          <strong>Why:</strong>{' '}
                          {demoResult.case2.rankingChangeExplanation}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Ranking change summary */}
                  <div className="rounded-lg border border-border/70 p-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-sm font-semibold flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" />
                        Ranking change
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          demoResult.rankingChange.isVisiblyDifferent
                            ? 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300'
                            : 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300'
                        }
                      >
                        {demoResult.rankingChange.isVisiblyDifferent
                          ? 'Visibly different'
                          : 'No visible change'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-xs">
                      <div>
                        <p className="text-muted-foreground uppercase tracking-wider text-[10px]">
                          Promoted
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {demoResult.rankingChange.promoted.length > 0
                            ? demoResult.rankingChange.promoted.map((p) => (
                                <li key={p} className="text-emerald-600 truncate">
                                  ↑ {p}
                                </li>
                              ))
                            : <li className="text-muted-foreground">—</li>}
                        </ul>
                      </div>
                      <div>
                        <p className="text-muted-foreground uppercase tracking-wider text-[10px]">
                          Demoted
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {demoResult.rankingChange.demoted.length > 0
                            ? demoResult.rankingChange.demoted.map((p) => (
                                <li key={p} className="text-red-600 truncate">
                                  ↓ {p}
                                </li>
                              ))
                            : <li className="text-muted-foreground">—</li>}
                        </ul>
                      </div>
                      <div>
                        <p className="text-muted-foreground uppercase tracking-wider text-[10px]">
                          Unchanged
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {demoResult.rankingChange.unchanged.slice(0, 4).map((p) => (
                            <li key={p} className="text-muted-foreground truncate">
                              = {p}
                            </li>
                          ))}
                          {demoResult.rankingChange.unchanged.length === 0 && (
                            <li className="text-muted-foreground">—</li>
                          )}
                        </ul>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                      {demoResult.behavioralSummary}
                    </p>
                  </div>
                </div>
              )}
              {!demoResult && !demoLoading && !demoError && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Click <strong>Run demo</strong> to see the loss → learning →
                  improvement loop.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Ingestion ──────────────────────────────────────────── */}
        <TabsContent value="ingest">
          <Card className="card-premium">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Database className="h-4 w-4 text-primary" />
                Outcome Ingestion
              </CardTitle>
              <CardDescription className="text-xs">
                Ingest a batch of 50 historical appeal outcomes to seed the
                learning loop.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-wrap">
                <Button
                  onClick={ingestBatch}
                  disabled={ingestLoading}
                  className="min-w-[180px] h-11"
                >
                  {ingestLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Ingesting…
                    </>
                  ) : (
                    <>
                      <Database className="h-4 w-4" /> Ingest 50 outcomes
                    </>
                  )}
                </Button>

                {ingestCount !== null && (
                  <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>
                      Successfully ingested <strong>{ingestCount}</strong>{' '}
                      outcome records.
                    </span>
                  </div>
                )}

                {ingestError && (
                  <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                    <AlertCircle className="h-4 w-4" />
                    {ingestError}
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-lg border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground space-y-1 leading-relaxed">
                <p>
                  <strong>What this does:</strong> Sends{' '}
                  <code className="bg-muted px-1 rounded font-mono">
                    {'{ action: "ingest_batch" }'}
                  </code>{' '}
                  to the outcome learning endpoint, which generates and stores
                  50 synthetic appeal outcomes (wins and losses with realistic
                  payer / category distributions).
                </p>
                <p>
                  These outcomes feed the learning loop, which adjusts strategy
                  selection weights per payer × denial-category so that future
                  appeals use better-informed strategies.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Learned Weights ────────────────────────────────────── */}
        <TabsContent value="weights">
          <Card className="card-premium">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <Brain className="h-4 w-4 text-emerald-500" />
                    Learned Weights
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Strategy success rates for {selectedPayer} /{' '}
                    {selectedCategory}.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadWeights}
                  disabled={weightsLoading}
                  className="gap-1.5 h-9"
                >
                  {weightsLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Load
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {weightsLoading && <Spinner label="Loading weights…" />}
              {weightsError && (
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="h-4 w-4" />
                  {weightsError}
                </div>
              )}
              {weights && !weightsLoading && (
                <div className="space-y-4">
                  <div className="overflow-x-auto scrollbar-premium">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 pr-4 font-medium">Strategy</th>
                          <th className="pb-2 pr-4 font-medium text-right">
                            Success Rate
                          </th>
                          <th className="pb-2 pr-4 font-medium text-right">
                            Samples
                          </th>
                          <th className="pb-2 font-medium text-right">Trend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weights.weights.map((w) => (
                          <tr key={w.strategy} className="border-b last:border-0">
                            <td className="py-2.5 pr-4 font-medium capitalize">
                              {w.strategy.replace(/_/g, ' ')}
                            </td>
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
                            <td className="py-2.5 text-right">
                              {trendBadge(w.trend)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Chart */}
                  <div className="rounded-lg border border-border/70 p-3 bg-muted/20">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                      Success rate distribution
                    </h4>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={weights.weights.map((w) => ({
                          name: w.strategy.replace(/_/g, ' '),
                          rate: Math.round(w.successRate * 100),
                        }))}
                        layout="vertical"
                        margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} horizontal={false} />
                        <XAxis
                          type="number"
                          unit="%"
                          tick={{ fontSize: 10 }}
                          stroke="currentColor"
                          opacity={0.6}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tick={{ fontSize: 10 }}
                          stroke="currentColor"
                          opacity={0.6}
                          width={120}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'var(--popover)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            fontSize: '12px',
                          }}
                          formatter={(value: number) => `${value}%`}
                        />
                        <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                          {weights.weights.map((w) => {
                            const color =
                              w.successRate >= 0.7
                                ? '#10b981'
                                : w.successRate >= 0.4
                                  ? '#f59e0b'
                                  : '#ef4444';
                            return <Cell key={w.strategy} fill={color} />;
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
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
                  Click <strong>Load</strong> to fetch learned strategy weights.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AnimatePresence />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-xs text-muted-foreground border-t border-border/50 pt-3 leading-relaxed"
      >
        The outcome learning loop closes the cycle:{' '}
        <strong>Outcome → Weight Update → Prompt Injection → Better Decision</strong>.
        Every appeal that lands an outcome (win or loss) feeds the Memory Bank,
        which adjusts strategy weights so the next appeal for the same payer ×
        category uses better-informed arguments.
      </motion.div>
    </section>
  );
}
