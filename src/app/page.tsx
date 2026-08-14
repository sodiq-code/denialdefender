'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { CaseDashboard } from '@/components/case-dashboard';
import { TraceStreamTab } from '@/components/trace-stream-tab';
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
} from 'lucide-react';

export default function Home() {
  const { connected, error } = useTraceStream();
  const [caseCount, setCaseCount] = useState(0);

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
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Provenance Cards</p>
                      <p className="text-xs text-muted-foreground">Per-claim evidence display</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">Coming Soon</Badge>
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
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
