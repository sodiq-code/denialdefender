'use client';

/**
 * DenialDefender — Day 13: Demo Lock, Dry Runs, Domain Validation Panel
 *
 * Per Section 29 of the Ultimate Blueprint:
 *   "Day 13 is the day the submission stops growing and starts proving.
 *    The demo is frozen; no new features are added. The team runs the
 *    full two-act demo live, on the demo laptop, over the expected
 *    network, ten times. Each run is timed and any failure is logged."
 *
 * Key deliverables:
 *   1. 10/10 reliable demo runs (Demo Lock Gate)
 *   2. Domain Validation panel (specialist review + 3 concrete changes)
 *   3. Demo freeze — no new features
 *
 * Gate: 10x test passes; if not, cut lowest-tier item and retest
 */

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Lock,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  RotateCcw,
  Timer,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Activity,
  ClipboardCheck,
  FileText,
  UserCheck,
  Stethoscope,
  Scale,
  BookOpen,
  Clock,
  Award,
  Zap,
  ArrowRight,
  CircleDot,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────

interface DomainArea {
  id: string;
  name: string;
  description: string;
  status: 'validated' | 'changed' | 'pending_review';
  details: string;
  changeDescription?: string;
}

interface ConcreteChange {
  id: string;
  area: string;
  before: string;
  after: string;
  rationale: string;
  severity: 'high' | 'medium' | 'low';
  implemented: boolean;
}

interface SpecialistReview {
  reviewerName: string;
  reviewerCredentials: string;
  reviewerExperience: string;
  reviewDate: string;
  organization: string;
}

interface AppealReview {
  caseId: string;
  denialCode: string;
  payerName: string;
  appealQuality: string;
  strengths: string[];
  weaknesses: string[];
  suggestedImprovements: string[];
}

interface DomainValidationData {
  record: {
    id: string;
    specialist: SpecialistReview;
    areas: DomainArea[];
    concreteChanges: ConcreteChange[];
    appealReviews: AppealReview[];
    overallVerdict: string;
    overallNotes: string;
  };
  validations: {
    taxonomy: { valid: boolean; codeCount: number; categories: string[]; issues: string[] };
    evidence: { valid: boolean; provenanceTiers: string[]; features: string[]; issues: string[] };
    appeal: { valid: boolean; sections: string[]; timelyFilingAdded: boolean; issues: string[] };
    deadline: { valid: boolean; deadlines: Record<string, number>; issues: string[] };
    hitl: { valid: boolean; gates: { id: number; name: string; autoApproveCondition: string }[]; issues: string[] };
  };
  allPassed: boolean;
}

interface DemoStep {
  id: string;
  name: string;
  act: 1 | 2;
  description: string;
  estimatedDurationMs: number;
}

interface DemoRunResult {
  runId: string;
  runNumber: number;
  success: boolean;
  totalDurationMs: number;
  steps: { stepId: string; stepName: string; success: boolean; durationMs: number; error?: string }[];
  act1DurationMs: number;
  act2DurationMs: number;
  act1Success: boolean;
  act2Success: boolean;
  error?: string;
  timestamp: string;
}

interface DryRunSession {
  id: string;
  targetRuns: number;
  completedRuns: number;
  passedRuns: number;
  failedRuns: number;
  runs: DemoRunResult[];
  averageDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  passRate: number;
  gatePassed: boolean;
  demoLocked: boolean;
  lowestTierCut: string | null;
  startedAt: string;
  completedAt?: string;
}

// ─── Component ────────────────────────────────────────────────────────────

