'use client';

import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Info, Bot } from 'lucide-react';

export interface DecisionTraceEvent {
  id: string;
  case_id: string;
  agent_name: string;
  step: string;
  status: 'started' | 'completed' | 'error' | 'blocked';
  details?: string | null;
  references?: string | null;
  timestamp: string;
}

interface DecisionTraceFeedProps {
  events: DecisionTraceEvent[];
  maxAutoScroll?: number;
}

const agentColors: Record<string, string> = {
  triage_agent: 'text-teal-600 dark:text-teal-400',
  evidence_agent: 'text-emerald-600 dark:text-emerald-400',
  drafter_agent: 'text-cyan-600 dark:text-cyan-400',
  quality_agent: 'text-purple-600 dark:text-purple-400',
  citation_agent: 'text-orange-600 dark:text-orange-400',
  orchestrator: 'text-rose-600 dark:text-rose-400',
  system: 'text-gray-600 dark:text-gray-400',
};

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case 'error':
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    case 'blocked':
      return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
    case 'started':
      return <Loader2 className="h-3.5 w-3.5 text-teal-500 animate-spin" />;
    default:
      return <Info className="h-3.5 w-3.5 text-gray-500" />;
  }
}

function formatAgentName(name: string): string {
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function parseJsonSafe(str: string | null | undefined): Record<string, unknown> | null {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

export function DecisionTraceFeed({ events, maxAutoScroll = 50 }: DecisionTraceFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (events.length > 0 && events.length <= maxAutoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events.length, maxAutoScroll]);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Bot className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">No trace events yet</p>
        <p className="text-xs">Events will appear here as agents process this case</p>
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-96 overflow-y-auto">
      <div className="space-y-2 pr-4">
        {events.map((event, idx) => {
          const details = parseJsonSafe(event.details);
          const agentColor = agentColors[event.agent_name] ?? 'text-gray-600 dark:text-gray-400';

          return (
            <div
              key={event.id ?? idx}
              className="flex items-start gap-2 rounded-lg border bg-card p-3 text-sm hover:bg-accent/50 transition-colors"
            >
              <div className="mt-0.5 shrink-0">
                <StatusIcon status={event.status} />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-medium text-xs ${agentColor}`}>
                    {formatAgentName(event.agent_name)}
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {event.step}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                {details && (
                  <p className="text-xs text-muted-foreground truncate">
                    {details.message
                      ? String(details.message)
                      : JSON.stringify(details).slice(0, 100)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
