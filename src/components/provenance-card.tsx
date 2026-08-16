'use client';

/**
 * DenialDefender — Provenance Card Component
 * Day 2: Displays provenance information for a citation/evidence record.
 *
 * Shows: Source, Document, Section, Effective Date, Retrieved Date,
 * Provenance Tier, Content Hash, and Status with color coding.
 */

import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Calendar,
  Hash,
  ExternalLink,
  ShieldCheck,
  BookOpen,
  AlertTriangle,
} from 'lucide-react';

export interface ProvenanceData {
  id: string;
  source: string;
  document: string;
  section?: string;
  provenance: 'primary_source' | 'secondary_summary' | 'tertiary_commentary';
  contentHash?: string;
  effectiveDate?: string | null;
  retrievedDate?: string | null;
  url?: string;
  status?: string;
  contentPreview?: string;
}

const TIER_CONFIG = {
  primary_source: {
    label: 'Primary Source',
    color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    borderColor: 'border-emerald-300 dark:border-emerald-700',
    icon: ShieldCheck,
    description: 'Authoritative government/payer source',
  },
  secondary_summary: {
    label: 'Secondary Summary',
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    borderColor: 'border-amber-300 dark:border-amber-700',
    icon: BookOpen,
    description: 'Summary/analysis of primary data',
  },
  tertiary_commentary: {
    label: 'Tertiary Commentary',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
    borderColor: 'border-gray-300 dark:border-gray-700',
    icon: AlertTriangle,
    description: 'Commentary or unofficial source',
  },
};

export function ProvenanceCard({
  data,
  compact = false,
  onClick,
}: {
  data: ProvenanceData;
  compact?: boolean;
  onClick?: () => void;
}) {
  const tier = TIER_CONFIG[data.provenance] || TIER_CONFIG.tertiary_commentary;
  const TierIcon = tier.icon;

  const formatDate = (d: string | null | undefined) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch {
      return '—';
    }
  };

  return (
    <Card
      className={`border ${tier.borderColor} hover:shadow-md transition-shadow ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <CardContent className={compact ? 'p-3' : 'p-4'}>
        {/* Header: Tier badge + Source */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <TierIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{data.document}</p>
              {!compact && data.section && (
                <p className="text-xs text-muted-foreground truncate">{data.section}</p>
              )}
            </div>
          </div>
          <Badge className={`text-[10px] shrink-0 ${tier.color}`}>
            {tier.label}
          </Badge>
        </div>

        {/* Metadata Row */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-2">
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {data.source}
          </span>
          {data.effectiveDate && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Effective: {formatDate(data.effectiveDate)}
            </span>
          )}
          {data.retrievedDate && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Retrieved: {formatDate(data.retrievedDate)}
            </span>
          )}
        </div>

        {/* Content Preview */}
        {data.contentPreview && !compact && (
          <p className="text-xs text-muted-foreground line-clamp-3 mb-2">
            {data.contentPreview}
          </p>
        )}

        {/* Footer: Hash + Link */}
        <div className="flex items-center justify-between gap-2">
          {data.contentHash && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
              <Hash className="h-2.5 w-2.5" />
              {data.contentHash.slice(0, 12)}...
            </span>
          )}
          {data.url && (
            <a
              href={data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-teal-600 hover:text-teal-800 dark:text-teal-400"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-2.5 w-2.5" />
              Source
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Compact provenance badge for inline use in appeal letters
 */
export function ProvenanceBadge({ provenance }: { provenance: ProvenanceData['provenance'] }) {
  const tier = TIER_CONFIG[provenance] || TIER_CONFIG.tertiary_commentary;
  const TierIcon = tier.icon;

  return (
    <Badge className={`text-[10px] gap-1 ${tier.color}`}>
      <TierIcon className="h-2.5 w-2.5" />
      {tier.label}
    </Badge>
  );
}
