'use client';

import { useState } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Eye,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Fingerprint,
  Activity,
  ChevronDown,
  ChevronUp,
  FileSearch,
  Scale,
  ClipboardCheck,
  Brain,
  Server,
  Sparkles,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────

interface ArmorResult {
  verdict: string;
  riskScore: number;
  threatCount: number;
}

interface PermissionResult {
  agent: string;
  resource: string;
  capability: string;
  allowed: boolean;
}

interface DemoResult {
  modelArmor: {
    cleanResult: ArmorResult;
    adversarialResult: ArmorResult;
  };
  agentIdentity: {
    violations: PermissionResult[];
    allowances: PermissionResult[];
    allPassed: boolean;
  };
  observability: {
    stats: {
      totalCases: number;
      totalTraceEvents: number;
      avgEventsPerCase: number;
      governanceCoverage: Record<string, number>;
      agentDistribution: Record<string, number>;
    };
    gateResult: {
      passed: boolean;
      checks: { check: string; result: boolean; detail: string }[];
    };
  };
}

interface DomainValidationResult {
  ruleId: string;
  ruleName: string;
  category: string;
  passed: boolean;
  severity: string;
  detail: string;
  evidence: string;
  source: string;
}

interface DomainValidationReport {
  id: string;
  validatorType: string;
  timestamp: string;
  results: DomainValidationResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    criticalFailures: number;
    highFailures: number;
    passRate: number;
    categories: Record<string, { total: number; passed: number; failed: number }>;
  };
  overallVerdict: string;
  overallNotes: string;
  concreteChanges?: Array<{
    id: string;
    area: string;
    severity: string;
    implemented: boolean;
    before: string;
    after: string;
    rationale: string;
  }>;
}

// ─── Domain Validation sub-component ──────────────────────────────────────

