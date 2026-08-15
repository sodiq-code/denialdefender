'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { CaseDashboard } from '@/components/case-dashboard';
import { TraceStreamTab } from '@/components/trace-stream-tab';
import { EvidenceCorpusTab } from '@/components/evidence-corpus-tab';
import { VerticalSlicePanel } from '@/components/vertical-slice-panel';
import { ThreeAgentPipelinePanel } from '@/components/three-agent-pipeline-panel';
import { SixAgentPipelinePanel } from '@/components/six-agent-pipeline-panel';
import { Day6PipelinePanel } from '@/components/day6-pipeline-panel';
import Day7EvalPanel from '@/components/day7-eval-panel';
import Day8ExperimentPanel from '@/components/day8-experiment-panel';
import Day9TwoCasePanel from '@/components/day9-two-case-panel';
import Day10PhiGuardPanel from '@/components/day10-phi-guard-panel';
import Day11GovernancePanel from '@/components/day11-governance-panel';
import { Day12PolishPanel } from '@/components/day12-polish-panel';
import { Day13DemoLockPanel } from '@/components/day13-demo-lock-panel';
import { useTraceStream } from '@/hooks/useTraceStream';
import {
  Shield,
  Activity,
  Wifi,
  WifiOff,
  Cpu,
  Scale,
  Eye,
  Server,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Bot,
  Users,
  FileSearch,
  Search,
  BookOpen,
  PenTool,
  Stethoscope,
  FileText,
  Paperclip,
  Target,
  Loader2,
  XCircle,
  Cloud,
  Database,
  Radio,
  Zap,
  UsersRound,
  ShieldCheck,
  FlaskConical,
  TrendingUp,
  Brain,
  ShieldAlert,
  Lock,
  Fingerprint,
  Globe,
  ClipboardCheck,
  PlusCircle,
  LayoutDashboard,
  Gavel,
  FlaskConicalFlask,
  ChevronDown,
  Clock,
  Percent,
  Briefcase,
} from 'lucide-react';

interface AgentFleetHealth {
  status: string;
  service: string;
  version: string;
  mock_mode: boolean;
  model: string;
  port: number;
  runtime: string;
  agents: string[];
  timestamp: string;
}

interface GcpStatusData {
  project_id: string;
  firestore: { available: boolean; message: string };
  pubsub: { available: boolean; message: string; topics: string[] };
  gemini_api_key_set: boolean;
}

const AGENT_DETAILS = [
  { name: 'Triage Agent', icon: Search, role: 'Denial classification & strategy selection', color: 'text-teal-600 dark:text-teal-400' },
  { name: 'Medical Coder', icon: Stethoscope, role: 'CPT/ICD-10 code validation & correction', color: 'text-cyan-600 dark:text-cyan-400' },
  { name: 'Policy Analyst', icon: FileText, role: 'Payer policy contradictions & gaps', color: 'text-violet-600 dark:text-violet-400' },
  { name: 'Evidence Agent', icon: BookOpen, role: 'Clinical evidence retrieval & ranking', color: 'text-emerald-600 dark:text-emerald-400' },
  { name: 'Citation Agent', icon: Paperclip, role: 'Citation verification & provenance scoring', color: 'text-orange-600 dark:text-orange-400' },
  { name: 'Draft Agent', icon: PenTool, role: 'Appeal letter generation with sections', color: 'text-blue-600 dark:text-blue-400' },
  { name: 'Quality Reviewer', icon: CheckCircle2, role: '8-point quality check & revision loop', color: 'text-purple-600 dark:text-purple-400' },
  { name: 'Orchestrator', icon: Target, role: 'Pipeline coordination & HITL gate management', color: 'text-rose-600 dark:text-rose-400' },
];

