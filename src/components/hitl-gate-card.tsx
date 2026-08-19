'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Edit3,
  Clock,
  Save,
  X,
  ShieldCheck,
} from 'lucide-react';

export interface HitlGate {
  id: string;
  case_id: string;
  gate_number: number;
  status: 'pending' | 'approved' | 'rejected' | 'edited';
  reviewer_note?: string | null;
  resolved_at?: string | null;
  created_at: string;
}

interface HitlGateCardProps {
  gate: HitlGate;
  onApprove?: (gateId: string, note: string) => void;
  onReject?: (gateId: string, note: string) => void;
  onEdit?: (gateId: string, note: string) => void;
}

const gateLabels: Record<number, string> = {
  1: 'Gate 1 — Confirm Denial',
  2: 'Gate 2 — Approve Appeal',
};

export function HitlGateCard({
  gate,
  onApprove,
  onReject,
  onEdit,
}: HitlGateCardProps) {
  const [note, setNote] = useState(gate.reviewer_note ?? '');
  const [isEditing, setIsEditing] = useState(false);

  const isPending = gate.status === 'pending';
  const isApproved = gate.status === 'approved';
  const isRejected = gate.status === 'rejected';

  const statusIcon = () => {
    if (isPending)
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    if (isApproved)
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    if (isRejected) return <XCircle className="h-4 w-4 text-red-500" />;
    return <Edit3 className="h-4 w-4 text-emerald-500" />;
  };

  const statusBadge = () => {
    if (isPending)
      return (
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-200 border-amber-300 dark:border-amber-700">
          Pending Review
        </Badge>
      );
    if (isApproved)
      return (
        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700">
          Approved
        </Badge>
      );
    if (isRejected)
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/70 dark:text-red-200 border-red-300 dark:border-red-700">
          Rejected
        </Badge>
      );
    return (
      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700">
        Edited
      </Badge>
    );
  };

  const borderColor = isPending
    ? 'border-amber-300/70 dark:border-amber-700/70'
    : isApproved
      ? 'border-emerald-300/70 dark:border-emerald-700/70'
      : isRejected
        ? 'border-red-300/70 dark:border-red-700/70'
        : 'border-emerald-300/70 dark:border-emerald-700/70';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={`card-premium ${borderColor}`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              {statusIcon()}
              {gateLabels[gate.gate_number] ?? `Gate ${gate.gate_number}`}
            </CardTitle>
            {statusBadge()}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <Clock className="h-3 w-3" />
            <span>Created {new Date(gate.created_at).toLocaleString()}</span>
            {gate.resolved_at && (
              <span className="flex items-center gap-1 ml-2">
                <ShieldCheck className="h-3 w-3" />
                Resolved {new Date(gate.resolved_at).toLocaleString()}
              </span>
            )}
          </div>

          {(isPending || isEditing) && (
            <div className="space-y-2">
              <Textarea
                aria-label="Reviewer notes"
                placeholder="Reviewer notes…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="text-sm min-h-[60px] bg-background"
              />
              {isPending && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => onApprove?.(gate.id, note)}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 h-9"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => onReject?.(gate.id, note)}
                    className="gap-1.5 h-9"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                </div>
              )}
              {isEditing && !isPending && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      onEdit?.(gate.id, note);
                      setIsEditing(false);
                    }}
                    className="gap-1.5 h-9"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setNote(gate.reviewer_note ?? '');
                      setIsEditing(false);
                    }}
                    className="gap-1.5 h-9"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}

          {!isPending && !isEditing && gate.reviewer_note && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Reviewer note:
              </p>
              <p className="text-sm bg-muted/50 rounded-md p-2 italic">
                &ldquo;{gate.reviewer_note}&rdquo;
              </p>
            </div>
          )}

          {!isPending && !isEditing && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsEditing(true)}
              className="text-xs gap-1.5 h-8"
            >
              <Edit3 className="h-3 w-3" />
              Edit Note
            </Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
