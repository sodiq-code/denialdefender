'use client';

import { motion } from 'framer-motion';
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
  Heart,
  Database,
  Scale,
  Send,
  Trophy,
  GraduationCap,
} from 'lucide-react';
import type { ElementType, ComponentType } from 'react';

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

// Emerald / teal / amber palette — no blue / indigo / sky.
const agentConfig: Record<
  string,
  { icon: ElementType; label: string; color: string }
> = {
  triage: {
    icon: Search,
    label: 'Triage Agent',
    color: 'text-teal-600 dark:text-teal-400',
  },
  coder: {
    icon: Stethoscope,
    label: 'Medical Coder',
    color: 'text-emerald-600 dark:text-emerald-400',
  },
  policy: {
    icon: FileText,
    label: 'Policy Analyst',
    color: 'text-emerald-700 dark:text-emerald-300',
  },
  evidence: {
    icon: BookOpen,
    label: 'Evidence Agent',
    color: 'text-teal-700 dark:text-teal-300',
  },
  citation: {
    icon: Paperclip,
    label: 'Citation Agent',
    color: 'text-amber-600 dark:text-amber-400',
  },
  drafter: {
    icon: PenTool,
    label: 'Draft Agent',
    color: 'text-emerald-600 dark:text-emerald-400',
  },
  reviewer: {
    icon: CheckCircle2,
    label: 'Quality Review',
    color: 'text-emerald-700 dark:text-emerald-300',
  },
  orchestrator: {
    icon: Target,
    label: 'Orchestrator',
    color: 'text-amber-700 dark:text-amber-300',
  },
};

const statusStyles: Record<
  AgentStepStatus,
  { border: string; bg: string; icon: string }
> = {
  pending: {
    border: 'border-border/70',
    bg: 'bg-muted/30',
    icon: 'text-muted-foreground',
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

function StatusIcon({ status }: { status: AgentStepStatus }) {
  switch (status) {
    case 'pending':
      return <Circle className="h-4 w-4 text-muted-foreground/60" />;
    case 'running':
      return <Loader2 className="h-4 w-4 text-teal-500 animate-spin" />;
    case 'complete':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case 'error':
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Circle className="h-4 w-4 text-muted-foreground/60" />;
  }
}

export function AgentStepIndicator({ step }: AgentStepIndicatorProps) {
  const config = agentConfig[step.agentName] ?? {
    icon: Circle,
    label: step.agentName,
    color: 'text-slate-600 dark:text-slate-400',
  };

  const Icon = config.icon as ComponentType<{ className?: string }>;
  const style = statusStyles[step.status];

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`flex items-center gap-3 rounded-lg border ${style.border} ${style.bg} p-3 transition-all duration-300`}
    >
      {/* Step number */}
      <div className="flex items-center justify-center h-7 w-7 rounded-full bg-muted text-[11px] font-bold text-muted-foreground shrink-0">
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
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-teal-300 text-teal-700 dark:border-teal-700 dark:text-teal-300"
            >
              Running
            </Badge>
          )}
          {step.status === 'complete' && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300"
            >
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
        <StatusIcon status={step.status} />
      </div>
    </motion.div>
  );
}

/**
 * Horizontal 8-step pipeline progress (premium variant).
 * Triage → Ground → Assemble → Draft → Verify → Approve → Track → Learn.
 */
export interface PipelineStep {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  status: AgentStepStatus;
}

export const PIPELINE_STEPS: PipelineStep[] = [
  { id: 'triage', label: 'Triage', icon: Search, status: 'pending' },
  { id: 'ground', label: 'Ground', icon: BookOpen, status: 'pending' },
  {
    id: 'assemble',
    label: 'Assemble',
    icon: Database,
    status: 'pending',
  },
  { id: 'draft', label: 'Draft', icon: PenTool, status: 'pending' },
  { id: 'verify', label: 'Verify', icon: CheckCircle2, status: 'pending' },
  { id: 'approve', label: 'Approve', icon: Scale, status: 'pending' },
  { id: 'track', label: 'Track', icon: Send, status: 'pending' },
  {
    id: 'learn',
    label: 'Learn',
    icon: GraduationCap,
    status: 'pending',
  },
];

