'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useTheme } from 'next-themes';
import { useTraceStream } from '@/hooks/useTraceStream';
import {
  Shield,
  Activity,
  Wifi,
  WifiOff,
  Scale,
  Server,
  ArrowRight,
  Bot,
  FileSearch,
  Search,
  PenTool,
  Stethoscope,
  FileText,
  Target,
  Cloud,
  Database,
  Radio,
  Zap,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Fingerprint,
  Brain,
  LayoutDashboard,
  Gavel,
  Clock,
  Percent,
  FlaskConical,
  Sparkles,
  Moon,
  Sun,
  Github,
  ExternalLink,
  HeartPulse,
} from 'lucide-react';

// ─── Dynamic imports (ssr:false to avoid OOM on heavy components) ────────────
const loadingFallback = (label: string) => (
  <div className="flex items-center justify-center p-12 text-muted-foreground">
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      <span className="text-sm">{label}…</span>
    </div>
  </div>
);

const PlatformStatusCard = dynamic(
  () => import('@/components/platform-status-card'),
  { ssr: false, loading: () => loadingFallback('Loading platform status') },
);
const AgentPipelineProgress = dynamic(
  () => import('@/components/agent-step-indicator').then((m) => ({ default: m.AgentPipelineProgress })),
  { ssr: false, loading: () => loadingFallback('Loading pipeline') },
);
const AppealWorkflowPanel = dynamic(
  () => import('@/components/appeal-workflow-panel').then((m) => ({ default: m.AppealWorkflowPanel })),
  { ssr: false, loading: () => loadingFallback('Loading appeal workflow') },
);
const CaseDashboard = dynamic(
  () => import('@/components/case-dashboard').then((m) => ({ default: m.CaseDashboard })),
  { ssr: false, loading: () => loadingFallback('Loading cases') },
);
const EvidenceCorpusTab = dynamic(
  () => import('@/components/evidence-corpus-tab').then((m) => ({ default: m.EvidenceCorpusTab })),
  { ssr: false, loading: () => loadingFallback('Loading evidence corpus') },
);
const TraceStreamTab = dynamic(
  () => import('@/components/trace-stream-tab').then((m) => ({ default: m.TraceStreamTab })),
  { ssr: false, loading: () => loadingFallback('Loading trace stream') },
);
const GovernancePanel = dynamic(
  () => import('@/components/governance-panel'),
  { ssr: false, loading: () => loadingFallback('Loading governance') },
);
const OutcomeLearningPanel = dynamic(
  () => import('@/components/outcome-learning-panel'),
  { ssr: false, loading: () => loadingFallback('Loading outcome learning') },
);
const AblationPanel = dynamic(
  () => import('@/components/ablation-panel'),
  { ssr: false, loading: () => loadingFallback('Loading ablation experiment') },
);
const SixAgentPipelinePanel = dynamic(
  () => import('@/components/six-agent-pipeline-panel').then((m) => ({ default: m.SixAgentPipelinePanel })),
  { ssr: false, loading: () => loadingFallback('Loading pipeline runner') },
);

// ─── Theme toggle ───────────────────────────────────────────────────────────
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-9 w-9" />;
  const isDark = theme === 'dark';
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 rounded-full"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label="Toggle theme"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

