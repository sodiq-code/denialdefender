'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useTraceStream, type TraceEvent } from '@/hooks/useTraceStream';
import { DecisionTraceFeed, type DecisionTraceEvent } from '@/components/decision-trace-feed';
import { HitlGateCard } from '@/components/hitl-gate-card';
import {
  Activity,
  Wifi,
  WifiOff,
  Trash2,
  Filter,
  Bot,
  Radio,
  Search,
} from 'lucide-react';

const decisionIcons: Record<string, React.ReactNode> = {
  approve: <span className="inline-block size-2 rounded-full bg-emerald-500" />,
  deny: <span className="inline-block size-2 rounded-full bg-red-500" />,
  escalate: <span className="inline-block size-2 rounded-full bg-amber-500" />,
  review: <span className="inline-block size-2 rounded-full bg-teal-500 animate-pulse" />,
  info: <span className="inline-block size-2 rounded-full bg-slate-400" />,
};

const decisionColors: Record<string, string> = {
  approve: 'bg-emerald-500',
  deny: 'bg-red-500',
  escalate: 'bg-amber-500',
  review: 'bg-teal-500',
  info: 'bg-slate-400',
};

export function TraceStreamTab() {
  const {
    connected,
    traceEvents,
    pendingGates,
    stateChanges,
    caseCreatedEvents,
    subscribedCases,
    error,
    clearTraceEvents,
    subscribeToCase,
    unsubscribeFromCase,
  } = useTraceStream();
  const [filterCaseId, setFilterCaseId] = useState('');
  const [subscribeInput, setSubscribeInput] = useState('');

  // Flatten all trace events across cases.
  const allEvents: (TraceEvent & { case_id: string })[] = useMemo(() => {
    const arr: (TraceEvent & { case_id: string })[] = [];
    for (const [caseId, events] of Object.entries(traceEvents)) {
      for (const event of events) {
        arr.push({ ...event, case_id: caseId });
      }
    }
    arr.sort(
      (a, b) =>
        new Date(b.broadcast_at ?? b.timestamp).getTime() -
        new Date(a.broadcast_at ?? a.timestamp).getTime(),
    );
    return arr;
  }, [traceEvents]);

  const filteredEvents = useMemo(() => {
    if (!filterCaseId.trim()) return allEvents;
    return allEvents.filter((e) =>
      e.case_id.toLowerCase().includes(filterCaseId.trim().toLowerCase()),
    );
  }, [allEvents, filterCaseId]);

  // Map to DecisionTraceEvent[] for the timeline feed.
  const feedEvents: DecisionTraceEvent[] = filteredEvents.map((e, idx) => ({
    id: `${e.trace_id}-${idx}`,
    case_id: e.case_id,
    agent_name: e.rule_name ?? 'unknown',
    step: String(e.step),
    status:
      e.decision === 'approve'
        ? 'completed'
        : e.decision === 'deny'
          ? 'error'
          : 'started',
    details: JSON.stringify({
      reason: e.reason,
      confidence: e.confidence,
      case_id: e.case_id,
    }),
    timestamp: e.broadcast_at ?? e.timestamp,
  }));

  // Collect pending gates for subscribed cases.
  const allPendingGates = useMemo(() => {
    const gates: Array<{
      caseId: string;
      gate: typeof pendingGates[string][number];
    }> = [];
    for (const [caseId, gateList] of Object.entries(pendingGates)) {
      for (const gate of gateList) {
        gates.push({ caseId, gate });
      }
    }
    return gates;
  }, [pendingGates]);

  // Most recent state-change events.
  const recentStateChanges = useMemo(() => {
    return Object.values(stateChanges)
      .sort(
        (a, b) =>
          new Date(b.broadcast_at ?? b.timestamp).getTime() -
          new Date(a.broadcast_at ?? a.timestamp).getTime(),
      )
      .slice(0, 6);
  }, [stateChanges]);

  // Recent case-created events.
  const recentCreated = useMemo(() => {
    return [...caseCreatedEvents]
      .sort(
        (a, b) =>
          new Date(b.broadcast_at ?? b.created_at).getTime() -
          new Date(a.broadcast_at ?? a.created_at).getTime(),
      )
      .slice(0, 6);
  }, [caseCreatedEvents]);

  const handleClear = () => {
    for (const caseId of subscribedCases) {
      clearTraceEvents(caseId);
    }
  };

  const handleSubscribe = () => {
    const id = subscribeInput.trim();
    if (!id) return;
    if (subscribedCases.includes(id)) {
      unsubscribeFromCase(id);
    } else {
      subscribeToCase(id);
    }
    setSubscribeInput('');
  };

  return (
    <section className="space-y-6" aria-label="Trace stream">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <Card className="card-premium">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <CardTitle className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Trace Stream
              </CardTitle>
              <div className="flex items-center gap-1.5">
                {connected ? (
                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200 gap-1">
                    <Wifi className="h-3 w-3" />
                    Connected
                  </Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-800 dark:bg-red-900/70 dark:text-red-200 gap-1">
                    <WifiOff className="h-3 w-3" />
                    Disconnected
                  </Badge>
                )}
                {error && (
                  <Badge variant="destructive" className="text-[10px]">
                    {error}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs gap-1">
                <Radio className="h-3 w-3" />
                {subscribedCases.length} subscribed
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {filteredEvents.length} events
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                className="gap-1.5 h-8"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </Button>
            </div>
          </div>
          <CardDescription className="text-xs">
            Real-time decision trace broadcast via Socket.io. Subscribe to a
            case to receive its trace events, gate transitions, and state
            changes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Subscribe-to-case input */}
          <div className="flex gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Input
                placeholder="Subscribe to case ID…"
                value={subscribeInput}
                onChange={(e) => setSubscribeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubscribe()}
                className="h-8 text-sm"
                aria-label="Subscribe to case ID"
              />
            </div>
            <Button
              size="sm"
              onClick={handleSubscribe}
              className="gap-1.5 h-8"
              disabled={!subscribeInput.trim()}
            >
              <Radio className="h-3 w-3" />
              {subscribedCases.includes(subscribeInput.trim())
                ? 'Unsubscribe'
                : 'Subscribe'}
            </Button>
          </div>
          {subscribedCases.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {subscribedCases.map((id) => (
                <Badge
                  key={id}
                  variant="outline"
                  className="text-[10px] gap-1 font-mono"
                >
                  <button
                    aria-label={`Unsubscribe from ${id}`}
                    onClick={() => unsubscribeFromCase(id)}
                    className="hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                  {id.slice(0, 12)}…
                </Badge>
              ))}
            </div>
          )}

          {/* Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Input
                placeholder="Filter by case ID…"
                value={filterCaseId}
                onChange={(e) => setFilterCaseId(e.target.value)}
                className="h-8 text-sm max-w-[260px]"
                aria-label="Filter by case ID"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Pending gates ────────────────────────────────────────── */}
      {allPendingGates.length > 0 && (
        <Card className="card-premium border-amber-300/70 dark:border-amber-700/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-amber-500" />
              Pending HITL gates
            </CardTitle>
            <CardDescription>
              Gates that are awaiting human resolution, streamed in real-time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {allPendingGates.map(({ caseId, gate }) => (
              <HitlGateCard
                key={gate.gate_id}
                gate={{
                  id: gate.gate_id,
                  case_id: caseId,
                  gate_number: gate.gate_type?.includes('gate_2') ? 2 : 1,
                  status: 'pending',
                  reviewer_note: null,
                  resolved_at: null,
                  created_at: gate.created_at,
                }}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Recent state changes ─────────────────────────────────── */}
      {recentStateChanges.length > 0 && (
        <Card className="card-premium">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              Recent state transitions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 max-h-48 overflow-y-auto scrollbar-premium">
              {recentStateChanges.map((s, idx) => (
                <motion.li
                  key={`${s.case_id}-${idx}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2 text-sm border-l-2 border-primary pl-2 py-1"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {s.case_id.slice(0, 12)}…
                  </span>
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {s.from_state.replace(/_/g, ' ')}
                  </Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge className="text-[10px] capitalize bg-primary/15 text-primary border-primary/30">
                    {s.to_state.replace(/_/g, ' ')}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {new Date(s.broadcast_at ?? s.timestamp).toLocaleTimeString()}
                  </span>
                </motion.li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ── Recent case creations ─────────────────────────────────── */}
      {recentCreated.length > 0 && (
        <Card className="card-premium">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              Recently created cases
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 max-h-48 overflow-y-auto scrollbar-premium">
              {recentCreated.map((c, idx) => (
                <motion.li
                  key={`${c.case_id}-${idx}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {c.case_id.slice(0, 12)}…
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {c.initial_state}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {new Date(c.broadcast_at ?? c.created_at).toLocaleTimeString()}
                  </span>
                </motion.li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ── Live trace feed ──────────────────────────────────────── */}
      <Card className="card-premium">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-teal-500" />
              Live decision trace
            </CardTitle>
            <div className="flex items-center gap-1.5">
              {filteredEvents.slice(0, 5).map((e, idx) => (
                <span
                  key={idx}
                  className={`inline-block size-2 rounded-full ${decisionColors[e.decision] ?? decisionColors.info}`}
                  title={`${e.rule_name}: ${e.decision}`}
                />
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {feedEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bot className="h-12 w-12 mb-3 opacity-40" />
              <h4 className="text-sm font-medium mb-1">
                {connected
                  ? 'Waiting for trace events…'
                  : 'Not connected to trace stream'}
              </h4>
              <p className="text-xs max-w-md text-center">
                {connected
                  ? 'Events will stream in real-time when agents process cases. Subscribe to a specific case above to receive its events.'
                  : 'Check that the trace-stream service is running on port 3003.'}
              </p>
            </div>
          ) : (
            <DecisionTraceFeed events={feedEvents} />
          )}
        </CardContent>
      </Card>

      {/* ── Decision legend ───────────────────────────────────────── */}
      <AnimatePresence>
        {feedEvents.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground"
          >
            <span>Legend:</span>
            {Object.entries(decisionIcons).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1.5 capitalize">
                {v}
                {k}
              </span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
