'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  FileText,
  Copy,
  Download,
  ChevronDown,
  ChevronRight,
  Quote,
  Type,
  Hash,
  ShieldCheck,
  BookOpen,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { ProvenanceCard, type ProvenanceData } from '@/components/provenance-card';

interface AppealSection {
  title: string;
  content: string;
}

interface CitationUsed {
  number: number;
  id: string;
  provenance_tier: string;
  short_ref: string;
}

interface AppealLetterViewerProps {
  letter: string;
  sections?: AppealSection[];
  wordCount?: number;
  tone?: string;
  citationsUsed?: CitationUsed[];
  /** Optional provenance records keyed by citation number for popovers. */
  provenanceRecords?: Record<number, ProvenanceData>;
}

const sectionLabels: Record<string, string> = {
  HEADER: 'Header',
  RE: 'Subject',
  INTRODUCTION: 'Introduction',
  DENIAL_SUMMARY: 'Denial Summary',
  CLINICAL_RATIONALE: 'Clinical Rationale',
  EVIDENCE_CITATIONS: 'Evidence & Citations',
  POLICY_ARGUMENTS: 'Policy Arguments',
  CONCLUSION: 'Conclusion',
  SIGNATURE: 'Signature',
};

// Map provenance tier strings → tier coloring for citation chips.
const tierColors: Record<string, string> = {
  TIER_1_SYSTEMATIC_REVIEW:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700',
  TIER_2_RCT:
    'bg-teal-100 text-teal-800 dark:bg-teal-900/70 dark:text-teal-200 border-teal-300 dark:border-teal-700',
  TIER_3_OBSERVATIONAL:
    'bg-teal-100 text-teal-800 dark:bg-teal-900/70 dark:text-teal-200 border-teal-300 dark:border-teal-700',
  TIER_4_GUIDELINE:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-200 border-amber-300 dark:border-amber-700',
  TIER_5_EXPERT_OPINION:
    'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700',
  primary_source:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700',
  secondary_summary:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-200 border-amber-300 dark:border-amber-700',
  tertiary_commentary:
    'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700',
};

function tierIcon(tier: string) {
  switch (tier) {
    case 'primary_source':
    case 'TIER_1_SYSTEMATIC_REVIEW':
    case 'TIER_2_RCT':
      return <ShieldCheck className="h-2.5 w-2.5" />;
    case 'secondary_summary':
    case 'TIER_4_GUIDELINE':
      return <BookOpen className="h-2.5 w-2.5" />;
    case 'tertiary_commentary':
    case 'TIER_5_EXPERT_OPINION':
      return <AlertTriangle className="h-2.5 w-2.5" />;
    default:
      return <Quote className="h-2.5 w-2.5" />;
  }
}

