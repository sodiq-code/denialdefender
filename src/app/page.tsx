'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CaseDashboard } from '@/components/case-dashboard';
import { TraceStreamTab } from '@/components/trace-stream-tab';
import { EvidenceCorpusTab } from '@/components/evidence-corpus-tab';
import { VerticalSlicePanel } from '@/components/vertical-slice-panel';
import { ThreeAgentPipelinePanel } from '@/components/three-agent-pipeline-panel';
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

export default function Home() {
  const { connected, error } = useTraceStream();
  const [caseCount, setCaseCount] = useState(0);
  const [agentFleetHealth, setAgentFleetHealth] = useState<AgentFleetHealth | null>(null);
  const [agentFleetLoading, setAgentFleetLoading] = useState(false);
  const [gcpStatus, setGcpStatus] = useState<GcpStatusData | null>(null);

  // Fetch agent fleet health on mount
  useEffect(() => {
    const fetchHealth = async () => {
      setAgentFleetLoading(true);
      try {
        const res = await fetch('/api/workflow');
        if (res.ok) {
          const data = await res.json();
          setAgentFleetHealth(data.health);
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
        <Tabs defaultValue="cases" className="w-full">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="cases" className="gap-1.5">
              <Shield className="h-4 w-4" />
              Cases
            </TabsTrigger>
            <TabsTrigger value="trace" className="gap-1.5">
              <Activity className="h-4 w-4" />
              Trace Stream
            </TabsTrigger>
            <TabsTrigger value="evidence" className="gap-1.5">
              <FileSearch className="h-4 w-4" />
              Evidence
            </TabsTrigger>
            <TabsTrigger value="vertical-slice" className="gap-1.5">
              <Zap className="h-4 w-4" />
              Vertical Slice
            </TabsTrigger>
            <TabsTrigger value="day4-agents" className="gap-1.5">
              <UsersRound className="h-4 w-4" />
              Day 4: Agents 1-3
            </TabsTrigger>
            <TabsTrigger value="architecture" className="gap-1.5">
              <Cpu className="h-4 w-4" />
              Architecture
            </TabsTrigger>
          </TabsList>

          {/* ── Cases Tab ──────────────────────────────────────── */}
          <TabsContent value="cases">
            <CaseDashboard onCaseCountChange={setCaseCount} />
          </TabsContent>

          {/* ── Trace Stream Tab ───────────────────────────────── */}
          <TabsContent value="trace">
            <TraceStreamTab />
          </TabsContent>

          {/* ── Evidence Corpus Tab ──────────────────────────── */}
          <TabsContent value="evidence">
            <EvidenceCorpusTab />
          </TabsContent>

          {/* ── Vertical Slice Tab ───────────────────────────── */}
          <TabsContent value="vertical-slice">
            <VerticalSlicePanel />
          </TabsContent>

          {/* ── Day 4: Agents 1-3 Tab ──────────────────────────── */}
          <TabsContent value="day4-agents">
            <ThreeAgentPipelinePanel />
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
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-teal-500" /> Evidence Agent — retrieval & ranking</li>
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-teal-500" /> Citation Agent — span & verification</li>
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-teal-500" /> Drafter Agent — appeal generation</li>
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-teal-500" /> Quality Agent — review & scoring</li>
                    </ul>
                  </div>

                  {/* Governance Pillar */}
                  <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="h-5 w-5 text-amber-600" />
                      <h4 className="font-semibold text-amber-700 dark:text-amber-300">Governance</h4>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Human-in-the-loop gates ensure every critical decision requires explicit human approval.
                    </p>
                    <ul className="space-y-1.5 text-xs text-muted-foreground">
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
                  {[
                    { label: 'Created', color: 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300' },
                    { label: 'Triage', color: 'bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300' },
                    { label: 'Gate 1', color: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300' },
                    { label: 'Evidence', color: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300' },
                    { label: 'Drafting', color: 'bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300' },
                    { label: 'QA', color: 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300' },
                    { label: 'Gate 2', color: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300' },
                    { label: 'Approved', color: 'bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200' },
                    { label: 'Submitted', color: 'bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200' },
                  ].map((step, idx, arr) => (
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
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
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
