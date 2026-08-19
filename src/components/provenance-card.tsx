'use client';

import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
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

type TierKey = 'primary_source' | 'secondary_summary' | 'tertiary_commentary';

const TIER_CONFIG: Record<
  TierKey,
  {
    label: string;
    color: string;
    glow: string;
    ring: string;
    iconColor: string;
    icon: typeof ShieldCheck;
    description: string;
  }
> = {
  primary_source: {
    label: 'Primary Source',
    color:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200',
    glow: 'from-emerald-500/15 to-transparent',
    ring: 'ring-emerald-400/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    icon: ShieldCheck,
    description: 'Authoritative government / payer source',
  },
  secondary_summary: {
    label: 'Secondary Summary',
    color:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-200',
    glow: 'from-amber-500/15 to-transparent',
    ring: 'ring-amber-400/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
    icon: BookOpen,
    description: 'Summary / analysis of primary data',
  },
  tertiary_commentary: {
    label: 'Tertiary Commentary',
    color:
      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    glow: 'from-slate-500/15 to-transparent',
    ring: 'ring-slate-400/30',
    iconColor: 'text-slate-500 dark:text-slate-400',
    icon: AlertTriangle,
    description: 'Commentary or unofficial source',
  },
};

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function ProvenanceCard({
  data,
  compact = false,
  onClick,
}: {
  data: ProvenanceData;
  compact?: boolean;
  onClick?: () => void;
}) {
  const tierKey: TierKey =
    data.provenance in TIER_CONFIG
      ? (data.provenance as TierKey)
      : 'tertiary_commentary';
  const tier = TIER_CONFIG[tierKey];
  const TierIcon = tier.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      whileHover={onClick ? { y: -2 } : undefined}
      className="h-full"
    >
      <Card
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onClick?.();
                }
              }
            : undefined
        }
        className={`relative overflow-hidden bg-card border border-border/70 ring-1 ${tier.ring} hover:shadow-md transition-all duration-300 ${
          onClick ? 'cursor-pointer hover:border-primary/40' : ''
        }`}
      >
        {/* Subtle tier-colored top gradient */}
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b ${tier.glow}`}
          aria-hidden
        />
        <CardContent className={`relative ${compact ? 'p-3' : 'p-4'}`}>
          {/* Header: tier badge + source */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <TierIcon className={`h-4 w-4 shrink-0 ${tier.iconColor}`} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate leading-tight">
                  {data.document}
                </p>
                {!compact && data.section && (
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {data.section}
                  </p>
                )}
              </div>
            </div>
            <Badge className={`text-[10px] shrink-0 ${tier.color}`}>
              {tier.label}
            </Badge>
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground mb-2">
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {data.source}
            </span>
            {data.effectiveDate && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Effective {formatDate(data.effectiveDate)}
              </span>
            )}
            {data.retrievedDate && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Retrieved {formatDate(data.retrievedDate)}
              </span>
            )}
          </div>

          {/* Content preview */}
          {data.contentPreview && !compact && (
            <p className="text-xs text-muted-foreground line-clamp-3 mb-2 leading-relaxed">
              {data.contentPreview}
            </p>
          )}

          {/* Footer: hash + link */}
          <div className="flex items-center justify-between gap-2">
            {data.contentHash ? (
              <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                <Hash className="h-2.5 w-2.5" />
                {data.contentHash.slice(0, 12)}…
              </span>
            ) : (
              <span />
            )}
            {data.url && (
              <a
                href={data.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open source in new tab"
                className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-2.5 w-2.5" />
                Source
              </a>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/** Compact provenance badge for inline use in appeal letters */
export function ProvenanceBadge({
  provenance,
}: {
  provenance: ProvenanceData['provenance'];
}) {
  const tierKey: TierKey =
    provenance in TIER_CONFIG ? (provenance as TierKey) : 'tertiary_commentary';
  const tier = TIER_CONFIG[tierKey];
  const TierIcon = tier.icon;

  return (
    <Badge className={`text-[10px] gap-1 ${tier.color}`}>
      <TierIcon className="h-2.5 w-2.5" />
      {tier.label}
    </Badge>
  );
}
