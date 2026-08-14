'use client';

import { Badge } from '@/components/ui/badge';
import {
  Search,
  BookOpen,
  PenTool,
  CheckCircle2,
  Stethoscope,
  FileText,
  Paperclip,
  Target,
  Loader2,
  XCircle,
  Circle,
} from 'lucide-react';

export type AgentStepStatus = 'pending' | 'running' | 'complete' | 'error';

export interface AgentStepData {
  stepNumber: number;
  agentName: string;
  status: AgentStepStatus;
  resultSummary?: string;
}

interface AgentStepIndicatorProps {
  step: AgentStepData;
}

const agentConfig: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  triage: { icon: Search, label: 'Triage Agent', color: 'text-teal-600 dark:text-teal-400' },
  coder: { icon: Stethoscope, label: 'Medical Coder', color: 'text-cyan-600 dark:text-cyan-400' },
  policy: { icon: FileText, label: 'Policy Analyst', color: 'text-violet-600 dark:text-violet-400' },
  evidence: { icon: BookOpen, label: 'Evidence Agent', color: 'text-emerald-600 dark:text-emerald-400' },
  citation: { icon: Paperclip, label: 'Citation Agent', color: 'text-orange-600 dark:text-orange-400' },
  drafter: { icon: PenTool, label: 'Draft Agent', color: 'text-blue-600 dark:text-blue-400' },
  reviewer: { icon: CheckCircle2, label: 'Quality Review', color: 'text-purple-600 dark:text-purple-400' },
  orchestrator: { icon: Target, label: 'Orchestrator', color: 'text-rose-600 dark:text-rose-400' },
};

export function AgentStepIndicator({ step }: AgentStepIndicatorProps) {
  const config = agentConfig[step.agentName] ?? {
    icon: Circle,
    label: step.agentName,
    color: 'text-gray-600 dark:text-gray-400',
  };

  const Icon = config.icon;

  const statusStyles: Record<AgentStepStatus, { border: string; bg: string; icon: string }> = {
    pending: {
      border: 'border-gray-200 dark:border-gray-700',
      bg: 'bg-gray-50 dark:bg-gray-900/50',
      icon: 'text-gray-400',
    },
    running: {
      border: 'border-teal-300 dark:border-teal-700',
      bg: 'bg-teal-50 dark:bg-teal-950/30',
      icon: 'text-teal-500',
    },
    complete: {
      border: 'border-emerald-300 dark:border-emerald-700',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
      icon: 'text-emerald-500',
    },
    error: {
      border: 'border-red-300 dark:border-red-700',
      bg: 'bg-red-50 dark:bg-red-950/30',
      icon: 'text-red-500',
    },
  };

  const style = statusStyles[step.status];

  const statusIcon = () => {
    switch (step.status) {
      case 'pending':
        return <Circle className="h-4 w-4 text-gray-300 dark:text-gray-600" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-teal-500 animate-spin" />;
      case 'complete':
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  return (
    <div className={`flex items-center gap-3 rounded-lg border ${style.border} ${style.bg} p-3 transition-all duration-300`}>
      {/* Step number */}
      <div className="flex items-center justify-center h-7 w-7 rounded-full bg-muted text-xs font-bold text-muted-foreground shrink-0">
        {step.stepNumber}
      </div>

      {/* Agent icon */}
      <div className={`${style.icon} shrink-0`}>
        <Icon className="h-4 w-4" />
      </div>

      {/* Agent info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${config.color}`}>
            {config.label}
          </span>
          {step.status === 'running' && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-teal-300 text-teal-600 dark:border-teal-700 dark:text-teal-400">
              Running
            </Badge>
          )}
          {step.status === 'complete' && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-300 text-emerald-600 dark:border-emerald-700 dark:text-emerald-400">
              Done
            </Badge>
          )}
        </div>
        {step.resultSummary && step.status === 'complete' && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {step.resultSummary}
          </p>
        )}
      </div>

      {/* Status icon */}
      <div className="shrink-0">
        {statusIcon()}
      </div>
    </div>
  );
}

/** Get the ordered list of agent names for the workflow */
export const WORKFLOW_AGENT_ORDER = [
  'triage',
  'coder',
  'policy',
  'evidence',
  'citation',
  'drafter',
  'reviewer',
] as const;

/** Helper to format a result summary for each agent */
export function formatAgentSummary(agent: string, resultSummary: Record<string, unknown> | undefined): string {
  if (!resultSummary) return '';
  switch (agent) {
    case 'triage':
      return `${resultSummary.classification ?? 'N/A'} @ ${typeof resultSummary.confidence === 'number' ? (resultSummary.confidence * 100).toFixed(0) + '%' : 'N/A'} confidence`;
    case 'coder':
      return `${resultSummary.validation_result ?? 'N/A'}${resultSummary.coding_action_required ? ' — corrections available' : ''}`;
    case 'policy':
      return `${resultSummary.contradictions_count ?? 0} contradictions, meets criteria: ${resultSummary.patient_meets_criteria ?? 'N/A'}`;
    case 'evidence':
      return `${resultSummary.evidence_count ?? 0} items, strength: ${resultSummary.overall_strength ?? 'N/A'}`;
    case 'citation':
      return `${resultSummary.verified_count ?? 0} verified, quality: ${resultSummary.overall_quality ?? 'N/A'}`;
    case 'drafter':
      return `${resultSummary.word_count ?? 0} words, ${resultSummary.citations_count ?? 0} citations`;
    case 'reviewer':
      return `${resultSummary.verdict ?? 'N/A'} @ ${typeof resultSummary.score === 'number' ? (resultSummary.score * 100).toFixed(1) + '%' : 'N/A'}`;
    default:
      return JSON.stringify(resultSummary).slice(0, 80);
  }
}
