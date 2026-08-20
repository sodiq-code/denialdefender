'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { Skeleton } from '@/components/ui/skeleton';
import { CaseStateBadge, getStateIndex, CASE_STATE_ORDER } from '@/components/case-state-badge';
import { HitlGateCard, type HitlGate } from '@/components/hitl-gate-card';
import { DecisionTraceFeed, type DecisionTraceEvent } from '@/components/decision-trace-feed';
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

export function CaseDetailPanel({
  caseId,
  open,
  onOpenChange,
  onCaseUpdated,
}: CaseDetailPanelProps) {
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { subscribeToCase, unsubscribeFromCase, traceEvents } = useTraceStream();

  useEffect(() => {
    if (!caseId || !open) return;

    const fetchCase = async () => {
      setLoading(true);
      setFetchError(null);
      try {
        const res = await fetch(`/api/cases/${caseId}`);
        if (res.ok) {
          const data = await res.json();
          setCaseData(data.case);
        } else {
          setFetchError(`Server returned ${res.status}`);
        }
      } catch (err) {
        setFetchError(
          err instanceof Error ? err.message : 'Failed to load case data',
        );
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

  // Merge live WebSocket trace events with API trace events.
  const liveTraceEvents: DecisionTraceEvent[] =
    caseId && traceEvents[caseId]
      ? traceEvents[caseId].map((wsEvent) => ({
          id: wsEvent.trace_id,
          case_id: wsEvent.case_id,
          agent_name: wsEvent.rule_name ?? 'unknown',
          step: String(wsEvent.step),
          status:
            wsEvent.decision === 'approve'
              ? 'completed'
              : wsEvent.decision === 'deny'
                ? 'error'
                : 'started',
          details: JSON.stringify({
            reason: wsEvent.reason,
            confidence: wsEvent.confidence,
          }),
          timestamp: wsEvent.broadcast_at ?? wsEvent.timestamp,
        }))
      : [];

  const allTraces = [...(caseData?.traces ?? []), ...liveTraceEvents];

  const handleApproveGate = useCallback(
    async (gateId: string, note: string) => {
      if (!caseId) {
        toast.error('Cannot approve: no case ID');
        return;
      }
      try {
        const gate = caseData?.gates?.find((g) => g.id === gateId);
        const res = await fetch(`/api/cases/${caseId}/gates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gate_number: gate?.gate_number,
            status: 'approved',
            reviewer_note: note,
          }),
        });
        if (res.ok) {
          toast.success('Gate approved');
          onCaseUpdated?.();
          const freshRes = await fetch(`/api/cases/${caseId}`);
          if (freshRes.ok) {
            const data = await freshRes.json();
            setCaseData(data.case);
          }
        } else {
          toast.error('Failed to approve gate');
        }
      } catch (err) {
        toast.error(
          `Failed to approve gate: ${err instanceof Error ? err.message : 'Unknown error'}`,
        );
      }
    },
    [caseId, caseData, onCaseUpdated],
  );

  const handleRejectGate = useCallback(
    async (gateId: string, note: string) => {
      if (!caseId) {
        toast.error('Cannot reject: no case ID');
        return;
      }
      try {
        const gate = caseData?.gates?.find((g) => g.id === gateId);
        const res = await fetch(`/api/cases/${caseId}/gates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gate_number: gate?.gate_number,
            status: 'rejected',
            reviewer_note: note,
          }),
        });
        if (res.ok) {
          toast.success('Gate rejected');
          onCaseUpdated?.();
          const freshRes = await fetch(`/api/cases/${caseId}`);
          if (freshRes.ok) {
            const data = await freshRes.json();
            setCaseData(data.case);
          }
        } else {
          toast.error('Failed to reject gate');
        }
      } catch (err) {
        toast.error(
          `Failed to reject gate: ${err instanceof Error ? err.message : 'Unknown error'}`,
        );
      }
    },
    [caseId, caseData, onCaseUpdated],
  );

  const handleEditGate = useCallback(
    async (gateId: string, note: string) => {
      if (!caseId) {
        toast.error('Cannot edit: no case ID');
        return;
      }
      try {
        const gate = caseData?.gates?.find((g) => g.id === gateId);
        const res = await fetch(`/api/cases/${caseId}/gates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gate_number: gate?.gate_number,
            status: 'edited',
            reviewer_note: note,
          }),
        });
        if (res.ok) {
          toast.success('Gate note updated');
          const freshRes = await fetch(`/api/cases/${caseId}`);
          if (freshRes.ok) {
            const data = await freshRes.json();
            setCaseData(data.case);
          }
        } else {
          toast.error('Failed to edit gate');
        }
      } catch (err) {
        toast.error(
          `Failed to edit gate: ${err instanceof Error ? err.message : 'Unknown error'}`,
        );
      }
    },
    [caseId, caseData],
  );

  const currentStateIdx = caseData ? getStateIndex(caseData.state) : -1;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="sm:max-w-xl w-full overflow-y-auto scrollbar-premium p-0"
        aria-label="Case detail"
      >
        <AnimatePresence mode="wait">
          {loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-6 space-y-4"
            >
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-6 w-1/2" />
              <div className="flex items-center justify-center py-12">
                <Activity className="h-6 w-6 animate-pulse text-primary" />
              </div>
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </motion.div>
          )}

          {!loading && caseData && (
            <motion.div
              key="case"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6 p-6"
            >
              <SheetHeader className="space-y-2 -mx-6 px-6 pb-4 border-b border-border/60">
                <SheetTitle className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <span className="font-mono text-base">
                    {caseData.id.slice(0, 12)}…
                  </span>
                </SheetTitle>
                <SheetDescription>
                  Created {new Date(caseData.created_at).toLocaleString()}
                </SheetDescription>
              </SheetHeader>

              {/* State badge + run appeal */}
              <div className="flex items-center gap-2 flex-wrap">
                <CaseStateBadge state={caseData.state} />
                <span className="text-xs text-muted-foreground">
                  Updated {new Date(caseData.updated_at).toLocaleString()}
                </span>
                {caseData.denial && (
                  <Button
                    size="sm"
                    className="ml-auto gap-1.5 h-9"
                    onClick={() => {
                      const panel = document.getElementById('appeal-workflow-section');
                      panel?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    <Play className="h-3 w-3" />
                    Run appeal
                  </Button>
                )}
              </div>

              {/* State machine timeline */}
              <section className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  State machine
                </h4>
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-premium pb-2">
                  {CASE_STATE_ORDER.map((state, idx) => {
                    const isActive = idx === currentStateIdx;
                    const isPast = idx < currentStateIdx;
                    return (
                      <div
                        key={state}
                        className="flex items-center shrink-0"
                        title={state.replace(/_/g, ' ')}
                      >
                        <div
                          className={`rounded-full transition-all duration-300 ${
                            isActive
                              ? 'bg-primary h-3 w-3 ring-2 ring-primary/30 pulse-ring'
                              : isPast
                                ? 'bg-emerald-400 dark:bg-emerald-600 h-2 w-2'
                                : 'bg-muted-foreground/30 h-2 w-2'
                          }`}
                        />
                        {idx < CASE_STATE_ORDER.length - 1 && (
                          <ChevronRight className="h-3 w-3 text-muted-foreground/40 mx-0.5" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              <Separator />

              {/* Case info */}
              <section className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Case info
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground text-xs">Patient:</span>
                    <span className="font-mono text-xs truncate">
                      {caseData.patient_id.slice(0, 16)}…
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground text-xs">Persona:</span>
                    <span className="text-xs">{caseData.persona ?? '—'}</span>
                  </div>
                  {caseData.deadline && (
                    <div className="flex items-center gap-1.5 col-span-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground text-xs">Deadline:</span>
                      <span className="text-xs">
                        {new Date(caseData.deadline).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              <Separator />

              {/* Denial info */}
              <section className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                  Denial information
                </h4>
                {caseData.denial ? (
                  <div className="space-y-2 text-sm bg-red-50/50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">Payer:</span>
                      <span className="font-medium text-sm">
                        {caseData.denial.payer}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">Reason code:</span>
                      <Badge variant="destructive" className="text-[10px] font-mono">
                        {caseData.denial.reason_code}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">Category:</span>
                      <Badge variant="outline" className="text-[10px]">
                        {caseData.denial.category.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    {caseData.denial.confidence !== null &&
                      caseData.denial.confidence !== undefined && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-xs">
                            Confidence:
                          </span>
                          <span className="font-mono text-xs">
                            {(caseData.denial.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                      )}
                    <p className="text-xs text-muted-foreground line-clamp-3 mt-2 leading-relaxed">
                      {caseData.denial.denial_letter_text.slice(0, 240)}…
                    </p>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground flex items-center gap-2 py-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    No denial information yet — add denial details to proceed
                  </div>
                )}
              </section>

              <Separator />

              {/* HITL Gates */}
              <section className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-amber-500" />
                  Human-in-the-Loop Gates
                </h4>
                {caseData.gates && caseData.gates.length > 0 ? (
                  <div className="space-y-3">
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
              </section>

              <Separator />

              {/* Decision trace */}
              <section className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-teal-500" />
                  Decision trace
                  {liveTraceEvents.length > 0 && (
                    <Badge variant="outline" className="text-[10px] ml-1 gap-1">
                      <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {liveTraceEvents.length} live
                    </Badge>
                  )}
                </h4>
                <DecisionTraceFeed events={allTraces} />
              </section>

              <Separator />

              {/* Outcomes */}
              <section className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-emerald-500" />
                  Outcomes
                </h4>
                {caseData.outcomes && caseData.outcomes.length > 0 ? (
                  <div className="space-y-1.5">
                    {caseData.outcomes.map((outcome) => (
                      <div
                        key={outcome.id}
                        className="flex items-center gap-2 text-sm bg-muted/40 rounded-md p-2"
                      >
                        <Badge
                          className={
                            outcome.verdict === 'won'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200'
                              : outcome.verdict === 'lost'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/70 dark:text-red-200'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                          }
                        >
                          {outcome.verdict}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {outcome.level}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {new Date(outcome.recorded_at).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-2">
                    No outcomes recorded yet
                  </p>
                )}
              </section>
            </motion.div>
          )}

          {!loading && !caseData && caseId && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-12 text-muted-foreground p-6"
            >
              <AlertTriangle className="h-8 w-8 mb-2" />
              <p className="text-sm">
                {fetchError ? `Error: ${fetchError}` : 'Case not found'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </SheetContent>
    </Sheet>
  );
}