export function AppealLetterViewer({
  letter,
  sections,
  wordCount,
  tone,
  citationsUsed,
  provenanceRecords,
}: AppealLetterViewerProps) {
  const [expanded, setExpanded] = useState(true);
  const [showSections, setShowSections] = useState(false);
  const [activeCitation, setActiveCitation] = useState<number | null>(null);

  const computedWordCount = useMemo(() => {
    if (wordCount != null) return wordCount;
    if (!letter) return 0;
    return letter.trim().split(/\s+/).filter(Boolean).length;
  }, [wordCount, letter]);

  const citationCount = useMemo(() => {
    if (citationsUsed && citationsUsed.length > 0) return citationsUsed.length;
    const matches = letter?.match(/\[(\d+)\]/g) ?? [];
    return new Set(matches.map((m) => m.slice(1, -1))).size;
  }, [citationsUsed, letter]);

  // Split the letter into parts so [N] chips are clickable tokens.
  const letterParts = useMemo(() => {
    if (!letter) return [];
    return letter.split(/(\[\d+\])/);
  }, [letter]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(letter);
      toast.success('Appeal letter copied to clipboard');
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleDownload = () => {
    try {
      const blob = new Blob([letter], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `appeal-letter-${Date.now()}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Appeal letter downloaded');
    } catch {
      toast.error('Download failed');
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Appeal Letter</title>
            <style>
              body { font-family: Georgia, 'Times New Roman', serif; margin: 40px; line-height: 1.8; color: #1a1a1a; }
              pre { white-space: pre-wrap; font-family: Georgia, 'Times New Roman', serif; }
            </style>
          </head>
          <body><pre>${letter.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <Card className="card-premium border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Appeal Letter
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Evidence-grounded, citation-linked, ready to file.
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="text-[10px] gap-1">
              <Type className="h-2.5 w-2.5" />
              {computedWordCount} words
            </Badge>
            <Badge variant="outline" className="text-[10px] gap-1">
              <Hash className="h-2.5 w-2.5" />
              {citationCount} citations
            </Badge>
            {tone && (
              <Badge
                variant="outline"
                className="text-[10px] capitalize gap-1 border-primary/30 text-primary"
              >
                {tone}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="default"
            size="sm"
            onClick={handleCopy}
            className="gap-1.5 h-9"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="gap-1.5 h-9"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="gap-1.5 h-9"
            aria-label="Print appeal letter"
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="sr-only">Print</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSections(!showSections)}
            className="gap-1.5 h-9 ml-auto"
          >
            {showSections ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            {showSections ? 'Hide Sections' : 'Show Sections'}
          </Button>
        </div>

        {/* Citation chips list */}
        {citationsUsed && citationsUsed.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Citations used:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {citationsUsed.map((cite) => (
                <Popover key={cite.number}>
                  <PopoverTrigger asChild>
                    <button
                      aria-label={`Citation ${cite.number}`}
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors hover:scale-105 ${
                        tierColors[cite.provenance_tier] ??
                        'bg-muted text-muted-foreground border-border'
                      }`}
                    >
                      {tierIcon(cite.provenance_tier)}
                      [{cite.number}] {cite.short_ref}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-72 p-0 border-border/70"
                    align="start"
                  >
                    <div className="p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge className="text-[10px] gap-1">
                          [{cite.number}]
                        </Badge>
                        <span className="text-xs font-medium truncate">
                          {cite.short_ref}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-medium">Provenance tier:</span>{' '}
                        {cite.provenance_tier.replace(/_/g, ' ')}
                      </p>
                      {provenanceRecords?.[cite.number] && (
                        <ProvenanceCard
                          data={provenanceRecords[cite.number]}
                          compact
                        />
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              ))}
            </div>
          </div>
        )}

        {/* Sections breakdown */}
        {showSections && sections && sections.length > 0 && (
          <div className="space-y-2">
            <Separator />
            <p className="text-xs font-medium text-muted-foreground">
              Letter sections:
            </p>
            {sections.map((section, idx) => (
              <Collapsible key={idx}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left hover:bg-accent/50 rounded-md p-1.5 transition-colors">
                  <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0 transition-transform [[data-state=open]>&]:rotate-90" />
                  <span className="text-xs font-medium text-primary">
                    {sectionLabels[section.title] ?? section.title}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-5 pr-2 pt-1 pb-2">
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {section.content}
                  </p>
                </CollapsibleContent>
              </Collapsible>
            ))}
            <Separator />
          </div>
        )}

        {/* Letter body with inline citation chips */}
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleContent className="space-y-3 data-[state=closed]:hidden">
            <ScrollArea className="max-h-[520px] rounded-lg border border-border/70 bg-muted/20">
              <motion.pre
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="font-serif text-sm leading-relaxed text-foreground whitespace-pre-wrap p-6 m-0"
              >
                {letterParts.map((part, idx) => {
                  const citationMatch = part.match(/^\[(\d+)\]$/);
                  if (citationMatch) {
                    const num = parseInt(citationMatch[1], 10);
                    const cite = citationsUsed?.find(
                      (c) => c.number === num,
                    );
                    const tier = cite?.provenance_tier ?? '';
                    return (
                      <Popover
                        key={`cite-${idx}`}
                        open={activeCitation === num}
                        onOpenChange={(o) =>
                          setActiveCitation(o ? num : null)
                        }
                      >
                        <PopoverTrigger asChild>
                          <button
                            aria-label={`Inline citation ${num}`}
                            className={`inline-flex items-center justify-center px-1.5 py-0 mx-0.5 rounded text-xs font-bold transition-all hover:scale-110 ${
                              tierColors[tier] ??
                              'bg-primary/15 text-primary border border-primary/30'
                            }`}
                          >
                            [{num}]
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-72 p-0 border-border/70"
                          align="center"
                        >
                          <div className="p-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge className="text-[10px] gap-1">
                                [{num}]
                              </Badge>
                              <span className="text-xs font-medium truncate">
                                {cite?.short_ref ?? 'Citation'}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              <span className="font-medium">
                                Provenance tier:
                              </span>{' '}
                              {tier.replace(/_/g, ' ')}
                            </p>
                            {provenanceRecords?.[num] && (
                              <ProvenanceCard
                                data={provenanceRecords[num]}
                                compact
                              />
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    );
                  }
                  return <span key={`text-${idx}`}>{part}</span>;
                })}
              </motion.pre>
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