// ─── Live status pill ───────────────────────────────────────────────────────
function StatusPill({ ok, label, icon: Icon }: { ok: boolean; label: string; icon: React.ElementType }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
        ok
          ? 'bg-success/10 text-success border border-success/20'
          : 'bg-muted text-muted-foreground border border-border'
      }`}
    >
      <Icon className={`h-3 w-3 ${ok ? 'pulse-ring rounded-full' : ''}`} />
      {label}
    </span>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [caseCount, setCaseCount] = useState(0);
  const [fleetHealth, setFleetHealth] = useState<{ status: string; mock_mode: boolean; agents?: string[] } | null>(null);
  const [config, setConfig] = useState<{ isCloudRun?: boolean; gcpProjectId?: string } | null>(null);
  const { connected } = useTraceStream();

  // Fetch fleet health + config on mount, poll every 30s
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = await res.json();
          setFleetHealth({
            status: data.status,
            mock_mode: data.mockMode ?? data.mock_mode ?? true,
            agents: data.agents,
          });
        }
      } catch {
        /* swallow */
      }
      try {
        const res = await fetch('/api/config');
        if (res.ok) setConfig(await res.json());
      } catch {
        /* swallow */
      }
    };
    fetchHealth();
    const id = setInterval(fetchHealth, 30000);
    return () => clearInterval(id);
  }, []);

  const liveMode = (fleetHealth && !fleetHealth.mock_mode) || !!config?.isCloudRun;
  const agents = fleetHealth?.agents ?? [
    'triage',
    'coder',
    'policy',
    'evidence',
    'citation',
    'drafter',
    'reviewer',
    'orchestrator',
  ];

  const heroStats = useMemo(
    () => [
      { label: 'Agents', value: '8', icon: Bot, accent: 'text-primary' },
      { label: 'Evidence', value: '31 files', icon: Database, accent: 'text-accent-foreground' },
      { label: 'HITL Gates', value: '2', icon: Gavel, accent: 'text-primary' },
      { label: 'Eval Cases', value: '10', icon: Target, accent: 'text-accent-foreground' },
    ],
    [],
  );

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      {/* Background grid */}
      <div className="pointer-events-none fixed inset-0 bg-grid opacity-40" aria-hidden />

      {/* ─── Sticky top nav ──────────────────────────────────────────── */}
      <header className="glass sticky top-0 z-50 w-full border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="DenialDefender" className="h-8 w-auto" />
            <div className="hidden sm:block">
              <p className="text-sm font-semibold leading-tight">DenialDefender</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Evidence-Grounded Appeal Ops</p>
            </div>
          </div>

          <nav className="hidden items-center gap-2 lg:flex">
            <StatusPill ok={!!fleetHealth} label={liveMode ? 'Live' : 'Mock'} icon={liveMode ? Zap : FlaskConical} />
            <StatusPill ok={connected} label={connected ? 'Trace Live' : 'Trace Idle'} icon={Radio} />
            <StatusPill ok={!!config?.gcpProjectId} label={config?.gcpProjectId ? 'GCP' : 'Local'} icon={Cloud} />
            <StatusPill ok label={`${agents.length} agents`} icon={Bot} />
          </nav>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => window.open('https://github.com/sodiq-code/denialdefender', '_blank', 'noopener')}
            >
              <Github className="mr-1.5 h-4 w-4" /> Source
            </Button>
            <ThemeToggle />
            <Button size="sm" className="hidden sm:inline-flex" onClick={() => setActiveTab('new-appeal')}>
              <Sparkles className="mr-1.5 h-4 w-4" /> New Appeal
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Main content ─────────────────────────────────────────────── */}
      <main className="relative mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="mb-6 overflow-x-auto pb-2 scrollbar-premium">
            <TabsList className="flex h-auto w-max gap-1 rounded-xl border border-border/60 bg-card/50 p-1 backdrop-blur">
              <TabsTrigger value="dashboard" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm">
                <LayoutDashboard className="h-4 w-4" /> Dashboard
              </TabsTrigger>
              <TabsTrigger value="new-appeal" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm">
                <PenTool className="h-4 w-4" /> New Appeal
              </TabsTrigger>
              <TabsTrigger value="cases" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm">
                <FileText className="h-4 w-4" /> Cases
                {caseCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                    {caseCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="evidence" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm">
                <FileSearch className="h-4 w-4" /> Evidence
              </TabsTrigger>
              <TabsTrigger value="trace" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm">
                <Activity className="h-4 w-4" /> Trace
              </TabsTrigger>
              <TabsTrigger value="governance" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm">
                <ShieldAlert className="h-4 w-4" /> Governance
              </TabsTrigger>
              <TabsTrigger value="learning" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm">
                <Brain className="h-4 w-4" /> Learning
              </TabsTrigger>
              <TabsTrigger value="ablation" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm">
                <FlaskConical className="h-4 w-4" /> Ablation
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ── Dashboard tab ───────────────────────────────────────── */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* Premium hero */}
            <section className="card-premium relative overflow-hidden rounded-2xl p-6 sm:p-8 gradient-hero">
              <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-2xl space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                    <Shield className="h-3.5 w-3.5" />
                    8-Agent ADK Fleet · Human-Governed
                  </div>
                  <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                    Turn claim denials into <span className="gradient-text">evidence-backed appeals</span> in 90 seconds.
                  </h1>
                  <p className="text-base text-muted-foreground sm:text-lg">
                    Triage → Ground → Assemble → Draft → Verify → Approve → Track → Learn. PHI-guarded,
                    citation-grounded, two human approval gates. No letter reaches a payer without explicit sign-off.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button onClick={() => setActiveTab('new-appeal')} size="lg" className="rounded-xl">
                      <Sparkles className="mr-2 h-4 w-4" /> Run a new appeal
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    <Button onClick={() => setActiveTab('evidence')} size="lg" variant="outline" className="rounded-xl">
                      <Database className="mr-2 h-4 w-4" /> Browse evidence corpus
                    </Button>
                  </div>
                </div>

                {/* Stat grid */}
                <div className="grid grid-cols-2 gap-3 lg:w-72">
                  {heroStats.map((s) => (
                    <Card key={s.label} className="card-premium rounded-xl p-4">
                      <s.icon className={`mb-2 h-5 w-5 ${s.accent}`} />
                      <p className="text-2xl font-bold tracking-tight">{s.value}</p>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </Card>
                  ))}
                </div>
              </div>
            </section>

            {/* Platform status */}
            <PlatformStatusCard />

            {/* Pipeline indicator */}
            <Card className="card-premium rounded-2xl">
              <CardContent className="p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">The 8-Step Pipeline</h2>
                    <p className="text-sm text-muted-foreground">
                      Each step is a scoped ADK agent with enforced permissions.
                    </p>
                  </div>
                  <Badge variant="outline" className="gap-1.5">
                    <Sparkles className="h-3 w-3 text-primary" /> Triage → Learn
                  </Badge>
                </div>
                <AgentPipelineProgress currentStep={0} />
              </CardContent>
            </Card>

            {/* Six-agent pipeline runner (Day 5 variant) */}
            <SixAgentPipelinePanel />
          </TabsContent>

          {/* ── New Appeal tab ──────────────────────────────────────── */}
          <TabsContent value="new-appeal" className="space-y-6">
            <AppealWorkflowPanel />
          </TabsContent>

          {/* ── Cases tab ───────────────────────────────────────────── */}
          <TabsContent value="cases" className="space-y-6">
            <CaseDashboard onCaseCountChange={setCaseCount} />
          </TabsContent>

          {/* ── Evidence tab ────────────────────────────────────────── */}
          <TabsContent value="evidence" className="space-y-6">
            <EvidenceCorpusTab />
          </TabsContent>

          {/* ── Trace tab ───────────────────────────────────────────── */}
          <TabsContent value="trace" className="space-y-6">
            <TraceStreamTab />
          </TabsContent>

          {/* ── Governance tab ─────────────────────────────────────── */}
          <TabsContent value="governance" className="space-y-6">
            {/* PHI Guard front-gate summary */}
            <Card className="card-premium rounded-2xl border-accent/30">
              <CardContent className="p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent-foreground">
                      <ShieldAlert className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold tracking-tight">PHI Guard — Front Gate</h2>
                      <p className="text-sm text-muted-foreground">
                        10-pattern classifier runs <strong>before</strong> any model call. On BLOCK:{' '}
                        <code className="rounded bg-muted px-1 text-xs">modelInvocations === 0</code> — verified in audit log.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="rounded-lg bg-muted px-3 py-2">
                      <Lock className="mr-1 inline h-3 w-3 text-primary" /> SSN · MRN
                    </span>
                    <span className="rounded-lg bg-muted px-3 py-2">
                      <Fingerprint className="mr-1 inline h-3 w-3 text-primary" /> RBAC 8 agents
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <GovernancePanel />
            <PlatformStatusCard />
          </TabsContent>

          {/* ── Learning tab ───────────────────────────────────────── */}
          <TabsContent value="learning" className="space-y-6">
            <OutcomeLearningPanel />
          </TabsContent>

          {/* ── Ablation tab ───────────────────────────────────────── */}
          <TabsContent value="ablation" className="space-y-6">
            <AblationPanel />
          </TabsContent>
        </Tabs>
      </main>

      {/* ─── Sticky footer ───────────────────────────────────────────── */}
      <footer className="mt-auto border-t border-border/60 bg-card/50 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <img src="/favicon.svg" alt="" className="h-4 w-4" />
              <span className="font-medium text-foreground">DenialDefender</span>
              <span>· Evidence-Grounded Denial Appeal Operations</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill ok={!!fleetHealth} label={liveMode ? 'Gemini Live' : 'Mock Mode'} icon={liveMode ? Zap : FlaskConical} />
              <StatusPill ok={connected} label={connected ? 'Trace Stream' : 'Trace Idle'} icon={Radio} />
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1">
                <Server className="h-3 w-3" /> europe-west1
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1">
                <Cloud className="h-3 w-3" /> {config?.gcpProjectId ?? 'denialdefender'}
              </span>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/80">
            DenialDefender does not make medical treatment decisions or autonomously submit appeals. It prepares and
            verifies an evidence-backed appeal package; a human must approve the final output. No real patient PHI is
            used. Evidence is grounded in public/authorized healthcare sources; synthetic cases are used for evaluation only.
          </p>
        </div>
      </footer>
    </div>
  );
}
