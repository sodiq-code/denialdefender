'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { ProvenanceCard, type ProvenanceData } from '@/components/provenance-card';
import {
  FileSearch,
  Search,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Database,
  Hash,
  BookOpen,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  ShieldCheck,
} from 'lucide-react';

interface CorpusStats {
  totalRecords: number;
  hashedRecords: number;
  uniqueDocuments: number;
  byTier: {
    primary_source: number;
    secondary_summary: number;
    tertiary_commentary: number;
  };
  bySource: Array<{ source: string; count: number }>;
  gatePassed: boolean;
}

interface EvidenceRecord {
  id: string;
  source: string;
  document: string;
  section: string;
  provenance: ProvenanceData['provenance'];
  contentHash: string;
  effectiveDate: string | null;
  retrievedDate: string | null;
  contentPreview: string;
  status: string;
}

interface IngestResult {
  totalRecords: number;
  totalFiles: number;
  durationMs: number;
  errors: Array<unknown>;
}

export function EvidenceCorpusTab() {
  const [stats, setStats] = useState<CorpusStats | null>(null);
  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProvenanceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<IngestResult | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [tierFilter, setTierFilter] = useState<string>('');
  const pageSize = 20;

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch('/api/evidence/corpus');
      if (res.ok) {
        const data = await res.json();
        setStats(data.corpus);
      }
    } catch (err) {
      console.error('[EvidenceCorpus] Failed to fetch stats:', err);
      toast.error('Failed to load evidence corpus stats');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (tierFilter) params.set('tier', tierFilter);

      const res = await fetch(`/api/evidence?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('[EvidenceCorpus] Failed to fetch records:', err);
      toast.error('Failed to load evidence records');
    } finally {
      setLoading(false);
    }
  }, [page, tierFilter]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleIngest = async () => {
    setIngesting(true);
    setIngestResult(null);
    try {
      const res = await fetch('/api/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ingest' }),
      });
      if (res.ok) {
        const data = await res.json();
        setIngestResult(data.ingest);
        setStats(data.corpus);
        fetchRecords();
        toast.success('Evidence corpus ingested', {
          description: `${data.ingest.totalRecords} records from ${data.ingest.totalFiles} files`,
        });
      } else {
        toast.error('Ingest failed');
      }
    } catch (err) {
      console.error('[EvidenceCorpus] Ingest failed:', err);
      toast.error('Evidence ingest failed — check server logs');
    } finally {
      setIngesting(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/evidence/search?q=${encodeURIComponent(searchQuery)}&limit=30`,
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      } else {
        toast.error('Search failed');
      }
    } catch (err) {
      console.error('[EvidenceCorpus] Search failed:', err);
      toast.error('Evidence search failed');
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // ── Stats cards data ──
  const statCards = [
    {
      label: 'Total evidence records',
      value: stats?.totalRecords ?? '—',
      icon: Database,
      iconColor: 'text-primary',
    },
    {
      label: 'Hashed records',
      value: stats?.hashedRecords ?? '—',
      icon: Hash,
      iconColor: 'text-teal-500',
    },
    {
      label: 'Unique documents',
      value: stats?.uniqueDocuments ?? '—',
      icon: BookOpen,
      iconColor: 'text-emerald-500',
    },
    {
      label: 'Quality gate',
      value: stats ? (stats.gatePassed ? 'PASSED' : 'PENDING') : '—',
      icon: stats?.gatePassed ? CheckCircle2 : AlertTriangle,
      iconColor: stats?.gatePassed ? 'text-emerald-500' : 'text-amber-500',
    },
  ];

  return (
    <section className="space-y-6" aria-label="Evidence corpus">
      {/* ── Stats grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.06 }}
            >
              <Card className="card-premium h-full">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        {card.label}
                      </p>
                      <p className="text-2xl font-bold tracking-tight mt-1">
                        {card.value}
                      </p>
                    </div>
                    <Icon className={`h-8 w-8 shrink-0 ${card.iconColor} opacity-80`} />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* ── Gate status banner ── */}
      {stats && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <Card
            className={`card-premium border-2 ${
              stats.gatePassed
                ? 'border-emerald-300/70 dark:border-emerald-700/70 bg-emerald-50/30 dark:bg-emerald-950/10'
                : 'border-amber-300/70 dark:border-amber-700/70 bg-amber-50/30 dark:bg-amber-950/10'
            }`}
          >
            <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {stats.gatePassed ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    Quality gate: {stats.gatePassed ? 'PASSED' : 'NOT YET PASSED'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Requirement: 100+ documents with hash + provenance; sample
                    citation resolves to a real document.
                  </p>
                </div>
              </div>
              <Button
                onClick={handleIngest}
                disabled={ingesting}
                size="sm"
                className="gap-1.5 h-9"
              >
                {ingesting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {ingesting ? 'Ingesting…' : 'Run ingest'}
              </Button>
            </CardContent>
            {ingestResult && (
              <CardContent className="pt-0">
                <div className="mt-2 text-xs text-muted-foreground border-t border-border/50 pt-3">
                  Ingested <strong>{ingestResult.totalRecords}</strong> records
                  from <strong>{ingestResult.totalFiles}</strong> files in{' '}
                  <strong>{(ingestResult.durationMs / 1000).toFixed(1)}s</strong>
                  {ingestResult.errors.length > 0 &&
                    ` (${ingestResult.errors.length} errors)`}
                  .
                </div>
              </CardContent>
            )}
          </Card>
        </motion.div>
      )}

      {/* ── Provenance tier breakdown ── */}
      {stats && (
        <Card className="card-premium">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Provenance tier breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <TierCard
                title="Primary source"
                count={stats.byTier.primary_source}
                description="Authoritative government / payer"
                icon={ShieldCheck}
                color="emerald"
              />
              <TierCard
                title="Secondary summary"
                count={stats.byTier.secondary_summary}
                description="Analysis of primary data"
                icon={BookOpen}
                color="amber"
              />
              <TierCard
                title="Tertiary commentary"
                count={stats.byTier.tertiary_commentary}
                description="Unofficial / commentary"
                icon={AlertTriangle}
                color="slate"
              />
            </div>

            {stats.bySource.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                  Records by source:
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto scrollbar-premium">
                  {stats.bySource.map((s) => (
                    <Badge
                      key={s.source}
                      variant="outline"
                      className="text-[10px] gap-1"
                    >
                      <span className="truncate max-w-[160px]">{s.source}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="font-mono">{s.count}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Search ── */}
      <Card className="card-premium">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            Evidence search
          </CardTitle>
          <CardDescription className="text-xs">
            Semantic search across the corpus — try “medical necessity”, “CO16”,
            or “prior auth”.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search evidence corpus…"
              className="flex-1 h-9 min-w-[200px]"
              aria-label="Search evidence corpus"
            />
            <Button
              onClick={handleSearch}
              disabled={loading}
              size="sm"
              className="gap-1.5 h-9"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              Search
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-3 mt-3">
              <p className="text-xs text-muted-foreground">
                {searchResults.length} results
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-96 overflow-y-auto scrollbar-premium pr-1">
                {searchResults.map((r) => (
                  <ProvenanceCard key={r.id} data={r} compact />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Records list ── */}
      <Card className="card-premium">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileSearch className="h-4 w-4 text-primary" />
              Evidence records ({total})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select
                value={tierFilter}
                onValueChange={(v) => {
                  setTierFilter(v === 'all' ? '' : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 text-xs w-44">
                  <SelectValue placeholder="All tiers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tiers</SelectItem>
                  <SelectItem value="primary_source">Primary source</SelectItem>
                  <SelectItem value="secondary_summary">
                    Secondary summary
                  </SelectItem>
                  <SelectItem value="tertiary_commentary">
                    Tertiary commentary
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={() => fetchRecords()}
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0"
                aria-label="Refresh records"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-lg" />
              ))}
            </div>
          ) : records.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto scrollbar-premium pr-1">
              {records.map((r) => (
                <ProvenanceCard
                  key={r.id}
                  data={{
                    id: r.id,
                    source: r.source,
                    document: r.document,
                    section: r.section,
                    provenance: r.provenance,
                    contentHash: r.contentHash,
                    effectiveDate: r.effectiveDate,
                    retrievedDate: r.retrievedDate,
                    contentPreview: r.contentPreview,
                    status: r.status,
                  }}
                  compact
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-sm text-muted-foreground">
              <FileSearch className="h-10 w-10 mx-auto mb-3 opacity-40" />
              No evidence records found. Click <strong>Run ingest</strong> to
              populate the corpus.
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
              <p className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-1">
                <Button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

// ─── Helper: tier card ────────────────────────────────────────────────────

function TierCard({
  title,
  count,
  description,
  icon: Icon,
  color,
}: {
  title: string;
  count: number;
  description: string;
  icon: typeof ShieldCheck;
  color: 'emerald' | 'amber' | 'slate';
}) {
  const palette = {
    emerald: {
      border: 'border-emerald-300 dark:border-emerald-700',
      bg: 'bg-emerald-50/50 dark:bg-emerald-950/20',
      icon: 'text-emerald-600',
      value: 'text-emerald-700 dark:text-emerald-300',
    },
    amber: {
      border: 'border-amber-300 dark:border-amber-700',
      bg: 'bg-amber-50/50 dark:bg-amber-950/20',
      icon: 'text-amber-600',
      value: 'text-amber-700 dark:text-amber-300',
    },
    slate: {
      border: 'border-slate-300 dark:border-slate-700',
      bg: 'bg-slate-50/50 dark:bg-slate-950/20',
      icon: 'text-slate-600',
      value: 'text-slate-700 dark:text-slate-300',
    },
  }[color];

  return (
    <div
      className={`rounded-lg border ${palette.border} ${palette.bg} p-3 transition-colors`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${palette.icon}`} />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className={`text-2xl font-bold ${palette.value}`}>{count}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
    </div>
  );
}
