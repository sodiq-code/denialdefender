'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { CaseStateBadge, getStateIndex, CASE_STATE_ORDER } from '@/components/case-state-badge';
import { HitlGateCard, type HitlGate } from '@/components/hitl-gate-card';
import { DecisionTraceFeed, type DecisionTraceEvent } from '@/components/decision-trace-feed';
import { AppealWorkflowPanel } from '@/components/appeal-workflow-panel';
import { useTraceStream } from '@/hooks/useTraceStream';
import { toast } from 'sonner';
import {
  Shield,
  FileText,
  Activity,
  Clock,
  User,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  Play,
} from 'lucide-react';

interface Denial {
  id: string;
  payer: string;
  reason_code: string;
  category: string;
  denial_letter_text: string;
  deadline?: string | null;
  confidence?: number | null;
}

interface Outcome {
  id: string;
  verdict: string;
  level: string;
  recorded_at: string;
}

interface CaseData {
  id: string;
  patient_id: string;
  state: string;
  deadline?: string | null;
  persona?: string | null;
  created_at: string;
  updated_at: string;
  denial?: Denial | null;
  outcomes?: Outcome[];
  traces?: DecisionTraceEvent[];
  gates?: HitlGate[];
}

interface CaseDetailPanelProps {
  caseId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCaseUpdated?: () => void;
}

