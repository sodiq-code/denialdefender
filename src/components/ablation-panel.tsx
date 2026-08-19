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
  Heart,
  Search,
  BookOpen,
  PenTool,
  Stethoscope,
  Paperclip,
  Scale,
} from 'lucide-react';
import { toast } from 'sonner';

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
  { id: 'advocate', name: 'Patient Advocate', color: 'bg-rose-500' },
  { id: 'triage', name: 'Denial Triage', color: 'bg-teal-500' },
  { id: 'policy', name: 'Policy Research', color: 'bg-emerald-500' },
  { id: 'evidence', name: 'Evidence Assembly', color: 'bg-teal-600' },
  { id: 'citation', name: 'Citation Agent', color: 'bg-amber-500' },
  { id: 'drafter', name: 'Letter Drafting', color: 'bg-emerald-600' },
  { id: 'coder', name: 'Medical Coder', color: 'bg-rose-600' },
  { id: 'reviewer', name: 'Quality Review', color: 'bg-emerald-700' },
] as const;

const TOPOLOGY_AGENT_MAP: Record<string, string[]> = {
  single: ['triage'],
  three_agent: ['triage', 'drafter', 'reviewer'],
  five_agent: ['triage', 'policy', 'evidence', 'drafter', 'reviewer'],
  eight_agent: [
    'advocate',
    'triage',
    'policy',
    'evidence',
    'citation',
    'drafter',
    'coder',
    'reviewer',
  ],
};

// ─── Color helpers ────────────────────────────────────────────────────────