function DomainValidationTab() {
  const [report, setReport] = useState<DomainValidationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const runValidation = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/domain-validation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'full_validation' }),
      });
      if (!res.ok) {
        toast.error('Domain validation failed');
        return;
      }
      const data = await res.json();
      setReport(data.report);
      toast.success('Domain validation complete', {
        description: data.report?.overallVerdict
          ? `Verdict: ${data.report.overallVerdict}`
          : undefined,
      });
    } catch (err) {
      console.error('Domain validation failed:', err);
      toast.error('Domain validation failed');
    } finally {
      setLoading(false);
    }
  };

  const verdictColor: Record<string, string> = {
    pass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200',
    conditional_pass:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-200',
    fail: 'bg-red-100 text-red-800 dark:bg-red-900/70 dark:text-red-200',
  };

  return (
    <div className="space-y-4">
      <Card className="card-premium">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Automated Domain Rule Validator
          </CardTitle>
          <CardDescription className="text-xs">
            Validates every agent output against 20 authoritative domain rules
            from CMS, AMA, and payer databases.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              onClick={runValidation}
              disabled={loading}
              size="sm"
              className="gap-1.5 h-9"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ClipboardCheck className="h-3 w-3" />
              )}
              Run full validation
            </Button>
            {report && (
              <Badge className={verdictColor[report.overallVerdict] ?? ''}>
                {report.overallVerdict === 'pass'
                  ? 'ALL RULES PASS'
                  : report.overallVerdict === 'conditional_pass'
                    ? 'CONDITIONAL PASS'
                    : 'FAIL'}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {report && (
        <>
          {/* Summary */}
          <Card className="card-premium">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Validation summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                <SummaryStat
                  value={report.summary.passed}
                  label="Passed"
                  color="text-emerald-600"
                />
                <SummaryStat
                  value={report.summary.failed}
                  label="Failed"
                  color="text-red-600"
                />
                <SummaryStat value={report.summary.total} label="Total" />
                <SummaryStat
                  value={`${Math.round(report.summary.passRate * 100)}%`}
                  label="Pass rate"
                />
                <SummaryStat
                  value={report.summary.criticalFailures}
                  label="Critical"
                  color="text-red-600"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                {report.overallNotes}
              </p>
            </CardContent>
          </Card>

          {/* Category breakdown */}
          <Card className="card-premium">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Category breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(report.summary.categories).map(([cat, data]) => (
                  <div
                    key={cat}
                    className="rounded-md border border-border/70 overflow-hidden"
                  >
                    <button
                      className="w-full px-3 py-2 flex items-center justify-between text-xs hover:bg-accent/40"
                      onClick={() =>
                        setExpandedCategory(
                          expandedCategory === cat ? null : cat,
                        )
                      }
                      aria-expanded={expandedCategory === cat}
                    >
                      <span className="font-medium capitalize">
                        {cat.replace(/_/g, ' ')}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-emerald-600">{data.passed}✓</span>
                        {data.failed > 0 && (
                          <span className="text-red-600">{data.failed}✗</span>
                        )}
                        {expandedCategory === cat ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </span>
                    </button>
                    {expandedCategory === cat && (
                      <div className="px-3 pb-2 space-y-1">
                        {report.results
                          .filter((r) => r.category === cat)
                          .map((r) => (
                            <div
                              key={r.ruleId}
                              className="flex items-start gap-2 text-xs py-1 border-t border-border/50"
                            >
                              <span className="mt-0.5 shrink-0">
                                {r.passed ? (
                                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                ) : (
                                  <XCircle className="h-3 w-3 text-red-600" />
                                )}
                              </span>
                              <div className="flex-1">
                                <div className="flex items-center gap-1">
                                  <span className="font-medium">{r.ruleId}</span>
                                  <span className="text-amber-600">
                                    [{r.severity}]
                                  </span>
                                </div>
                                <div className="text-muted-foreground leading-relaxed">
                                  {r.detail}
                                </div>
                                <div className="text-muted-foreground/70 italic mt-0.5">
                                  Source: {r.source}
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {report.concreteChanges && report.concreteChanges.length > 0 && (
            <Card className="card-premium">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Concrete changes (Domain improvements)
                </CardTitle>
                <CardDescription className="text-xs">
                  Improvements identified and implemented — the system was
                  validated against domain rules and these 3 things were
                  changed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {report.concreteChanges.map((change, i) => (
                    <div
                      key={change.id}
                      className="rounded-md border border-border/70 p-3"
                    >
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          Change #{i + 1}
                        </Badge>
                        <span className="text-xs font-medium">{change.area}</span>
                        <Badge
                          className={`text-xs ${
                            change.severity === 'high'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/70 dark:text-red-200'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-200'
                          }`}
                        >
                          {change.severity}
                        </Badge>
                        {change.implemented && (
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        )}
                      </div>
                      <div className="text-xs space-y-1">
                        <div>
                          <span className="text-red-600 font-medium">Before:</span>{' '}
                          {change.before}
                        </div>
                        <div>
                          <span className="text-emerald-600 font-medium">
                            After:
                          </span>{' '}
                          {change.after}
                        </div>
                        <div className="text-muted-foreground italic">
                          Rationale: {change.rationale}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────

export default function GovernancePanel() {
  const [activeTab, setActiveTab] = useState('overview');
  const [demoResult, setDemoResult] = useState<DemoResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [armorAudit, setArmorAudit] = useState<unknown[]>([]);
  const [identityAudit, setIdentityAudit] = useState<unknown[]>([]);
  const [observabilityStats, setObservabilityStats] = useState<
    | {
        totalCases: number;
        totalTraceEvents: number;
        avgEventsPerCase: number;
        governanceCoverage: Record<string, number>;
        agentDistribution: Record<string, number>;
        recentActivity?: Array<{
          timestamp: string;
          agent: string;
          step: string;
          status: string;
          detail: string;
        }>;
      }
    | null
  >(null);
  const [gateResult, setGateResult] = useState<{
    passed: boolean;
    checks: { check: string; result: boolean; detail: string }[];
  } | null>(null);

  const runDemo = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/governance/demo');
      if (res.ok) {
        const data = await res.json();
        setDemoResult(data);
        toast.success('Governance demo complete', {
          description: data.observability?.gateResult?.passed
            ? 'Gate PASSED'
            : 'Gate FAILED',
        });
      } else {
        toast.error('Governance demo failed');
      }
    } catch (error) {
      console.error('Governance demo failed:', error);
      toast.error('Governance demo failed');
    } finally {
      setLoading(false);
    }
  };

  const loadArmorAudit = async () => {
    try {
      const res = await fetch('/api/governance/armor');
      if (res.ok) {
        const data = await res.json();
        setArmorAudit(data.entries || []);
        toast.success(`Loaded ${data.entries?.length ?? 0} armor audit entries`);
      }
    } catch (err) {
      console.error('[Governance] Armor audit failed:', err);
      toast.error('Failed to load Model Armor audit log');
    }
  };

  const loadIdentityAudit = async () => {
    try {
      const res = await fetch('/api/governance/identity?audit=true');
      if (res.ok) {
        const data = await res.json();
        setIdentityAudit(data.entries || []);
        toast.success(`Loaded ${data.entries?.length ?? 0} identity audit entries`);
      }
    } catch (err) {
      console.error('[Governance] Identity audit failed:', err);
      toast.error('Failed to load Agent Identity audit log');
    }
  };

  const loadObservabilityStats = async () => {
    try {
      const res = await fetch('/api/governance/observability?action=stats');
      if (res.ok) {
        const data = await res.json();
        setObservabilityStats(data);
        toast.success('Observability stats loaded');
      }
    } catch (err) {
      console.error('[Governance] Observability stats failed:', err);
      toast.error('Failed to load observability stats');
    }
  };

  const verifyGate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/governance/verify');
      if (res.ok) {
        const data = await res.json();
        setGateResult(data);
        toast.success(data.passed ? 'Gate PASSED' : 'Gate FAILED');
      }
    } catch (err) {
      console.error('[Governance] Gate verification failed:', err);
      toast.error('Governance gate verification failed');
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <section className="space-y-6" aria-label="Governance panel">
      {/* ── Governance triad header ──────────────────────────────── */}
      <Card className="card-premium relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 gradient-hero opacity-60"
          aria-hidden
        />
        <CardHeader className="relative">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                <Scale className="h-6 w-6 text-primary" />
                Governance Framework Complete
              </CardTitle>
              <CardDescription className="mt-1 text-sm">
                The third pillar of the triad — PHI Guard · Model Armor ·
                Agent Identity · Agent Observability.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {demoResult && (
                <Badge
                  variant={
                    demoResult.observability.gateResult.passed
                      ? 'default'
                      : 'destructive'
                  }
                  className="gap-1"
                >
                  {demoResult.observability.gateResult.passed ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" /> Gate PASS
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3 w-3" /> Gate FAIL
                    </>
                  )}
                </Badge>
              )}
              <Button
                onClick={runDemo}
                disabled={loading}
                size="sm"
                className="gap-1.5 h-9"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Activity className="h-4 w-4" />
                )}
                Run demo
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* ── Governance vertex flow ───────────────────────────────── */}
      <Card className="card-premium">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Governance Framework
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-2 flex-wrap py-3">
            <GovernanceNode
              icon={ShieldAlert}
              label="PHI Guard"
              color="rose"
            />
            <Arrow />
            <GovernanceNode
              icon={ShieldCheck}
              label="Model Armor"
              color="amber"
            />
            <Arrow />
            <GovernanceNode
              icon={Fingerprint}
              label="Agent Identity"
              color="emerald"
            />
            <Arrow />
            <GovernanceNode
              icon={Eye}
              label="Observability"
              color="teal"
            />
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2 leading-relaxed">
            Governance is integrated with evidence and agents to ensure safety
            and accountability throughout the pipeline.
          </p>
        </CardContent>
      </Card>

      {/* ── Tabs ───────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="armor">Model Armor</TabsTrigger>
          <TabsTrigger value="identity">Agent Identity</TabsTrigger>
          <TabsTrigger value="observability">Observability</TabsTrigger>
          <TabsTrigger value="gate">Verification</TabsTrigger>
          <TabsTrigger value="domain">Validation</TabsTrigger>
          <TabsTrigger value="phrase">Phrase Discipline</TabsTrigger>
          <TabsTrigger value="geap">GEAP Platform</TabsTrigger>
        </TabsList>

        {/* ── Overview ────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4">
          {demoResult ? (
            <>
              <Card className="card-premium">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-amber-600" />
                    Model Armor scan results
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <ArmorCard
                      title="Clean Policy Content"
                      result={demoResult.modelArmor.cleanResult}
                      isClean
                    />
                    <ArmorCard
                      title="Adversarial Content"
                      result={demoResult.modelArmor.adversarialResult}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="card-premium">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Fingerprint className="h-4 w-4 text-emerald-600" />
                    Agent Identity permission results
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-3">
                      <h4 className="text-xs font-semibold mb-2 text-red-700 dark:text-red-400 uppercase tracking-wider">
                        Denied (expected)
                      </h4>
                      <ul className="space-y-1.5">
                        {demoResult.agentIdentity.violations.map((v, i) => (
                          <PermissionRow key={i} result={v} />
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
                      <h4 className="text-xs font-semibold mb-2 text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                        Allowed (expected)
                      </h4>
                      <ul className="space-y-1.5">
                        {demoResult.agentIdentity.allowances.map((a, i) => (
                          <PermissionRow key={i} result={a} />
                        ))}
                      </ul>
                    </div>
                  </div>
                  <Badge
                    variant={
                      demoResult.agentIdentity.allPassed ? 'default' : 'destructive'
                    }
                    className="gap-1"
                  >
                    {demoResult.agentIdentity.allPassed ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" /> All permission checks
                        correct
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3" /> Permission check failures
                      </>
                    )}
                  </Badge>
                </CardContent>
              </Card>

              <Card className="card-premium">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Eye className="h-4 w-4 text-teal-500" />
                    Agent Observability summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <SummaryStat
                      value={demoResult.observability.stats.totalCases}
                      label="Total cases"
                    />
                    <SummaryStat
                      value={demoResult.observability.stats.totalTraceEvents}
                      label="Trace events"
                    />
                    <SummaryStat
                      value={demoResult.observability.stats.avgEventsPerCase}
                      label="Avg / case"
                    />
                    <SummaryStat
                      value={Object.values(
                        demoResult.observability.stats.governanceCoverage,
                      ).reduce((a, b) => a + (b as number), 0)}
                      label="Governance events"
                    />
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Scale className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                <p className="text-sm text-muted-foreground mb-2">
                  Click <strong>Run demo</strong> to demonstrate the governance
                  vertex.
                </p>
                <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                  The demo will scan clean / adversarial content (Model Armor),
                  test permission violations (Agent Identity), and verify audit
                  reconstruction (Observability).
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Model Armor ─────────────────────────────────────────── */}
        <TabsContent value="armor" className="space-y-4">
          <Card className="card-premium">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-amber-600" />
                  Model Armor — Prompt Injection &amp; Jailbreak Defense
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadArmorAudit}
                  className="gap-1.5 h-8"
                >
                  <FileSearch className="h-3 w-3" /> Load audit
                </Button>
              </div>
              <CardDescription className="text-xs">
                Second layer inside the agent fleet. Scans retrieved content
                before agent processing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <ThreatCard
                  level="CRITICAL — Block"
                  color="red"
                  items={[
                    'Instruction Override',
                    'New Instruction Injection',
                    'Role Switching Attack',
                  ]}
                />
                <ThreatCard
                  level="HIGH — Block"
                  color="amber"
                  items={[
                    'Data Exfiltration Attempt',
                    'Boundary Crossing',
                    'Tool / Function Poisoning',
                  ]}
                />
                <ThreatCard
                  level="MEDIUM — Sanitize"
                  color="amber"
                  items={[
                    'Indirect Manipulation',
                    'Output Format Manipulation',
                    'Emotional / Social Engineering',
                  ]}
                />
                <ThreatCard
                  level="LOW — Log"
                  color="slate"
                  items={[
                    'Suspicious Escape Sequences',
                    'Repetition Attack',
                  ]}
                />
              </div>

              <div className="flex items-center justify-center gap-2 text-xs py-2 flex-wrap">
                <FlowChip label="Retrieved Content" />
                <Arrow />
                <FlowChip label="Model Armor" highlight />
                <Arrow />
                <FlowChip label="ALLOW" color="emerald" />
                <span className="text-muted-foreground">|</span>
                <FlowChip label="SANITIZE" color="amber" />
                <span className="text-muted-foreground">|</span>
                <FlowChip label="BLOCK" color="red" />
              </div>

              {armorAudit.length > 0 && (
                <div className="space-y-1">
                  <h5 className="text-xs font-medium">
                    Audit log ({armorAudit.length} entries)
                  </h5>
                  <div className="max-h-40 overflow-y-auto scrollbar-premium text-[10px] font-mono bg-muted/50 p-2 rounded">
                    {JSON.stringify(armorAudit, null, 1)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Agent Identity ─────────────────────────────────────── */}
        <TabsContent value="identity" className="space-y-4">
          <Card className="card-premium">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Fingerprint className="h-4 w-4 text-emerald-600" />
                  Agent Identity — Scoped Permissions
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadIdentityAudit}
                  className="gap-1.5 h-8"
                >
                  <FileSearch className="h-3 w-3" /> Load audit
                </Button>
              </div>
              <CardDescription className="text-xs">
                Each agent has scoped permissions. Quality Review cannot
                write appeals. Letter Drafting cannot ingest outcomes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto scrollbar-premium">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Agent</TableHead>
                      <TableHead className="text-xs">Key resources</TableHead>
                      <TableHead className="text-xs">Notable restriction</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <IdentityRow
                      agent="Patient Advocate"
                      color="rose"
                      resources="case (R/W), denial (R)"
                      restriction="No appeal write"
                      restrictionColor="amber"
                    />
                    <IdentityRow
                      agent="Denial Triage"
                      color="teal"
                      resources="denial (R/W), hitl_gate (R/W)"
                    />
                    <IdentityRow
                      agent="Policy Research"
                      color="emerald"
                      resources="policy (R/X), evidence (R/W)"
                    />
                    <IdentityRow
                      agent="Evidence Assembly"
                      color="teal"
                      resources="evidence (R/W), citation (R/W)"
                    />
                    <IdentityRow
                      agent="Letter Drafting"
                      color="emerald"
                      resources="appeal (R/W), evidence (R)"
                      restriction="⛔ Cannot read outcomes"
                      restrictionColor="red"
                    />
                    <IdentityRow
                      agent="Quality Review"
                      color="emerald"
                      resources="citation (R/W), appeal (R only)"
                      restriction="⛔ Cannot write appeals"
                      restrictionColor="red"
                    />
                    <IdentityRow
                      agent="Outcome Learning"
                      color="amber"
                      resources="outcome (R/W), policy (R/W)"
                      restriction="No appeal / evidence write"
                      restrictionColor="amber"
                    />
                    <IdentityRow
                      agent="Deadline Tracker"
                      color="amber"
                      resources="deadline (R/W/X)"
                      restriction="Temporal-only authority"
                      restrictionColor="amber"
                    />
                  </TableBody>
                </Table>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-3">
                  <h5 className="text-[10px] font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider mb-1">
                    Security requirement: Prevention
                  </h5>
                  <ul className="text-[10px] space-y-0.5">
                    <li>
                      • Quality Review → write appeal: <strong>DENIED</strong>{' '}
                      (prevents self-approval)
                    </li>
                    <li>
                      • Letter Drafting → read outcome: <strong>DENIED</strong>{' '}
                      (prevents bias)
                    </li>
                  </ul>
                </div>
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
                  <h5 className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-1">
                    Security requirement: Capability
                  </h5>
                  <ul className="text-[10px] space-y-0.5">
                    <li>
                      • Letter Drafting → write appeal: <strong>ALLOWED</strong>{' '}
                      (its core job)
                    </li>
                    <li>
                      • Quality Review → write citation:{' '}
                      <strong>ALLOWED</strong> (verification)
                    </li>
                  </ul>
                </div>
              </div>

              {identityAudit.length > 0 && (
                <div className="space-y-1">
                  <h5 className="text-xs font-medium">
                    Audit log ({identityAudit.length} entries)
                  </h5>
                  <div className="max-h-40 overflow-y-auto scrollbar-premium text-[10px] font-mono bg-muted/50 p-2 rounded">
                    {JSON.stringify(identityAudit, null, 1)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Observability ──────────────────────────────────────── */}
        <TabsContent value="observability" className="space-y-4">
          <Card className="card-premium">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Eye className="h-4 w-4 text-teal-500" />
                  Agent Observability — Audit Trail
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadObservabilityStats}
                  className="gap-1.5 h-8"
                >
                  <Activity className="h-3 w-3" /> Load stats
                </Button>
              </div>
              <CardDescription className="text-xs">
                Every case is queryable end-to-end through the decision trace
                stream.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {observabilityStats ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <SummaryStat
                      value={observabilityStats.totalCases}
                      label="Cases"
                    />
                    <SummaryStat
                      value={observabilityStats.totalTraceEvents}
                      label="Trace events"
                    />
                    <SummaryStat
                      value={observabilityStats.avgEventsPerCase}
                      label="Avg / case"
                    />
                    <SummaryStat
                      value={Object.values(
                        observabilityStats.governanceCoverage,
                      ).reduce((a, b) => a + b, 0)}
                      label="Governance events"
                    />
                  </div>

                  <div className="space-y-1">
                    <h5 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Agent distribution
                    </h5>
                    {Object.entries(observabilityStats.agentDistribution)
                      .sort(([, a], [, b]) => (b as number) - (a as number))
                      .slice(0, 8)
                      .map(([agent, count]) => (
                        <div
                          key={agent}
                          className="flex items-center gap-2"
                        >
                          <span className="text-[10px] w-28 truncate">
                            {agent}
                          </span>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all"
                              style={{
                                width: `${Math.min(
                                  ((count as number) /
                                    (observabilityStats.totalTraceEvents || 1)) *
                                    100,
                                  100,
                                )}%`,
                              }}
                            />
                          </div>
                          <span className="text-[10px] w-8 text-right tabular-nums">
                            {count as number}
                          </span>
                        </div>
                      ))}
                  </div>

                  {observabilityStats.recentActivity &&
                    observabilityStats.recentActivity.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-medium">Recent activity</h5>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleSection('recent')}
                            className="h-5 p-0"
                            aria-label="Toggle recent activity"
                          >
                            {expandedSection === 'recent' ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                        {expandedSection === 'recent' && (
                          <div className="max-h-48 overflow-y-auto scrollbar-premium space-y-1">
                            {observabilityStats.recentActivity
                              .slice(0, 15)
                              .map((event, i) => (
                                <div
                                  key={i}
                                  className="flex items-start gap-2 text-[10px] p-1 rounded bg-muted/30"
                                >
                                  <Badge
                                    variant="outline"
                                    className="text-[8px] h-4 px-1 shrink-0"
                                  >
                                    {event.agent.slice(0, 10)}
                                  </Badge>
                                  <span className="truncate">
                                    {event.step}: {event.detail.slice(0, 60)}
                                  </span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Click <strong>Load stats</strong> to view observability data.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Gate Verification ──────────────────────────────────── */}
        <TabsContent value="gate" className="space-y-4">
          <Card className="card-premium">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Lock className="h-4 w-4 text-primary" />
                  Gate Verification
                </CardTitle>
                <Button
                  onClick={verifyGate}
                  disabled={loading}
                  size="sm"
                  className="gap-1.5 h-8"
                >
                  {loading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  Verify gate
                </Button>
              </div>
              <CardDescription className="text-xs">
                Gate: an audit query can reconstruct a full case from trace
                events alone.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {gateResult ? (
                <div className="space-y-3">
                  <div
                    className={`p-4 rounded-lg border-2 ${
                      gateResult.passed
                        ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20'
                        : 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {gateResult.passed ? (
                        <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                      ) : (
                        <XCircle className="h-6 w-6 text-red-600" />
                      )}
                      <div>
                        <p className="font-semibold">
                          Gate {gateResult.passed ? 'PASSED' : 'FAILED'}
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {gateResult.passed
                            ? 'An audit query can reconstruct a full case from trace events alone.'
                            : 'Case reconstruction from trace events is incomplete.'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {gateResult.checks.map((check, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-2 rounded-md border border-border/70"
                      >
                        {check.result ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <p className="text-xs font-medium">{check.check}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {check.detail}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Lock className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-50" />
                  <p className="text-sm text-muted-foreground">
                    Click <strong>Verify gate</strong> to check if audit queries
                    can reconstruct cases.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Domain Rules ───────────────────────────────────────── */}
        <TabsContent value="domain">
          <DomainValidationTab />
        </TabsContent>

        {/* ── Phrase Discipline ──────────────────────────────────── */}
        <TabsContent value="phrase" className="space-y-4">
          <PhraseDisciplineCard />
        </TabsContent>

        {/* ── GEAP Platform ──────────────────────────────────────── */}
        <TabsContent value="geap" className="space-y-4">
          <GeapPlatformCard />
        </TabsContent>
      </Tabs>
    </section>
  );
}

// ─── Helper components ─────────────────────────────────────────────────────

function SummaryStat({
  value,
  label,
  color,
}: {
  value: number | string;
  label: string;
  color?: string;
}) {
  return (
    <div className="text-center p-2 rounded bg-muted/40">
      <p className={`text-2xl font-bold tabular-nums ${color ?? ''}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
        {label}
      </p>
    </div>
  );
}

function Arrow() {
  return (
    <span className="text-muted-foreground select-none" aria-hidden>
      →
    </span>
  );
}

function GovernanceNode({
  icon: Icon,
  label,
  color,
}: {
  icon: typeof ShieldAlert;
  label: string;
  color: 'rose' | 'amber' | 'emerald' | 'teal';
}) {
  const palette = {
    rose: {
      border: 'border-rose-200 dark:border-rose-800',
      bg: 'bg-rose-50 dark:bg-rose-950/30',
      icon: 'text-rose-600',
    },
    amber: {
      border: 'border-amber-200 dark:border-amber-800',
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      icon: 'text-amber-600',
    },
    emerald: {
      border: 'border-emerald-200 dark:border-emerald-800',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
      icon: 'text-emerald-600',
    },
    teal: {
      border: 'border-teal-200 dark:border-teal-800',
      bg: 'bg-teal-50 dark:bg-teal-950/30',
      icon: 'text-teal-600',
    },
  }[color];

  return (
    <div
      className={`flex flex-col items-center p-3 rounded-lg border-2 ${palette.border} ${palette.bg} min-w-[100px]`}
    >
      <Icon className={`h-5 w-5 ${palette.icon} mb-1`} />
      <span className="text-xs font-medium">{label}</span>
      <Badge variant="outline" className="text-[10px] mt-1 gap-1">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Active
      </Badge>
    </div>
  );
}

function ArmorCard({
  title,
  result,
  isClean = false,
}: {
  title: string;
  result: ArmorResult;
  isClean?: boolean;
}) {
  const isAllow = result.verdict === 'ALLOW';
  const isBlock = result.verdict === 'BLOCK';
  const expected = isClean ? isAllow : isBlock;

  return (
    <div
      className={`p-3 rounded-lg border-2 ${
        expected
          ? isClean
            ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20'
            : 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20'
          : 'border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium flex items-center gap-1">
          {isClean ? (
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          ) : (
            <AlertTriangle className="h-3 w-3 text-amber-500" />
          )}
          {title}
        </span>
        <Badge
          variant={
            isBlock ? 'destructive' : isAllow ? 'default' : 'secondary'
          }
        >
          {result.verdict}
        </Badge>
      </div>
      <div className="text-xs text-muted-foreground space-y-0.5">
        <p>
          Risk score: <span className="font-mono">{result.riskScore}/100</span>
        </p>
        <p>Threats: <span className="font-mono">{result.threatCount}</span></p>
      </div>
    </div>
  );
}

function PermissionRow({ result }: { result: PermissionResult }) {
  return (
    <li className="flex items-start gap-1.5">
      {result.allowed ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
      )}
      <span className="text-[11px]">
        <strong>{result.agent}</strong> → {result.capability}{' '}
        <span className="text-muted-foreground">{result.resource}</span>
      </span>
    </li>
  );
}

function ThreatCard({
  level,
  color,
  items,
}: {
  level: string;
  color: 'red' | 'amber' | 'slate';
  items: string[];
}) {
  const palette = {
    red: 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400',
    amber:
      'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400',
    slate:
      'bg-slate-50 dark:bg-slate-950/30 text-slate-700 dark:text-slate-400',
  }[color];
  return (
    <div className={`p-2 rounded-md border border-border/70 ${palette}`}>
      <h5 className="text-[10px] font-semibold mb-1 uppercase tracking-wider">
        {level}
      </h5>
      <ul className="text-[10px] space-y-0.5">
        {items.map((i) => (
          <li key={i}>• {i}</li>
        ))}
      </ul>
    </div>
  );
}

function FlowChip({
  label,
  highlight = false,
  color,
}: {
  label: string;
  highlight?: boolean;
  color?: 'emerald' | 'amber' | 'red';
}) {
  const palette = highlight
    ? 'bg-primary/15 text-primary font-medium border-primary/30'
    : color === 'emerald'
      ? 'bg-emerald-100 dark:bg-emerald-900/70 text-emerald-700 dark:text-emerald-300'
      : color === 'amber'
        ? 'bg-amber-100 dark:bg-amber-900/70 text-amber-700 dark:text-amber-300'
        : color === 'red'
          ? 'bg-red-100 dark:bg-red-900/70 text-red-700 dark:text-red-300'
          : 'bg-muted text-muted-foreground';
  return (
    <span className={`px-2 py-1 rounded ${palette} text-[10px]`}>{label}</span>
  );
}

function IdentityRow({
  agent,
  color,
  resources,
  restriction,
  restrictionColor = 'amber',
}: {
  agent: string;
  color: 'rose' | 'teal' | 'emerald' | 'amber';
  resources: string;
  restriction?: string;
  restrictionColor?: 'amber' | 'red';
}) {
  const palette = {
    rose: 'text-rose-600',
    teal: 'text-teal-600',
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
  }[color];
  const restrictionPalette = {
    amber: 'text-amber-600',
    red: 'text-red-600 font-medium',
  }[restrictionColor];

  return (
    <TableRow>
      <TableCell className="py-1 px-2">
        <span className={`text-xs font-medium ${palette}`}>{agent}</span>
      </TableCell>
      <TableCell className="py-1 px-2 text-[10px] font-mono text-muted-foreground">
        {resources}
      </TableCell>
      <TableCell className="py-1 px-2 text-[10px]">
        {restriction ? (
          <span className={restrictionPalette}>{restriction}</span>
        ) : (
          '—'
        )}
      </TableCell>
    </TableRow>
  );
}

// ─── Phrase Discipline tab ────────────────────────────────────────────────

function PhraseDisciplineCard() {
  const [result, setResult] = useState<
    | {
        total: number;
        passed: number;
        violations: Array<{ phrase: string; issue: string; severity: string }>;
        categories: Record<string, number>;
      }
    | null
  >(null);
  const [loading, setLoading] = useState(false);

  const runCheck = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/phrase-discipline');
      if (res.ok) {
        const data = await res.json();
        setResult(data);
        toast.success(
          `Phrase discipline: ${data.passed}/${data.total} phrases clean`,
        );
      } else {
        toast.error('Phrase discipline check failed');
      }
    } catch (err) {
      console.error('[Governance] Phrase discipline failed:', err);
      toast.error('Phrase discipline check failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="card-premium">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Phrase Discipline
          </CardTitle>
          <Button
            onClick={runCheck}
            disabled={loading}
            size="sm"
            className="gap-1.5 h-8"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            Run check
          </Button>
        </div>
        <CardDescription className="text-xs">
          Checks that appeal language avoids hedging, weasel words, and
          unsupported claims (e.g., “always”, “100%”, “proven”).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {result ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <SummaryStat
                value={result.passed}
                label="Passed"
                color="text-emerald-600"
              />
              <SummaryStat
                value={result.total - result.passed}
                label="Violations"
                color="text-red-600"
              />
              <SummaryStat value={result.total} label="Total phrases" />
            </div>
            {result.violations.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-premium">
                {result.violations.map((v, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 p-2 rounded-md border border-border/70 bg-card"
                  >
                    <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <p className="font-medium font-mono">{v.phrase}</p>
                      <p className="text-muted-foreground">{v.issue}</p>
                      <Badge
                        variant="outline"
                        className={`text-[10px] mt-1 ${
                          v.severity === 'high'
                            ? 'border-red-300 text-red-700 dark:border-red-700 dark:text-red-300'
                            : 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {v.severity}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-sm text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                All phrases clean — no violations detected.
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Click <strong>Run check</strong> to scan appeal language for
            discipline violations.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── GEAP Platform tab ────────────────────────────────────────────────────

function GeapPlatformCard() {
  const [stats, setStats] = useState<
    | {
        totalCases: number;
        traceEventsIngested: number;
        modelInvocations: number;
        phiGuardEvents: number;
        armorEvents: number;
        identityEvents: number;
        memoryBankStore: string;
        platformAvailable: boolean;
      }
    | null
  >(null);
  const [loading, setLoading] = useState(false);

  const loadStats = async () => {
    setLoading(true);
    try {
      const [gRes, oRes, pRes] = await Promise.all([
        fetch('/api/governance/observability?action=stats').catch(() => null),
        fetch('/api/outcome-learning').catch(() => null),
        fetch('/api/governance/platform').catch(() => null),
      ]);
      const g = gRes?.ok ? await gRes.json() : null;
      const o = oRes?.ok ? await oRes.json() : null;
      const p = pRes?.ok ? await pRes.json() : null;
      setStats({
        totalCases: g?.totalCases ?? 0,
        traceEventsIngested: g?.totalTraceEvents ?? 0,
        modelInvocations: 0,
        phiGuardEvents:
          (g?.governanceCoverage?.phi_guard as number) ?? 0,
        armorEvents: (g?.governanceCoverage?.model_armor as number) ?? 0,
        identityEvents: (g?.governanceCoverage?.agent_identity as number) ?? 0,
        memoryBankStore:
          o?.status?.memoryBank?.storeUsed?.[0] ??
          o?.status?.memoryBankStore ??
          'sqlite_fallback',
        platformAvailable: p?.platformAvailable ?? false,
      });
      toast.success('GEAP platform stats loaded');
    } catch (err) {
      console.error('[Governance] GEAP platform stats failed:', err);
      toast.error('Failed to load GEAP platform stats');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="card-premium">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            GEAP Platform status
          </CardTitle>
          <Button
            onClick={loadStats}
            disabled={loading}
            size="sm"
            className="gap-1.5 h-8"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Activity className="h-3 w-3" />
            )}
            Load stats
          </Button>
        </div>
        <CardDescription className="text-xs">
          Google Enterprise Agent Platform — component adoption, integration
          verification, and audit reconstruction.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {stats ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryStat
                value={stats.totalCases}
                label="Total cases"
              />
              <SummaryStat
                value={stats.traceEventsIngested}
                label="Trace events"
              />
              <SummaryStat
                value={stats.modelInvocations}
                label="Model invocations"
                color="text-emerald-600"
              />
              <SummaryStat
                value={stats.phiGuardEvents + stats.armorEvents + stats.identityEvents}
                label="Governance events"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                className={
                  stats.modelInvocations === 0
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200 gap-1'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-200 gap-1'
                }
              >
                {stats.modelInvocations === 0 ? (
                  <CheckCircle2 className="h-2.5 w-2.5" />
                ) : (
                  <AlertTriangle className="h-2.5 w-2.5" />
                )}
                {stats.modelInvocations === 0
                  ? '0 model invocations'
                  : `${stats.modelInvocations} model invocations`}
              </Badge>
              <Badge variant="outline" className="text-[10px] gap-1">
                <Sparkles className="h-2.5 w-2.5" />
                Memory: {stats.memoryBankStore}
              </Badge>
              <Badge
                variant="outline"
                className={`text-[10px] gap-1 ${
                  stats.platformAvailable
                    ? 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300'
                    : 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300'
                }`}
              >
                {stats.platformAvailable ? (
                  <CheckCircle2 className="h-2.5 w-2.5" />
                ) : (
                  <AlertTriangle className="h-2.5 w-2.5" />
                )}
                {stats.platformAvailable ? 'GCP connected' : 'Local mode'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The mock pipeline performs <strong>zero model invocations</strong>{' '}
              — every agent runs deterministic logic over the seed corpus. The
              GEAP integration is wired to the real Google services when
              <code className="font-mono mx-1">GCP_PROJECT_ID</code> is set;
              otherwise the platform calls fall back to local implementations.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Click <strong>Load stats</strong> to view the GEAP platform
            adoption metrics.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