interface AgentPipelineProgressProps {
  currentStep: number;
  steps?: PipelineStep[];
}

export function AgentPipelineProgress({
  currentStep,
  steps = PIPELINE_STEPS,
}: AgentPipelineProgressProps) {
  return (
    <div
      className="flex items-center gap-1 w-full overflow-x-auto scrollbar-premium py-2"
      role="progressbar"
      aria-valuenow={currentStep}
      aria-valuemin={1}
      aria-valuemax={steps.length}
    >
      {steps.map((step, idx) => {
        const stepNum = idx + 1;
        const isCurrent = stepNum === currentStep;
        const isPast = stepNum < currentStep;
        const isFuture = stepNum > currentStep;
        const StepIcon = step.icon;
        const isActive = isPast || isCurrent;

        return (
          <div
            key={step.id}
            className="flex items-center shrink-0"
            aria-label={`Step ${stepNum}: ${step.label}`}
          >
            <motion.div
              initial={false}
              animate={{
                scale: isCurrent ? 1.08 : 1,
              }}
              transition={{ duration: 0.25 }}
              className={`relative flex flex-col items-center gap-1.5 ${
                isCurrent ? 'pulse-ring rounded-full' : ''
              }`}
            >
              <div
                className={`flex items-center justify-center h-10 w-10 rounded-full border-2 transition-all duration-300 ${
                  isCurrent
                    ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/30'
                    : isPast
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/70 dark:text-emerald-200 dark:border-emerald-700'
                      : 'bg-muted text-muted-foreground border-border'
                }`}
              >
                {isPast ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : isCurrent ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <StepIcon className="h-4 w-4" />
                )}
              </div>
              <span
                className={`text-[10px] font-medium whitespace-nowrap ${
                  isCurrent
                    ? 'text-primary'
                    : isPast
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-muted-foreground'
                }`}
              >
                {step.label}
              </span>
              {isFuture && (
                <span className="sr-only">upcoming</span>
              )}
            </motion.div>
            {idx < steps.length - 1 && (
              <div
                className={`h-0.5 w-6 sm:w-10 mx-1 transition-colors duration-300 ${
                  isActive && !isFuture
                    ? 'bg-emerald-400 dark:bg-emerald-600'
                    : 'bg-border'
                }`}
                aria-hidden
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Re-export the trophy & heart icons so callers can compose their own steps.
export const __icons = { Trophy, Heart, FileText };

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
export function formatAgentSummary(
  agent: string,
  resultSummary: Record<string, unknown> | undefined,
): string {
  if (!resultSummary) return '';
  switch (agent) {
    case 'triage':
      return `${resultSummary.classification ?? 'N/A'} @ ${
        typeof resultSummary.confidence === 'number'
          ? (resultSummary.confidence * 100).toFixed(0) + '%'
          : 'N/A'
      } confidence`;
    case 'coder':
      return `${resultSummary.validation_result ?? 'N/A'}${
        resultSummary.coding_action_required ? ' — corrections available' : ''
      }`;
    case 'policy':
      return `${resultSummary.contradictions_count ?? 0} contradictions, meets criteria: ${
        resultSummary.patient_meets_criteria ?? 'N/A'
      }`;
    case 'evidence':
      return `${resultSummary.evidence_count ?? 0} items, strength: ${
        resultSummary.overall_strength ?? 'N/A'
      }`;
    case 'citation':
      return `${resultSummary.verified_count ?? 0} verified, quality: ${
        resultSummary.overall_quality ?? 'N/A'
      }`;
    case 'drafter':
      return `${resultSummary.word_count ?? 0} words, ${
        resultSummary.citations_count ?? 0
      } citations`;
    case 'reviewer':
      return `${resultSummary.verdict ?? 'N/A'} @ ${
        typeof resultSummary.score === 'number'
          ? (resultSummary.score * 100).toFixed(1) + '%'
          : 'N/A'
      }`;
    default:
      return JSON.stringify(resultSummary).slice(0, 80);
  }
}
