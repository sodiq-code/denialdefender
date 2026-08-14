'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CaseStateBadge } from '@/components/case-state-badge';
import { CaseCreateDialog } from '@/components/case-create-dialog';
import { CaseDetailPanel } from '@/components/case-detail-panel';
import { Skeleton } from '@/components/ui/skeleton';
import { useTraceStream } from '@/hooks/useTraceStream';
import {
  Shield,
  Clock,
  Building2,
  Hash,
  FileQuestion,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

interface Denial {
  id: string;
  payer: string;
  reason_code: string;
  category: string;
  confidence?: number | null;
  deadline?: string | null;
}

interface CaseItem {
  id: string;
  patient_id: string;
  state: string;
  deadline?: string | null;
  persona?: string | null;
  created_at: string;
  updated_at: string;
  denial?: Denial | null;
}

interface CaseDashboardProps {
  onCaseCountChange?: (count: number) => void;
}

export function CaseDashboard({ onCaseCountChange }: CaseDashboardProps) {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { caseCreatedEvents } = useTraceStream();

  const fetchCases = async () => {
    try {
      const res = await fetch('/api/cases');
      if (res.ok) {
        const data = await res.json();
        setCases(data.cases);
        onCaseCountChange?.(data.cases.length);
      }
    } catch (err) {
      console.error('Failed to fetch cases:', err);
      toast.error('Failed to load cases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, []);

  // Refresh when a new case is created via WebSocket
  useEffect(() => {
    if (caseCreatedEvents.length > 0) {
      fetchCases();
    }
  }, [caseCreatedEvents.length]);

  const handleCaseCreated = () => {
    fetchCases();
  };

  const handleCaseClick = (caseId: string) => {
    setSelectedCaseId(caseId);
    setDetailOpen(true);
  };

  // Loading skeletons
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Cases</h3>
          <Badge variant="secondary" className="text-xs">
            {cases.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchCases} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <CaseCreateDialog onCaseCreated={handleCaseCreated} />
        </div>
      </div>

      {cases.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FileQuestion className="h-16 w-16 mb-4 opacity-30" />
          <h4 className="text-lg font-medium mb-1">No cases yet</h4>
          <p className="text-sm mb-4">Create your first case to start fighting denials</p>
          <CaseCreateDialog onCaseCreated={handleCaseCreated} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cases.map((c) => {
            const deadlineDate = c.deadline ? new Date(c.deadline) : null;
            const isOverdue = deadlineDate && deadlineDate < new Date();
            const daysLeft = deadlineDate
              ? Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              : null;

            return (
              <Card
                key={c.id}
                className="cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-700 transition-all hover:shadow-md group"
                onClick={() => handleCaseClick(c.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-mono flex items-center gap-1.5">
                      <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                      {c.id.slice(0, 12)}...
                    </CardTitle>
                    <CaseStateBadge state={c.state} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {c.denial && (
                    <div className="flex items-center gap-1.5 text-sm">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{c.denial.payer}</span>
                      <Badge variant="outline" className="text-[10px] ml-1">
                        {c.denial.category.replace('_', ' ')}
                      </Badge>
                    </div>
                  )}

                  {!c.denial && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Shield className="h-3.5 w-3.5" />
                      <span>Awaiting denial input</span>
                    </div>
                  )}

                  {c.denial?.confidence !== null && c.denial?.confidence !== undefined && (
                    <div className="flex items-center gap-1.5 text-sm">
                      <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Confidence:</span>
                      <span className="font-mono text-xs">
                        {(c.denial.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}

                  {deadlineDate && (
                    <div className="flex items-center gap-1.5 text-sm">
                      <Clock className={`h-3.5 w-3.5 ${isOverdue ? 'text-red-500' : 'text-muted-foreground'}`} />
                      <span className={isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                        {isOverdue
                          ? 'Overdue'
                          : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`}
                      </span>
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground pt-1">
                    Created {new Date(c.created_at).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CaseDetailPanel
        caseId={selectedCaseId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onCaseUpdated={fetchCases}
      />
    </div>
  );
}