export function CaseDetailPanel({ caseId, open, onOpenChange, onCaseUpdated }: CaseDetailPanelProps) {
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [loading, setLoading] = useState(false);
  const { subscribeToCase, unsubscribeFromCase, traceEvents } = useTraceStream();

  // Fetch case data when opened
  useEffect(() => {
    if (!caseId || !open) return;

    const fetchCase = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/cases/${caseId}`);
        if (res.ok) {
          const data = await res.json();
          setCaseData(data.case);
        }
      } catch (err) {
        console.error('Failed to fetch case:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCase();
    subscribeToCase(caseId);

    return () => {
      unsubscribeFromCase(caseId);
    };
  }, [caseId, open, subscribeToCase, unsubscribeFromCase]);

  // Merge WebSocket trace events with API trace events
  const liveTraceEvents: DecisionTraceEvent[] = caseId && traceEvents[caseId]
    ? traceEvents[caseId].map((wsEvent) => ({
        id: wsEvent.trace_id,
        case_id: wsEvent.case_id,
        agent_name: wsEvent.rule_name ?? 'unknown',
        step: String(wsEvent.step),
        status: wsEvent.decision === 'approve' ? 'completed' : wsEvent.decision === 'deny' ? 'error' : 'started',
        details: JSON.stringify({ reason: wsEvent.reason, confidence: wsEvent.confidence }),
        timestamp: wsEvent.broadcast_at ?? wsEvent.timestamp,
      }))
    : [];

  const allTraces = [...(caseData?.traces ?? []), ...liveTraceEvents];

  // Gate action handlers
  const handleApproveGate = useCallback(async (gateId: string, note: string) => {
    if (!caseId) { toast.error('Cannot approve: no case ID'); return; }
    try {
      const res = await fetch(`/api/cases/${caseId}/gates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gate_number: caseData?.gates?.find((g) => g.id === gateId)?.gate_number, status: 'approved', reviewer_note: note }),
      });
      if (res.ok) {
        toast.success('Gate approved');
        onCaseUpdated?.();
        // Refresh case data
        const freshRes = await fetch(`/api/cases/${caseId}`);
        if (freshRes.ok) {
          const data = await freshRes.json();
          setCaseData(data.case);
        } else {
          toast.warning('Gate approved, but failed to refresh case data');
        }
      } else {
        toast.error('Failed to approve gate — server returned an error');
      }
    } catch (err) {
      toast.error(`Failed to approve gate: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [caseId, caseData, onCaseUpdated]);

  const handleRejectGate = useCallback(async (gateId: string, note: string) => {
    if (!caseId) { toast.error('Cannot reject: no case ID'); return; }
    try {
      const res = await fetch(`/api/cases/${caseId}/gates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gate_number: caseData?.gates?.find((g) => g.id === gateId)?.gate_number, status: 'rejected', reviewer_note: note }),
      });
      if (res.ok) {
        toast.success('Gate rejected');
        onCaseUpdated?.();
        const freshRes = await fetch(`/api/cases/${caseId}`);
        if (freshRes.ok) {
          const data = await freshRes.json();
          setCaseData(data.case);
        } else {
          toast.warning('Gate rejected, but failed to refresh case data');
        }
      } else {
        toast.error('Failed to reject gate — server returned an error');
      }
    } catch (err) {
      toast.error(`Failed to reject gate: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [caseId, caseData, onCaseUpdated]);

  const handleEditGate = useCallback(async (gateId: string, note: string) => {
    if (!caseId) { toast.error('Cannot edit: no case ID'); return; }
    try {
      const res = await fetch(`/api/cases/${caseId}/gates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gate_number: caseData?.gates?.find((g) => g.id === gateId)?.gate_number, status: 'edited', reviewer_note: note }),
      });
      if (res.ok) {
        toast.success('Gate note updated');
        const freshRes = await fetch(`/api/cases/${caseId}`);
        if (freshRes.ok) {
          const data = await freshRes.json();
          setCaseData(data.case);
        } else {
          toast.warning('Gate updated, but failed to refresh case data');
        }
      } else {
        toast.error('Failed to edit gate — server returned an error');
      }
    } catch (err) {
      toast.error(`Failed to edit gate: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [caseId, caseData]);

  const currentStateIdx = caseData ? getStateIndex(caseData.state) : -1;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg w-full overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Activity className="h-6 w-6 animate-pulse text-teal-500" />
          </div>
        )}

        {!loading && caseData && (
          <div className="space-y-6">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-emerald-600" />
                Case {caseData.id.slice(0, 12)}...
              </SheetTitle>
              <SheetDescription>
                Created {new Date(caseData.created_at).toLocaleString()}
              </SheetDescription>
            </SheetHeader>

            {/* State Badge & Run Appeal Button */}
            <div className="flex items-center gap-2 flex-wrap">
              <CaseStateBadge state={caseData.state} />
              <span className="text-xs text-muted-foreground">
                Updated: {new Date(caseData.updated_at).toLocaleString()}
              </span>
              {caseData.denial && (
                <Button
                  size="sm"
                  className="ml-auto gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs"
                  onClick={() => {
                    const panel = document.getElementById('appeal-workflow-section');
                    panel?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  <Play className="h-3 w-3" />
                  Run Appeal
                </Button>
              )}
            </div>

            {/* State Machine Timeline */}
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                State Machine
              </h4>
              <div className="flex items-center gap-1 overflow-x-auto pb-2">
                {CASE_STATE_ORDER.map((state, idx) => {
                  const isActive = idx === currentStateIdx;
                  const isPast = idx < currentStateIdx;
                  const isFuture = idx > currentStateIdx;

                  return (
                    <div key={state} className="flex items-center shrink-0">
                      <div
                        className={`w-2 h-2 rounded-full transition-all ${
                          isActive
                            ? 'bg-emerald-500 w-3 h-3 ring-2 ring-emerald-300'
                            : isPast
                              ? 'bg-emerald-400'
                              : isFuture
                                ? 'bg-gray-300 dark:bg-gray-600'
                                : ''
                        }`}
                        title={state}
                      />
                      {idx < CASE_STATE_ORDER.length - 1 && (
                        <ChevronRight className="h-3 w-3 text-muted-foreground/50 mx-0.5" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Patient & Persona Info */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Case Info
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Patient:</span>
                  <span className="font-mono text-xs">{caseData.patient_id.slice(0, 16)}...</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Persona:</span>
                  <span className="text-xs">{caseData.persona ?? '—'}</span>
                </div>
                {caseData.deadline && (
                  <div className="flex items-center gap-1.5 col-span-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Deadline:</span>
                    <span className="text-xs">{new Date(caseData.deadline).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Denial Information */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <XCircle className="h-3.5 w-3.5 text-red-500" />
                Denial Information
              </h4>
              {caseData.denial ? (
                <div className="space-y-2 text-sm bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Payer:</span>
                    <span className="font-medium">{caseData.denial.payer}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Reason Code:</span>
                    <Badge variant="destructive" className="text-xs">{caseData.denial.reason_code}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Category:</span>
                    <Badge variant="outline" className="text-xs">{caseData.denial.category}</Badge>
                  </div>
                  {caseData.denial.confidence !== null && caseData.denial.confidence !== undefined && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Confidence:</span>
                      <span className="font-mono">{(caseData.denial.confidence * 100).toFixed(1)}%</span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground line-clamp-3 mt-1">
                    {caseData.denial.denial_letter_text.slice(0, 200)}...
                  </p>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground flex items-center gap-2 py-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  No denial information yet — add denial details to proceed
                </div>
              )}
            </div>

            <Separator />

            {/* Appeal Workflow Panel */}
            {caseData.denial && (
              <div id="appeal-workflow-section" className="space-y-2">
                <AppealWorkflowPanel
                  caseId={caseData.id}
                  caseState={caseData.state}
                  denial={{
                    payer: caseData.denial.payer,
                    reason_code: caseData.denial.reason_code,
                    category: caseData.denial.category,
                    denial_letter_text: caseData.denial.denial_letter_text,
                  }}
                  onWorkflowComplete={(newState) => {
                    // Refresh case data after workflow
                    if (caseId) {
                      fetch(`/api/cases/${caseId}`)
                        .then((res) => res.ok ? res.json() : null)
                        .then((data) => {
                          if (data?.case) setCaseData(data.case);
                        })
                        .catch(console.error);
                    }
                    onCaseUpdated?.();
                  }}
                />
              </div>
            )}

            <Separator />

            {/* HITL Gates */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-amber-500" />
                Human-in-the-Loop Gates
              </h4>
              {caseData.gates && caseData.gates.length > 0 ? (
                <div className="space-y-2">
                  {caseData.gates.map((gate) => (
                    <HitlGateCard
                      key={gate.id}
                      gate={gate}
                      onApprove={handleApproveGate}
                      onReject={handleRejectGate}
                      onEdit={handleEditGate}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-2">
                  No gates created yet — gates appear at HITL decision points
                </p>
              )}
            </div>

            <Separator />

            {/* Decision Trace */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-teal-500" />
                Decision Trace
                {liveTraceEvents.length > 0 && (
                  <Badge variant="outline" className="text-[10px] ml-1">
                    {liveTraceEvents.length} live
                  </Badge>
                )}
              </h4>
              <DecisionTraceFeed events={allTraces} />
            </div>

            <Separator />

            {/* Outcomes */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-emerald-500" />
                Outcomes
              </h4>
              {caseData.outcomes && caseData.outcomes.length > 0 ? (
                <div className="space-y-1">
                  {caseData.outcomes.map((outcome) => (
                    <div key={outcome.id} className="flex items-center gap-2 text-sm bg-muted/50 rounded p-2">
                      <Badge
                        className={
                          outcome.verdict === 'won'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                            : outcome.verdict === 'lost'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                        }
                      >
                        {outcome.verdict}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{outcome.level}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(outcome.recorded_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-2">No outcomes recorded yet</p>
              )}
            </div>
          </div>
        )}

        {!loading && !caseData && caseId && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mb-2" />
            <p className="text-sm">Case not found</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
