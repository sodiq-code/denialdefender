'use client';

/**
 * DenialDefender — Day 8 Panel: Before/After Experiment + Agent Ablation
 *
 * Day 8 features:
 * 1. Before/After Delta Table — 50 outcomes ingested, weights updated, re-scored
 * 2. Agent Ablation Table (Table 7.1) — 4 topologies on 10 held-out cases
 * 3. Gate Status — honest reporting (Principle 5)
 * 4. Outcome Learning visualization
 *
 * Per Blueprint: "Both killer tables exist as real numbers."
 * Gate: "The before/after table is honest — if the delta is negative on any
 * metric, that is reported, not hidden."
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
  FlaskConical, CheckCircle2, XCircle, ArrowRight, Play, TrendingUp,
  TrendingDown, Minus, Shield, BarChart3, Target, GitBranch, Loader2,
  AlertTriangle, Activity, Database, Eye, Scale, Users, Zap,
  ChevronDown, ChevronUp, ArrowUpRight, ArrowDownRight, MinusCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────

interface BeforeAfterDelta {
  metric: string;
  metricLabel: string;
  beforeValue: number;
  afterValue: number;
  delta: number;
  deltaPercent: number;
  improved: boolean;
  honest: boolean;
}

interface AblationTopology {
  topology: string;
  label: string;
  description: string;
  agentCount: number;
  agentsIncluded: string[];
  aggregate: {
    citationGrounding: number;
    citationGroundingPercent: number;
    unsupportedClaims: number;
    unsupportedClaimsLevel: string;
    verdict: string;
    top1Accuracy: number;
    top3Accuracy: number;
    appealQuality: number;
    argumentSelection: number;
  };
  caseCount: number;
  caseErrors: number;
}

interface BeforeAfterResult {
  deltas: BeforeAfterDelta[];
  beforeSnapshot: { runId: string; timestamp: string; aggregateMetrics: Record<string, number> };
  afterSnapshot: { runId: string; timestamp: string; aggregateMetrics: Record<string, number> };
  outcomeIngestion: { totalRecords: number; successful: number; failed: number; totalWeightUpdates: number; memoryBankStatus: string };
  outcomeSources: { public: number; synthetic: number; total: number };
  gatePassed: boolean;
  gateDetails: string;
  durationMs: number;
}

interface AblationResult {
  topologies: AblationTopology[];
  totalCases: number;
  gatePassed: boolean;
  gateDetails: string;
  durationMs: number;
}

// ─── Component ────────────────────────────────────────────────────────────

export default function Day8ExperimentPanel() {
  const [activeTab, setActiveTab] = useState('before-after');
  const [beforeAfterResult, setBeforeAfterResult] = useState<BeforeAfterResult | null>(null);
  const [ablationResult, setAblationResult] = useState<AblationResult | null>(null);
  const [runningBA, setRunningBA] = useState(false);
  const [runningAblation, setRunningAblation] = useState(false);
  const [expandedCase, setExpandedCase] = useState<string | null>(null);

  // ─── Run Before/After Experiment ──────────────────────────────────────

  const runBeforeAfter = useCallback(async (quick: boolean = true) => {
    setRunningBA(true);
    try {
      const res = await fetch('/api/eval/before-after', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quick }),
      });
      const data = await res.json();
      if (data.success) {
        setBeforeAfterResult(data.experiment);
      }
    } catch (e) {
      console.error('Before/after experiment failed:', e);
    } finally {
      setRunningBA(false);
    }
  }, []);

  // ─── Run Ablation Experiment ─────────────────────────────────────────

  const runAblation = useCallback(async (quick: boolean = true) => {
    setRunningAblation(true);
    try {
      const res = await fetch('/api/eval/ablation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quick }),
      });
      const data = await res.json();
      if (data.success) {
        setAblationResult(data.experiment);
      }
    } catch (e) {
      console.error('Ablation experiment failed:', e);
    } finally {
      setRunningAblation(false);
    }
  }, []);

  // ─── Run Both Experiments ─────────────────────────────────────────────

  const runBoth = useCallback(async () => {
    await Promise.all([runBeforeAfter(true), runAblation(true)]);
  }, [runBeforeAfter, runAblation]);

  // ─── Delta Icon ───────────────────────────────────────────────────────

  const DeltaIcon = ({ delta }: { delta: number }) => {
    if (delta > 0) return <ArrowUpRight className="h-4 w-4 text-emerald-500" />;
    if (delta < 0) return <ArrowDownRight className="h-4 w-4 text-red-500" />;
    return <MinusCircle className="h-4 w-4 text-amber-500" />;
  };

  const DeltaColor = ({ delta }: { delta: number }) => {
    if (delta > 0) return 'text-emerald-600';
    if (delta < 0) return 'text-red-600';
    return 'text-amber-600';
  };

  // ─── Unsupported Claims Color ─────────────────────────────────────────

  const claimsLevelColor = (level: string) => {
    switch (level) {
      case 'near-zero': return 'bg-emerald-100 text-emerald-800';
      case 'low': return 'bg-lime-100 text-lime-800';
      case 'medium': return 'bg-amber-100 text-amber-800';
      case 'high': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const groundingColor = (pct: number) => {
    if (pct >= 94) return 'text-emerald-600';
    if (pct >= 88) return 'text-lime-600';
    if (pct >= 80) return 'text-amber-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* ─── Header ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-violet-500" />
                Day 8: Before/After Experiment + Agent Ablation
              </CardTitle>
              <CardDescription className="mt-1">
                Outcome Learning measured, not claimed. Both killer tables exist as real numbers.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={runBoth}
                disabled={runningBA || runningAblation}
                size="sm"
                className="bg-violet-600 hover:bg-violet-700"
              >
                {(runningBA || runningAblation) ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Running...</>
                ) : (
                  <><Play className="h-4 w-4 mr-1" /> Run Both Experiments</>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-violet-50 border border-violet-200">
              <Database className="h-4 w-4 text-violet-500" />
              <div>
                <div className="font-medium">50 Outcome Records</div>
                <div className="text-muted-foreground">5 public + 45 synthetic controlled</div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <Target className="h-4 w-4 text-emerald-500" />
              <div>
                <div className="font-medium">10 Held-Out Cases</div>
                <div className="text-muted-foreground">Scored before &amp; after learning</div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <Scale className="h-4 w-4 text-amber-500" />
              <div>
                <div className="font-medium">4 Ablation Topologies</div>
                <div className="text-muted-foreground">Single → 3 → 5 → 8 agent</div>
              </div>
            </div>
          </div>

          {/* Principle 5 Banner */}
          <Alert className="mt-4 border-amber-200 bg-amber-50">
            <Eye className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800">Principle 5: Honest Reporting</AlertTitle>
            <AlertDescription className="text-amber-700">
              A measured non-improvement is more credible than an inflated claim.
              If the delta is negative on any metric, it is reported, not hidden.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* ─── Tabs ──────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="before-after" className="flex items-center gap-1">
            <TrendingUp className="h-4 w-4" /> Before/After Delta Table
          </TabsTrigger>
          <TabsTrigger value="ablation" className="flex items-center gap-1">
            <GitBranch className="h-4 w-4" /> Agent Ablation (Table 7.1)
          </TabsTrigger>
        </TabsList>

        {/* ─── Before/After Tab ──────────────────────────────────────── */}
        <TabsContent value="before-after" className="space-y-4">
          {!beforeAfterResult ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FlaskConical className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Before/After Experiment</h3>
                <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                  Ingest 50 outcome records, update procedural-evidence weights,
                  and re-score the same 10 held-out cases to measure the learning delta.
                </p>
                <Button
                  onClick={() => runBeforeAfter(true)}
                  disabled={runningBA}
                  className="bg-violet-600 hover:bg-violet-700"
                >
                  {runningBA ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Running Experiment...</>
                  ) : (
                    <><Play className="h-4 w-4 mr-1" /> Run Before/After</>
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Outcome Ingestion Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Database className="h-4 w-4 text-violet-500" />
                    Outcome Ingestion Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                    <div className="p-3 rounded-lg bg-slate-50 border">
                      <div className="text-muted-foreground">Public Records</div>
                      <div className="font-bold text-lg">{beforeAfterResult.outcomeSources.public}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border">
                      <div className="text-muted-foreground">Synthetic</div>
                      <div className="font-bold text-lg">{beforeAfterResult.outcomeSources.synthetic}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border">
                      <div className="text-muted-foreground">Total Ingested</div>
                      <div className="font-bold text-lg">{beforeAfterResult.outcomeIngestion.totalRecords}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border">
                      <div className="text-muted-foreground">Weight Updates</div>
                      <div className="font-bold text-lg">{beforeAfterResult.outcomeIngestion.totalWeightUpdates}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border">
                      <div className="text-muted-foreground">Memory Bank</div>
                      <div className="font-bold text-lg">{beforeAfterResult.outcomeIngestion.memoryBankStatus}</div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    Per Blueprint: &quot;never &apos;50 fake wins&apos;&quot; — 5 public (CMS MA appeal data) + 45 synthetic controlled cases
                  </div>
                </CardContent>
              </Card>

              {/* ─── The Killer Table: Before/After Delta ────────────────── */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-emerald-500" />
                    Before/After Delta Table — The Killer Table
                  </CardTitle>
                  <CardDescription>
                    Five metrics measured before and after outcome learning on 10 held-out cases
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 font-medium">Metric</th>
                          <th className="text-right py-2 px-3 font-medium">Before</th>
                          <th className="text-right py-2 px-3 font-medium">After</th>
                          <th className="text-right py-2 px-3 font-medium">Delta</th>
                          <th className="text-right py-2 px-3 font-medium">Delta %</th>
                          <th className="text-center py-2 px-3 font-medium">Direction</th>
                        </tr>
                      </thead>
                      <tbody>
                        {beforeAfterResult.deltas.map((d) => (
                          <tr key={d.metric} className="border-b hover:bg-muted/50">
                            <td className="py-2 px-3 font-medium">{d.metricLabel}</td>
                            <td className="py-2 px-3 text-right tabular-nums">
                              {(d.beforeValue * 100).toFixed(1)}%
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums">
                              {(d.afterValue * 100).toFixed(1)}%
                            </td>
                            <td className={`py-2 px-3 text-right tabular-nums font-bold ${DeltaColor({ delta: d.delta })}`}>
                              {d.delta > 0 ? '+' : ''}{(d.delta * 100).toFixed(1)}%
                            </td>
                            <td className={`py-2 px-3 text-right tabular-nums ${DeltaColor({ delta: d.delta })}`}>
                              {d.deltaPercent > 0 ? '+' : ''}{d.deltaPercent.toFixed(1)}%
                            </td>
                            <td className="py-2 px-3 text-center">
                              <DeltaIcon delta={d.delta} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Honesty Badge */}
                  <div className="mt-4 flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className="bg-emerald-50 text-emerald-700 border-emerald-200"
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      HONEST REPORTING (Principle 5)
                    </Badge>
                    {beforeAfterResult.deltas.some(d => d.delta < 0) ? (
                      <span className="text-xs text-amber-600">
                        Negative deltas reported honestly — more credible than inflated claims
                      </span>
                    ) : (
                      <span className="text-xs text-emerald-600">
                        All metrics improved after outcome learning
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Gate Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4 text-amber-500" />
                    Before/After Gate Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className={`h-6 w-6 ${beforeAfterResult.gatePassed ? 'text-emerald-500' : 'text-red-500'}`} />
                    <div>
                      <div className={`font-bold ${beforeAfterResult.gatePassed ? 'text-emerald-600' : 'text-red-600'}`}>
                        GATE {beforeAfterResult.gatePassed ? 'PASSED' : 'FAILED'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {beforeAfterResult.gateDetails}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ─── Ablation Tab ──────────────────────────────────────────── */}
        <TabsContent value="ablation" className="space-y-4">
          {!ablationResult ? (
            <Card>
              <CardContent className="py-12 text-center">
                <GitBranch className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Agent Ablation Experiment</h3>
                <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                  Run 4 progressively richer agent topologies on the same 10 held-out cases.
                  Demonstrates that each agent removal breaks a measurable property.
                </p>
                <Button
                  onClick={() => runAblation(true)}
                  disabled={runningAblation}
                  className="bg-violet-600 hover:bg-violet-700"
                >
                  {runningAblation ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Running Ablation...</>
                  ) : (
                    <><Play className="h-4 w-4 mr-1" /> Run Ablation</>
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* ─── Table 7.1: The Ablation Table ─────────────────────── */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-violet-500" />
                    Table 7.1 — Agent Ablation Results
                  </CardTitle>
                  <CardDescription>
                    Every cell is a MEASUREMENT, not a claim. Removing agents breaks measurable properties.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 font-medium">Architecture</th>
                          <th className="text-center py-2 px-3 font-medium">Agents</th>
                          <th className="text-right py-2 px-3 font-medium">Citation Grounding</th>
                          <th className="text-center py-2 px-3 font-medium">Unsupported Claims</th>
                          <th className="text-center py-2 px-3 font-medium">Level</th>
                          <th className="text-left py-2 px-3 font-medium">Verdict</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ablationResult.topologies.map((t) => (
                          <tr key={t.topology} className="border-b hover:bg-muted/50">
                            <td className="py-3 px-3">
                              <div className="font-medium">{t.label}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {t.agentsIncluded.join(' → ')}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <Badge variant="outline" className="font-mono">
                                {t.agentCount}
                              </Badge>
                            </td>
                            <td className={`py-3 px-3 text-right font-bold tabular-nums ${groundingColor(t.aggregate.citationGroundingPercent)}`}>
                              {t.aggregate.citationGroundingPercent}%
                            </td>
                            <td className="py-3 px-3 text-center tabular-nums">
                              {t.aggregate.unsupportedClaims.toFixed(1)}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <Badge className={`text-xs ${claimsLevelColor(t.aggregate.unsupportedClaimsLevel)}`}>
                                {t.aggregate.unsupportedClaimsLevel}
                              </Badge>
                            </td>
                            <td className="py-3 px-3 font-medium">
                              {t.aggregate.verdict}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Progression visualization */}
                  <div className="mt-6 space-y-3">
                    <h4 className="text-sm font-medium text-muted-foreground">Citation Grounding Progression</h4>
                    {ablationResult.topologies.map((t) => (
                      <div key={t.topology} className="flex items-center gap-3">
                        <div className="w-32 text-xs font-medium truncate">
                          {t.agentCount}-agent
                        </div>
                        <div className="flex-1">
                          <Progress
                            value={t.aggregate.citationGroundingPercent}
                            className="h-3"
                          />
                        </div>
                        <div className="w-14 text-xs font-bold tabular-nums text-right">
                          {t.aggregate.citationGroundingPercent}%
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* ─── Detailed Metrics per Topology ─────────────────────── */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-500" />
                    Detailed Metrics by Topology
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {ablationResult.topologies.map((t) => (
                      <div key={t.topology} className="p-4 rounded-lg border bg-slate-50">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium">{t.label}</h4>
                          <Badge variant="outline">{t.agentCount} agents</Badge>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Top-1 Accuracy</span>
                            <span className="font-bold tabular-nums">{(t.aggregate.top1Accuracy * 100).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Top-3 Accuracy</span>
                            <span className="font-bold tabular-nums">{(t.aggregate.top3Accuracy * 100).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Citation Grounding</span>
                            <span className="font-bold tabular-nums">{(t.aggregate.citationGrounding * 100).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Appeal Quality</span>
                            <span className="font-bold tabular-nums">{(t.aggregate.appealQuality * 100).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Argument Selection</span>
                            <span className="font-bold tabular-nums">{(t.aggregate.argumentSelection * 100).toFixed(1)}%</span>
                          </div>
                          <Separator className="my-2" />
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Unsupported Claims</span>
                            <Badge className={`text-xs ${claimsLevelColor(t.aggregate.unsupportedClaimsLevel)}`}>
                              {t.aggregate.unsupportedClaims.toFixed(1)} ({t.aggregate.unsupportedClaimsLevel})
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* ─── Key Insight ────────────────────────────────────────── */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-500" />
                    Why 8 Agents? — The Necessity Argument
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="p-3 rounded-lg bg-violet-50 border border-violet-200">
                    <div className="font-medium text-violet-800 mb-1">Collapsing Policy Research + Evidence Assembly</div>
                    <div className="text-violet-700">
                      Destroys the citation/clinical-evidence distinction the appeal depends on.
                      Without separate policy lookup, citations come from draft inference only (weak grounding).
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <div className="font-medium text-amber-800 mb-1">Removing Quality Review</div>
                    <div className="text-amber-700">
                      Reintroduces unsupported claims that the compliance story cannot tolerate.
                      Without independent review, the system cannot verify its own output.
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                    <div className="font-medium text-emerald-800 mb-1">Full 8-Agent Pipeline</div>
                    <div className="text-emerald-700">
                      Each agent&apos;s removal breaks a measurable property. The count is justified
                      by measurement, not by ambition. &quot;Why eight? Because the table shows it.&quot;
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Ablation Gate Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4 text-amber-500" />
                    Ablation Gate Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className={`h-6 w-6 ${ablationResult.gatePassed ? 'text-emerald-500' : 'text-red-500'}`} />
                    <div>
                      <div className={`font-bold ${ablationResult.gatePassed ? 'text-emerald-600' : 'text-red-600'}`}>
                        GATE {ablationResult.gatePassed ? 'PASSED' : 'FAILED'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {ablationResult.gateDetails}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Experiment Status Footer ────────────────────────────────── */}
      {(beforeAfterResult || ablationResult) && (
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-violet-50 text-violet-700">
                  <FlaskConical className="h-3 w-3 mr-1" />
                  Day 8
                </Badge>
              </div>
              {beforeAfterResult && (
                <div className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Before/After: Complete ({beforeAfterResult.deltas.length} metrics)
                </div>
              )}
              {ablationResult && (
                <div className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Ablation: Complete ({ablationResult.topologies.length} topologies)
                </div>
              )}
              {beforeAfterResult && (
                <div className="text-muted-foreground ml-auto">
                  Duration: {beforeAfterResult.durationMs}ms
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
