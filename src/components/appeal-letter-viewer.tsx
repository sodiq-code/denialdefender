'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  FileText,
  Copy,
  Printer,
  ChevronDown,
  ChevronRight,
  CheckCheck,
  Quote,
} from 'lucide-react';
import { toast } from 'sonner';

interface AppealSection {
  title: string;
  content: string;
}

interface AppealLetterViewerProps {
  letter: string;
  sections?: AppealSection[];
  wordCount?: number;
  tone?: string;
  citationsUsed?: Array<{
    number: number;
    id: string;
    provenance_tier: string;
    short_ref: string;
  }>;
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

const tierColors: Record<string, string> = {
  TIER_1_SYSTEMATIC_REVIEW: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  TIER_2_RCT: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  TIER_3_OBSERVATIONAL: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  TIER_4_GUIDELINE: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  TIER_5_EXPERT_OPINION: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};

export function AppealLetterViewer({
  letter,
  sections,
  wordCount,
  tone,
  citationsUsed,
}: AppealLetterViewerProps) {
  const [expanded, setExpanded] = useState(false);
  const [showSections, setShowSections] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(letter);
      toast.success('Appeal letter copied to clipboard');
    } catch {
      toast.error('Failed to copy to clipboard');
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
    <Card className="border-emerald-200 dark:border-emerald-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-600" />
            Appeal Letter
          </CardTitle>
          <div className="flex items-center gap-2">
            {wordCount && (
              <Badge variant="outline" className="text-[10px]">
                {wordCount} words
              </Badge>
            )}
            {tone && (
              <Badge variant="outline" className="text-[10px] capitalize">
                {tone}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 text-xs">
            <Copy className="h-3 w-3" />
            Copy
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5 text-xs">
            <Printer className="h-3 w-3" />
            Print
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSections(!showSections)}
            className="gap-1.5 text-xs"
          >
            {showSections ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {showSections ? 'Hide Sections' : 'Show Sections'}
          </Button>
        </div>

        {/* Citations used */}
        {citationsUsed && citationsUsed.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Citations Used:</p>
            <div className="flex flex-wrap gap-1.5">
              {citationsUsed.map((cite) => (
                <Badge
                  key={cite.number}
                  variant="outline"
                  className={`text-[10px] gap-1 ${tierColors[cite.provenance_tier] ?? ''}`}
                >
                  <Quote className="h-2.5 w-2.5" />
                  [{cite.number}] {cite.short_ref}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Section breakdown */}
        {showSections && sections && sections.length > 0 && (
          <div className="space-y-2">
            <Separator />
            <p className="text-xs font-medium text-muted-foreground">Letter Sections:</p>
            {sections.map((section, idx) => (
              <Collapsible key={idx}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left hover:bg-accent/50 rounded p-1.5 transition-colors">
                  <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
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

        {/* Full letter view */}
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5 text-xs"
            >
              {expanded ? (
                <>
                  <ChevronDown className="h-3 w-3" />
                  Hide Full Letter
                </>
              ) : (
                <>
                  <ChevronRight className="h-3 w-3" />
                  View Full Letter
                </>
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <ScrollArea className="max-h-[500px]">
              <div className="bg-white dark:bg-gray-950 border rounded-lg p-6 shadow-inner">
                <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                  {letter}
                </pre>
              </div>
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