// Gradient red (0%) → orange → amber → emerald (100%)
function getPercentColor(value: number) {
  if (value < 0.5) return 'text-red-600 dark:text-red-400';
  if (value < 0.7) return 'text-orange-600 dark:text-orange-400';
  if (value < 0.85) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

function getPercentBg(value: number) {
  if (value < 0.5)
    return 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800';
  if (value < 0.7)
    return 'bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800';
  if (value < 0.85)
    return 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800';
  return 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800';
}

function getCitationGroundingColor(percent: number) {
  if (percent < 75) return 'text-red-600 dark:text-red-400';
  if (percent < 85) return 'text-orange-600 dark:text-orange-400';
  if (percent < 92) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

function getCitationGroundingBg(percent: number) {
  if (percent < 75)
    return 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800';
  if (percent < 85)
    return 'bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800';
  if (percent < 92)
    return 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800';
  return 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800';
}

function getUnsupportedClaimsColor(level: string) {
  switch (level) {
    case 'high':
      return 'text-red-600 dark:text-red-400';
    case 'medium':
      return 'text-orange-600 dark:text-orange-400';
    case 'low':
      return 'text-amber-600 dark:text-amber-400';
    case 'near-zero':
      return 'text-emerald-600 dark:text-emerald-400';
    default:
      return 'text-muted-foreground';
  }
}

function getUnsupportedClaimsBg(level: string) {
  switch (level) {
    case 'high':
      return 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800';
    case 'medium':
      return 'bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800';
    case 'low':
      return 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800';
    case 'near-zero':
      return 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800';
    default:
      return 'border-border/40';
  }
}

function getVerdictColor(verdict: string) {
  const lower = verdict.toLowerCase();
  if (lower.includes('fail'))
    return {
      text: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800',
    };
  if (lower.includes('weak'))
    return {
      text: 'text-orange-600 dark:text-orange-400',
      bg: 'bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800',
    };
  if (
    lower.includes('strong') ||
    lower.includes('independently') ||
    lower.includes('verifiable')
  )
    return {
      text: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
    };
  return { text: 'text-muted-foreground', bg: 'border-border/40' };
}

function getVerdictIcon(verdict: string) {
  const lower = verdict.toLowerCase();
  if (lower.includes('fail')) return <XCircle className="h-3.5 w-3.5" />;
  if (lower.includes('weak')) return <AlertTriangle className="h-3.5 w-3.5" />;
  if (
    lower.includes('strong') ||
    lower.includes('independently') ||
    lower.includes('verifiable')
  )
    return <CheckCircle2 className="h-3.5 w-3.5" />;
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────

export default function AblationPanel() {
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
        throw new Error(
          errBody.error || `Request failed with status ${res.status}`,
        );
      }
      const data = await res.json();
      if (!data.success) {
        throw new Error(
          data.error || 'Experiment returned unsuccessful response',
        );
      }
      setExperiment(data.experiment as ExperimentData);
      toast.success('Ablation experiment complete', {
        description: data.experiment.gatePassed
          ? 'Gate PASSED'
          : 'Gate FAILED',
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unknown error occurred';
      setError(message);
      toast.error('Experiment failed', { description: message.slice(0, 80) });
    } finally {
      setLoading(false);
    }
  }, []);

  const getImprovementDeltas = useCallback((): string[] => {
    if (!experiment || experiment.topologies.length < 2) return [];
    const single = experiment.topologies.find((t) => t.topology === 'single');
    const full = experiment.topologies.find(
      (t) => t.topology === 'eight_agent',
    );
    if (!single || !full) return [];

    const deltas: string[] = [];
    const cgDelta =
      full.aggregate.citationGrounding - single.aggregate.citationGrounding;
    deltas.push(
      `Citation grounding ${single.aggregate.citationGrounding.toFixed(2)} → ${full.aggregate.citationGrounding.toFixed(2)} (${cgDelta >= 0 ? '+' : ''}${Math.round(cgDelta * 100)}pp)`,
    );

    const top1Delta =
      full.aggregate.top1Accuracy - single.aggregate.top1Accuracy;
    deltas.push(
      `Top-1 accuracy ${single.aggregate.top1Accuracy.toFixed(2)} → ${full.aggregate.top1Accuracy.toFixed(2)} (${top1Delta >= 0 ? '+' : ''}${Math.round(top1Delta * 100)}pp)`,
    );

    const top3Delta =
      full.aggregate.top3Accuracy - single.aggregate.top3Accuracy;
    deltas.push(
      `Top-3 accuracy ${single.aggregate.top3Accuracy.toFixed(2)} → ${full.aggregate.top3Accuracy.toFixed(2)} (${top3Delta >= 0 ? '+' : ''}${Math.round(top3Delta * 100)}pp)`,
    );

    const aqDelta =
      full.aggregate.appealQuality - single.aggregate.appealQuality;
    deltas.push(
      `Appeal quality ${single.aggregate.appealQuality.toFixed(2)} → ${full.aggregate.appealQuality.toFixed(2)} (${aqDelta >= 0 ? '+' : ''}${Math.round(aqDelta * 100)}pp)`,
    );

    const asDelta =
      full.aggregate.argumentSelection - single.aggregate.argumentSelection;
    deltas.push(
      `Argument selection ${single.aggregate.argumentSelection.toFixed(2)} → ${full.aggregate.argumentSelection.toFixed(2)} (${asDelta >= 0 ? '+' : ''}${Math.round(asDelta * 100)}pp)`,
    );

    return deltas;
  }, [experiment]);

  // Heatmap data for visualization.
  const heatmapRows = useMemo(() => {
    if (!experiment) return [];
    return experiment.topologies.map((t) => ({
      label: t.label,
      cells: [
        {
          value: t.aggregate.citationGroundingPercent,
          label: `${t.aggregate.citationGroundingPercent}%`,
        },
        {
          value: t.aggregate.top1Accuracy * 100,
          label: `${Math.round(t.aggregate.top1Accuracy * 100)}%`,
        },
        {
          value: t.aggregate.top3Accuracy * 100,
          label: `${Math.round(t.aggregate.top3Accuracy * 100)}%`,
        },
        {
          value: t.aggregate.appealQuality * 100,
          label: `${Math.round(t.aggregate.appealQuality * 100)}%`,
        },
        {
          value: t.aggregate.argumentSelection * 100,
          label: `${Math.round(t.aggregate.argumentSelection * 100)}%`,
        },
      ],
    }));
  }, [experiment]);

  const heatmapColumns = [
    'Citation Grounding',
    'Top-1',
    'Top-3',
    'Appeal Quality',
    'Arg Selection',
  ];

  return (
    <section className="space-y-6" aria-label="Ablation panel">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <Card className="card-premium relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 gradient-hero opacity-60"
          aria-hidden
        />
        <CardHeader className="relative">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                <FlaskConical className="h-6 w-6 text-primary" />
                Agent Contribution Analysis
              </CardTitle>
              <CardDescription className="text-sm">
                Table 7.1 — measuring each agent&apos;s measurable
                contribution to appeal quality. Not a checklist; a measurement.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {experiment && (
                <Badge
                  className={`gap-1 text-xs px-3 py-1 ${
                    experiment.gatePassed
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/70 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/70 dark:text-red-300 border-red-300 dark:border-red-700'
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
                className="gap-1.5 h-9"
              >
                {loading && mode === 'quick' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5" />
                )}
                Quick
              </Button>
              <Button
                size="sm"
                onClick={() => fetchExperiment(false)}
                disabled={loading}
                className="gap-1.5 h-9"
              >
                {loading && mode === 'full' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FlaskConical className="h-3.5 w-3.5" />
                )}
                Full experiment
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* ── Error state ───────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <Card className="card-premium border-red-200 dark:border-red-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium text-red-700 dark:text-red-400">
                      Experiment failed
                    </p>
                    <p className="text-xs text-red-600/80 dark:text-red-400/80">
                      {error}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => fetchExperiment(mode === 'quick')}
                    className="gap-1.5 h-8"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retry
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loading state ─────────────────────────────────────────── */}
      {loading && (
        <Card className="card-premium">
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">
                {mode === 'quick'
                  ? 'Running quick ablation experiment…'
                  : 'Running full ablation experiment (this may take a while)…'}
              </p>
              <p className="text-xs">Evaluating 4 topologies across held-out cases</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Empty state ──────────────────────────────────────────── */}
      {!loading && !error && !experiment && (
        <Card className="card-premium">
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <BarChart3 className="h-10 w-10 text-primary/50" />
              <p className="text-sm font-medium">No experiment results yet</p>
              <p className="text-xs text-center max-w-md leading-relaxed">
                Run a <strong>Quick</strong> experiment for documented baseline
                numbers, or a <strong>Full</strong> experiment to measure with
                actual agent outputs.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Heatmap ──────────────────────────────────────────────── */}
      {experiment && !loading && heatmapRows.length > 0 && (
        <Card className="card-premium">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <BarChart3 className="h-4 w-4 text-primary" />
              Contribution heatmap
            </CardTitle>
            <CardDescription className="text-xs">
              Color-coded: red (0%) → orange → amber → emerald (100%). Each
              cell is a measurement, not a claim.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto scrollbar-premium">
              <div className="min-w-[640px]">
                {/* Column headers */}
                <div className="grid grid-cols-[140px_repeat(5,1fr)] gap-2 mb-2">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider" />
                  {heatmapColumns.map((col) => (
                    <div
                      key={col}
                      className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-center"
                    >
                      {col}
                    </div>
                  ))}
                </div>
                {/* Heatmap rows */}
                {heatmapRows.map((row) => (
                  <div
                    key={row.label}
                    className="grid grid-cols-[140px_repeat(5,1fr)] gap-2 mb-2"
                  >
                    <div className="text-xs font-medium flex items-center">
                      {row.label}
                    </div>
                    {row.cells.map((cell, idx) => (
                      <div
                        key={idx}
                        className={`rounded-md border h-14 flex items-center justify-center text-sm font-semibold tabular-nums ${getPercentBg(
                          cell.value / 100,
                        )} ${getPercentColor(cell.value / 100)}`}
                      >
                        {cell.label}
                      </div>
                    ))}
                  </div>
                ))}
                {/* Legend */}
                <div className="flex items-center justify-end gap-2 mt-3 text-[10px] text-muted-foreground">
                  <span>0%</span>
                  <div className="h-2 w-32 rounded-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500" />
                  <span>100%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Detailed Table 7.1 ─── */}
      {experiment && !loading && (
        <Card className="card-premium">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <BarChart3 className="h-4 w-4 text-primary" />
              Agent Contribution Results (Table 7.1)
            </CardTitle>
            <CardDescription className="text-xs">
              Each row is a topology. Each cell is a measurement, not a claim.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto scrollbar-premium">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[140px] text-xs">
                      Architecture
                    </TableHead>
                    <TableHead className="text-center text-xs">Agents</TableHead>
                    <TableHead className="text-center text-xs min-w-[110px]">
                      Citation Grounding
                    </TableHead>
                    <TableHead className="text-center text-xs">
                      Unsupported Claims
                    </TableHead>
                    <TableHead className="text-center text-xs">Top-1</TableHead>
                    <TableHead className="text-center text-xs">Top-3</TableHead>
                    <TableHead className="text-center text-xs">
                      Appeal Quality
                    </TableHead>
                    <TableHead className="text-center text-xs">
                      Arg Selection
                    </TableHead>
                    <TableHead className="text-center text-xs min-w-[160px]">
                      Verdict
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {experiment.topologies.map((topo) => {
                    const agg = topo.aggregate;
                    const vColor = getVerdictColor(agg.verdict);
                    const vIcon = getVerdictIcon(agg.verdict);

                    return (
                      <TableRow key={topo.topology}>
                        <TableCell className="font-medium text-sm">
                          {topo.label}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="secondary"
                            className="text-xs tabular-nums"
                          >
                            {topo.agentCount}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${getCitationGroundingColor(agg.citationGroundingPercent)} ${getCitationGroundingBg(agg.citationGroundingPercent)}`}
                          >
                            {agg.citationGroundingPercent}%
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${getUnsupportedClaimsColor(agg.unsupportedClaimsLevel)} ${getUnsupportedClaimsBg(agg.unsupportedClaimsLevel)}`}
                          >
                            {agg.unsupportedClaims.toFixed(1)}
                            <span className="opacity-70">
                              ({agg.unsupportedClaimsLevel})
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`text-xs font-semibold tabular-nums ${getPercentColor(agg.top1Accuracy)}`}
                          >
                            {Math.round(agg.top1Accuracy * 100)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`text-xs font-semibold tabular-nums ${getPercentColor(agg.top3Accuracy)}`}
                          >
                            {Math.round(agg.top3Accuracy * 100)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`text-xs font-semibold tabular-nums ${getPercentColor(agg.appealQuality)}`}
                          >
                            {Math.round(agg.appealQuality * 100)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`text-xs font-semibold tabular-nums ${getPercentColor(agg.argumentSelection)}`}
                          >
                            {Math.round(agg.argumentSelection * 100)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${vColor.text} ${vColor.bg} border`}
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
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Agent composition matrix ────────────────────────────── */}
      {experiment && !loading && (
        <Card className="card-premium">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Shield className="h-4 w-4 text-primary" />
              Agent Composition Per Topology
            </CardTitle>
            <CardDescription className="text-xs">
              Present agents are solid; absent agents are dashed — showing
              what&apos;s removed at each level.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {experiment.topologies.map((topo) => {
                const includedIds =
                  TOPOLOGY_AGENT_MAP[topo.topology] || [];
                const removedCount = ALL_AGENTS.length - includedIds.length;

                return (
                  <motion.div
                    key={topo.topology}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="rounded-lg border border-border/70 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{topo.label}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {topo.agentCount} agent
                          {topo.agentCount !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                      {removedCount > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {removedCount} agent
                          {removedCount !== 1 ? 's' : ''} removed
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

                    {removedCount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Removed: </span>
                        {ALL_AGENTS.filter(
                          (a) => !includedIds.includes(a.id),
                        )
                          .map((a) => a.name)
                          .join(', ')}
                      </p>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Gate details + improvement deltas ───────────────────── */}
      {experiment && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card
            className={`card-premium ${
              experiment.gatePassed
                ? 'border-emerald-200 dark:border-emerald-800'
                : 'border-red-200 dark:border-red-800'
            }`}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
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
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/70 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/70 dark:text-red-300 border-red-300 dark:border-red-700'
                }`}
              >
                {experiment.gatePassed ? 'GATE PASSED' : 'GATE FAILED'}
              </Badge>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {experiment.gateDetails}
              </p>
              <div className="rounded-md border border-border/70 bg-muted/30 p-3">
                <p className="text-xs font-medium italic text-muted-foreground leading-relaxed">
                  &ldquo;Honesty is the gate — if the delta is negative on any
                  metric, that is reported, not hidden.&rdquo;
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="card-premium">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <TrendingUp className="h-4 w-4 text-primary" />
                Improvement: Single → Full
              </CardTitle>
              <CardDescription className="text-xs">
                Measured improvement from 1-agent to 8-agent pipeline.
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

      {/* ── Experiment info ─────────────────────────────────────── */}
      {experiment && !loading && (
        <Card className="card-premium">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <BarChart3 className="h-4 w-4 text-primary" />
              Experiment info
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                  <Hash className="h-3 w-3" />
                  Total cases
                </div>
                <p className="text-lg font-semibold tabular-nums">
                  {experiment.totalCases}
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                  <Clock className="h-3 w-3" />
                  Duration
                </div>
                <p className="text-lg font-semibold tabular-nums">
                  {experiment.durationMs < 1000
                    ? `${experiment.durationMs}ms`
                    : `${(experiment.durationMs / 1000).toFixed(1)}s`}
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                  <FlaskConical className="h-3 w-3" />
                  Mode
                </div>
                <Badge
                  variant="outline"
                  className={
                    mode === 'full'
                      ? 'text-xs border-primary/30 text-primary'
                      : 'text-xs'
                  }
                >
                  {mode === 'quick' ? 'Quick (baseline)' : 'Full (measured)'}
                </Badge>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                  <Clock className="h-3 w-3" />
                  Timestamp
                </div>
                <p className="text-xs font-medium">
                  {new Date(experiment.timestamp).toLocaleString()}
                </p>
              </div>
            </div>

            {experiment.topologies.some((t) => t.caseErrors > 0) && (
              <div className="mt-4 rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 p-3">
                <div className="flex items-center gap-2 text-xs text-orange-700 dark:text-orange-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-medium">Case errors detected:</span>
                  <span>
                    {experiment.topologies
                      .filter((t) => t.caseErrors > 0)
                      .map((t) => `${t.label}: ${t.caseErrors}/${t.caseCount}`)
                      .join('; ')}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Agent role legend ─────────────────────────────────────── */}
      {!loading && (
        <Card className="card-premium">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Agent roles</CardTitle>
            <CardDescription className="text-xs">
              The 8 agents in the full pipeline and their roles.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { agent: ALL_AGENTS[0], icon: Heart, role: 'Empathetic intake & case framing' },
                { agent: ALL_AGENTS[1], icon: Search, role: 'Denial classification & structured JSON' },
                { agent: ALL_AGENTS[2], icon: BookOpen, role: 'Corpus retrieval & clause selection' },
                { agent: ALL_AGENTS[3], icon: Paperclip, role: 'Clinical evidence matching & dedup' },
                { agent: ALL_AGENTS[4], icon: PenTool, role: 'Evidence-backed appeal composition' },
                { agent: ALL_AGENTS[5], icon: Stethoscope, role: 'CPT / ICD validation' },
                { agent: ALL_AGENTS[6], icon: Scale, role: 'Adversarial 7-check battery' },
                { agent: ALL_AGENTS[7], icon: Shield, role: 'Pipeline orchestration' },
              ].map(({ agent, icon: Icon, role }) => (
                <div
                  key={agent.id}
                  className="rounded-lg border border-border/70 p-2.5"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      className={`inline-flex items-center justify-center size-5 rounded ${agent.color} text-white`}
                    >
                      <Icon className="h-3 w-3" />
                    </span>
                    <span className="text-xs font-medium truncate">
                      {agent.name}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    {role}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
