'use client';

import { useState, useEffect, type ElementType } from 'react';
import { motion } from 'framer-motion';
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
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Cloud,
  Server,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Database,
  ShieldCheck,
  Users,
  ArrowRight,
  RefreshCw,
  Shield,
  Radio,
  Sparkles,
  Heart,
  Search,
  BookOpen,
  Paperclip,
  PenTool,
  Scale,
  Send,
  GraduationCap,
  Stethoscope,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────

interface PlatformComponentStatus {
  available: boolean;
  lastBackend: 'platform' | 'local';
  lastError: string | null;
  lastSuccessAt: string | null;
  role?: string;
  gateResult?: string;
}

interface PlatformData {
  success: boolean;
  strategy: string;
  platformAvailable: boolean;
  projectId: string;
  region: string;
  components: {
    registry: PlatformComponentStatus & { role: string; gateResult: string };
    memory: PlatformComponentStatus & { role: string; gateResult: string };
    policies: PlatformComponentStatus & { role: string; gateResult: string };
  };
  skipped: { name: string; reason: string }[];
}

interface HealthData {
  status: string;
  service: string;
  timestamp: string;
  version: string;
}

interface ConfigData {
  traceStreamUrl?: string;
  isCloudRun?: boolean;
  memoryBankStore?: string;
  geminiProvider?: string;
  adkFramework?: string;
  geminiModel?: string;
  agentFleetUrl?: string;
  region?: string;
  projectId?: string;
}

interface RegistryAgent {
  agent_id: string;
  role: string;
  status?: string;
  permissions?: string[];
  description?: string;
}

interface RegistryData {
  agents?: RegistryAgent[];
  registeredAgents?: RegistryAgent[];
  count?: number;
}

const COMPONENT_ICONS = {
  registry: Users,
  memory: Database,
  policies: ShieldCheck,
} as const;

const COMPONENT_LABELS = {
  registry: 'Agent Registry',
  memory: 'Memory Bank',
  policies: 'Model Armor',
} as const;

const FLEET_AGENTS = [
  { id: 'advocate', name: 'Patient Advocate', icon: Heart, color: 'text-rose-500' },
  { id: 'triage', name: 'Denial Triage', icon: Search, color: 'text-teal-500' },
  { id: 'coder', name: 'Medical Coder', icon: Stethoscope, color: 'text-emerald-500' },
  { id: 'policy', name: 'Policy Research', icon: Shield, color: 'text-emerald-600' },
  { id: 'evidence', name: 'Evidence Assembly', icon: BookOpen, color: 'text-teal-600' },
  { id: 'citation', name: 'Citation Agent', icon: Paperclip, color: 'text-amber-500' },
  { id: 'drafter', name: 'Letter Drafting', icon: PenTool, color: 'text-emerald-600' },
  { id: 'reviewer', name: 'Quality Review', icon: Scale, color: 'text-amber-600' },
];

const PIPELINE_BADGES = [
  { key: 'gcp', label: 'GCP', icon: Cloud, description: 'Cloud Run deployment' },
  { key: 'firestore', label: 'Firestore', icon: Database, description: 'Memory bank store' },
  { key: 'pubsub', label: 'Pub/Sub', icon: Radio, description: 'Decision trace broadcast' },
  { key: 'gemini', label: 'Gemini', icon: Sparkles, description: 'ADK agent fleet' },
];

