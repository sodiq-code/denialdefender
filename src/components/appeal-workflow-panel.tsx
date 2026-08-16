'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  AgentStepIndicator,
  WORKFLOW_AGENT_ORDER,
  formatAgentSummary,
  type AgentStepData,
  type AgentStepStatus,
} from '@/components/agent-step-indicator';
import { AppealLetterViewer } from '@/components/appeal-letter-viewer';
import {
  Play,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Shield,
  Activity,
  BookOpen,
  Target,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────

interface WorkflowResult {
  case_id: string;
  workflow_id: string;
  status: string;
  triage?: {
    classification: string;
    confidence: number;
    factors: string[];
    strategy: string;
    reasoning: string;
    appeal_urgency: string;
    estimated_success_rate: number;
  };
  coder?: {
    validation_result: string;
    coding_action_required: boolean;
    confidence: number;
  };
  policy?: {
    contradictions_found: Array<{
      id: string;
      type: string;
      strength: string;
      description: string;
      impact_on_appeal: string;
    }>;
    patient_meets_criteria: string;
    overall_policy_assessment: string;
  };
  evidence?: {
    evidence_items: Array<{
      id: string;
      title: string;
      source: string;
      provenance_tier: string;
      relevance_score: number;
      supports_appeal: boolean;
    }>;
    overall_evidence_strength: string;
    evidence_summary: string;
  };
  citation?: {
    verified_citations: Array<{
      number: number;
      formatted_citation: string;
      provenance_tier: string;
      combined_score: number;
    }>;
    overall_citation_quality: string;
  };
  draft?: {
    appeal_letter: string;
    sections: Array<{ title: string; content: string }>;
    citations_used: Array<{
      number: number;
      id: string;
      provenance_tier: string;
      short_ref: string;
    }>;
    word_count: number;
    tone: string;
    strengths: string[];
    potential_weaknesses: string[];
  };
  review?: {
    overall_verdict: string;
    overall_score: number;
    checks: Array<{
      category: string;
      status: string;
      score: number;
      details: string;
      severity: string;
    }>;
    recommendations: string[];
  };
  decision_traces: Array<{
    step: number;
    agent: string;
    timestamp: string;
    result_summary?: Record<string, unknown>;
    revision_loop?: number;
  }>;
  hitl_gate?: {
    gate_type: string;
    status: string;
    content: string;
  };
  workflow_stopped_at?: string;
  stop_reason?: string;
}

interface AppealWorkflowPanelProps {
  caseId: string;
  caseState: string;
  denial?: {
    payer: string;
    reason_code: string;
    category: string;
    denial_letter_text: string;
  } | null;
  onWorkflowComplete?: (newState: string) => void;
}

// ─── Component ────────────────────────────────────────────────────

export function AppealWorkflowPanel({
  caseId,
  caseState,
  denial,
  onWorkflowComplete,
}: AppealWorkflowPanelProps) {
  const [running, setRunning] = useState(false);
  const [workflowResult, setWorkflowResult] = useState<WorkflowResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [agentSteps, setAgentSteps] = useState<AgentStepData[]>(() =>
    WORKFLOW_AGENT_ORDER.map((agent, idx) => ({
      stepNumber: idx + 1,
      agentName: agent,
      status: 'pending' as AgentStepStatus,
    }))
  );

  // Determine if we can run the workflow
  const canRunWorkflow = !running && (
    caseState === 'created' ||
    caseState === 'triage_complete' ||
    caseState === 'hitl_gate_1' ||
    caseState === 'evidence_active' ||
    caseState === 'drafting_active' ||
    caseState === 'quality_review'
  );

  // Check if workflow has already been run (case is in later states)
  const workflowCompleted = caseState === 'hitl_gate_2' || caseState === 'approved' || caseState === 'submitted';

  const runWorkflow = useCallback(async () => {
    setRunning(true);
    setError(null);
    setCurrentStep(0);

    // Reset all steps to pending
    setAgentSteps(
      WORKFLOW_AGENT_ORDER.map((agent, idx) => ({
        stepNumber: idx + 1,
        agentName: agent,
        status: 'pending' as AgentStepStatus,
      }))
    );

    try {
      // Build the request body
      const requestBody: Record<string, unknown> = {
        case_id: caseId,
      };

      if (denial) {
        requestBody.denial = {
          denial_code: denial.reason_code,
          denial_reason: denial.category,
          carrier_name: denial.payer,
        };
      }

      // Simulate step-by-step progress by marking steps as running
      // while we wait for the actual API response
      const stepTimers: ReturnType<typeof setTimeout>[] = [];

      for (let i = 0; i < WORKFLOW_AGENT_ORDER.length; i++) {
        const timer = setTimeout(() => {
          setCurrentStep(i + 1);
          setAgentSteps(prev =>
            prev.map((step, idx) => ({
              ...step,
              status: idx === i ? 'running' as const : idx < i ? 'complete' as const : step.status,
            }))
          );
        }, (i + 1) * 400); // Stagger 400ms apart
        stepTimers.push(timer);
      }

      // Call the workflow API
      const res = await fetch('/api/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      // Clear all timers
      stepTimers.forEach(clearTimeout);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.details ?? errorData.error ?? `Workflow failed with status ${res.status}`);
      }

      const data = await res.json();
      const result: WorkflowResult = data.workflow;
      setWorkflowResult(result);

      // Update agent steps based on actual results
      if (result.decision_traces && result.decision_traces.length > 0) {
        setAgentSteps(prev =>
          prev.map((step) => {
            const trace = result.decision_traces.find(
              (t) => t.agent === step.agentName
            );
            if (trace) {
              return {
                ...step,
                status: 'complete' as const,
                resultSummary: formatAgentSummary(step.agentName, trace.result_summary as Record<string, unknown> | undefined),
              };
            }
            return step;
          })
        );
      } else {
        // Mark all as complete if no traces
        setAgentSteps(prev =>
          prev.map(step => ({
            ...step,
            status: 'complete' as const,
          }))
        );
      }

      setCurrentStep(WORKFLOW_AGENT_ORDER.length);
      toast.success('Appeal workflow completed successfully');
      onWorkflowComplete?.(data.new_state ?? 'hitl_gate_2');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      toast.error('Workflow failed: ' + message.slice(0, 80));

      // Mark current step as error
      setAgentSteps(prev =>
        prev.map((step, idx) => ({
          ...step,
          status: idx === currentStep - 1 ? 'error' as const : step.status,
        }))
      );
    } finally {
      setRunning(false);
    }
  }, [caseId, denial, currentStep, onWorkflowComplete]);

  const progressPercent = Math.round(
    (agentSteps.filter((s) => s.status === 'complete').length / agentSteps.length) * 100
  );

  return (
    <div className="space-y-4">
      {/* Workflow Header & Run Button */}
      <Card className="border-teal-200 dark:border-teal-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-teal-600" />
              Appeal Workflow
            </CardTitle>
            <div className="flex items-center gap-2">
              {running && (
                <Badge variant="outline" className="text-[10px] gap-1 border-teal-300 text-teal-600">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  Running
                </Badge>
              )}
              {workflowCompleted && !running && (
                <Badge className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                  Completed
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {canRunWorkflow && (
            <Button
              onClick={runWorkflow}
              disabled={running}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white gap-2"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running Appeal Workflow...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run Appeal Workflow
                </>
              )}
            </Button>
          )}

          {!canRunWorkflow && !workflowCompleted && !running && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
              <Clock className="h-4 w-4" />
              <span>Workflow cannot be run in the current state ({caseState.replace(/_/g, ' ')})</span>
            </div>
          )}

          {/* Progress bar */}
          {(running || progressPercent > 0) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Progress</span>
                <span>{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Workflow Error</p>
                <p className="text-xs mt-0.5">{error}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agent Steps */}
      {(running || progressPercent > 0) && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-teal-500" />
            Agent Steps
          </h4>
          <div className="space-y-2">
            {agentSteps.map((step) => (
              <AgentStepIndicator key={step.agentName} step={step} />
            ))}
          </div>
        </div>
      )}

      {/* Workflow Results */}
      {workflowResult && (
        <div className="space-y-4">
          <Separator />

          {/* Triage Classification */}
          {workflowResult.triage && (
            <Card className="border-teal-200 dark:border-teal-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4 text-teal-600" />
                  Triage Classification
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    className={
                      workflowResult.triage.classification === 'APPEALABLE'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                        : workflowResult.triage.classification === 'PARTIALLY_APPEALABLE'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                          : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    }
                  >
                    {workflowResult.triage.classification.replace(/_/g, ' ')}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {(workflowResult.triage.confidence * 100).toFixed(0)}% confidence
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Strategy: {workflowResult.triage.strategy.replace(/_/g, ' ')}
                  </Badge>
                </div>
                {workflowResult.triage.reasoning && (
                  <p className="text-xs text-muted-foreground line-clamp-3">
                    {workflowResult.triage.reasoning}
                  </p>
                )}
                {workflowResult.workflow_stopped_at && (
                  <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded p-2 mt-1">
                    <AlertTriangle className="h-3 w-3" />
                    <span>Workflow stopped at {workflowResult.workflow_stopped_at}: {workflowResult.stop_reason}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Evidence Summary */}
          {workflowResult.evidence && (
            <Card className="border-emerald-200 dark:border-emerald-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-emerald-600" />
                  Evidence Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {workflowResult.evidence.evidence_items.length} evidence items
                  </Badge>
                  <Badge
                    className={
                      workflowResult.evidence.overall_evidence_strength === 'strong'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                        : workflowResult.evidence.overall_evidence_strength === 'moderate'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                    }
                  >
                    Strength: {workflowResult.evidence.overall_evidence_strength}
                  </Badge>
                </div>
                {workflowResult.evidence.evidence_items.slice(0, 3).map((item) => (
                  <div key={item.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-medium text-foreground">{item.title}</span>
                      <span className="ml-1">({item.source})</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Policy Contradictions */}
          {workflowResult.policy && workflowResult.policy.contradictions_found.length > 0 && (
            <Card className="border-violet-200 dark:border-violet-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-violet-600" />
                  Policy Contradictions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {workflowResult.policy.contradictions_found.length} contradictions
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Criteria: {workflowResult.policy.patient_meets_criteria}
                  </Badge>
                </div>
                {workflowResult.policy.contradictions_found.map((c) => (
                  <div key={c.id} className="text-xs space-y-0.5 bg-muted/50 rounded p-2">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          c.strength === 'STRONG'
                            ? 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300'
                            : 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {c.strength}
                      </Badge>
                      <span className="font-medium">{c.type.replace(/_/g, ' ')}</span>
                    </div>
                    <p className="text-muted-foreground line-clamp-2">{c.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Quality Review Score */}
          {workflowResult.review && (
            <Card className="border-purple-200 dark:border-purple-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-purple-600" />
                  Quality Review
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    className={
                      workflowResult.review.overall_verdict === 'APPROVED'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                        : workflowResult.review.overall_verdict === 'NEEDS_REVISION'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                          : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    }
                  >
                    {workflowResult.review.overall_verdict.replace(/_/g, ' ')}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Score: {(workflowResult.review.overall_score * 100).toFixed(1)}%
                  </Badge>
                </div>
                {/* Quality checks breakdown */}
                <div className="grid grid-cols-2 gap-1.5">
                  {workflowResult.review.checks.map((check) => (
                    <div key={check.category} className="flex items-center gap-1.5 text-xs">
                      {check.status === 'pass' ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      ) : check.status === 'needs_improvement' ? (
                        <AlertTriangle className="h-3 w-3 text-amber-500" />
                      ) : (
                        <XCircle className="h-3 w-3 text-red-500" />
                      )}
                      <span className="text-muted-foreground">{check.category.replace(/_/g, ' ')}</span>
                      <span className="ml-auto font-mono text-[10px]">{(check.score * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Appeal Letter */}
          {workflowResult.draft && (
            <AppealLetterViewer
              letter={workflowResult.draft.appeal_letter}
              sections={workflowResult.draft.sections}
              wordCount={workflowResult.draft.word_count}
              tone={workflowResult.draft.tone}
              citationsUsed={workflowResult.draft.citations_used}
            />
          )}

          {/* HITL Gate */}
          {workflowResult.hitl_gate && (
            <Card className="border-amber-200 dark:border-amber-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-amber-600" />
                  {workflowResult.hitl_gate.gate_type === 'gate_1' ? 'Gate 1: Confirm Denial' : 'Gate 2: Approve Appeal'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">{workflowResult.hitl_gate.content}</p>
                <div className="flex items-center gap-2">
                  <Badge
                    className={
                      workflowResult.hitl_gate.status === 'pending_approval'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                    }
                  >
                    {workflowResult.hitl_gate.status.replace(/_/g, ' ')}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Use the HITL Gates section above to approve or reject
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