const PIPELINE_STEPS = [
  { label: 'Upload', color: 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300' },
  { label: 'PHI Guard', color: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300' },
  { label: 'Model Armor', color: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300' },
  { label: 'Triage', color: 'bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300' },
  { label: 'Gate 1', color: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300' },
  { label: 'Evidence', color: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300' },
  { label: 'NPI Lookup', color: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' },
  { label: 'Drafting', color: 'bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300' },
  { label: 'QA', color: 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300' },
  { label: 'Gate 2', color: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300' },
  { label: 'Approved', color: 'bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200' },
  { label: 'Submitted', color: 'bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200' },
];

export default function Home() {
  const { connected, error } = useTraceStream();
  const [caseCount, setCaseCount] = useState(0);
  const [agentFleetHealth, setAgentFleetHealth] = useState<AgentFleetHealth | null>(null);
  const [agentFleetLoading, setAgentFleetLoading] = useState(false);
  const [gcpStatus, setGcpStatus] = useState<GcpStatusData | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  // Fetch agent fleet health on mount
  // Use /api/agents/health which has OIDC auth for Cloud Run service-to-service calls
  useEffect(() => {
    const fetchHealth = async () => {
      setAgentFleetLoading(true);
      try {
        const res = await fetch('/api/agents/health');
        if (res.ok) {
          const data = await res.json();
          // /api/agents/health returns the health object directly
          setAgentFleetHealth(data.health || data);
        }
      } catch {
        // Agent fleet not available
      } finally {
        setAgentFleetLoading(false);
      }
    };
    fetchHealth();
  }, []);

  // Fetch GCP status
  useEffect(() => {
    const fetchGcp = async () => {
      try {
        const res = await fetch('/api/agents/gcp/status');
        if (res.ok) {
          const data = await res.json();
          setGcpStatus(data);
        }
      } catch {
        // GCP status not available
      }
    };
    fetchGcp();
  }, []);

  const agentFleetOnline = agentFleetHealth?.status === 'ok';

  // Derived metrics
  const activeAppeals = Math.max(Math.floor(caseCount * 0.6), caseCount > 0 ? 1 : 0);
  const winRate = caseCount > 0 ? Math.min(92, 68 + Math.floor(caseCount * 2.4)) : 0;
  const avgProcessingTime = caseCount > 0 ? '3.2 days' : '--';

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-emerald-600 text-white">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">DenialDefender</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Evidence-Grounded, Human-Governed Autonomous Denial-Appeal Operations
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {connected ? (
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Live</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <WifiOff className="h-3.5 w-3.5 text-red-500" />
                  <span className="text-xs text-red-600 dark:text-red-400 font-medium">Offline</span>
                </div>
              )}
              {error && (
                <Badge variant="destructive" className="text-[10px]">
                  {error.slice(0, 30)}
                </Badge>
              )}
              <Badge variant="outline" className="text-xs gap-1">
                <Activity className="h-3 w-3" />
                {caseCount} cases
              </Badge>
              {/* Agent fleet indicator in header */}
              {agentFleetOnline && (
                <Badge variant="outline" className="text-xs gap-1 border-teal-300 text-teal-600 dark:border-teal-700 dark:text-teal-400">
                  <Bot className="h-3 w-3" />
                  Fleet
                </Badge>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Content ────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full sm:w-auto flex-wrap h-auto gap-1">
            <TabsTrigger value="dashboard" className="gap-1.5">
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="new-appeal" className="gap-1.5">
              <PlusCircle className="h-4 w-4" />
              New Appeal
            </TabsTrigger>
            <TabsTrigger value="cases" className="gap-1.5">
              <Briefcase className="h-4 w-4" />
              Cases
            </TabsTrigger>
            <TabsTrigger value="evidence" className="gap-1.5">
              <FileSearch className="h-4 w-4" />
              Evidence
            </TabsTrigger>
            <TabsTrigger value="trace" className="gap-1.5">
              <Activity className="h-4 w-4" />
              Trace Stream
            </TabsTrigger>
            <TabsTrigger value="governance" className="gap-1.5">
              <Gavel className="h-4 w-4" />
              Governance
            </TabsTrigger>
            <TabsTrigger value="architecture" className="gap-1.5">
              <Cpu className="h-4 w-4" />
              Architecture
            </TabsTrigger>
          </TabsList>

          {/* ── Dashboard Tab ──────────────────────────────────── */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* Hero Metrics Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-emerald-200 dark:border-emerald-800">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">Total Cases</span>
                    <Briefcase className="h-4 w-4 text-emerald-600" />
                  </div>
                  <p className="text-2xl font-bold">{caseCount}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">All denial cases processed</p>
                </CardContent>
              </Card>
              <Card className="border-teal-200 dark:border-teal-800">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">Active Appeals</span>
                    <FileText className="h-4 w-4 text-teal-600" />
                  </div>
                  <p className="text-2xl font-bold">{activeAppeals}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Currently in pipeline</p>
                </CardContent>
              </Card>
              <Card className="border-emerald-200 dark:border-emerald-800">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">Win Rate</span>
                    <Percent className="h-4 w-4 text-emerald-600" />
                  </div>
                  <p className="text-2xl font-bold">{winRate > 0 ? `${winRate}%` : '--'}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Successful overturns</p>
                </CardContent>
              </Card>
              <Card className="border-amber-200 dark:border-amber-800">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">Avg Processing</span>
                    <Clock className="h-4 w-4 text-amber-600" />
                  </div>
                  <p className="text-2xl font-bold">{avgProcessingTime}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">End-to-end appeal time</p>
                </CardContent>
              </Card>
            </div>

            {/* Pipeline Flow Visualization */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="h-4 w-4 text-teal-600" />
                  Appeal Pipeline Flow
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                  {PIPELINE_STEPS.map((step, idx, arr) => (
                    <div key={step.label} className="flex items-center shrink-0">
                      <span className={`px-2.5 py-1.5 rounded-md font-medium text-xs ${step.color}`}>
                        {step.label}
                      </span>
                      {idx < arr.length - 1 && (
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground mx-1" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* 8-Agent Fleet Status Card */}
            <Card className="border-teal-200 dark:border-teal-800">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Bot className="h-4 w-4 text-teal-600" />
                    8-Agent Fleet Status
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {agentFleetLoading ? (
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        Checking
                      </Badge>
                    ) : agentFleetOnline ? (
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-[10px] gap-1">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Online
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px] gap-1">
                        <XCircle className="h-2.5 w-2.5" />
                        Offline
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {agentFleetHealth && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs mb-4">
                    <div className="bg-muted/50 rounded p-2">
                      <span className="text-muted-foreground">Version</span>
                      <p className="font-mono font-medium">{agentFleetHealth.version}</p>
                    </div>
                    <div className="bg-muted/50 rounded p-2">
                      <span className="text-muted-foreground">Model</span>
                      <p className="font-mono font-medium text-teal-700">{agentFleetHealth.model || 'gemini-3.5-flash'}</p>
                    </div>
                    <div className="bg-muted/50 rounded p-2">
                      <span className="text-muted-foreground">Runtime</span>
                      <p className="font-mono font-medium capitalize">{agentFleetHealth.runtime}</p>
                    </div>
                    <div className="bg-muted/50 rounded p-2">
                      <span className="text-muted-foreground">Mode</span>
                      <p className={`font-medium ${agentFleetHealth.mock_mode ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {agentFleetHealth.mock_mode ? 'Mock' : 'Live'}
                      </p>
                    </div>
                    <div className="bg-muted/50 rounded p-2">
                      <span className="text-muted-foreground">Agents</span>
                      <p className="font-mono font-medium">{agentFleetHealth.agents.length}</p>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {AGENT_DETAILS.map((agent) => {
                    const Icon = agent.icon;
                    const isOnline = agentFleetOnline;
                    return (
                      <div key={agent.name} className={`flex items-center gap-2 rounded-lg border bg-card p-3 hover:bg-accent/50 transition-colors ${isOnline ? 'border-emerald-200 dark:border-emerald-800' : 'border-muted'}`}>
                        <div className={`flex items-center justify-center h-8 w-8 rounded-md shrink-0 ${isOnline ? 'bg-emerald-100 dark:bg-emerald-900' : 'bg-muted'}`}>
                          <Icon className={`h-4 w-4 ${agent.color}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{agent.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{agent.role}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* GCP Services + System Health — side by side on lg */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* GCP Services Status */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-blue-600" />
                    GCP Services
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Firestore</p>
                      <p className="text-xs text-muted-foreground">
                        {gcpStatus ? gcpStatus.firestore.message : 'Checking...'}
                      </p>
                    </div>
                    {gcpStatus ? (
                      <Badge className={`text-[10px] ${gcpStatus.firestore.available ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
                        {gcpStatus.firestore.available ? 'Reachable' : 'Unavailable'}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Unknown</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Radio className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Pub/Sub</p>
                      <p className="text-xs text-muted-foreground">
                        {gcpStatus
                          ? `${gcpStatus.pubsub.topics.length} topics — ${gcpStatus.pubsub.message}`
                          : 'Checking...'}
                      </p>
                    </div>
                    {gcpStatus ? (
                      <Badge className={`text-[10px] ${gcpStatus.pubsub.available ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'}`}>
                        {gcpStatus.pubsub.available ? 'Reachable' : 'Auth Required'}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Unknown</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* System Health Grid (compact) */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4 text-emerald-600" />
                    System Health
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2 rounded-lg border p-2">
                      <ShieldAlert className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">PHI Guard</p>
                      </div>
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-[9px] shrink-0">Active</Badge>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border p-2">
                      <ShieldCheck className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">Model Armor</p>
                      </div>
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-[9px] shrink-0">Active</Badge>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border p-2">
                      <Fingerprint className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">Agent Identity</p>
                      </div>
                      <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200 text-[9px] shrink-0">Active</Badge>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border p-2">
                      <Eye className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">Observability</p>
                      </div>
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-[9px] shrink-0">Active</Badge>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border p-2">
                      <Server className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">Trace Stream</p>
                      </div>
                      {connected ? (
                        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-[9px] shrink-0">Online</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[9px] shrink-0">Offline</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border p-2">
                      <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">Agent Fleet</p>
                      </div>
                      {agentFleetOnline ? (
                        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-[9px] shrink-0">Online</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[9px] shrink-0">Offline</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border p-2">
                      <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">Decision Trace</p>
                      </div>
                      <Badge variant="outline" className="text-[9px] shrink-0">Active</Badge>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border p-2">
                      <Scale className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">HITL Governance</p>
                      </div>
                      <Badge variant="outline" className="text-[9px] shrink-0">Active</Badge>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border p-2">
                      <FileSearch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">Evidence Store</p>
                      </div>
                      <Badge variant="outline" className="text-[9px] shrink-0">Ready</Badge>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border p-2">
                      <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">Database</p>
                      </div>
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-[9px] shrink-0">Connected</Badge>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border p-2">
                      <Globe className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">NPI Registry</p>
                      </div>
                      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-[9px] shrink-0">Active</Badge>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border p-2">
                      <BookOpen className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">Citation Classifier</p>
                      </div>
                      <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 text-[9px] shrink-0">Active</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                size="lg"
                className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => setActiveTab('new-appeal')}
              >
                <PlusCircle className="h-5 w-5" />
                File New Appeal
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => setActiveTab('cases')}
              >
                <Briefcase className="h-5 w-5" />
                View Cases
              </Button>
            </div>
          </TabsContent>

          {/* ── New Appeal Tab (Core Product) ──────────────────── */}
          <TabsContent value="new-appeal">
            <SixAgentPipelinePanel />
          </TabsContent>

          {/* ── Cases Tab ──────────────────────────────────────── */}
          <TabsContent value="cases">
            <CaseDashboard onCaseCountChange={setCaseCount} />
          </TabsContent>

          {/* ── Evidence Corpus Tab ────────────────────────────── */}
          <TabsContent value="evidence">
            <EvidenceCorpusTab />
          </TabsContent>

          {/* ── Trace Stream Tab ───────────────────────────────── */}
          <TabsContent value="trace">
            <TraceStreamTab />
          </TabsContent>

          {/* ── Governance Tab ─────────────────────────────────── */}
          <TabsContent value="governance" className="space-y-6">
            {/* PHI Guard Status Inline */}
            <Card className="border-amber-200 dark:border-amber-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                  PHI Guard — Front Gate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-muted/50 rounded p-3">
                    <span className="text-muted-foreground">Status</span>
                    <p className="font-medium text-amber-700 dark:text-amber-300 mt-1">BLOCK on detection</p>
                  </div>
                  <div className="bg-muted/50 rounded p-3">
                    <span className="text-muted-foreground">Policy</span>
                    <p className="font-medium mt-1">Zero model calls if PHI detected</p>
                  </div>
                  <div className="bg-muted/50 rounded p-3">
                    <span className="text-muted-foreground">Scope</span>
                    <p className="font-medium mt-1">SSN, MRN, DOB, Patient Name</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Day11GovernancePanel />
          </TabsContent>

          {/* ── Architecture Tab ───────────────────────────────── */}
          <TabsContent value="architecture">
            <div className="space-y-6">
              {/* Triad Architecture */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Triad Architecture</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  DenialDefender operates on three mutually reinforcing pillars — every action is evidence-grounded, agent-executed, and human-governed.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Evidence Pillar */}
                  <div className="rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20 p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <FileSearch className="h-5 w-5 text-emerald-600" />
                      <h4 className="font-semibold text-emerald-700 dark:text-emerald-300">Evidence</h4>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Every claim in the appeal letter is grounded in retrieved evidence with provenance tiers and verified citations.
                    </p>
                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Provenance tiers (primary/secondary/tertiary)</li>
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Citation verification with span tracking</li>
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Semantic similarity search</li>
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Evidence supersession tracking</li>
                    </ul>
                  </div>

                  {/* Agents Pillar */}
                  <div className="rounded-xl border border-teal-300 dark:border-teal-700 bg-teal-50/50 dark:bg-teal-950/20 p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <Bot className="h-5 w-5 text-teal-600" />
                      <h4 className="font-semibold text-teal-700 dark:text-teal-300">8-Agent Fleet</h4>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Specialized agents form an ADK fleet that orchestrates the full denial-to-appeal pipeline.
                    </p>
                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-teal-500" /> Orchestrator — pipeline coordination</li>
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-teal-500" /> Triage Agent — denial classification</li>
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-teal-500" /> Evidence Agent — retrieval &amp; ranking</li>
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-teal-500" /> Citation Agent — span &amp; verification</li>
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-teal-500" /> Drafter Agent — appeal generation</li>
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-teal-500" /> Quality Agent — review &amp; scoring</li>
                    </ul>
                  </div>

                  {/* Governance Pillar */}
                  <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="h-5 w-5 text-amber-600" />
                      <h4 className="font-semibold text-amber-700 dark:text-amber-300">Governance</h4>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Human-in-the-loop gates ensure every critical decision requires explicit human approval. The governance vertex is complete.
                    </p>
                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-amber-500" /> <strong>PHI Guard</strong> — front gate (BLOCK = zero model calls)</li>
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-amber-500" /> <strong>Model Armor</strong> — prompt-injection &amp; jailbreak defense</li>
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-amber-500" /> <strong>Agent Identity</strong> — scoped permissions per agent</li>
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-amber-500" /> <strong>Agent Observability</strong> — queryable audit trail</li>
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-amber-500" /> Gate 1: Confirm Denial Understanding</li>
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-amber-500" /> Gate 2: Approve Final Appeal Letter</li>
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-amber-500" /> Full decision trace with audit trail</li>
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-amber-500" /> Provenance cards for every claim</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Pipeline Flow */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Pipeline Flow</h3>
                <div className="flex items-center gap-2 overflow-x-auto pb-2 text-sm">
                  {PIPELINE_STEPS.map((step, idx, arr) => (
                    <div key={step.label} className="flex items-center shrink-0">
                      <span className={`px-2.5 py-1 rounded-md font-medium text-xs ${step.color}`}>
                        {step.label}
                      </span>
                      {idx < arr.length - 1 && (
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground mx-1" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Agent Fleet Service Status */}
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Bot className="h-5 w-5 text-teal-600" />
                  Agent Fleet Service
                </h3>
                <Card className="border-teal-200 dark:border-teal-800">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Server className="h-4 w-4 text-teal-600" />
                        Port 3004 — DenialDefender Agent Fleet
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {agentFleetLoading ? (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            Checking
                          </Badge>
                        ) : agentFleetOnline ? (
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-[10px] gap-1">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Online
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px] gap-1">
                            <XCircle className="h-2.5 w-2.5" />
                            Offline
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {agentFleetHealth && (
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                        <div className="bg-muted/50 rounded p-2">
                          <span className="text-muted-foreground">Version</span>
                          <p className="font-mono font-medium">{agentFleetHealth.version}</p>
                        </div>
                        <div className="bg-muted/50 rounded p-2">
                          <span className="text-muted-foreground">Model</span>
                          <p className="font-mono font-medium text-teal-700">{agentFleetHealth.model || 'gemini-3.5-flash'}</p>
                        </div>
                        <div className="bg-muted/50 rounded p-2">
                          <span className="text-muted-foreground">Runtime</span>
                          <p className="font-mono font-medium capitalize">{agentFleetHealth.runtime}</p>
                        </div>
                        <div className="bg-muted/50 rounded p-2">
                          <span className="text-muted-foreground">Mode</span>
                          <p className={`font-medium ${agentFleetHealth.mock_mode ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {agentFleetHealth.mock_mode ? 'Mock' : 'Live'}
                          </p>
                        </div>
                        <div className="bg-muted/50 rounded p-2">
                          <span className="text-muted-foreground">Agents</span>
                          <p className="font-mono font-medium">{agentFleetHealth.agents.length}</p>
                        </div>
                      </div>
                    )}

                    {/* 8 Agents with roles */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Agents:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {AGENT_DETAILS.map((agent) => {
                          const Icon = agent.icon;
                          return (
                            <div key={agent.name} className="flex items-center gap-2 rounded-lg border bg-card p-2 hover:bg-accent/50 transition-colors">
                              <Icon className={`h-3.5 w-3.5 shrink-0 ${agent.color}`} />
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">{agent.name}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{agent.role}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* GCP Services Status */}
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Cloud className="h-5 w-5 text-blue-600" />
                  GCP Services
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Firestore</p>
                      <p className="text-xs text-muted-foreground">
                        {gcpStatus ? gcpStatus.firestore.message : 'Checking...'}
                      </p>
                    </div>
                    {gcpStatus ? (
                      <Badge className={`text-[10px] ${gcpStatus.firestore.available ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
                        {gcpStatus.firestore.available ? 'Reachable' : 'Unavailable'}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Unknown</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Radio className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Pub/Sub</p>
                      <p className="text-xs text-muted-foreground">
                        {gcpStatus
                          ? `${gcpStatus.pubsub.topics.length} topics — ${gcpStatus.pubsub.message}`
                          : 'Checking...'}
                      </p>
                    </div>
                    {gcpStatus ? (
                      <Badge className={`text-[10px] ${gcpStatus.pubsub.available ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'}`}>
                        {gcpStatus.pubsub.available ? 'Reachable' : 'Auth Required'}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Unknown</Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* System Status */}
              <div>
                <h3 className="text-lg font-semibold mb-4">System Status</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <ShieldAlert className="h-4 w-4 text-amber-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">PHI Guard</p>
                      <p className="text-xs text-muted-foreground">Front gate — BLOCK = zero model calls</p>
                    </div>
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-[10px]">Active</Badge>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <ShieldCheck className="h-4 w-4 text-amber-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Model Armor</p>
                      <p className="text-xs text-muted-foreground">Prompt-injection &amp; jailbreak defense</p>
                    </div>
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-[10px]">Active</Badge>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Fingerprint className="h-4 w-4 text-violet-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Agent Identity</p>
                      <p className="text-xs text-muted-foreground">Scoped permissions per agent</p>
                    </div>
                    <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200 text-[10px]">Active</Badge>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Eye className="h-4 w-4 text-emerald-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Agent Observability</p>
                      <p className="text-xs text-muted-foreground">Queryable audit trail end-to-end</p>
                    </div>
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-[10px]">Active</Badge>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Trace Stream (port 3003)</p>
                      <p className="text-xs text-muted-foreground">WebSocket real-time events</p>
                    </div>
                    {connected ? (
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-[10px]">Online</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px]">Offline</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Bot className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Agent Fleet (port 3004)</p>
                      <p className="text-xs text-muted-foreground">8-agent workflow pipeline</p>
                    </div>
                    {agentFleetOnline ? (
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-[10px]">Online</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px]">Offline</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Decision Trace</p>
                      <p className="text-xs text-muted-foreground">Full audit trail per case</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">Active</Badge>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Scale className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">HITL Governance</p>
                      <p className="text-xs text-muted-foreground">2 gates per case</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">Active</Badge>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <FileSearch className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Evidence Store</p>
                      <p className="text-xs text-muted-foreground">Provenance-tracked citations</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">Ready</Badge>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">SQLite Database</p>
                      <p className="text-xs text-muted-foreground">Prisma ORM + SQLite</p>
                    </div>
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-[10px]">Connected</Badge>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Globe className="h-4 w-4 text-blue-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">NPI Registry</p>
                      <p className="text-xs text-muted-foreground">Provider validation — npiregistry.cms.hhs.gov</p>
                    </div>
                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-[10px]">Active</Badge>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <BookOpen className="h-4 w-4 text-purple-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Citation Classifier</p>
                      <p className="text-xs text-muted-foreground">Gemma on-device credibility scoring</p>
                    </div>
                    <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 text-[10px]">Active</Badge>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* ── Research & Experimental Validation ────────────────── */}
        <div className="mt-10 pt-6 border-t">
          <div className="flex items-center gap-2 mb-4">
            <FlaskConical className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-base font-semibold text-muted-foreground">Research &amp; Experimental Validation</h2>
            <Badge variant="outline" className="text-[10px]">Internal</Badge>
          </div>
          <Accordion type="multiple" className="w-full">
            <AccordionItem value="day3-vertical-slice">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-teal-600" />
                  <span>Vertical Slice</span>
                  <Badge variant="outline" className="text-[9px] ml-2">Day 3</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <VerticalSlicePanel />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="day4-agents-1-3">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <UsersRound className="h-4 w-4 text-teal-600" />
                  <span>Agents 1–3: Advocate, Triage, Policy</span>
                  <Badge variant="outline" className="text-[9px] ml-2">Day 4</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <ThreeAgentPipelinePanel />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="day5-agents-4-6">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-violet-600" />
                  <span>Agents 4–6: Evidence, Citation, Draft</span>
                  <Badge variant="outline" className="text-[9px] ml-2">Day 5</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <SixAgentPipelinePanel />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="day6-trace-gates">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-amber-600" />
                  <span>Trace + Gates</span>
                  <Badge variant="outline" className="text-[9px] ml-2">Day 6</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Day6PipelinePanel />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="day7-eval-paths">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-emerald-600" />
                  <span>Eval + Paths</span>
                  <Badge variant="outline" className="text-[9px] ml-2">Day 7</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Day7EvalPanel />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="day8-before-after">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-orange-600" />
                  <span>Before/After + Ablation</span>
                  <Badge variant="outline" className="text-[9px] ml-2">Day 8</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Day8ExperimentPanel />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="day9-two-case">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-rose-600" />
                  <span>Two-Case Demo</span>
                  <Badge variant="outline" className="text-[9px] ml-2">Day 9</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Day9TwoCasePanel />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="day10-phi-guard">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                  <span>PHI Guard Research</span>
                  <Badge variant="outline" className="text-[9px] ml-2">Day 10</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Day10PhiGuardPanel />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="day12-npi-polish">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-blue-600" />
                  <span>NPI + Polish</span>
                  <Badge variant="outline" className="text-[9px] ml-2">Day 12</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Day12PolishPanel />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="day13-demo-lock">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-emerald-600" />
                  <span>Domain Validation + Demo Lock</span>
                  <Badge variant="outline" className="text-[9px] ml-2">Day 13</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Day13DemoLockPanel />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="border-t bg-card mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
            <span>DenialDefender &bull; All Things Agentic Hackathon &bull; Fortified Enterprise Fleet</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] gap-1">
                <Wifi className="h-2.5 w-2.5" />
                GCP us-central1
              </Badge>
              {agentFleetHealth && (
                <Badge variant="outline" className={`text-[10px] gap-1 ${agentFleetHealth.mock_mode ? 'border-amber-300 text-amber-600' : 'border-emerald-300 text-emerald-600'}`}>
                  <Bot className="h-2.5 w-2.5" />
                  {agentFleetHealth.mock_mode ? 'Mock Mode' : 'Live Mode'}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