export default function PlatformStatusCard() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [registry, setRegistry] = useState<RegistryData | null>(null);
  const [platform, setPlatform] = useState<PlatformData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    // Health + config + registry + platform in parallel.
    const [healthRes, configRes, registryRes, platformRes] =
      await Promise.all([
        fetch('/api/health').catch(() => null),
        fetch('/api/config').catch(() => null),
        fetch('/api/governance/registry').catch(() => null),
        fetch('/api/governance/platform', { signal: AbortSignal.timeout(5000) }).catch(
          () => null,
        ),
      ]);

    if (healthRes?.ok) {
      const data = await healthRes.json().catch(() => null);
      if (data) setHealth(data);
    }
    if (configRes?.ok) {
      const data = await configRes.json().catch(() => null);
      if (data) setConfig(data);
    }
    if (registryRes?.ok) {
      const data = await registryRes.json().catch(() => null);
      if (data) setRegistry(data);
    }
    if (platformRes?.ok) {
      const data = await platformRes.json().catch(() => null);
      if (data) setPlatform(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    // Fetch on mount — setLoading(true) inside fetchAll is intentional; the
    // cascading render is one frame and we want the loading skeleton visible.
    /* eslint-disable react-hooks/set-state-in-effect */
    fetchAll();
    /* eslint-enable react-hooks/set-state-in-effect */
    const onFocus = () => {
      if (!platform) fetchAll();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const registryAgents: RegistryAgent[] =
    registry?.agents ?? registry?.registeredAgents ?? [];

  return (
    <Card className="card-premium relative overflow-hidden border-primary/20">
      <div
        className="pointer-events-none absolute inset-0 gradient-hero opacity-70"
        aria-hidden
      />
      <CardHeader className="relative pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Cloud className="h-6 w-6 text-primary" />
              Google Agent Platform
            </CardTitle>
            <CardDescription className="mt-1 text-sm">
              Platform-accelerated, demo-first: 3 adopted components (Memory,
              Policies, Registry) with local fallback — every platform call
              degrades gracefully.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAll}
            disabled={loading}
            className="h-8 gap-1.5"
            aria-label="Refresh platform status"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="relative space-y-5">
        {/* ── Pipeline status badges ───────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PIPELINE_BADGES.map((badge) => {
            const Icon = badge.icon;
            // Derive status from config / platform data.
            let status: 'live' | 'local' | 'pending' = 'pending';
            if (badge.key === 'gcp')
              status = platform?.platformAvailable
                ? 'live'
                : (config?.isCloudRun ? 'live' : 'local');
            if (badge.key === 'firestore')
              status = config?.isCloudRun ? 'live' : 'local';
            if (badge.key === 'pubsub')
              status = config?.traceStreamUrl ? 'live' : 'local';
            if (badge.key === 'gemini')
              status = config?.agentFleetUrl || config?.isCloudRun ? 'live' : 'pending';

            const palette = {
              live: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700',
              local:
                'bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-200 border-amber-300 dark:border-amber-700',
              pending:
                'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700',
            }[status];

            return (
              <div
                key={badge.key}
                className={`rounded-lg border p-2.5 ${palette} flex items-center gap-2`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-tight">
                    {badge.label}
                  </p>
                  <p className="text-[10px] opacity-80 leading-tight truncate">
                    {status === 'live'
                      ? 'Connected'
                      : status === 'local'
                        ? 'Local mode'
                        : 'Pending'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── 8-agent fleet health ──────────────────────────────────── */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-primary" />
              Agent fleet health
              <Badge variant="outline" className="text-[10px] ml-1">
                {registryAgents.length || FLEET_AGENTS.length} agents
              </Badge>
            </h4>
            {config?.adkFramework && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Sparkles className="h-2.5 w-2.5" />
                {config.adkFramework}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {(registryAgents.length > 0
              ? registryAgents.slice(0, 8).map((a, idx) => {
                  const fallback = FLEET_AGENTS[idx] ?? FLEET_AGENTS[0];
                  const Icon = fallback.icon;
                  return {
                    id: a.agent_id ?? fallback.id,
                    name: a.role ?? fallback.name,
                    Icon,
                    color: fallback.color,
                    status: a.status ?? 'active',
                  };
                })
              : FLEET_AGENTS
            ).map((agent) => {
              const Icon = (agent.Icon ?? agent.icon) as ElementType;
              return (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.25 }}
                  whileHover={{ y: -2 }}
                  className="flex flex-col items-center text-center p-2 rounded-lg border border-border/70 bg-card/50 hover:border-primary/40 transition-colors"
                >
                  <div className="relative">
                    <Icon className={`h-5 w-5 ${agent.color}`} />
                    <span className="absolute -top-1 -right-1 size-2 rounded-full bg-emerald-500 ring-2 ring-card" />
                  </div>
                  <p className="text-[10px] font-medium mt-1 leading-tight">
                    {agent.name}
                  </p>
                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400">
                    Active
                  </span>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* ── GEAP component table ─────────────────────────────────── */}
        <section className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            GEAP component status
          </h4>
          <div className="rounded-lg border border-border/70 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Component</TableHead>
                  <TableHead className="text-xs">Role</TableHead>
                  <TableHead className="text-xs text-right">Backend</TableHead>
                  <TableHead className="text-xs text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(['registry', 'memory', 'policies'] as const).map((key) => {
                  const comp = platform?.components?.[key];
                  const Icon = COMPONENT_ICONS[key];
                  const isPlatform = comp?.lastBackend === 'platform';
                  const isAvailable = comp?.available;
                  const isPlaceholder = !platform;
                  return (
                    <TableRow key={key}>
                      <TableCell className="text-sm font-medium">
                        <span className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          {COMPONENT_LABELS[key]}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {isPlaceholder ? (
                          <Skeleton className="h-3 w-24" />
                        ) : (
                          comp?.role ?? '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isPlaceholder ? (
                          <Skeleton className="h-4 w-16 ml-auto" />
                        ) : (
                          <Badge
                            className={
                              isPlatform
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200 gap-1 text-[10px]'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-200 gap-1 text-[10px]'
                            }
                          >
                            {isPlatform ? (
                              <Cloud className="h-2.5 w-2.5" />
                            ) : (
                              <Server className="h-2.5 w-2.5" />
                            )}
                            {isPlatform ? 'Platform' : (config?.isCloudRun ? 'Live' : 'Local fallback')}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isPlaceholder ? (
                          <Skeleton className="h-4 w-10 ml-auto" />
                        ) : isAvailable === false ? (
                          <XCircle className="h-4 w-4 text-red-500 ml-auto" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-auto" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* ── Platform availability banner ─────────────────────────── */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 flex-wrap">
          {platform?.platformAvailable ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium">
                Connected to GCP project{' '}
                <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">
                  {platform.projectId}
                </code>{' '}
                in{' '}
                <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">
                  {platform.region}
                </code>
              </span>
            </>
          ) : (
            <>
              <Server className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Local mode — set <code className="font-mono text-xs">GCP_PROJECT_ID</code>{' '}
                to enable platform integration.
              </span>
            </>
          )}
        </div>

        {/* ── Collapsible details ───────────────────────────────────── */}
        {platform?.components && (
          <details className="group">
            <summary className="text-xs font-medium text-muted-foreground cursor-pointer flex items-center gap-1 list-none">
              <ArrowRight className="h-3 w-3 transition-transform group-open:rotate-90" />
              Component gate results
            </summary>
            <div className="mt-2 space-y-2 pl-4">
              {(['registry', 'memory', 'policies'] as const).map((key) => {
                const comp = platform.components[key];
                return (
                  <div
                    key={key}
                    className="text-xs text-muted-foreground leading-relaxed"
                  >
                    <span className="font-medium text-foreground">
                      {COMPONENT_LABELS[key]}:
                    </span>{' '}
                    {comp.gateResult}
                  </div>
                );
              })}
            </div>
          </details>
        )}

        {/* ── Strategy summary ─────────────────────────────────────── */}
        <div className="text-xs text-muted-foreground border-t pt-3 leading-relaxed">
          <strong className="text-foreground">Strategy:</strong>{' '}
          {platform?.strategy ?? 'Platform-Accelerated, Demo-First'} — Adopt
          Agent Platform for exactly 3 components that pass the quality gate.
          Skip all others. Every platform call falls back to the existing
          local implementation — zero execution risk.
        </div>
      </CardContent>
    </Card>
  );
}
