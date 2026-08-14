'use client';

import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useTraceStream, type TraceEvent } from '@/hooks/useTraceStream';
import {
  Activity,
  Wifi,
  WifiOff,
  Trash2,
  Filter,
  Bot,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Radio,
} from 'lucide-react';

const decisionIcons: Record<string, React.ReactNode> = {
  approve: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
  deny: <XCircle className="h-3.5 w-3.5 text-red-500" />,
  escalate: <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />,
  review: <Loader2 className="h-3.5 w-3.5 text-purple-500 animate-spin" />,
  info: <Activity className="h-3.5 w-3.5 text-teal-500" />,
};

const decisionColors: Record<string, string> = {
  approve: 'border-l-emerald-500',
  deny: 'border-l-red-500',
  escalate: 'border-l-amber-500',
  review: 'border-l-purple-500',
  info: 'border-l-teal-500',
};

export function TraceStreamTab() {
  const { connected, traceEvents, subscribedCases, error, clearTraceEvents } = useTraceStream();
  const [filterCaseId, setFilterCaseId] = useState('');
  const [isFiltering, setIsFiltering] = useState(false);

  // Flatten all trace events across cases
  const allEvents: (TraceEvent & { case_id: string })[] = [];
  for (const [caseId, events] of Object.entries(traceEvents)) {
    for (const event of events) {
      allEvents.push({ ...event, case_id: caseId });
    }
  }

  // Sort by timestamp descending
  allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Apply filter
  const filteredEvents = isFiltering && filterCaseId
    ? allEvents.filter((e) => e.case_id.includes(filterCaseId))
    : allEvents;

  const handleClear = () => {
    for (const caseId of subscribedCases) {
      clearTraceEvents(caseId);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with connection status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">Trace Stream</h3>
          <div className="flex items-center gap-1.5">
            {connected ? (
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <Wifi className="h-4 w-4" />
                <span className="text-xs font-medium">Connected</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                <WifiOff className="h-4 w-4" />
                <span className="text-xs font-medium">Disconnected</span>
              </div>
            )}
          </div>
          {error && (
            <Badge variant="destructive" className="text-[10px]">
              {error}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            <Radio className="h-3 w-3 mr-1" />
            {subscribedCases.length} subscribed
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {filteredEvents.length} events
          </Badge>
        </div>
      </div>

      {/* Filter controls */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 flex-1">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter by case ID..."
            value={filterCaseId}
            onChange={(e) => {
              setFilterCaseId(e.target.value);
              setIsFiltering(e.target.value.length > 0);
            }}
            className="h-8 text-sm max-w-[240px]"
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleClear} className="gap-1.5">
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </Button>
      </div>

      {/* Events feed */}
      {filteredEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Bot className="h-12 w-12 mb-3 opacity-30" />
          <h4 className="text-sm font-medium mb-1">
            {connected ? 'Waiting for trace events...' : 'Not connected to trace stream'}
          </h4>
          <p className="text-xs">
            {connected
              ? 'Events will stream in real-time when agents process cases'
              : 'Check that the trace stream service is running on port 3003'}
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-320px)]">
          <div className="space-y-2 pr-4">
            {filteredEvents.map((event, idx) => {
              const icon = decisionIcons[event.decision] ?? decisionIcons.info;
              const borderColor = decisionColors[event.decision] ?? decisionColors.info;

              return (
                <div
                  key={`${event.trace_id}-${idx}`}
                  className={`border-l-2 ${borderColor} rounded-r-lg bg-card p-3 hover:bg-accent/50 transition-colors`}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 shrink-0">{icon}</div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-xs text-teal-600 dark:text-teal-400">
                          {event.rule_name}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          Step {event.step}
                        </Badge>
                        <Badge
                          className={
                            event.decision === 'approve'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-[10px]'
                              : event.decision === 'deny'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 text-[10px]'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-[10px]'
                          }
                        >
                          {event.decision}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                          {new Date(event.broadcast_at ?? event.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {event.reason}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>Case: {event.case_id.slice(0, 12)}...</span>
                        <span>Confidence: {(event.confidence * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
