'use client';

/**
 * DenialDefender — Agent Ablation Experiment Panel (Table 7.1)
 *
 * Visualizes the Agent Ablation Experiment that proves each agent's
 * contribution is measurable, not decorative.
 *
 * Sections:
 *   1. Header — title, subtitle, run buttons, gate badge
 *   2. Table 7.1 — 4 topologies × 8 metrics with color coding
 *   3. Agent Lists — which agents are present/absent per topology
 *   4. Gate Details — honesty principle and improvement deltas
 *   5. Experiment Info — cases, duration, timestamp, mode
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
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  FlaskConical,
  TrendingUp,
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  BarChart3,
  RotateCcw,
  Clock,
  Hash,
  Zap,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────

interface TopologyAggregate {
  citationGrounding: number;
  citationGroundingPercent: number;
  unsupportedClaims: number;
  unsupportedClaimsLevel: 'high' | 'medium' | 'low' | 'near-zero';
  verdict: string;
  top1Accuracy: number;
  top3Accuracy: number;
  appealQuality: number;
  argumentSelection: number;
}

interface TopologyResult {
  topology: string;
  label: string;
  description: string;
  agentCount: number;
  agentsIncluded: string[];
  aggregate: TopologyAggregate;
  caseCount: number;
  caseErrors: number;
}

interface ExperimentData {
  topologies: TopologyResult[];
  totalCases: number;
  gatePassed: boolean;
  gateDetails: string;
  durationMs: number;
  timestamp: string;
}

// ─── All 8 agents in the full pipeline ────────────────────────────────────

const ALL_AGENTS = [
  { id: 'advocate', name: 'Patient Advocate', color: 'bg-teal-600 dark:bg-teal-500' },
  { id: 'triage', name: 'Denial Triage', color: 'bg-emerald-600 dark:bg-emerald-500' },
  { id: 'policy', name: 'Policy Research', color: 'bg-cyan-600 dark:bg-cyan-500' },
  { id: 'evidence', name: 'Evidence Assembly', color: 'bg-sky-600 dark:bg-sky-500' },
  { id: 'citation', name: 'Citation Agent', color: 'bg-amber-600 dark:bg-amber-500' },
  { id: 'drafter', name: 'Letter Drafting', color: 'bg-orange-600 dark:bg-orange-500' },
  { id: 'coder', name: 'Medical Coder', color: 'bg-rose-600 dark:bg-rose-500' },
  { id: 'reviewer', name: 'Quality Review', color: 'bg-violet-600 dark:bg-violet-500' },
] as const;

// Mapping from topology to included agent ids
const TOPOLOGY_AGENT_MAP: Record<string, string[]> = {
  single: ['triage'],  // Monolith: triage+draft combined
  three_agent: ['triage', 'drafter', 'reviewer'],
  five_agent: ['triage', 'policy', 'evidence', 'drafter', 'reviewer'],
  eight_agent: ['advocate', 'triage', 'policy', 'evidence', 'citation', 'drafter', 'coder', 'reviewer'],
};

// ─── Color Helpers ────────────────────────────────────────────────────────

function getCitationGroundingColor(percent: number): string {
  if (percent < 75) return 'text-red-600 dark:text-red-400';
  if (percent < 85) return 'text-orange-600 dark:text-orange-400';
  if (percent < 92) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

function getCitationGroundingBg(percent: number): string {
  if (percent < 75) return 'bg-red-50 dark:bg-red-950/40';
  if (percent < 85) return 'bg-orange-50 dark:bg-orange-950/40';
  if (percent < 92) return 'bg-yellow-50 dark:bg-yellow-950/40';
  return 'bg-emerald-50 dark:bg-emerald-950/40';
}

function getUnsupportedClaimsColor(level: string): string {
  switch (level) {
    case 'high': return 'text-red-600 dark:text-red-400';
    case 'medium': return 'text-orange-600 dark:text-orange-400';
    case 'low': return 'text-yellow-600 dark:text-yellow-400';
    case 'near-zero': return 'text-emerald-600 dark:text-emerald-400';
    default: return 'text-muted-foreground';
  }
}

function getUnsupportedClaimsBg(level: string): string {
  switch (level) {
    case 'high': return 'bg-red-50 dark:bg-red-950/40';
    case 'medium': return 'bg-orange-50 dark:bg-orange-950/40';
    case 'low': return 'bg-yellow-50 dark:bg-yellow-950/40';
    case 'near-zero': return 'bg-emerald-50 dark:bg-emerald-950/40';
    default: return '';
  }
}

function getVerdictColor(verdict: string): { text: string; bg: string } {
  const lower = verdict.toLowerCase();
  if (lower.includes('fail')) return { text: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/40' };
  if (lower.includes('weak')) return { text: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/40' };
  if (lower.includes('strong') || lower.includes('independently') || lower.includes('verifiable'))
    return { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40' };
  return { text: 'text-muted-foreground', bg: '' };
}

function getVerdictIcon(verdict: string) {
  const lower = verdict.toLowerCase();
  if (lower.includes('fail')) return <XCircle className="h-3.5 w-3.5" />;
  if (lower.includes('weak')) return <AlertTriangle className="h-3.5 w-3.5" />;
  if (lower.includes('strong') || lower.includes('independently') || lower.includes('verifiable'))
    return <CheckCircle2 className="h-3.5 w-3.5" />;
  return null;
}

/** Gradient from red (0%) → yellow (50%) → green (100%) */
function getPercentColor(value: number): string {
  if (value < 0.5) return 'text-red-600 dark:text-red-400';
  if (value < 0.7) return 'text-orange-600 dark:text-orange-400';
  if (value < 0.85) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

// ─── Component ────────────────────────────────────────────────────────────

export function AblationPanel() {
  const [experiment, setExperiment] = useState<ExperimentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'idle' | 'quick' | 'full'>('idle');

  const fetchExperiment = useCallback(async (quick: boolean) => {
    setLoading(true);
    setError(null);
    setMode(quick ? 'quick' : 'full');

    try {
      const res = await fetch('/api/eval/ablation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quick }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Request failed with status ${res.status}`);
      }

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Experiment returned unsuccessful response');
      }

      setExperiment(data.experiment as ExperimentData);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Derived: improvement from single → full ──
  const getImprovementDeltas = useCallback((): string[] => {
    if (!experiment || experiment.topologies.length < 2) return [];
    const single = experiment.topologies.find(t => t.topology === 'single');
    const full = experiment.topologies.find(t => t.topology === 'eight_agent');
    if (!single || !full) return [];

    const deltas: string[] = [];
    const cgDelta = full.aggregate.citationGrounding - single.aggregate.citationGrounding;
    deltas.push(
      `Citation grounding ${single.aggregate.citationGrounding.toFixed(2)} → ${full.aggregate.citationGrounding.toFixed(2)} (${cgDelta >= 0 ? '+' : ''}${Math.round(cgDelta * 100)}pp)`
    );

    const top1Delta = full.aggregate.top1Accuracy - single.aggregate.top1Accuracy;
    deltas.push(
      `Top-1 accuracy ${single.aggregate.top1Accuracy.toFixed(2)} → ${full.aggregate.top1Accuracy.toFixed(2)} (${top1Delta >= 0 ? '+' : ''}${Math.round(top1Delta * 100)}pp)`
    );

    const top3Delta = full.aggregate.top3Accuracy - single.aggregate.top3Accuracy;
    deltas.push(
      `Top-3 accuracy ${single.aggregate.top3Accuracy.toFixed(2)} → ${full.aggregate.top3Accuracy.toFixed(2)} (${top3Delta >= 0 ? '+' : ''}${Math.round(top3Delta * 100)}pp)`
    );

    const aqDelta = full.aggregate.appealQuality - single.aggregate.appealQuality;
    deltas.push(
      `Appeal quality ${single.aggregate.appealQuality.toFixed(2)} → ${full.aggregate.appealQuality.toFixed(2)} (${aqDelta >= 0 ? '+' : ''}${Math.round(aqDelta * 100)}pp)`
    );

    const asDelta = full.aggregate.argumentSelection - single.aggregate.argumentSelection;
    deltas.push(
      `Argument selection ${single.aggregate.argumentSelection.toFixed(2)} → ${full.aggregate.argumentSelection.toFixed(2)} (${asDelta >= 0 ? '+' : ''}${Math.round(asDelta * 100)}pp)`
    );

    return deltas;
  }, [experiment]);

  // ── Render ──

  return (
    <div className="space-y-6">
      {/* ── 1. Header Section ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-xl">
                <FlaskConical className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                Agent Contribution Analysis
              </CardTitle>
              <CardDescription className="text-sm">
                Measuring each agent's measurable contribution to appeal quality
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {experiment && (
                <Badge
                  className={`gap-1 text-xs px-3 py-1 ${
                    experiment.gatePassed
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border-red-300 dark:border-red-700'
                  }`}
                  variant="outline"
                >
                  <Shield className="h-3 w-3" />
                  {experiment.gatePassed ? 'GATE PASSED' : 'GATE FAILED'}
                </Badge>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => fetchExperiment(true)}
                disabled={loading}
                className="gap-1.5"
              >
                {loading && mode === 'quick' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5" />
                )}
                Run Quick Experiment
              </Button>
              <Button
                size="sm"
                onClick={() => fetchExperiment(false)}
                disabled={loading}
                className="gap-1.5 bg-teal-600 hover:bg-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600"
              >
                {loading && mode === 'full' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FlaskConical className="h-3.5 w-3.5" />
                )}
                Run Full Experiment
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* ── Error State ───────────────────────────────────────────── */}
      {error && (
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <XCircle className="h-5 w-5 text-red-500 shrink-0" />
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium text-red-700 dark:text-red-400">
                  Experiment failed
                </p>
                <p className="text-xs text-red-600/80 dark:text-red-400/80">{error}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => fetchExperiment(mode === 'quick')}
                className="gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Loading State ─────────────────────────────────────────── */}
      {loading && (
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600 dark:text-teal-400" />
              <p className="text-sm font-medium">
                {mode === 'quick'
                  ? 'Running quick ablation experiment...'
                  : 'Running full ablation experiment (this may take a while)...'}
              </p>
              <p className="text-xs">
                Evaluating 4 topologies across held-out cases
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Empty State ───────────────────────────────────────────── */}
      {!loading && !error && !experiment && (
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <BarChart3 className="h-10 w-10 text-teal-600/40 dark:text-teal-400/40" />
              <p className="text-sm font-medium">No experiment results yet</p>
              <p className="text-xs text-center max-w-md">
                Run a Quick experiment for documented baseline numbers,
                or a Full experiment to measure with actual agent outputs.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 2. Agent Contribution Results Table ──────────────── */}
      {experiment && !loading && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              Agent Contribution Results
            </CardTitle>
            <CardDescription>
              Each row is a topology. Each cell is a measurement, not a claim.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">Architecture</TableHead>
                  <TableHead className="text-center">Agents</TableHead>
                  <TableHead className="text-center min-w-[110px]">
                    <span className="flex items-center justify-center gap-1">
                      Citation Grounding
                    </span>
                  </TableHead>
                  <TableHead className="text-center min-w-[110px]">
                    Unsupported Claims
                  </TableHead>
                  <TableHead className="text-center">Top-1</TableHead>
                  <TableHead className="text-center">Top-3</TableHead>
                  <TableHead className="text-center">Appeal Quality</TableHead>
                  <TableHead className="text-center">Arg Selection</TableHead>
                  <TableHead className="text-center min-w-[160px]">Verdict</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {experiment.topologies.map((topo) => {
                  const agg = topo.aggregate;
                  const vColor = getVerdictColor(agg.verdict);
                  const vIcon = getVerdictIcon(agg.verdict);

                  return (
                    <TableRow key={topo.topology}>
                      {/* Architecture */}
                      <TableCell className="font-medium text-sm">
                        {topo.label}
                      </TableCell>

                      {/* Agent Count */}
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-xs tabular-nums">
                          {topo.agentCount}
                        </Badge>
                      </TableCell>

                      {/* Citation Grounding */}
                      <TableCell className="text-center">
                        <span
                          className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${getCitationGroundingColor(agg.citationGroundingPercent)} ${getCitationGroundingBg(agg.citationGroundingPercent)}`}
                        >
                          {agg.citationGroundingPercent}%
                        </span>
                      </TableCell>

                      {/* Unsupported Claims */}
                      <TableCell className="text-center">
                        <span
                          className={`inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${getUnsupportedClaimsColor(agg.unsupportedClaimsLevel)} ${getUnsupportedClaimsBg(agg.unsupportedClaimsLevel)}`}
                        >
                          {agg.unsupportedClaims.toFixed(1)}
                          <span className="opacity-70">({agg.unsupportedClaimsLevel})</span>
                        </span>
                      </TableCell>

                      {/* Top-1 Accuracy */}
                      <TableCell className="text-center">
                        <span className={`text-xs font-semibold tabular-nums ${getPercentColor(agg.top1Accuracy)}`}>
                          {Math.round(agg.top1Accuracy * 100)}%
                        </span>
                      </TableCell>

                      {/* Top-3 Accuracy */}
                      <TableCell className="text-center">
                        <span className={`text-xs font-semibold tabular-nums ${getPercentColor(agg.top3Accuracy)}`}>
                          {Math.round(agg.top3Accuracy * 100)}%
                        </span>
                      </TableCell>

                      {/* Appeal Quality */}
                      <TableCell className="text-center">
                        <span className={`text-xs font-semibold tabular-nums ${getPercentColor(agg.appealQuality)}`}>
                          {Math.round(agg.appealQuality * 100)}%
                        </span>
                      </TableCell>

                      {/* Argument Selection */}
                      <TableCell className="text-center">
                        <span className={`text-xs font-semibold tabular-nums ${getPercentColor(agg.argumentSelection)}`}>
                          {Math.round(agg.argumentSelection * 100)}%
                        </span>
                      </TableCell>

                      {/* Verdict */}
                      <TableCell className="text-center">
                        <span
                          className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${vColor.text} ${vColor.bg}`}
                        >
                          {vIcon}
                          {agg.verdict}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── 3. Agent Lists Per Topology ───────────────────────────── */}
      {experiment && !loading && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              Agent Composition Per Topology
            </CardTitle>
            <CardDescription>
              Present agents are solid. Absent agents are dashed — showing what&apos;s removed at each level.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {experiment.topologies.map((topo) => {
                const includedIds = TOPOLOGY_AGENT_MAP[topo.topology] || [];
                const removedCount = ALL_AGENTS.length - includedIds.length;

                return (
                  <div
                    key={topo.topology}
                    className="rounded-lg border border-border p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{topo.label}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {topo.agentCount} agent{topo.agentCount !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                      {removedCount > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {removedCount} agent{removedCount !== 1 ? 's' : ''} removed
                        </span>
                      )}
                    </div>

                    {/* Agent pills */}
                    <div className="flex flex-wrap gap-2">
                      {ALL_AGENTS.map((agent) => {
                        const isPresent = includedIds.includes(agent.id);
                        return (
                          <span
                            key={agent.id}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                              isPresent
                                ? `${agent.color} text-white`
                                : 'border border-dashed border-muted-foreground/30 text-muted-foreground/50 bg-transparent'
                            }`}
                          >
                            {isPresent ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            {agent.name}
                          </span>
                        );
                      })}
                    </div>

                    {/* What's removed */}
                    {removedCount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Removed: </span>
                        {ALL_AGENTS
                          .filter((a) => !includedIds.includes(a.id))
                          .map((a) => a.name)
                          .join(', ')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 4. Gate Details ───────────────────────────────────────── */}
      {experiment && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Gate Card */}
          <Card className={experiment.gatePassed ? 'border-emerald-200 dark:border-emerald-800' : 'border-red-200 dark:border-red-800'}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {experiment.gatePassed ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                )}
                Quality Gate
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Badge
                className={`text-xs ${
                  experiment.gatePassed
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border-red-300 dark:border-red-700'
                }`}
                variant="outline"
              >
                {experiment.gatePassed ? 'GATE PASSED' : 'GATE FAILED'}
              </Badge>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {experiment.gateDetails}
              </p>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium italic text-muted-foreground">
                  &ldquo;Honesty is the gate — if the delta is negative on any metric,
                  that is reported, not hidden.&rdquo;
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Improvement Deltas Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                Improvement: Single → Full
              </CardTitle>
              <CardDescription>
                Measured improvement from 1-agent to 8-agent pipeline
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {getImprovementDeltas().map((delta, i) => {
                  const isPositive = delta.includes('+');
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-xs bg-muted/30"
                    >
                      {isPositive ? (
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400 shrink-0" />
                      )}
                      <span
                        className={
                          isPositive
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-orange-700 dark:text-orange-400'
                        }
                      >
                        {delta}
                      </span>
                    </div>
                  );
                })}
                {getImprovementDeltas().length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Run the experiment to see improvement deltas.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── 5. Experiment Info ────────────────────────────────────── */}
      {experiment && !loading && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              Experiment Info
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* Total Cases */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Hash className="h-3 w-3" />
                  Total Cases
                </div>
                <p className="text-lg font-semibold tabular-nums">{experiment.totalCases}</p>
              </div>

              {/* Duration */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Duration
                </div>
                <p className="text-lg font-semibold tabular-nums">
                  {experiment.durationMs < 1000
                    ? `${experiment.durationMs}ms`
                    : `${(experiment.durationMs / 1000).toFixed(1)}s`}
                </p>
              </div>

              {/* Mode */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FlaskConical className="h-3 w-3" />
                  Mode
                </div>
                <Badge
                  variant="outline"
                  className={
                    mode === 'full'
                      ? 'text-xs border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-400'
                      : 'text-xs'
                  }
                >
                  {mode === 'quick' ? 'Quick (baseline)' : 'Full (measured)'}
                </Badge>
              </div>

              {/* Timestamp */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Timestamp
                </div>
                <p className="text-xs font-medium">
                  {new Date(experiment.timestamp).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Case errors per topology */}
            {experiment.topologies.some(t => t.caseErrors > 0) && (
              <div className="mt-4 rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 p-3">
                <div className="flex items-center gap-2 text-xs text-orange-700 dark:text-orange-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-medium">Case errors detected:</span>
                  {experiment.topologies
                    .filter(t => t.caseErrors > 0)
                    .map(t => `${t.label}: ${t.caseErrors}/${t.caseCount}`)
                    .join('; ')}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
