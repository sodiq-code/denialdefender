'use client';

import { Badge } from '@/components/ui/badge';
import {
  Circle,
  Search,
  ShieldCheck,
  AlertTriangle,
  BookOpen,
  PenTool,
  Scale,
  CheckCircle2,
  Send,
  Trophy,
  XCircle,
  Clock,
} from 'lucide-react';
import type { ComponentType } from 'react';

export type CaseState =
  | 'created'
  | 'triage_active'
  | 'triage_complete'
  | 'hitl_gate_1'
  | 'evidence_active'
  | 'drafting_active'
  | 'quality_review'
  | 'hitl_gate_2'
  | 'approved'
  | 'submitted'
  | 'won'
  | 'lost';

interface CaseStateBadgeProps {
  state: CaseState | string;
  className?: string;
}

interface StateConfig {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon: ComponentType<{ className?: string }>;
  className: string;
}

const stateConfig: Record<string, StateConfig> = {
  created: {
    label: 'Created',
    variant: 'secondary',
    icon: Circle,
    className:
      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-600',
  },
  triage_active: {
    label: 'Triage Active',
    variant: 'default',
    icon: Search,
    className:
      'bg-teal-100 text-teal-800 dark:bg-teal-900/70 dark:text-teal-200 border-teal-300 dark:border-teal-700',
  },
  triage_complete: {
    label: 'Triage Complete',
    variant: 'default',
    icon: CheckCircle2,
    className:
      'bg-teal-100 text-teal-800 dark:bg-teal-900/70 dark:text-teal-200 border-teal-300 dark:border-teal-700',
  },
  hitl_gate_1: {
    label: 'Gate 1 — Confirm',
    variant: 'outline',
    icon: AlertTriangle,
    className:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-200 border-amber-300 dark:border-amber-700',
  },
  evidence_active: {
    label: 'Evidence Active',
    variant: 'default',
    icon: BookOpen,
    className:
      'bg-teal-100 text-teal-800 dark:bg-teal-900/70 dark:text-teal-200 border-teal-300 dark:border-teal-700',
  },
  drafting_active: {
    label: 'Drafting Active',
    variant: 'default',
    icon: PenTool,
    className:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700',
  },
  quality_review: {
    label: 'Quality Review',
    variant: 'default',
    icon: Scale,
    className:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700',
  },
  hitl_gate_2: {
    label: 'Gate 2 — Approve',
    variant: 'outline',
    icon: AlertTriangle,
    className:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-200 border-amber-300 dark:border-amber-700',
  },
  approved: {
    label: 'Approved',
    variant: 'default',
    icon: ShieldCheck,
    className:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700',
  },
  submitted: {
    label: 'Submitted',
    variant: 'default',
    icon: Send,
    className:
      'bg-emerald-200 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100 border-emerald-400 dark:border-emerald-600',
  },
  won: {
    label: 'Won',
    variant: 'default',
    icon: Trophy,
    className:
      'bg-emerald-200 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100 border-emerald-400 dark:border-emerald-600',
  },
  lost: {
    label: 'Lost',
    variant: 'destructive',
    icon: XCircle,
    className:
      'bg-red-100 text-red-800 dark:bg-red-900/70 dark:text-red-200 border-red-300 dark:border-red-700',
  },
};

export function CaseStateBadge({ state, className }: CaseStateBadgeProps) {
  const config =
    stateConfig[state] ?? {
      label: state.replace(/_/g, ' '),
      variant: 'secondary' as const,
      icon: Clock,
      className:
        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-600',
    };

  const Icon = config.icon;

  return (
    <Badge
      variant={config.variant}
      className={`gap-1 font-medium capitalize ${config.className} ${className ?? ''}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

/** All valid case states in order of the state machine */
export const CASE_STATE_ORDER: CaseState[] = [
  'created',
  'triage_active',
  'triage_complete',
  'hitl_gate_1',
  'evidence_active',
  'drafting_active',
  'quality_review',
  'hitl_gate_2',
  'approved',
  'submitted',
  'won',
  'lost',
];

/** Get the index of a state in the state machine order */
export function getStateIndex(state: string): number {
  return CASE_STATE_ORDER.indexOf(state as CaseState);
}