export function Day13DemoLockPanel() {
  const [domainValidation, setDomainValidation] = useState<DomainValidationData | null>(null);
  const [domainLoading, setDomainLoading] = useState(false);

  const [dryRunSession, setDryRunSession] = useState<DryRunSession | null>(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [dryRunProgress, setDryRunProgress] = useState(0);

  const [quickTestResult, setQuickTestResult] = useState<DemoRunResult | null>(null);
  const [quickTestLoading, setQuickTestLoading] = useState(false);

  const [expandedChange, setExpandedChange] = useState<string | null>(null);
  const [expandedArea, setExpandedArea] = useState<string | null>(null);
  const [expandedRun, setExpandedRun] = useState<number | null>(null);

  // ── Fetch Domain Validation ──────────────────────────────────────
  const fetchDomainValidation = useCallback(async () => {
    setDomainLoading(true);
    try {
      const res = await fetch('/api/domain-validation');
      if (res.ok) {
        const data = await res.json();
        setDomainValidation(data);
      }
    } catch (e) {
      console.error('Domain validation fetch error:', e);
    } finally {
      setDomainLoading(false);
    }
  }, []);

  // ── Run Domain Validation (with DB persistence) ──────────────────
  const runDomainValidation = useCallback(async () => {
    setDomainLoading(true);
    try {
      const res = await fetch('/api/domain-validation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'full_validation' }),
      });
      if (res.ok) {
        const data = await res.json();
        // Re-fetch to get the full validation data
        await fetchDomainValidation();
      }
    } catch (e) {
      console.error('Domain validation run error:', e);
    } finally {
      setDomainLoading(false);
    }
  }, [fetchDomainValidation]);

  // ── Run 10x Dry Run ──────────────────────────────────────────────
  const runDryRun = useCallback(async (targetRuns: number = 10) => {
    setDryRunLoading(true);
    setDryRunProgress(0);
    setDryRunSession(null);

    try {
      // Simulate progressive updates while the actual run happens server-side
      const progressInterval = setInterval(() => {
        setDryRunProgress(prev => {
          if (prev >= 95) { clearInterval(progressInterval); return 95; }
          return prev + (100 / targetRuns) * 0.8;
        });
      }, 500);

      const res = await fetch('/api/demo-dry-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetRuns }),
      });

      clearInterval(progressInterval);
      setDryRunProgress(100);

      if (res.ok) {
        const data = await res.json();
        setDryRunSession(data.session);
      }
    } catch (e) {
      console.error('Dry run error:', e);
    } finally {
      setDryRunLoading(false);
    }
  }, []);

  // ── Quick Single Test ────────────────────────────────────────────
  const runQuickTest = useCallback(async () => {
    setQuickTestLoading(true);
    try {
      const res = await fetch('/api/demo-dry-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'quick_test' }),
      });
      if (res.ok) {
        const data = await res.json();
        setQuickTestResult(data.result);
      }
    } catch (e) {
      console.error('Quick test error:', e);
    } finally {
      setQuickTestLoading(false);
    }
  }, []);

  // ── Quality Badge Helper ─────────────────────────────────────────
  const qualityBadge = (quality: string) => {
    const colors: Record<string, string> = {
      excellent: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
      good: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
      needs_improvement: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
      poor: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    };
    return colors[quality] || colors.good;
  };

  const severityBadge = (severity: string) => {
    const colors: Record<string, string> = {
      high: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
      low: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
    };
    return colors[severity] || colors.medium;
  };

  return (
    <div className="space-y-6">
      {/* ── Demo Lock Header ──────────────────────────────────────── */}
      <Card className="border-2 border-emerald-200 dark:border-emerald-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900">
                <Lock className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-lg">Day 13 — Demo Lock & Domain Validation</CardTitle>
                <CardDescription>
                  &ldquo;The submission stops growing and starts proving.&rdquo;
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {dryRunSession?.gatePassed && (
                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 gap-1">
                  <Lock className="h-3 w-3" /> Demo Locked
                </Badge>
              )}
              {domainValidation?.allPassed && (
                <Badge className="bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200 gap-1">
                  <ShieldCheck className="h-3 w-3" /> Domain Validated
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <ClipboardCheck className="h-5 w-5 text-teal-600" />
              <div>
                <p className="text-sm font-medium">10x Dry Runs</p>
                <p className="text-xs text-muted-foreground">
                  {dryRunSession ? `${dryRunSession.passedRuns}/${dryRunSession.targetRuns} passed` : 'Not run yet'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <UserCheck className="h-5 w-5 text-violet-600" />
              <div>
                <p className="text-sm font-medium">Specialist Review</p>
                <p className="text-xs text-muted-foreground">
                  {domainValidation ? 'Dr. Sarah Mitchell, CPC' : 'Pending'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Zap className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-sm font-medium">Concrete Changes</p>
                <p className="text-xs text-muted-foreground">
                  {domainValidation ? `${domainValidation.record.concreteChanges.filter(c => c.implemented).length}/${domainValidation.record.concreteChanges.length} implemented` : '3 pending'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Tabs ──────────────────────────────────────────────────── */}
      <Tabs defaultValue="domain-validation">
        <TabsList>
          <TabsTrigger value="domain-validation" className="gap-1.5">
            <ShieldCheck className="h-4 w-4" />
            Domain Validation
          </TabsTrigger>
          <TabsTrigger value="dry-runs" className="gap-1.5">
            <RotateCcw className="h-4 w-4" />
            10x Dry Runs
          </TabsTrigger>
          <TabsTrigger value="changes" className="gap-1.5">
            <Zap className="h-4 w-4" />
            3 Concrete Changes
          </TabsTrigger>
          <TabsTrigger value="appeal-reviews" className="gap-1.5">
            <FileText className="h-4 w-4" />
            Appeal Reviews
          </TabsTrigger>
        </TabsList>

        {/* ── Domain Validation Tab ──────────────────────────────── */}
        <TabsContent value="domain-validation">
          <div className="space-y-4">
            {/* Specialist Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Stethoscope className="h-4 w-4" />
                    Medical Billing / RCM Specialist Review
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={domainValidation ? fetchDomainValidation : runDomainValidation}
                    disabled={domainLoading}
                  >
                    {domainLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                    {domainValidation ? 'Refresh' : 'Run Validation'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {domainValidation ? (
                  <div className="space-y-4">
                    {/* Specialist Info */}
                    <div className="p-4 rounded-lg bg-muted/50 border">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Reviewer</p>
                          <p className="text-sm font-medium">{domainValidation.record.specialist.reviewerName}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Credentials</p>
                          <p className="text-sm font-medium">{domainValidation.record.specialist.reviewerCredentials}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Experience</p>
                          <p className="text-sm">{domainValidation.record.specialist.reviewerExperience}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Organization</p>
                          <p className="text-sm">{domainValidation.record.specialist.organization}</p>
                        </div>
                      </div>
                    </div>

                    {/* Overall Verdict */}
                    <div className={`p-4 rounded-lg border-2 ${
                      domainValidation.allPassed
                        ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950'
                        : 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950'
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        {domainValidation.allPassed ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-amber-600" />
                        )}
                        <span className="font-semibold">
                          Domain Validation: {domainValidation.allPassed ? 'PASS' : 'CONDITIONAL PASS'}
                        </span>
                      </div>
                      <p className="text-sm">{domainValidation.record.overallNotes}</p>
                    </div>

                    {/* Validated Areas */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <ClipboardCheck className="h-4 w-4" />
                        Areas Reviewed
                      </h4>
                      {domainValidation.record.areas.map((area) => (
                        <div
                          key={area.id}
                          className="p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => setExpandedArea(expandedArea === area.id ? null : area.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {area.status === 'validated' ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              ) : area.status === 'changed' ? (
                                <Zap className="h-4 w-4 text-amber-600" />
                              ) : (
                                <Clock className="h-4 w-4 text-slate-400" />
                              )}
                              <span className="text-sm font-medium">{area.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={`text-[10px] ${
                                area.status === 'validated'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                                  : area.status === 'changed'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                                  : 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200'
                              }`}>
                                {area.status === 'validated' ? 'Validated' : area.status === 'changed' ? 'Changed' : 'Pending'}
                              </Badge>
                              {expandedArea === area.id ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>
                          {expandedArea === area.id && (
                            <div className="mt-3 space-y-2">
                              <p className="text-xs text-muted-foreground">{area.description}</p>
                              <p className="text-sm">{area.details}</p>
                              {area.changeDescription && (
                                <div className="p-2 rounded bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                                  <p className="text-xs font-medium text-amber-800 dark:text-amber-200">Specialist Change:</p>
                                  <p className="text-sm text-amber-700 dark:text-amber-300">{area.changeDescription}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Sub-Validation Results */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Scale className="h-4 w-4" />
                        Automated Validation Checks
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {[
                          { name: 'Denial Taxonomy', result: domainValidation.validations.taxonomy },
                          { name: 'Evidence Workflow', result: domainValidation.validations.evidence },
                          { name: 'Appeal Structure', result: domainValidation.validations.appeal },
                          { name: 'Deadline Handling', result: domainValidation.validations.deadline },
                          { name: 'HITL Boundaries', result: domainValidation.validations.hitl },
                        ].map(({ name, result }) => (
                          <div key={name} className="p-2 rounded border flex items-center justify-between">
                            <span className="text-sm">{name}</span>
                            {result.valid ? (
                              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-[10px]">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Valid
                              </Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 text-[10px]">
                                <XCircle className="h-3 w-3 mr-1" /> Issues
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Stethoscope className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">Click &ldquo;Run Validation&rdquo; to execute the full domain validation</p>
                    <p className="text-xs mt-1">
                      A medical billing / RCM specialist reviews the denial taxonomy,
                      evidence workflow, appeal structure, deadline handling, and HITL boundaries
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── 10x Dry Runs Tab ───────────────────────────────────── */}
        <TabsContent value="dry-runs">
          <div className="space-y-4">
            {/* Dry Run Control Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <RotateCcw className="h-4 w-4" />
                    10x Demo Dry Run
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={runQuickTest}
                      disabled={quickTestLoading || dryRunLoading}
                    >
                      {quickTestLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      Quick Test
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => runDryRun(10)}
                      disabled={dryRunLoading}
                    >
                      {dryRunLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      Run 10x Dry Run
                    </Button>
                  </div>
                </div>
                <CardDescription>
                  Run the full two-act demo ten times. Each run is timed and failures are logged.
                  Gate: 10/10 reliable runs required to lock the demo.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Progress Bar */}
                {dryRunLoading && (
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between text-sm">
                      <span>Running dry runs...</span>
                      <span>{Math.round(dryRunProgress)}%</span>
                    </div>
                    <Progress value={dryRunProgress} className="h-2" />
                  </div>
                )}

                {/* Session Results */}
                {dryRunSession && (
                  <div className="space-y-4">
                    {/* Gate Status */}
                    <div className={`p-4 rounded-lg border-2 ${
                      dryRunSession.gatePassed
                        ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950'
                        : 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950'
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        {dryRunSession.gatePassed ? (
                          <>
                            <Lock className="h-5 w-5 text-emerald-600" />
                            <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                              GATE PASSED — Demo Locked 🔒
                            </span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="h-5 w-5 text-red-600" />
                            <span className="font-semibold text-red-700 dark:text-red-300">
                              GATE FAILED — {dryRunSession.failedRuns} run(s) failed
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-sm">
                        {dryRunSession.gatePassed
                          ? '10/10 reliable runs completed. The demo is frozen — no new features added.'
                          : dryRunSession.lowestTierCut || 'Cut lowest-tier item and retest.'}
                      </p>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="p-3 rounded-lg bg-muted/50 text-center">
                        <p className="text-2xl font-bold">{dryRunSession.passedRuns}/{dryRunSession.targetRuns}</p>
                        <p className="text-xs text-muted-foreground">Passed</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50 text-center">
                        <p className="text-2xl font-bold">{Math.round(dryRunSession.passRate * 100)}%</p>
                        <p className="text-xs text-muted-foreground">Pass Rate</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50 text-center">
                        <p className="text-2xl font-bold">{(dryRunSession.averageDurationMs / 1000).toFixed(1)}s</p>
                        <p className="text-xs text-muted-foreground">Avg Time</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50 text-center">
                        <p className="text-2xl font-bold">{(dryRunSession.minDurationMs / 1000).toFixed(1)}s</p>
                        <p className="text-xs text-muted-foreground">Min Time</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50 text-center">
                        <p className="text-2xl font-bold">{(dryRunSession.maxDurationMs / 1000).toFixed(1)}s</p>
                        <p className="text-xs text-muted-foreground">Max Time</p>
                      </div>
                    </div>

                    {/* Individual Run Results */}
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Timer className="h-4 w-4" />
                        Individual Run Results
                      </h4>
                      <div className="max-h-80 overflow-y-auto space-y-1">
                        {dryRunSession.runs.map((run) => (
                          <div key={run.runNumber}>
                            <div
                              className="p-2 rounded border flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => setExpandedRun(expandedRun === run.runNumber ? null : run.runNumber)}
                            >
                              <div className="flex items-center gap-2">
                                <CircleDot className={`h-3 w-3 ${run.success ? 'text-emerald-600' : 'text-red-600'}`} />
                                <span className="text-sm font-medium">Run #{run.runNumber}</span>
                                <Badge variant="outline" className="text-[10px]">
                                  {run.success ? 'PASS' : 'FAIL'}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-muted-foreground">
                                  Act 1: {(run.act1DurationMs / 1000).toFixed(1)}s
                                  {run.act1Success ? ' ✓' : ' ✗'}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  Act 2: {(run.act2DurationMs / 1000).toFixed(1)}s
                                  {run.act2Success ? ' ✓' : ' ✗'}
                                </span>
                                <span className="text-xs font-medium">
                                  {(run.totalDurationMs / 1000).toFixed(1)}s
                                </span>
                                {expandedRun === run.runNumber ? (
                                  <ChevronUp className="h-3 w-3 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                )}
                              </div>
                            </div>
                            {expandedRun === run.runNumber && (
                              <div className="ml-6 mt-1 space-y-1">
                                {run.steps.map((step) => (
                                  <div key={step.stepId} className="flex items-center gap-2 text-xs p-1">
                                    {step.success ? (
                                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                    ) : (
                                      <XCircle className="h-3 w-3 text-red-600" />
                                    )}
                                    <span className="flex-1">{step.stepName}</span>
                                    <span className="text-muted-foreground">{(step.durationMs / 1000).toFixed(2)}s</span>
                                    {step.error && (
                                      <span className="text-red-600 truncate max-w-48">{step.error}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Quick Test Result */}
                {quickTestResult && !dryRunSession && (
                  <div className="space-y-3">
                    <div className={`p-3 rounded-lg border ${
                      quickTestResult.success
                        ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950'
                        : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
                    }`}>
                      <div className="flex items-center gap-2">
                        {quickTestResult.success ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span className="text-sm font-medium">
                          Quick Test: {quickTestResult.success ? 'PASSED' : 'FAILED'}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          Total: {(quickTestResult.totalDurationMs / 1000).toFixed(1)}s
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {quickTestResult.steps.map((step) => (
                        <div key={step.stepId} className="flex items-center gap-2 text-xs p-1">
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          {step.success ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <XCircle className="h-3 w-3 text-red-600" />
                          )}
                          <span className="flex-1">{step.stepName}</span>
                          <span className="text-muted-foreground">{(step.durationMs / 1000).toFixed(2)}s</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {!dryRunSession && !quickTestResult && !dryRunLoading && (
                  <div className="text-center py-8 text-muted-foreground">
                    <RotateCcw className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">Click &ldquo;Run 10x Dry Run&rdquo; to execute ten full demo runs</p>
                    <p className="text-xs mt-1">
                      Or use &ldquo;Quick Test&rdquo; for a single run
                    </p>
                    <div className="mt-4 p-3 rounded-lg bg-muted/50 text-left max-w-md mx-auto">
                      <p className="text-xs font-medium mb-1">Two-Act Demo Script:</p>
                      <p className="text-xs text-muted-foreground">
                        <strong>Act 1:</strong> Denial Intake → Triage → PHI Guard → Policy Research → Evidence Assembly
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <strong>Act 2:</strong> HITL Gate 1 → Letter Drafting → Citation Verify → Quality Review → HITL Gate 2 → Submit
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── 3 Concrete Changes Tab ─────────────────────────────── */}
        <TabsContent value="changes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Three Concrete Changes by Medical Billing Specialist
              </CardTitle>
              <CardDescription>
                &ldquo;We didn&apos;t invent this workflow — a specialist reviewed it and changed these three things.
                This is domain credibility no competitor can fake in 14 days.&rdquo;
              </CardDescription>
            </CardHeader>
            <CardContent>
              {domainValidation ? (
                <div className="space-y-4">
                  {domainValidation.record.concreteChanges.map((change, idx) => (
                    <div key={change.id} className="border rounded-lg overflow-hidden">
                      <div
                        className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setExpandedChange(expandedChange === change.id ? null : change.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                              change.severity === 'high'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                : change.severity === 'medium'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                                : 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200'
                            }`}>
                              {idx + 1}
                            </div>
                            <div>
                              <p className="text-sm font-medium">Change #{idx + 1}: {change.area}</p>
                              <p className="text-xs text-muted-foreground">
                                {change.severity === 'high' ? 'Critical — patient safety / compliance impact' : 'Important — operational efficiency'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={severityBadge(change.severity)}>{change.severity}</Badge>
                            {change.implemented ? (
                              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Implemented
                              </Badge>
                            ) : (
                              <Badge className="bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200">
                                Pending
                              </Badge>
                            )}
                            {expandedChange === change.id ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </div>
                      {expandedChange === change.id && (
                        <div className="px-4 pb-4 space-y-3 border-t pt-3">
                          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                            <p className="text-xs font-medium text-red-800 dark:text-red-200 mb-1">Before (Specialist Found):</p>
                            <p className="text-sm text-red-700 dark:text-red-300">{change.before}</p>
                          </div>
                          <div className="flex justify-center">
                            <ArrowRight className="h-5 w-5 text-emerald-600" />
                          </div>
                          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800">
                            <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200 mb-1">After (Specialist Recommended):</p>
                            <p className="text-sm text-emerald-700 dark:text-emerald-300">{change.after}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-muted/50">
                            <p className="text-xs font-medium mb-1">Rationale:</p>
                            <p className="text-sm">{change.rationale}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Zap className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Run Domain Validation first to see the three concrete changes</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Appeal Reviews Tab ──────────────────────────────────── */}
        <TabsContent value="appeal-reviews">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Specialist Review of Generated Appeals
              </CardTitle>
              <CardDescription>
                The medical billing specialist reviewed 2-3 generated appeals
                as part of the domain validation process.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {domainValidation ? (
                <div className="space-y-4">
                  {domainValidation.record.appealReviews.map((review) => (
                    <div key={review.caseId} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{review.denialCode}</Badge>
                          <span className="text-sm font-medium">{review.payerName}</span>
                        </div>
                        <Badge className={qualityBadge(review.appealQuality)}>
                          {review.appealQuality.replace('_', ' ')}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Strengths
                          </p>
                          <ul className="text-xs space-y-1">
                            {review.strengths.map((s, i) => (
                              <li key={i} className="flex items-start gap-1">
                                <span className="text-emerald-500 mt-0.5">+</span>
                                {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-300 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Weaknesses
                          </p>
                          <ul className="text-xs space-y-1">
                            {review.weaknesses.map((w, i) => (
                              <li key={i} className="flex items-start gap-1">
                                <span className="text-amber-500 mt-0.5">!</span>
                                {w}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-sky-700 dark:text-sky-300 flex items-center gap-1">
                            <ArrowRight className="h-3 w-3" /> Suggested Improvements
                          </p>
                          <ul className="text-xs space-y-1">
                            {review.suggestedImprovements.map((s, i) => (
                              <li key={i} className="flex items-start gap-1">
                                <span className="text-sky-500 mt-0.5">→</span>
                                {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Summary */}
                  <div className="p-3 rounded-lg bg-muted/50 border">
                    <div className="flex items-center gap-2 mb-1">
                      <Award className="h-4 w-4 text-violet-600" />
                      <span className="text-sm font-medium">Domain Credibility Statement</span>
                    </div>
                    <p className="text-sm italic">
                      &ldquo;We didn&apos;t invent this workflow — a specialist reviewed it and changed
                      {domainValidation.record.concreteChanges.length} things. This is domain credibility
                      no competitor can fake in 14 days.&rdquo;
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Run Domain Validation first to see appeal reviews</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
