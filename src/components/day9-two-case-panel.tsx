'use client';

/**
 * DenialDefender — Day 9 Panel: Two-Case Behavioral Demo
 *
 * Day 9 features:
 * 1. Case 1: Denial → LOSS → Outcome Ingested → Weight Updated
 * 2. Case 2: Related Denial (same payer) → Different Argument Ranking
 * 3. Agent Explains WHY the ranking changed (from Memory Bank weight delta)
 * 4. Before/After metric display with real measured delta
 * 5. Gate verification: ranking change NOT a hardcoded reorder
 *
 * Per Blueprint: "This is the single biggest strategic change from the
 * blueprint as written (Section 13) — its gate is non-negotiable."
 */

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Play, Loader2, CheckCircle2, XCircle, ArrowRight, ArrowUpRight,
  ArrowDownRight, MinusCircle, Shield, Activity, TrendingUp,
  BookOpen, Scale, Brain, Zap, Eye, Database, Trophy,
  BarChart3,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────

interface WeightUpdate {
  evidenceId: string;
  oldWeight: number;
  newWeight: number;
  delta: number;
  reason: string;
}

interface RankingChangeItem {
  argument: string;
  oldRank: number;
  newRank: number;
}

interface DemoResult {
  case1: {
    payer: string;
    appealStrategy: string;
    argumentRanking: string[];
    citationsUsed: string[];
    verdict: string;
    weightUpdates: WeightUpdate[];
    weightUpdateCount: number;
    memoryBankStatus: string;
    durationMs: number;
  };
  case2: {
    payer: string;
    appealStrategy: string;
    argumentRanking: string[];
    citationsUsed: string[];
    rankingChangeExplanation: string;
    durationMs: number;
  };
  rankingChange: {
    promoted: RankingChangeItem[];
    demoted: RankingChangeItem[];
    unchanged: { argument: string; rank: number }[];
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
}

// ─── Component ────────────────────────────────────────────────────────────

export default function Day9TwoCasePanel() {
  const [demoResult, setDemoResult] = useState<DemoResult | null>(null);
  const [running, setRunning] = useState(false);

  const runDemo = useCallback(async () => {
    setRunning(true);
    try {
      const res = await fetch('/api/demo/two-case', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quick: true }),
      });
      const data = await res.json();
      if (data.success) {
        setDemoResult(data.demo);
      }
    } catch (e) {
      console.error('Two-case demo failed:', e);
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* ─── Header ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-violet-500" />
                Day 9: Two-Case Behavioral Demo
              </CardTitle>
              <CardDescription className="mt-1">
                The single biggest strategic change — actual observable learning, not a performed animation.
              </CardDescription>
            </div>
            <Button
              onClick={runDemo}
              disabled={running}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {running ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Running Demo...</>
              ) : (
                <><Play className="h-4 w-4 mr-1" /> Run Two-Case Demo</>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <XCircle className="h-4 w-4 text-red-500" />
              <div>
                <div className="font-medium">Case 1 → LOSS</div>
                <div className="text-muted-foreground">Knee arthroplasty, UnitedHealthcare</div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <Database className="h-4 w-4 text-amber-500" />
              <div>
                <div className="font-medium">Weight Update</div>
                <div className="text-muted-foreground">Outcome ingested → Memory Bank</div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              <div>
                <div className="font-medium">Case 2 → Different Ranking</div>
                <div className="text-muted-foreground">Hip arthroplasty, same payer</div>
              </div>
            </div>
          </div>

          {/* Non-negotiable Gate Banner */}
          <Alert className="mt-4 border-violet-200 bg-violet-50">
            <Shield className="h-4 w-4 text-violet-600" />
            <AlertTitle className="text-violet-800">Non-Negotiable Gate</AlertTitle>
            <AlertDescription className="text-violet-700">
              The ranking change must be attributable to the recorded outcomes (verified by reading
              the Memory Bank weight delta), <strong>NOT a hardcoded reorder</strong>. This is the
              single biggest strategic change from the blueprint as written.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {!demoResult ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Two-Case Behavioral Moment</h3>
            <p className="text-muted-foreground mb-4 max-w-lg mx-auto">
              Case 1 runs to a LOSS, the system updates procedural evidence, and Case 2 — same payer,
              related denial — runs with a visibly different argument ranking. The agent explains
              why the ranking changed.
            </p>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto mb-6">
              &quot;This ranking changed because two previous validated outcomes favored Argument C.&quot;
            </p>
            <Button
              onClick={runDemo}
              disabled={running}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {running ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Running...</>
              ) : (
                <><Play className="h-4 w-4 mr-1" /> Start Demo</>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ─── Case 1: LOSS + Weight Update ─────────────────────────── */}
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-500" />
                Case 1: Knee Arthroplasty → LOSS
                <Badge variant="outline" className="ml-auto text-red-600 border-red-300">
                  UnitedHealthcare
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Argument Ranking (Before) */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Argument Ranking (Before Learning)</h4>
                <div className="space-y-1">
                  {demoResult.case1.argumentRanking.map((arg, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="w-6 h-6 flex items-center justify-center text-xs font-mono">
                        {i + 1}
                      </Badge>
                      <span>{arg.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Weight Updates */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  Weight Updates from LOSS Outcome
                </h4>
                <div className="space-y-2">
                  {demoResult.case1.weightUpdates.map((w, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded bg-red-50 border border-red-100 text-sm">
                      <ArrowDownRight className="h-4 w-4 text-red-500" />
                      <span className="font-medium truncate max-w-48">{w.evidenceId.replace(/_/g, ' ')}</span>
                      <span className="tabular-nums text-red-600 font-bold">
                        {w.oldWeight.toFixed(2)} → {w.newWeight.toFixed(2)} ({w.delta > 0 ? '+' : ''}{w.delta.toFixed(2)})
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Memory Bank status: {demoResult.case1.memoryBankStatus} • {demoResult.case1.weightUpdateCount} weight update(s)
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ─── Case 2: Different Ranking + Explanation ──────────────── */}
          <Card className="border-emerald-200">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
                Case 2: Hip Arthroplasty → Different Ranking
                <Badge variant="outline" className="ml-auto text-emerald-600 border-emerald-300">
                  Same Payer
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Argument Ranking (After) */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Argument Ranking (After Learning)</h4>
                <div className="space-y-1">
                  {demoResult.case2.argumentRanking.map((arg, i) => {
                    // Check if this argument was promoted or demoted
                    const wasPromoted = demoResult.rankingChange.promoted.some(p => p.argument === arg);
                    const wasDemoted = demoResult.rankingChange.demoted.some(d => d.argument === arg);
                    const change = demoResult.rankingChange.promoted.find(p => p.argument === arg) ||
                      demoResult.rankingChange.demoted.find(d => d.argument === arg);

                    return (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className="w-6 h-6 flex items-center justify-center text-xs font-mono">
                          {i + 1}
                        </Badge>
                        <span>{arg.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                        {wasPromoted && (
                          <Badge className="text-xs bg-emerald-100 text-emerald-700">
                            <ArrowUpRight className="h-3 w-3 mr-0.5" />
                            ↑{change?.oldRank} → {change?.newRank}
                          </Badge>
                        )}
                        {wasDemoted && (
                          <Badge className="text-xs bg-red-100 text-red-700">
                            <ArrowDownRight className="h-3 w-3 mr-0.5" />
                            ↓{change?.oldRank} → {change?.newRank}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Agent Explanation */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <Brain className="h-4 w-4" />
                  Agent Explanation (from Memory Bank — NOT hardcoded)
                </h4>
                <div className="p-4 rounded-lg bg-violet-50 border border-violet-200 text-sm text-violet-800">
                  &quot;{demoResult.case2.rankingChangeExplanation}&quot;
                </div>
              </div>

              {/* Ranking Change Summary */}
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
                  <div className="text-lg font-bold text-emerald-600">{demoResult.rankingChange.promoted.length}</div>
                  <div className="text-muted-foreground">Promoted</div>
                </div>
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-center">
                  <div className="text-lg font-bold text-red-600">{demoResult.rankingChange.demoted.length}</div>
                  <div className="text-muted-foreground">Demoted</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border text-center">
                  <div className="text-lg font-bold">{demoResult.rankingChange.unchanged.length}</div>
                  <div className="text-muted-foreground">Unchanged</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ─── Before/After Metrics ──────────────────────────────────── */}
          {demoResult.beforeAfterMetrics && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-500" />
                  Before/After Metrics (Real Measured Delta)
                </CardTitle>
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
                        <th className="text-center py-2 px-3 font-medium">Dir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(demoResult.beforeAfterMetrics.deltas).map(([metric, delta]) => {
                        const before = demoResult.beforeAfterMetrics!.before[metric] || 0;
                        const after = demoResult.beforeAfterMetrics!.after[metric] || 0;
                        const label = metric.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                        return (
                          <tr key={metric} className="border-b hover:bg-muted/50">
                            <td className="py-2 px-3 font-medium">{label}</td>
                            <td className="py-2 px-3 text-right tabular-nums">{(before * 100).toFixed(1)}%</td>
                            <td className="py-2 px-3 text-right tabular-nums">{(after * 100).toFixed(1)}%</td>
                            <td className={`py-2 px-3 text-right tabular-nums font-bold ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                              {delta > 0 ? '+' : ''}{(delta * 100).toFixed(1)}%
                            </td>
                            <td className="py-2 px-3 text-center">
                              {delta > 0 ? <ArrowUpRight className="h-4 w-4 text-emerald-500 inline" /> :
                               delta < 0 ? <ArrowDownRight className="h-4 w-4 text-red-500 inline" /> :
                               <MinusCircle className="h-4 w-4 text-amber-500 inline" />}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── Behavioral Summary ────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Behavioral Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{demoResult.behavioralSummary}</p>
            </CardContent>
          </Card>

          {/* ─── Gate Status ──────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-violet-500" />
                Two-Case Demo Gate Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                {demoResult.gatePassed ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                ) : (
                  <XCircle className="h-6 w-6 text-red-500" />
                )}
                <div>
                  <div className={`font-bold ${demoResult.gatePassed ? 'text-emerald-600' : 'text-red-600'}`}>
                    GATE {demoResult.gatePassed ? 'PASSED' : 'FAILED'}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {demoResult.gateDetails}
                  </div>
                </div>
              </div>

              {/* Attribution verification */}
              <div className="mt-4 p-3 rounded-lg bg-slate-50 border">
                <div className="text-sm font-medium mb-2">Attribution Verification</div>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    {demoResult.case1.weightUpdateCount > 0 ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-500" />
                    )}
                    <span>Weight updates from Case 1 LOSS: {demoResult.case1.weightUpdateCount}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {demoResult.rankingChange.isVisiblyDifferent ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-500" />
                    )}
                    <span>Ranking visibly different: {demoResult.rankingChange.isVisiblyDifferent ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {demoResult.case1.memoryBankStatus === 'primary' ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <XCircle className="h-3 w-3 text-amber-500" />
                    )}
                    <span>Memory Bank: {demoResult.case1.memoryBankStatus}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ─── Demo Status Footer ────────────────────────────────────── */}
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <Badge variant="outline" className="bg-violet-50 text-violet-700">
                  <Brain className="h-3 w-3 mr-1" />
                  Day 9
                </Badge>
                <span className="text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" />
                  Two-Case Demo: Complete
                </span>
                <span className="text-muted-foreground ml-auto">
                  Duration: {demoResult.durationMs}ms
                </span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
