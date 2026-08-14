'use client';

import { Badge } from '@/components/ui/badge';

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

const stateConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  created: { label: 'Created', variant: 'secondary', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-300 dark:border-gray-600' },
  triage_active: { label: 'Triage Active', variant: 'default', className: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200 border-teal-300 dark:border-teal-700' },
  triage_complete: { label: 'Triage Complete', variant: 'default', className: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200 border-teal-300 dark:border-teal-700' },
  hitl_gate_1: { label: 'Gate 1: Confirm Denial', variant: 'outline', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700' },
  evidence_active: { label: 'Evidence Active', variant: 'default', className: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200 border-teal-300 dark:border-teal-700' },
  drafting_active: { label: 'Drafting Active', variant: 'default', className: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200 border-teal-300 dark:border-teal-700' },
  quality_review: { label: 'Quality Review', variant: 'default', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 border-purple-300 dark:border-purple-700' },
  hitl_gate_2: { label: 'Gate 2: Approve Appeal', variant: 'outline', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700' },
  approved: { label: 'Approved', variant: 'default', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700' },
  submitted: { label: 'Submitted', variant: 'default', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700' },
  won: { label: 'Won', variant: 'default', className: 'bg-emerald-200 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100 border-emerald-400 dark:border-emerald-600' },
  lost: { label: 'Lost', variant: 'destructive', className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-300 dark:border-red-700' },
};

export function CaseStateBadge({ state, className }: CaseStateBadgeProps) {
  const config = stateConfig[state] ?? { label: state, variant: 'secondary' as const, className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' };

  return (
    <Badge
      variant={config.variant}
      className={`${config.className} font-medium ${className ?? ''}`}
    >
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
