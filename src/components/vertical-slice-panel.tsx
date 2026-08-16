'use client';

/**
 * DenialDefender — Vertical Slice Panel Component
 * Day 3: Interactive UI for the vertical slice pipeline.
 *
 * Shows: Input section, 3-step progress, parsed denial, 3 citations with
 * clickable provenance cards, appeal draft, gate status, and latency.
 */

import { useState, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  FileText,
  CheckCircle2,
  XCircle,
  Search,
  BookOpen,
  Clock,
  Shield,
  Loader2,
  ChevronRight,
  Zap,
  AlertTriangle,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────

interface ParsedDenial {
  denial_code: string;
  denial_type: string;
  denial_type_label: string;
  payer: string;
  reason_codes: string[];
  cpt_codes: string[];
  icd_codes: string[];
  amount_denied: number;
  confidence: number;
  summary: string;
}

interface VerticalSliceCitation {
  number: number;
  evidenceId: string;
  source: string;
  documentName: string;
  section: string | null;
  contentPreview: string;
  provenanceTier: string;
  provenanceColor: string;
  clauseId: string | null;
  retrievalWeight: number;
  relevanceScore: number;
}

interface AppealDraft {
  paragraph: string;
  wordCount: number;
  citationsUsed: number[];
  tone: string;
  strengths: string[];
}

interface VerticalSliceResult {
  parsedDenial: ParsedDenial;
  citations: VerticalSliceCitation[];
  appealDraft: AppealDraft;
  latencyMs: number;
  success: boolean;
  gatePassed: boolean;
  trace: {
    step: string;
    agent: string;
    timestamp: string;
    detail: string;
  }[];
}

interface SampleLetter {
  id: string;
  label: string;
  payer: string;
  text: string;
}

// ─── Provenance Tier Config ───────────────────────────────────────────────

const TIER_DISPLAY: Record<string, { label: string; color: string; borderColor: string; icon: typeof ShieldCheck }> = {
  primary_source: {
    label: 'Primary Source',
    color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    borderColor: 'border-emerald-300 dark:border-emerald-700',
    icon: ShieldCheck,
  },
  secondary_summary: {
    label: 'Secondary Summary',
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    borderColor: 'border-amber-300 dark:border-amber-700',
    icon: BookOpen,
  },
  tertiary_commentary: {
    label: 'Tertiary Commentary',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
    borderColor: 'border-gray-300 dark:border-gray-700',
    icon: AlertTriangle,
  },
};

// ─── Step Indicator ───────────────────────────────────────────────────────

function StepIndicator({
  steps,
  currentStep,
}: {
  steps: { label: string; icon: typeof FileText }[];
  currentStep: number; // 0 = not started, 1-3 = in progress, 4 = done
}) {
  return (
    <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-2">
      {steps.map((step, idx) => {
        const stepNum = idx + 1;
        const isActive = currentStep === stepNum;
        const isDone = currentStep > stepNum;
        const Icon = step.icon;

        return (
          <div key={step.label} className="flex items-center shrink-0">
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 ${
                isDone
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                  : isActive
                  ? 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200 ring-2 ring-teal-400'
                  : 'bg-muted/50 text-muted-foreground'
              }`}
            >
              {isDone ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : isActive ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">{step.label}</span>
              <span className="sm:hidden">{stepNum}</span>
            </div>
            {idx < steps.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground mx-0.5 sm:mx-1 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export function VerticalSlicePanel() {
  const [denialText, setDenialText] = useState('');
  const [payer, setPayer] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [result, setResult] = useState<VerticalSliceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gateResult, setGateResult] = useState<{
    allPassed: boolean;
    passedCount: number;
    totalRuns: number;
    totalLatencyMs: number;
    results: { run: number; sampleLabel: string; citationsCount: number; gatePassed: boolean; latencyMs: number }[];
  } | null>(null);
  const [gateLoading, setGateLoading] = useState(false);
  const [expandedCitation, setExpandedCitation] = useState<number | null>(null);
  const [samples, setSamples] = useState<SampleLetter[]>([]);

  // Fetch sample letters from API
  const fetchSamples = useCallback(async () => {
    if (samples.length > 0) return;
    try {
      const res = await fetch('/api/vertical-slice');
      if (res.ok) {
        const data = await res.json();
        // The API returns sample letter metadata; we need full text from the agent module
        // Since we can't import server code on client, we fetch and set via the sample select
      }
    } catch {
      // Ignore
    }
  }, [samples.length]);

  // Run the vertical slice
  const runSlice = useCallback(async () => {
    if (!denialText.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setCurrentStep(1);

    try {
      // Simulate step progress for UX
      const stepTimer = setInterval(() => {
        setCurrentStep(prev => (prev < 3 ? prev + 1 : prev));
      }, 800);

      const res = await fetch('/api/vertical-slice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ denialText, payer: payer || undefined }),
      });

      clearInterval(stepTimer);

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || errData.detail || 'Request failed');
      }

      const data: VerticalSliceResult = await res.json();
      setCurrentStep(4);
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setCurrentStep(0);
    } finally {
      setLoading(false);
    }
  }, [denialText, payer]);

  // Run the gate test
  const runGate = useCallback(async () => {
    setGateLoading(true);
    setGateResult(null);
    try {
      const res = await fetch('/api/vertical-slice/gate', { method: 'POST' });
      if (!res.ok) throw new Error('Gate test failed');
      const data = await res.json();
      setGateResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGateLoading(false);
    }
  }, []);

  // Load a sample denial letter
  const loadSample = useCallback(async (sampleId: string) => {
    try {
      // Fetch the full sample text from the vertical-slice API GET endpoint
      // and then find the matching sample. Since we need the full text on the client,
      // we'll use a different approach: fetch from API that returns the samples.
      const res = await fetch('/api/vertical-slice');
      if (!res.ok) return;
      const data = await res.json();
      // The GET endpoint returns sample letter metadata, but not full text.
      // Instead, we'll use inline sample text directly.
    } catch {
      // Ignore
    }

    // Use inline samples for immediate loading (no server round-trip needed)
    const inlineSamples = getInlineSamples();
    const sample = inlineSamples.find(s => s.id === sampleId);
    if (sample) {
      setDenialText(sample.text);
      setPayer(sample.payer);
    }
  }, []);

  const STEPS = [
    { label: 'Parse Denial', icon: FileText },
    { label: 'Retrieve Citations', icon: Search },
    { label: 'Draft Appeal', icon: BookOpen },
  ];

  return (
    <div className="space-y-6">
      {/* ── Input Section ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-teal-600" />
            Vertical Slice — Single-Agent Pipeline
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Upload a denial letter → Parse → Retrieve 3 citations → Draft appeal. Proves the end-to-end plumbing works.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sample selector */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Select onValueChange={loadSample}>
              <SelectTrigger className="w-full sm:w-[300px]">
                <SelectValue placeholder="Load sample denial letter..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sample-1">Medicare — Medical Necessity (CO-50, TKA)</SelectItem>
                <SelectItem value="sample-2">UnitedHealthcare — Prior Auth (CO-197, MRI)</SelectItem>
                <SelectItem value="sample-3">Aetna — Coding (CO-4, E/M Level 3)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={payer} onValueChange={setPayer}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Payer (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Medicare">Medicare</SelectItem>
                <SelectItem value="UnitedHealthcare">UnitedHealthcare</SelectItem>
                <SelectItem value="Aetna">Aetna</SelectItem>
                <SelectItem value="Cigna">Cigna</SelectItem>
                <SelectItem value="Humana">Humana</SelectItem>
                <SelectItem value="Anthem">Anthem</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Textarea
            value={denialText}
            onChange={(e) => setDenialText(e.target.value)}
            placeholder="Paste a denial letter here, or select a sample above..."
            className="min-h-[180px] text-sm font-mono"
          />

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={runSlice}
              disabled={loading || !denialText.trim()}
              className="gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              Run Vertical Slice
            </Button>
            <Button
              variant="outline"
              onClick={runGate}
              disabled={gateLoading}
              className="gap-2"
            >
              {gateLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Shield className="h-4 w-4" />
              )}
              Run Gate Test (5×)
            </Button>
            {result && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Clock className="h-3 w-3" />
                {result.latencyMs}ms
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Progress Indicator ──────────────────────────────────── */}
      {currentStep > 0 && (
        <Card>
          <CardContent className="p-4">
            <StepIndicator steps={STEPS} currentStep={currentStep} />
          </CardContent>
        </Card>
      )}

      {/* ── Error Display ───────────────────────────────────────── */}
      {error && (
        <Card className="border-red-300 dark:border-red-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <XCircle className="h-4 w-4 shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Results ─────────────────────────────────────────────── */}
      {result && (
        <>
          {/* Parsed Denial */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-teal-600" />
                Parsed Denial
                <Badge variant="outline" className="text-[10px] ml-auto">
                  Confidence: {Math.round(result.parsedDenial.confidence * 100)}%
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
                <div className="bg-muted/50 rounded p-2.5">
                  <span className="text-muted-foreground block mb-0.5">Denial Code</span>
                  <p className="font-mono font-semibold">{result.parsedDenial.denial_code}</p>
                </div>
                <div className="bg-muted/50 rounded p-2.5">
                  <span className="text-muted-foreground block mb-0.5">Denial Type</span>
                  <p className="font-medium">{result.parsedDenial.denial_type_label}</p>
                </div>
                <div className="bg-muted/50 rounded p-2.5">
                  <span className="text-muted-foreground block mb-0.5">Payer</span>
                  <p className="font-medium">{result.parsedDenial.payer}</p>
                </div>
                <div className="bg-muted/50 rounded p-2.5">
                  <span className="text-muted-foreground block mb-0.5">Amount Denied</span>
                  <p className="font-mono font-semibold">
                    {result.parsedDenial.amount_denied > 0
                      ? `$${result.parsedDenial.amount_denied.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : '—'}
                  </p>
                </div>
                <div className="bg-muted/50 rounded p-2.5">
                  <span className="text-muted-foreground block mb-0.5">CPT Codes</span>
                  <div className="flex flex-wrap gap-1">
                    {result.parsedDenial.cpt_codes.length > 0
                      ? result.parsedDenial.cpt_codes.map(c => (
                          <Badge key={c} variant="outline" className="text-[10px] font-mono">{c}</Badge>
                        ))
                      : <span className="text-muted-foreground">—</span>}
                  </div>
                </div>
                <div className="bg-muted/50 rounded p-2.5">
                  <span className="text-muted-foreground block mb-0.5">ICD Codes</span>
                  <div className="flex flex-wrap gap-1">
                    {result.parsedDenial.icd_codes.length > 0
                      ? result.parsedDenial.icd_codes.map(c => (
                          <Badge key={c} variant="outline" className="text-[10px] font-mono">{c}</Badge>
                        ))
                      : <span className="text-muted-foreground">—</span>}
                  </div>
                </div>
                <div className="bg-muted/50 rounded p-2.5 col-span-2 sm:col-span-1">
                  <span className="text-muted-foreground block mb-0.5">Reason Codes</span>
                  <div className="flex flex-wrap gap-1">
                    {result.parsedDenial.reason_codes.length > 0
                      ? result.parsedDenial.reason_codes.map(c => (
                          <Badge key={c} variant="outline" className="text-[10px] font-mono">{c}</Badge>
                        ))
                      : <span className="text-muted-foreground">—</span>}
                  </div>
                </div>
                <div className="bg-muted/50 rounded p-2.5 col-span-2">
                  <span className="text-muted-foreground block mb-0.5">Summary</span>
                  <p className="font-medium">{result.parsedDenial.summary}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Citations with Provenance Cards */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Search className="h-4 w-4 text-emerald-600" />
                Retrieved Citations
                <Badge variant="outline" className="text-[10px]">
                  {result.citations.length} of 3
                </Badge>
                <Badge
                  className={`text-[10px] ml-auto ${
                    result.gatePassed
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                  }`}
                >
                  {result.gatePassed ? (
                    <><CheckCircle2 className="h-3 w-3 mr-1" />Gate Passed</>
                  ) : (
                    <><XCircle className="h-3 w-3 mr-1" />Gate Not Passed</>
                  )}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {result.citations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No citations retrieved. The evidence corpus may be empty or the query did not match.</p>
              ) : (
                result.citations.map((citation) => {
                  const tierConfig = TIER_DISPLAY[citation.provenanceTier] || TIER_DISPLAY.tertiary_commentary;
                  const TierIcon = tierConfig.icon;
                  const isExpanded = expandedCitation === citation.number;

                  return (
                    <div
                      key={citation.number}
                      className={`rounded-lg border ${tierConfig.borderColor} hover:shadow-md transition-all cursor-pointer`}
                      onClick={() => setExpandedCitation(isExpanded ? null : citation.number)}
                    >
                      <div className="p-3 sm:p-4">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="flex items-center justify-center h-6 w-6 rounded-full bg-muted text-xs font-bold shrink-0">
                              {citation.number}
                            </div>
                            <TierIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{citation.documentName}</p>
                              {citation.section && (
                                <p className="text-xs text-muted-foreground truncate">§ {citation.section}</p>
                              )}
                            </div>
                          </div>
                          <Badge className={`text-[10px] shrink-0 ${tierConfig.color}`}>
                            {tierConfig.label}
                          </Badge>
                        </div>

                        {/* Source + scores */}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-2">
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {citation.source}
                          </span>
                          <span className="flex items-center gap-1">
                            Relevance: {citation.relevanceScore}
                          </span>
                          <span className="flex items-center gap-1">
                            Weight: {citation.retrievalWeight}
                          </span>
                          {citation.clauseId && (
                            <span className="flex items-center gap-1 font-mono">
                              Clause: {citation.clauseId}
                            </span>
                          )}
                        </div>

                        {/* Content Preview */}
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {citation.contentPreview}
                        </p>

                        {/* Expanded detail */}
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t space-y-2">
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="bg-muted/50 rounded p-2">
                                <span className="text-muted-foreground block mb-0.5">Evidence ID</span>
                                <p className="font-mono">{citation.evidenceId}</p>
                              </div>
                              <div className="bg-muted/50 rounded p-2">
                                <span className="text-muted-foreground block mb-0.5">Provenance Tier</span>
                                <p className="font-medium">{citation.provenanceTier}</p>
                              </div>
                              <div className="bg-muted/50 rounded p-2">
                                <span className="text-muted-foreground block mb-0.5">Retrieval Weight</span>
                                <p className="font-mono">{citation.retrievalWeight}</p>
                              </div>
                              <div className="bg-muted/50 rounded p-2">
                                <span className="text-muted-foreground block mb-0.5">Relevance Score</span>
                                <p className="font-mono">{citation.relevanceScore}</p>
                              </div>
                            </div>
                            <div className="bg-muted/50 rounded p-2 text-xs">
                              <span className="text-muted-foreground block mb-1">Full Content Preview</span>
                              <p className="whitespace-pre-wrap">{citation.contentPreview}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Appeal Draft */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-teal-600" />
                Appeal Draft
                <Badge variant="outline" className="text-[10px]">
                  {result.appealDraft.wordCount} words
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  Tone: {result.appealDraft.tone}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Appeal paragraph with inline citation references */}
              <div className="bg-muted/30 border rounded-lg p-4">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {renderAppealWithCitations(result.appealDraft.paragraph, result.citations)}
                </p>
              </div>

              {/* Strengths */}
              {result.appealDraft.strengths.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Appeal Strengths:</p>
                  <ul className="space-y-1">
                    {result.appealDraft.strengths.map((s, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-emerald-500" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Trace */}
              <Accordion type="single" collapsible>
                <AccordionItem value="trace" className="border-b-0">
                  <AccordionTrigger className="text-xs py-2 hover:no-underline">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      Decision Trace ({result.trace.length} steps)
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {result.trace.map((t, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs bg-muted/30 rounded p-2">
                          <div className="flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[10px] font-bold shrink-0">
                            {idx + 1}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-medium">{t.step}</span>
                              <span className="text-muted-foreground font-mono text-[10px]">
                                {new Date(t.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-muted-foreground break-words">{t.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          {/* Gate Status Card */}
          <Card className={result.gatePassed ? 'border-emerald-300 dark:border-emerald-700' : 'border-amber-300 dark:border-amber-700'}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {result.gatePassed ? (
                    <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      Gate: {result.gatePassed ? 'PASSED' : 'NOT PASSED'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Requires 3+ citations. Got {result.citations.length}.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Clock className="h-2.5 w-2.5" />
                    {result.latencyMs}ms
                  </Badge>
                  <Badge
                    className={`text-[10px] ${
                      result.gatePassed
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                    }`}
                  >
                    {result.citations.length}/3
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Gate Test Results ───────────────────────────────────── */}
      {gateResult && (
        <Card className={gateResult.allPassed ? 'border-emerald-300 dark:border-emerald-700' : 'border-amber-300 dark:border-amber-700'}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-teal-600" />
              Gate Test Results (5×)
              <Badge
                className={`text-[10px] ml-auto ${
                  gateResult.allPassed
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                }`}
              >
                {gateResult.allPassed ? (
                  <><CheckCircle2 className="h-3 w-3 mr-1" />All Passed</>
                ) : (
                  <>{gateResult.passedCount}/{gateResult.totalRuns} Passed</>
                )}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs mb-3">
              <div className="bg-muted/50 rounded p-2.5">
                <span className="text-muted-foreground block mb-0.5">Total Runs</span>
                <p className="font-mono font-semibold">{gateResult.totalRuns}</p>
              </div>
              <div className="bg-muted/50 rounded p-2.5">
                <span className="text-muted-foreground block mb-0.5">Passed</span>
                <p className={`font-mono font-semibold ${gateResult.allPassed ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {gateResult.passedCount}
                </p>
              </div>
              <div className="bg-muted/50 rounded p-2.5">
                <span className="text-muted-foreground block mb-0.5">Total Latency</span>
                <p className="font-mono font-semibold">{gateResult.totalLatencyMs}ms</p>
              </div>
            </div>

            {gateResult.results.map((r) => (
              <div
                key={r.run}
                className={`flex items-center gap-3 rounded-lg border p-3 ${
                  r.gatePassed
                    ? 'border-emerald-200 dark:border-emerald-800'
                    : 'border-red-200 dark:border-red-800'
                }`}
              >
                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-muted text-xs font-bold shrink-0">
                  {r.run}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{r.sampleLabel}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {r.citationsCount} citations &middot; {r.latencyMs}ms
                  </p>
                </div>
                {r.gatePassed ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Helper: Render appeal paragraph with clickable citation refs ────────

function renderAppealWithCitations(paragraph: string, citations: VerticalSliceCitation[]) {
  // Split on [1], [2], [3] patterns and interleave with clickable spans
  const parts: React.ReactNode[] = [];
  const regex = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(paragraph)) !== null) {
    // Push text before the match
    if (match.index > lastIndex) {
      parts.push(paragraph.slice(lastIndex, match.index));
    }

    const citationNum = parseInt(match[1]);
    const citation = citations.find(c => c.number === citationNum);

    parts.push(
      <button
        key={`cite-${match.index}`}
        className="inline-flex items-center gap-0.5 px-1 py-0 rounded bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200 text-xs font-medium hover:bg-teal-200 dark:hover:bg-teal-800 transition-colors"
        title={citation ? `${citation.documentName}${citation.section ? ` — §${citation.section}` : ''}` : `Citation ${citationNum}`}
      >
        [{citationNum}]
        <ExternalLink className="h-2.5 w-2.5" />
      </button>
    );

    lastIndex = regex.lastIndex;
  }

  // Push remaining text
  if (lastIndex < paragraph.length) {
    parts.push(paragraph.slice(lastIndex));
  }

  return parts;
}

// ─── Inline Sample Denial Letters ─────────────────────────────────────────

function getInlineSamples(): SampleLetter[] {
  return [
    {
      id: 'sample-1',
      label: 'Medicare — Medical Necessity (CO-50, TKA)',
      payer: 'Medicare',
      text: `Medicare\nClaims Adjudication Department\n\nDATE: March 4, 2026\n\nRE: Denial of Claim — 27447 (Total Knee Arthroplasty)\n\nDear Provider,\n\nThis letter is to inform you that the claim submitted for the above-referenced service has been denied.\n\nDENIAL REASON: CO50 — Non-covered services because it is not deemed medically necessary\n\nPAYER STATEMENT: The requested service is not medically necessary for the diagnosed condition. Conservative treatment options have not been adequately documented as exhausted.\n\nPROCEDURE: 27447 — Total Knee Arthroplasty\nDIAGNOSIS: M17.11 — Primary osteoarthritis, right knee\nAMOUNT DENIED: $34,250.00\n\nAPPEAL RIGHTS: You have the right to appeal this denial within 120 days of the date of this notice.\n\nSincerely,\nClaims Adjudication Department\nMedicare`,
    },
    {
      id: 'sample-2',
      label: 'UnitedHealthcare — Prior Auth (CO-197, MRI)',
      payer: 'UnitedHealthcare',
      text: `UnitedHealthcare\nPrior Authorization Department\n\nDATE: February 28, 2026\n\nRE: Denial of Claim — 70553 (MRI Brain With and Without Contrast)\n\nDear Provider,\n\nThis letter is to inform you that the claim submitted for the above-referenced service has been denied.\n\nDENIAL REASON: CO197 — Precertification/authorization/notification/pre-treatment absent\n\nPAYER STATEMENT: Precertification was not obtained prior to service delivery. This procedure requires prior authorization per UnitedHealthcare Medical Policy.\n\nPROCEDURE: 70553 — MRI brain with and without contrast\nDIAGNOSIS: G43.909 — Migraine, unspecified, not intractable\nAMOUNT DENIED: $2,890.00\n\nAPPEAL RIGHTS: You have the right to appeal this denial within 180 days.\n\nSincerely,\nPrior Authorization Department\nUnitedHealthcare`,
    },
    {
      id: 'sample-3',
      label: 'Aetna — Coding (CO-4, E/M Level 3)',
      payer: 'Aetna',
      text: `Aetna\nClaims Adjudication Department\n\nDATE: March 10, 2026\n\nRE: Denial of Claim — 99213 (Office Visit, Established Patient, Level 3)\n\nDear Provider,\n\nThis letter is to inform you that the claim submitted for the above-referenced service has been denied.\n\nDENIAL REASON: CO4 — The procedure code is inconsistent with the modifier used or is inconsistent with the diagnosis\n\nPAYER STATEMENT: Procedure code 99213 is inconsistent with the submitted diagnosis code. The level of service billed does not match the documentation provided for the stated diagnosis.\n\nPROCEDURE: 99213 — Office visit, established patient, level 3\nDIAGNOSIS: K21.0 — Gastro-esophageal reflux disease with esophagitis\nAMOUNT DENIED: $156.00\n\nAPPEAL RIGHTS: You have the right to appeal this denial within 90 days.\n\nSincerely,\nClaims Adjudication Department\nAetna`,
    },
  ];
}
