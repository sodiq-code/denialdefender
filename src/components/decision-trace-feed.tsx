'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Info,
  Bot,
  Clock,
} from 'lucide-react';

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

// Emerald / teal / amber palette — no blue / indigo / sky.
const agentColors: Record<string, string> = {
  triage_agent: 'text-teal-600 dark:text-teal-400',
  evidence_agent: 'text-emerald-600 dark:text-emerald-400',
  drafter_agent: 'text-emerald-700 dark:text-emerald-300',
  drafting_agent: 'text-emerald-700 dark:text-emerald-300',
  quality_agent: 'text-emerald-700 dark:text-emerald-300',
  citation_agent: 'text-amber-600 dark:text-amber-400',
  orchestrator: 'text-amber-700 dark:text-amber-300',
  system: 'text-slate-600 dark:text-slate-400',
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
      return <Info className="h-3.5 w-3.5 text-slate-500" />;
  }
}

function formatAgentName(name: string): string {
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function parseJsonSafe(
  str: string | null | undefined,
): Record<string, unknown> | null {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

export function DecisionTraceFeed({
  events,
  maxAutoScroll = 50,
}: DecisionTraceFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (events.length > 0 && events.length <= maxAutoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [events.length, maxAutoScroll]);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Bot className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">No trace events yet</p>
        <p className="text-xs mt-1">
          Events will appear here as agents process this case
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="max-h-96 overflow-y-auto scrollbar-premium pr-2 relative"
      role="log"
      aria-live="polite"
      aria-label="Decision trace feed"
    >
      <ol className="space-y-2">
        <AnimatePresence initial={false}>
          {events.map((event, idx) => {
            const details = parseJsonSafe(event.details);
            const agentColor =
              agentColors[event.agent_name] ??
              'text-slate-600 dark:text-slate-400';

            return (
              <motion.li
                key={event.id ?? idx}
                initial={{ opacity: 0, y: 8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="relative flex items-start gap-3 rounded-lg border border-border/70 bg-card p-3 text-sm hover:bg-accent/40 transition-colors"
              >
                {/* Timeline dot + line */}
                <div className="relative flex flex-col items-center self-stretch">
                  <div className="mt-0.5 shrink-0">
                    <StatusIcon status={event.status} />
                  </div>
                  {idx < events.length - 1 && (
                    <div
                      className="absolute top-5 bottom-0 left-1/2 -translate-x-1/2 w-px bg-gradient-to-b from-border to-transparent"
                      aria-hidden
                    />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-medium text-xs ${agentColor}`}>
                      {formatAgentName(event.agent_name)}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 font-mono"
                    >
                      {event.step}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground ml-auto shrink-0 flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  {details && (
                    <p className="text-xs text-muted-foreground truncate">
                      {details.message
                        ? String(details.message)
                        : JSON.stringify(details).slice(0, 120)}
                    </p>
                  )}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
        <div ref={bottomRef} aria-hidden />
      </ol>
    </div>
  );
}
