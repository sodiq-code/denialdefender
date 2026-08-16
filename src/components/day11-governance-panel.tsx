'use client';

/**
 * DenialDefender — Day 11: Governance Panel
 *
 * Visualizes the complete governance vertex of the triad:
 *   PHI Guard → Model Armor → Agent Identity → Agent Observability
 *
 * Demo moment:
 *   1. Model Armor: clean → ALLOW, adversarial → BLOCK
 *   2. Agent Identity: violations → DENY, allowances → ALLOW
 *   3. Agent Observability: case reconstruction from trace events
 *   4. Gate: audit query reconstructs full case
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

// ─── Component ────────────────────────────────────────────────────────────

export default function Day11GovernancePanel() {
  const [activeTab, setActiveTab] = useState('overview');
  const [demoResult, setDemoResult] = useState<DemoResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [armorAudit, setArmorAudit] = useState<unknown[]>([]);
  const [identityAudit, setIdentityAudit] = useState<unknown[]>([]);
  const [observabilityStats, setObservabilityStats] = useState<unknown>(null);
  const [gateResult, setGateResult] = useState<{ passed: boolean; checks: { check: string; result: boolean; detail: string }[] } | null>(null);

  // Run full governance demo
  const runDemo = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/governance/demo');
      if (res.ok) {
        const data = await res.json();
        setDemoResult(data);
      }
    } catch (error) {
      console.error('Governance demo failed:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load audit logs
  const loadArmorAudit = async () => {
    try {
      const res = await fetch('/api/governance/armor');
      if (res.ok) {
        const data = await res.json();
        setArmorAudit(data.entries || []);
      }
    } catch { /* ignore */ }
  };

  const loadIdentityAudit = async () => {
    try {
      const res = await fetch('/api/governance/identity?audit=true');
      if (res.ok) {
        const data = await res.json();
        setIdentityAudit(data.entries || []);
      }
    } catch { /* ignore */ }
  };

  const loadObservabilityStats = async () => {
    try {
      const res = await fetch('/api/governance/observability?action=stats');
      if (res.ok) {
        const data = await res.json();
        setObservabilityStats(data);
      }
    } catch { /* ignore */ }
  };

  // Verify governance gate
  const verifyGate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/governance/verify');
      if (res.ok) {
        const data = await res.json();
        setGateResult(data);
      }
    } catch { /* ignore */ }
    finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div className="space-y-6">
      {/* ── Governance Triad Header ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-emerald-600" />
                Day 11: Governance Vertex Complete
              </CardTitle>
              <CardDescription className="mt-1">
                The third pillar of the triad — PHI Guard · Model Armor · Agent Identity · Agent Observability
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {demoResult && (
                <Badge variant={demoResult.observability.gateResult.passed ? 'default' : 'destructive'} className="gap-1">
                  {demoResult.observability.gateResult.passed ? (
                    <><CheckCircle2 className="h-3 w-3" /> Gate PASS</>
                  ) : (
                    <><XCircle className="h-3 w-3" /> Gate FAIL</>
                  )}
                </Badge>
              )}
              <Button onClick={runDemo} disabled={loading} size="sm" className="gap-1.5">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                Run Demo
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* ── Governance Vertex Flow Diagram ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Figure 5.1 — Governance Vertex (Complete)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-2 flex-wrap py-3">
            <div className="flex flex-col items-center p-3 rounded-lg border-2 border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950 min-w-[100px]">
              <ShieldAlert className="h-5 w-5 text-rose-600 mb-1" />
              <span className="text-xs font-medium">PHI Guard</span>
              <Badge variant="outline" className="text-[10px] mt-1">Day 10</Badge>
            </div>
            <span className="text-muted-foreground">→</span>
            <div className="flex flex-col items-center p-3 rounded-lg border-2 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 min-w-[100px]">
              <ShieldCheck className="h-5 w-5 text-amber-600 mb-1" />
              <span className="text-xs font-medium">Model Armor</span>
              <Badge variant="outline" className="text-[10px] mt-1">Day 11</Badge>
            </div>
            <span className="text-muted-foreground">→</span>
            <div className="flex flex-col items-center p-3 rounded-lg border-2 border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950 min-w-[100px]">
              <Fingerprint className="h-5 w-5 text-violet-600 mb-1" />
              <span className="text-xs font-medium">Agent Identity</span>
              <Badge variant="outline" className="text-[10px] mt-1">Day 11</Badge>
            </div>
            <span className="text-muted-foreground">→</span>
            <div className="flex flex-col items-center p-3 rounded-lg border-2 border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950 min-w-[100px]">
              <Eye className="h-5 w-5 text-emerald-600 mb-1" />
              <span className="text-xs font-medium">Observability</span>
              <Badge variant="outline" className="text-[10px] mt-1">Day 11</Badge>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Governance is co-equal with Evidence and Agents — not a security afterthought tacked onto a working pipeline.
          </p>
        </CardContent>
      </Card>

      {/* ── Sub-Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="overview">Demo Moment</TabsTrigger>
          <TabsTrigger value="armor">Model Armor</TabsTrigger>
          <TabsTrigger value="identity">Agent Identity</TabsTrigger>
          <TabsTrigger value="observability">Observability</TabsTrigger>
          <TabsTrigger value="gate">Gate Verify</TabsTrigger>
        </TabsList>

        {/* ── Demo Moment Tab ── */}
        <TabsContent value="overview" className="space-y-4">
          {demoResult ? (
            <>
              {/* Model Armor Results */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-amber-600" />
                    Model Armor Scan Results
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Clean content */}
                    <div className={`p-3 rounded-lg border-2 ${demoResult.modelArmor.cleanResult.verdict === 'ALLOW' ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950' : 'border-red-200 bg-red-50'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">✅ Clean Policy Content</span>
                        <Badge variant={demoResult.modelArmor.cleanResult.verdict === 'ALLOW' ? 'default' : 'destructive'}>
                          {demoResult.modelArmor.cleanResult.verdict}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <p>Risk Score: {demoResult.modelArmor.cleanResult.riskScore}/100</p>
                        <p>Threats: {demoResult.modelArmor.cleanResult.threatCount}</p>
                      </div>
                    </div>

                    {/* Adversarial content */}
                    <div className={`p-3 rounded-lg border-2 ${demoResult.modelArmor.adversarialResult.verdict === 'BLOCK' ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950' : 'border-amber-200 bg-amber-50'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">⚠️ Adversarial Content</span>
                        <Badge variant={demoResult.modelArmor.adversarialResult.verdict === 'BLOCK' ? 'destructive' : 'default'}>
                          {demoResult.modelArmor.adversarialResult.verdict}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <p>Risk Score: {demoResult.modelArmor.adversarialResult.riskScore}/100</p>
                        <p>Threats: {demoResult.modelArmor.adversarialResult.threatCount}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Agent Identity Results */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Fingerprint className="h-4 w-4 text-violet-600" />
                    Agent Identity Permission Results
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Violations */}
                    <div className="p-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
                      <h4 className="text-xs font-semibold mb-2 text-red-700 dark:text-red-400">
                        DENIED (Expected)
                      </h4>
                      <div className="space-y-1.5">
                        {demoResult.agentIdentity.violations.map((v, i) => (
                          <div key={i} className="flex items-start gap-1.5">
                            <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                            <span className="text-[11px]">
                              <strong>{v.agent}</strong> → {v.capability} {v.resource}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Allowances */}
                    <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950">
                      <h4 className="text-xs font-semibold mb-2 text-emerald-700 dark:text-emerald-400">
                        ALLOWED (Expected)
                      </h4>
                      <div className="space-y-1.5">
                        {demoResult.agentIdentity.allowances.map((a, i) => (
                          <div key={i} className="flex items-start gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                            <span className="text-[11px]">
                              <strong>{a.agent}</strong> → {a.capability} {a.resource}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant={demoResult.agentIdentity.allPassed ? 'default' : 'destructive'} className="gap-1">
                      {demoResult.agentIdentity.allPassed ? (
                        <><CheckCircle2 className="h-3 w-3" /> All permission checks correct</>
                      ) : (
                        <><XCircle className="h-3 w-3" /> Permission check failures</>
                      )}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Observability Summary */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Eye className="h-4 w-4 text-emerald-600" />
                    Agent Observability Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="text-center">
                      <p className="text-lg font-bold">{demoResult.observability.stats.totalCases}</p>
                      <p className="text-[10px] text-muted-foreground">Total Cases</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold">{demoResult.observability.stats.totalTraceEvents}</p>
                      <p className="text-[10px] text-muted-foreground">Trace Events</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold">{demoResult.observability.stats.avgEventsPerCase}</p>
                      <p className="text-[10px] text-muted-foreground">Avg/Case</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold">
                        {Object.values(demoResult.observability.stats.governanceCoverage).reduce((a: number, b: unknown) => a + (b as number), 0)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Governance Events</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Scale className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground mb-4">
                  Click &quot;Run Demo&quot; to demonstrate the governance vertex
                </p>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  The demo will scan clean/adversarial content (Model Armor),
                  test permission violations (Agent Identity),
                  and verify audit reconstruction (Observability).
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Model Armor Tab ── */}
        <TabsContent value="armor" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-amber-600" />
                  Model Armor — Prompt Injection &amp; Jailbreak Defense
                </CardTitle>
                <Button variant="outline" size="sm" onClick={loadArmorAudit} className="gap-1">
                  <FileSearch className="h-3 w-3" /> Load Audit
                </Button>
              </div>
              <CardDescription>
                Second layer inside the agent fleet. Scans retrieved content before agent processing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Threat Categories */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="p-2 rounded border bg-red-50 dark:bg-red-950">
                  <h5 className="text-[10px] font-semibold text-red-700 dark:text-red-400 mb-1">CRITICAL — Block</h5>
                  <ul className="text-[10px] text-muted-foreground space-y-0.5">
                    <li>• Instruction Override</li>
                    <li>• New Instruction Injection</li>
                    <li>• Role Switching Attack</li>
                  </ul>
                </div>
                <div className="p-2 rounded border bg-amber-50 dark:bg-amber-950">
                  <h5 className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 mb-1">HIGH — Block</h5>
                  <ul className="text-[10px] text-muted-foreground space-y-0.5">
                    <li>• Data Exfiltration Attempt</li>
                    <li>• Boundary Crossing</li>
                    <li>• Tool/Function Poisoning</li>
                  </ul>
                </div>
                <div className="p-2 rounded border bg-yellow-50 dark:bg-yellow-950">
                  <h5 className="text-[10px] font-semibold text-yellow-700 dark:text-yellow-400 mb-1">MEDIUM — Sanitize</h5>
                  <ul className="text-[10px] text-muted-foreground space-y-0.5">
                    <li>• Indirect Manipulation</li>
                    <li>• Output Format Manipulation</li>
                    <li>• Emotional/Social Engineering</li>
                  </ul>
                </div>
                <div className="p-2 rounded border bg-slate-50 dark:bg-slate-950">
                  <h5 className="text-[10px] font-semibold text-slate-700 dark:text-slate-400 mb-1">LOW — Log</h5>
                  <ul className="text-[10px] text-muted-foreground space-y-0.5">
                    <li>• Suspicious Escape Sequences</li>
                    <li>• Repetition Attack</li>
                  </ul>
                </div>
              </div>

              {/* Verdict Flow */}
              <div className="flex items-center justify-center gap-2 text-xs py-2">
                <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">Retrieved Content</span>
                <span className="text-muted-foreground">→</span>
                <span className="px-2 py-1 rounded bg-amber-100 dark:bg-amber-900 font-medium">Model Armor</span>
                <span className="text-muted-foreground">→</span>
                <span className="px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900">ALLOW</span>
                <span className="text-muted-foreground">|</span>
                <span className="px-2 py-1 rounded bg-yellow-100 dark:bg-yellow-900">SANITIZE</span>
                <span className="text-muted-foreground">|</span>
                <span className="px-2 py-1 rounded bg-red-100 dark:bg-red-900">BLOCK</span>
              </div>

              {/* Audit Log */}
              {armorAudit.length > 0 && (
                <div className="space-y-1">
                  <h5 className="text-xs font-medium">Audit Log ({armorAudit.length} entries)</h5>
                  <div className="max-h-40 overflow-y-auto text-[10px] font-mono bg-muted/50 p-2 rounded">
                    {JSON.stringify(armorAudit, null, 1)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Agent Identity Tab ── */}
        <TabsContent value="identity" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Fingerprint className="h-4 w-4 text-violet-600" />
                  Agent Identity — Scoped Permissions
                </CardTitle>
                <Button variant="outline" size="sm" onClick={loadIdentityAudit} className="gap-1">
                  <FileSearch className="h-3 w-3" /> Load Audit
                </Button>
              </div>
              <CardDescription>
                Each agent has scoped permissions. Quality Review cannot write appeals. Letter Drafting cannot ingest outcomes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Agent Permission Matrix */}
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1 px-2 font-medium">Agent</th>
                      <th className="text-left py-1 px-2 font-medium">Key Resources</th>
                      <th className="text-left py-1 px-2 font-medium">Notable Restriction</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-1 px-2"><span className="text-rose-600 font-medium">Patient Advocate</span></td>
                      <td className="py-1 px-2">case (R/W), denial (R)</td>
                      <td className="py-1 px-2 text-amber-600">No appeal write</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-1 px-2"><span className="text-teal-600 font-medium">Denial Triage</span></td>
                      <td className="py-1 px-2">denial (R/W), hitl_gate (R/W)</td>
                      <td className="py-1 px-2">—</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-1 px-2"><span className="text-violet-600 font-medium">Policy Research</span></td>
                      <td className="py-1 px-2">policy (R/X), evidence (R/W)</td>
                      <td className="py-1 px-2">—</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-1 px-2"><span className="text-emerald-600 font-medium">Evidence Assembly</span></td>
                      <td className="py-1 px-2">evidence (R/W), citation (R/W)</td>
                      <td className="py-1 px-2">—</td>
                    </tr>
                    <tr className="border-b bg-blue-50/50 dark:bg-blue-950/30">
                      <td className="py-1 px-2"><span className="text-blue-600 font-medium">Letter Drafting</span></td>
                      <td className="py-1 px-2">appeal (R/W), evidence (R)</td>
                      <td className="py-1 px-2 text-red-600 font-medium">⛔ Cannot read outcomes</td>
                    </tr>
                    <tr className="border-b bg-purple-50/50 dark:bg-purple-950/30">
                      <td className="py-1 px-2"><span className="text-purple-600 font-medium">Quality Review</span></td>
                      <td className="py-1 px-2">citation (R/W), appeal (R only)</td>
                      <td className="py-1 px-2 text-red-600 font-medium">⛔ Cannot write appeals</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-1 px-2"><span className="text-amber-600 font-medium">Outcome Learning</span></td>
                      <td className="py-1 px-2">outcome (R/W), policy (R/W)</td>
                      <td className="py-1 px-2 text-amber-600">No appeal/evidence write</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2"><span className="text-orange-600 font-medium">Deadline Tracker</span></td>
                      <td className="py-1 px-2">deadline (R/W/X)</td>
                      <td className="py-1 px-2 text-amber-600">Temporal-only authority</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Blueprint-mandated examples */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="p-2 rounded border bg-red-50 dark:bg-red-950">
                  <h5 className="text-[10px] font-semibold text-red-700 dark:text-red-400 mb-1">
                    Blueprint Mandate: Prevention
                  </h5>
                  <ul className="text-[10px] space-y-0.5">
                    <li>• Quality Review → write appeal: <strong>DENIED</strong> (prevents self-approval)</li>
                    <li>• Letter Drafting → read outcome: <strong>DENIED</strong> (prevents bias)</li>
                  </ul>
                </div>
                <div className="p-2 rounded border bg-emerald-50 dark:bg-emerald-950">
                  <h5 className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                    Blueprint Mandate: Capability
                  </h5>
                  <ul className="text-[10px] space-y-0.5">
                    <li>• Letter Drafting → write appeal: <strong>ALLOWED</strong> (its core job)</li>
                    <li>• Quality Review → write citation: <strong>ALLOWED</strong> (verification)</li>
                  </ul>
                </div>
              </div>

              {/* Audit Log */}
              {identityAudit.length > 0 && (
                <div className="space-y-1">
                  <h5 className="text-xs font-medium">Audit Log ({identityAudit.length} entries)</h5>
                  <div className="max-h-40 overflow-y-auto text-[10px] font-mono bg-muted/50 p-2 rounded">
                    {JSON.stringify(identityAudit, null, 1)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Observability Tab ── */}
        <TabsContent value="observability" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4 text-emerald-600" />
                  Agent Observability — Audit Trail
                </CardTitle>
                <Button variant="outline" size="sm" onClick={loadObservabilityStats} className="gap-1">
                  <Activity className="h-3 w-3" /> Load Stats
                </Button>
              </div>
              <CardDescription>
                Every case is queryable end-to-end through the decision trace stream.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Stats Display */}
              {observabilityStats ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="text-center p-2 rounded bg-muted/50">
                      <p className="text-lg font-bold">{(observabilityStats as Record<string, unknown>).totalCases as number}</p>
                      <p className="text-[10px] text-muted-foreground">Cases</p>
                    </div>
                    <div className="text-center p-2 rounded bg-muted/50">
                      <p className="text-lg font-bold">{(observabilityStats as Record<string, unknown>).totalTraceEvents as number}</p>
                      <p className="text-[10px] text-muted-foreground">Trace Events</p>
                    </div>
                    <div className="text-center p-2 rounded bg-muted/50">
                      <p className="text-lg font-bold">{(observabilityStats as Record<string, unknown>).avgEventsPerCase as number}</p>
                      <p className="text-[10px] text-muted-foreground">Avg/Case</p>
                    </div>
                    <div className="text-center p-2 rounded bg-muted/50">
                      <p className="text-lg font-bold">
                        {Object.values((observabilityStats as Record<string, unknown>).governanceCoverage as Record<string, number>).reduce((a, b) => a + b, 0)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Governance Events</p>
                    </div>
                  </div>

                  {/* Agent Distribution */}
                  <div className="space-y-1">
                    <h5 className="text-xs font-medium">Agent Distribution</h5>
                    {Object.entries((observabilityStats as Record<string, unknown>).agentDistribution as Record<string, number>)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 8)
                      .map(([agent, count]) => (
                        <div key={agent} className="flex items-center gap-2">
                          <span className="text-[10px] w-28 truncate">{agent}</span>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${Math.min((count / ((observabilityStats as Record<string, unknown>).totalTraceEvents as number || 1)) * 100, 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] w-8 text-right">{count as number}</span>
                        </div>
                      ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Click &quot;Load Stats&quot; to view observability data
                </p>
              )}

              {/* Recent Activity */}
              {observabilityStats && ((observabilityStats as Record<string, unknown>).recentActivity as unknown[]).length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-medium">Recent Activity</h5>
                    <Button variant="ghost" size="sm" onClick={() => toggleSection('recent')} className="h-5 p-0">
                      {expandedSection === 'recent' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </Button>
                  </div>
                  {expandedSection === 'recent' && (
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {((observabilityStats as Record<string, unknown>).recentActivity as Array<{ timestamp: string; agent: string; step: string; status: string; detail: string }>).slice(0, 15).map((event, i) => (
                        <div key={i} className="flex items-start gap-2 text-[10px] p-1 rounded bg-muted/30">
                          <Badge variant="outline" className="text-[8px] h-4 px-1 shrink-0">
                            {event.agent.slice(0, 10)}
                          </Badge>
                          <span className="truncate">{event.step}: {event.detail.slice(0, 60)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Gate Verification Tab ── */}
        <TabsContent value="gate" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Day 11 Gate Verification
                </CardTitle>
                <Button onClick={verifyGate} disabled={loading} size="sm" className="gap-1">
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  Verify Gate
                </Button>
              </div>
              <CardDescription>
                Gate: an audit query can reconstruct a full case from trace events alone.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {gateResult ? (
                <div className="space-y-3">
                  {/* Gate Status */}
                  <div className={`p-4 rounded-lg border-2 ${gateResult.passed ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950' : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'}`}>
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
                        <p className="text-xs text-muted-foreground">
                          {gateResult.passed
                            ? 'An audit query can reconstruct a full case from trace events alone.'
                            : 'Case reconstruction from trace events is incomplete.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Individual Checks */}
                  <div className="space-y-2">
                    {gateResult.checks.map((check, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded border">
                        {check.result ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <p className="text-xs font-medium">{check.check}</p>
                          <p className="text-[10px] text-muted-foreground">{check.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Lock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Click &quot;Verify Gate&quot; to check if audit queries can reconstruct cases
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
