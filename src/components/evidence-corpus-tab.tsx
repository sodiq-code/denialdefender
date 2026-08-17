'use client';

/**
 * DenialDefender — Evidence Corpus Tab
 * Day 2: Displays corpus statistics, evidence records, and provenance cards.
 * Allows searching the corpus and triggering ingest.
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProvenanceCard, ProvenanceBadge } from '@/components/provenance-card';
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
  Filter,
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
  provenance: 'primary_source' | 'secondary_summary' | 'tertiary_commentary';
  contentHash: string;
  effectiveDate: string | null;
  retrievedDate: string | null;
  contentPreview: string;
  status: string;
}

export function EvidenceCorpusTab() {
  const [stats, setStats] = useState<CorpusStats | null>(null);
  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [tierFilter, setTierFilter] = useState<string>('');
  const pageSize = 20;

  // Fetch corpus stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/evidence/corpus');
      if (res.ok) {
        const data = await res.json();
        setStats(data.corpus);
      }
    } catch {
      // ignore
    }
  }, []);

  // Fetch evidence records
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
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, tierFilter]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // Trigger ingest
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
      }
    } catch {
      // ignore
    } finally {
      setIngesting(false);
    }
  };

  // Search evidence
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/evidence/search?q=${encodeURIComponent(searchQuery)}&limit=30`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* ── Corpus Stats Header ────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Evidence Records</p>
                <p className="text-2xl font-bold">{stats?.totalRecords ?? '—'}</p>
              </div>
              <Database className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Hashed Records</p>
                <p className="text-2xl font-bold">{stats?.hashedRecords ?? '—'}</p>
              </div>
              <Hash className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Unique Documents</p>
                <p className="text-2xl font-bold">{stats?.uniqueDocuments ?? '—'}</p>
              </div>
              <BookOpen className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Quality Gate</p>
                <p className="text-2xl font-bold">
                  {stats ? (stats.gatePassed ? 'PASSED' : 'PENDING') : '—'}
                </p>
              </div>
              {stats?.gatePassed ? (
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-8 w-8 text-amber-500" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Gate Status Banner ──────────────────────────────────────── */}
      {stats && (
        <div className={`rounded-lg border p-4 ${stats.gatePassed
          ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/20'
          : 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/20'
        }`}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              {stats.gatePassed ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              )}
              <div>
                <p className="text-sm font-medium">
                  Quality Gate: {stats.gatePassed ? 'PASSED' : 'NOT YET PASSED'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Requirement: 100+ documents with hash + provenance; sample citation resolves to real document
                </p>
              </div>
            </div>
            <Button
              onClick={handleIngest}
              disabled={ingesting}
              size="sm"
              className="gap-1.5"
            >
              {ingesting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {ingesting ? 'Ingesting...' : 'Run Ingest'}
            </Button>
          </div>
          {ingestResult && (
            <div className="mt-3 text-xs text-muted-foreground">
              Ingested {ingestResult.totalRecords} records from {ingestResult.totalFiles} files
              in {(ingestResult.durationMs / 1000).toFixed(1)}s
              {ingestResult.errors.length > 0 && ` (${ingestResult.errors.length} errors)`}
            </div>
          )}
        </div>
      )}

      {/* ── Provenance Tier Breakdown ──────────────────────────────── */}
      {stats && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Provenance Tier Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-medium">Primary Source</span>
                </div>
                <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
                  {stats.byTier.primary_source}
                </p>
                <p className="text-xs text-muted-foreground">Authoritative government/payer</p>
              </div>

              <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-medium">Secondary Summary</span>
                </div>
                <p className="text-xl font-bold text-amber-700 dark:text-amber-300">
                  {stats.byTier.secondary_summary}
                </p>
                <p className="text-xs text-muted-foreground">Analysis of primary data</p>
              </div>

              <div className="rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-950/20 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-gray-600" />
                  <span className="text-sm font-medium">Tertiary Commentary</span>
                </div>
                <p className="text-xl font-bold text-gray-700 dark:text-gray-300">
                  {stats.byTier.tertiary_commentary}
                </p>
                <p className="text-xs text-muted-foreground">Unofficial/commentary</p>
              </div>
            </div>

            {/* Source breakdown */}
            {stats.bySource.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">Records by Source:</p>
                <div className="flex flex-wrap gap-2">
                  {stats.bySource.map(s => (
                    <Badge key={s.source} variant="outline" className="text-[10px] gap-1">
                      {s.source}: {s.count}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Search ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Search className="h-4 w-4" />
            Evidence Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search evidence corpus (e.g., 'medical necessity', 'CO16', 'prior auth')..."
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={loading} size="sm" className="gap-1.5">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Search
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
              <p className="text-xs text-muted-foreground">{searchResults.length} results</p>
              {searchResults.map((r) => (
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
                  }}
                  compact
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Evidence Records List ───────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileSearch className="h-4 w-4" />
              Evidence Records ({total})
            </CardTitle>
            <div className="flex items-center gap-2">
              <select
                value={tierFilter}
                onChange={(e) => { setTierFilter(e.target.value); setPage(1); }}
                className="text-xs border rounded-md px-2 py-1 bg-background"
              >
                <option value="">All Tiers</option>
                <option value="primary_source">Primary Source</option>
                <option value="secondary_summary">Secondary Summary</option>
                <option value="tertiary_commentary">Tertiary Commentary</option>
              </select>
              <Button onClick={() => { fetchRecords(); }} size="sm" variant="outline" className="h-7 w-7 p-0">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : records.length > 0 ? (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
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
            <div className="text-center py-8 text-sm text-muted-foreground">
              No evidence records found. Click &ldquo;Run Ingest&rdquo; to populate the corpus.
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-1">
                <Button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
