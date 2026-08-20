'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { CaseStateBadge } from '@/components/case-state-badge';
import { CaseCreateDialog } from '@/components/case-create-dialog';
import { CaseDetailPanel } from '@/components/case-detail-panel';
import { Skeleton } from '@/components/ui/skeleton';
import { useTraceStream } from '@/hooks/useTraceStream';
import {
  Clock,
  Building2,
  Hash,
  FileQuestion,
  TrendingUp,
  RefreshCw,
  Search,
  Shield,
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
  const [search, setSearch] = useState('');
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
      } else {
        toast.error('Failed to load cases — server returned an error');
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

  // Search / filter
  const filteredCases = useMemo(() => {
    if (!search.trim()) return cases;
    const q = search.trim().toLowerCase();
    return cases.filter(
      (c) =>
        c.id.toLowerCase().includes(q) ||
        c.patient_id.toLowerCase().includes(q) ||
        c.denial?.payer.toLowerCase().includes(q) ||
        c.denial?.reason_code.toLowerCase().includes(q) ||
        c.state.toLowerCase().includes(q),
    );
  }, [cases, search]);

  // Loading skeletons
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Skeleton className="h-8 w-32" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-11 w-28" />
          </div>
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
    <section className="space-y-4" aria-label="Cases dashboard">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Cases
          </h3>
          <Badge variant="secondary" className="text-xs">
            {cases.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search cases…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 text-sm w-48 sm:w-56"
              aria-label="Search cases"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCases}
            className="gap-1.5 h-9"
            aria-label="Refresh cases"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <CaseCreateDialog onCaseCreated={handleCaseCreated} />
        </div>
      </div>

      {filteredCases.length === 0 ? (
        <Card className="card-premium">
          <CardContent className="py-16 text-center">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <FileQuestion className="h-16 w-16 mb-4 opacity-40" />
              <h4 className="text-lg font-medium mb-1">
                {cases.length === 0
                  ? 'No cases yet'
                  : 'No cases match your search'}
              </h4>
              <p className="text-sm mb-4 max-w-sm">
                {cases.length === 0
                  ? 'Create your first case to start fighting denials with evidence-grounded appeals.'
                  : 'Try adjusting or clearing your search query.'}
              </p>
              {cases.length === 0 && (
                <CaseCreateDialog onCaseCreated={handleCaseCreated} />
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCases.map((c, idx) => {
            const deadlineDate = c.deadline ? new Date(c.deadline) : null;
            const isOverdue = deadlineDate && deadlineDate < new Date();
            const daysLeft = deadlineDate
              ? Math.ceil(
                  (deadlineDate.getTime() - Date.now()) /
                    (1000 * 60 * 60 * 24),
                )
              : null;

            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(idx * 0.04, 0.3) }}
                whileHover={{ y: -3 }}
              >
                <Card
                  role="button"
                  tabIndex={0}
                  onClick={() => handleCaseClick(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleCaseClick(c.id);
                    }
                  }}
                  className="card-premium cursor-pointer hover:border-primary/40 transition-all group h-full"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-mono flex items-center gap-1.5 min-w-0">
                        <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">
                          {c.id.slice(0, 12)}…
                        </span>
                      </span>
                      <CaseStateBadge state={c.state} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    {c.denial ? (
                      <div className="flex items-center gap-1.5 text-sm flex-wrap">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{c.denial.payer}</span>
                        <Badge variant="outline" className="text-[10px] ml-1 font-mono">
                          {c.denial.reason_code}
                        </Badge>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Shield className="h-3.5 w-3.5" />
                        <span>Awaiting denial input</span>
                      </div>
                    )}

                    {c.denial?.confidence !== null &&
                      c.denial?.confidence !== undefined && (
                        <div className="flex items-center gap-1.5 text-sm">
                          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-muted-foreground text-xs">
                            Confidence:
                          </span>
                          <span className="font-mono text-xs">
                            {(c.denial.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      )}

                    {deadlineDate && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <Clock
                          className={`h-3.5 w-3.5 ${
                            isOverdue ? 'text-red-500' : 'text-muted-foreground'
                          }`}
                        />
                        <span
                          className={
                            isOverdue
                              ? 'text-red-600 dark:text-red-400 font-medium text-xs'
                              : 'text-muted-foreground text-xs'
                          }
                        >
                          {isOverdue
                            ? 'Overdue'
                            : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`}
                        </span>
                      </div>
                    )}

                    <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
                      Created {new Date(c.created_at).toLocaleDateString()}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
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
    </section>
  );
}
