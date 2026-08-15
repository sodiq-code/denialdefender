'use client';

/**
 * DenialDefender — Day 10: PHI Guard Panel
 *
 * The governance vertex's front gate. Shows:
 *  - PHI Guard demo moment (synthetic → ALLOW; sensitive → BLOCK)
 *  - Classification results with risk scores
 *  - Audit log
 *  - Gate verification
 *  - Pattern library
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Shield,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Play,
  RotateCcw,
  Lock,
  Unlock,
  FileText,
  Activity,
  Server,
  Search,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────

interface PhiMatch {
  type: string;
  label: string;
  severity: 'high' | 'medium' | 'low';
  matchedText: string;
  position: number;
  description: string;
}

interface ClassificationResult {
  detected: boolean;
  patterns: PhiMatch[];
  riskScore: number;
  verdict: 'ALLOW' | 'BLOCK';
  reason: string;
  modelInvocations: number;
  timestamp: string;
}

interface AuditEntry {
  id: string;
  caseId: string;
  contentHash: string;
  verdict: 'ALLOW' | 'BLOCK';
  riskScore: number;
  patternCount: number;
  patternTypes: string[];
  modelInvocations: number;
  timestamp: string;
}

interface GateCheck {
  check: string;
  result: boolean;
  detail: string;
}

interface DemoResult {
  synthetic: {
    label: string;
    result: ClassificationResult;
    audit: AuditEntry;
  };
  sensitive: {
    label: string;
    result: ClassificationResult;
    audit: AuditEntry;
  };
  gateVerification: {
    passed: boolean;
    checks: GateCheck[];
  };
  gatePassed: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────

export default function Day10PhiGuardPanel() {
  const [demoResult, setDemoResult] = useState<DemoResult | null>(null);
  const [running, setRunning] = useState(false);
  const [customText, setCustomText] = useState('');
  const [customResult, setCustomResult] = useState<ClassificationResult | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [showPatterns, setShowPatterns] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [gateChecks, setGateChecks] = useState<GateCheck[]>([]);
  const [gatePassed, setGatePassed] = useState<boolean | null>(null);

  // ── Run Demo ──
  const runDemo = async () => {
    setRunning(true);
    try {
      const res = await fetch('/api/phi-guard/demo');
      const data = await res.json();
      if (data.success) {
        setDemoResult(data.demo);
        setGateChecks(data.gateVerification.checks);
        setGatePassed(data.gatePassed);
      }
    } catch (err) {
      console.error('Demo failed:', err);
    } finally {
      setRunning(false);
    }
  };

  // ── Classify Custom Text ──
  const classifyCustom = async () => {
    if (!customText.trim()) return;
    setClassifying(true);
    try {
      const res = await fetch('/api/phi-guard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: customText,
          caseId: `custom-${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCustomResult(data.result);
      }
    } catch (err) {
      console.error('Classification failed:', err);
    } finally {
      setClassifying(false);
    }
  };

  // ── Fetch Audit Log ──
  useEffect(() => {
    const fetchAudit = async () => {
      try {
        const res = await fetch('/api/phi-guard');
        const data = await res.json();
        if (data.success) {
          setAuditLog(data.audits || []);
        }
      } catch { /* ignore */ }
    };
    fetchAudit();
    const interval = setInterval(fetchAudit, 10000);
    return () => clearInterval(interval);
  }, []);

  // ── Helpers ──
  const severityColor = (s: string) => {
    switch (s) {
      case 'high': return 'text-red-600 dark:text-red-400';
      case 'medium': return 'text-amber-600 dark:text-amber-400';
      case 'low': return 'text-gray-600 dark:text-gray-400';
      default: return 'text-gray-600';
    }
  };

  const severityBg = (s: string) => {
    switch (s) {
      case 'high': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
      case 'medium': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
      case 'low': return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
      default: return 'bg-gray-100';
    }
  };

  const riskColor = (score: number) => {
    if (score >= 50) return 'text-red-600 dark:text-red-400';
    if (score >= 20) return 'text-amber-600 dark:text-amber-400';
    return 'text-emerald-600 dark:text-emerald-400';
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-amber-600 text-white">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold">PHI Guard</h2>
            <p className="text-sm text-muted-foreground">
              Governance Vertex — Front Gate • Section 10
            </p>
          </div>
          <Badge variant="outline" className="ml-auto text-xs">
            Day 10
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">
          The classifier runs <strong>before</strong> any agent invocation. A BLOCK guarantees
          <strong> zero model calls</strong> and is logged. This is both a real security
          guarantee and the enterprise-security demo moment.
        </p>
      </div>

      {/* ── PHI Guard Flow Diagram ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">PHI Guard Flow (Figure 10.1)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 text-sm">
            <span className="px-3 py-1.5 rounded-md font-medium text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 shrink-0">
              Upload
            </span>
            <span className="text-muted-foreground shrink-0">→</span>
            <span className="px-3 py-1.5 rounded-md font-medium text-xs bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 shrink-0">
              <Shield className="h-3 w-3 inline mr-1" />
              PHI Guard
            </span>
            <span className="text-muted-foreground shrink-0">→</span>
            <span className="px-3 py-1.5 rounded-md font-medium text-xs bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 shrink-0">
              <CheckCircle2 className="h-3 w-3 inline mr-1" />
              ALLOW → Agent Fleet
            </span>
            <span className="text-muted-foreground shrink-0">|</span>
            <span className="px-3 py-1.5 rounded-md font-medium text-xs bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 shrink-0">
              <XCircle className="h-3 w-3 inline mr-1" />
              BLOCK → No Model Invocation
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            <Lock className="h-3 w-3 inline mr-1" />
            The decisive property: a BLOCK means no model invocation occurred — provable in the decision trace and audit log.
          </p>
        </CardContent>
      </Card>

      {/* ── Demo Moment ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">PHI Guard Demo Moment</CardTitle>
            <Button
              onClick={runDemo}
              disabled={running}
              size="sm"
              className="gap-1.5"
            >
              {running ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {running ? 'Running...' : 'Run Demo'}
            </Button>
          </div>
          <CardDescription>
            Synthetic case → ALLOW; Sensitive document → BLOCK with &quot;no model invocation&quot;
          </CardDescription>
        </CardHeader>
        <CardContent>
          {demoResult ? (
            <div className="space-y-4">
              {/* Synthetic Result */}
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  <h4 className="font-semibold text-sm">Case 1: Synthetic Document</h4>
                  <Badge className={`text-[10px] ${demoResult.synthetic.result.verdict === 'ALLOW' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
                    {demoResult.synthetic.result.verdict}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Risk Score</p>
                    <p className={`font-mono font-bold ${riskColor(demoResult.synthetic.result.riskScore)}`}>
                      {demoResult.synthetic.result.riskScore}/100
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Patterns</p>
                    <p className="font-mono font-bold">{demoResult.synthetic.result.patterns.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Model Calls</p>
                    <p className="font-mono font-bold text-emerald-600">{demoResult.synthetic.result.modelInvocations}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <p className="font-semibold text-emerald-600">
                      <Unlock className="h-3.5 w-3.5 inline mr-1" />
                      Processing Allowed
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{demoResult.synthetic.result.reason}</p>
                {demoResult.synthetic.result.patterns.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {demoResult.synthetic.result.patterns.map((p, i) => (
                      <Badge key={i} variant="outline" className={`text-[10px] ${severityBg(p.severity)}`}>
                        {p.label}: {p.matchedText}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Sensitive Result */}
              <div className="rounded-lg border-2 border-red-300 dark:border-red-700 bg-red-50/30 dark:bg-red-950/10 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldX className="h-5 w-5 text-red-600" />
                  <h4 className="font-semibold text-sm">Case 2: Sensitive Document</h4>
                  <Badge className="text-[10px] bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                    {demoResult.sensitive.result.verdict}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Risk Score</p>
                    <p className={`font-mono font-bold ${riskColor(demoResult.sensitive.result.riskScore)}`}>
                      {demoResult.sensitive.result.riskScore}/100
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Patterns</p>
                    <p className="font-mono font-bold text-red-600">{demoResult.sensitive.result.patterns.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Model Calls</p>
                    <p className="font-mono font-bold text-emerald-600">
                      {demoResult.sensitive.result.modelInvocations}
                      <span className="text-xs text-muted-foreground ml-1">(ZERO — guaranteed)</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <p className="font-semibold text-red-600">
                      <Lock className="h-3.5 w-3.5 inline mr-1" />
                      Processing BLOCKED
                    </p>
                  </div>
                </div>
                <Alert variant="destructive" className="mt-3">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>PHI Guard — BLOCK</AlertTitle>
                  <AlertDescription>
                    {demoResult.sensitive.result.reason}
                  </AlertDescription>
                </Alert>
                <div className="mt-3">
                  <p className="text-xs font-medium mb-1.5">Detected PHI patterns:</p>
                  <div className="flex flex-wrap gap-1">
                    {demoResult.sensitive.result.patterns.map((p, i) => (
                      <Badge key={i} variant="outline" className={`text-[10px] ${severityBg(p.severity)}`}>
                        {p.label}: {p.matchedText}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              {/* Gate Verification */}
              {gateChecks.length > 0 && (
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    {gatePassed ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                    <h4 className="font-semibold text-sm">
                      Gate Verification: {gatePassed ? 'PASSED' : 'FAILED'}
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {gateChecks.map((check, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        {check.result ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <p className="font-medium">{check.check}</p>
                          <p className="text-xs text-muted-foreground">{check.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Click &quot;Run Demo&quot; to execute the PHI Guard demo moment</p>
              <p className="text-xs mt-1">Synthetic case → ALLOW | Sensitive document → BLOCK</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Custom Classification ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Classify Custom Content</CardTitle>
          <CardDescription>
            Paste any text to test PHI detection in real-time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Paste text to classify for PHI..."
              className="w-full h-32 rounded-lg border p-3 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <div className="flex items-center gap-2">
              <Button
                onClick={classifyCustom}
                disabled={classifying || !customText.trim()}
                size="sm"
                className="gap-1.5"
              >
                {classifying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
                {classifying ? 'Classifying...' : 'Classify'}
              </Button>
              {customResult && (
                <Badge className={`text-xs ${customResult.verdict === 'ALLOW' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
                  {customResult.verdict} — Risk: {customResult.riskScore}/100
                </Badge>
              )}
            </div>
            {customResult && (
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium mb-2">{customResult.reason}</p>
                {customResult.patterns.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {customResult.patterns.map((p, i) => (
                      <Badge key={i} variant="outline" className={`text-[10px] ${severityBg(p.severity)}`}>
                        {p.label}: {p.matchedText}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No PHI patterns detected</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── PHI Pattern Library ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowPatterns(!showPatterns)}>
            <CardTitle className="text-base">PHI Pattern Library</CardTitle>
            {showPatterns ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CardHeader>
        {showPatterns && (
          <CardContent>
            <div className="space-y-2 text-sm">
              {[
                { type: 'SSN', severity: 'high', desc: '9-digit Social Security Number (XXX-XX-XXXX)' },
                { type: 'MRN', severity: 'high', desc: 'Medical Record Number with prefix' },
                { type: 'Insurance ID', severity: 'high', desc: 'Member/Subscriber/Policy ID' },
                { type: 'DOB', severity: 'medium', desc: 'Date of Birth with label' },
                { type: 'Patient Name', severity: 'medium', desc: 'Patient name with label prefix' },
                { type: 'Phone', severity: 'medium', desc: 'Phone number with label' },
                { type: 'Address', severity: 'medium', desc: 'Street address with label' },
                { type: 'Email', severity: 'medium', desc: 'Email address pattern' },
                { type: 'Diagnosis Link', severity: 'low', desc: 'Patient-diagnosis linkage statement' },
                { type: 'Medication Link', severity: 'low', desc: 'Patient-medication linkage statement' },
              ].map((p) => (
                <div key={p.type} className="flex items-center gap-3 rounded-md border p-2">
                  <Badge className={`text-[10px] shrink-0 ${severityBg(p.severity)}`}>
                    {p.severity}
                  </Badge>
                  <span className="font-medium min-w-[100px]">{p.type}</span>
                  <span className="text-xs text-muted-foreground">{p.desc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Audit Log ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowAudit(!showAudit)}>
            <CardTitle className="text-base">PHI Guard Audit Log</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">{auditLog.length} entries</Badge>
              {showAudit ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </CardHeader>
        {showAudit && (
          <CardContent>
            {auditLog.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {auditLog.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-2 rounded-md border p-2 text-xs">
                    <Badge className={`text-[10px] shrink-0 ${entry.verdict === 'ALLOW' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
                      {entry.verdict}
                    </Badge>
                    <span className="font-mono text-muted-foreground">risk={entry.riskScore}</span>
                    <span className="font-mono text-muted-foreground">patterns={entry.patternCount}</span>
                    <span className="font-mono text-muted-foreground">calls={entry.modelInvocations}</span>
                    <span className="font-mono text-muted-foreground truncate">{entry.contentPreview.slice(0, 40)}...</span>
                    <span className="ml-auto text-muted-foreground shrink-0">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No audit entries yet. Run the demo or classify content.</p>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Compliance Note ── */}
      <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-950/10 p-4">
        <div className="flex items-start gap-2">
          <Shield className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-300">Compliance Posture</p>
            <p className="text-xs text-muted-foreground mt-1">
              The hackathon prototype is <strong>intentionally designed not to process PHI</strong>.
              Demonstration cases are synthetic and public sources are non-PHI.
              We are not claiming production HIPAA compliance. A production deployment
              handling PHI would require the applicable HIPAA privacy/security program,
              contractual arrangements, access controls, auditability, and governance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
