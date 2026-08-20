'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

interface CaseCreateDialogProps {
  onCaseCreated?: (newCase: unknown) => void;
}

const PERSONA_OPTIONS = [
  { value: 'er_appeal', label: 'ER Appeal Specialist' },
  { value: 'surgery_appeal', label: 'Surgery Appeal Specialist' },
  { value: 'pharma_appeal', label: 'Pharma Appeal Specialist' },
  { value: 'mental_health_appeal', label: 'Mental Health Appeal Specialist' },
  { value: 'general_appeal', label: 'General Appeal Specialist' },
];

const PAYERS = [
  'Medicare',
  'UnitedHealthcare',
  'Aetna',
  'Cigna',
  'Humana',
  'Anthem',
  'Kaiser Permanente',
  'Medicaid',
];

const REASON_CODES = [
  'CO50 — Medical Necessity',
  'CO197 — Prior Authorization',
  'CO4 — Coding Inconsistency',
  'CO45 — Non-covered Service',
  'CO109 — Not Covered by Payer',
  'CO151 — Timely Filing',
];

export function CaseCreateDialog({ onCaseCreated }: CaseCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [patientId, setPatientId] = useState('');
  const [persona, setPersona] = useState('general_appeal');
  const [deadline, setDeadline] = useState('');
  const [payer, setPayer] = useState('Medicare');
  const [reasonCode, setReasonCode] = useState('CO50 — Medical Necessity');
  const [denialText, setDenialText] = useState('');

  const handleSubmit = async () => {
    if (!patientId.trim()) {
      toast.error('Patient ID is required');
      return;
    }
    setLoading(true);
    try {
      // 1. Create the case shell.
      const caseRes = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId.trim(),
          persona,
          deadline: deadline || null,
        }),
      });
      if (!caseRes.ok) {
        const err = await caseRes.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to create case');
      }
      const data = await caseRes.json();
      const caseId = data.case.id;

      // 2. Attach the denial (if provided).
      if (denialText.trim()) {
        try {
          await fetch(`/api/cases/${caseId}/denial`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              payer,
              reason_code: reasonCode.split(' — ')[0],
              category: reasonCode.split(' — ')[1] ?? 'medical_necessity',
              denial_letter_text: denialText.trim(),
            }),
          });
        } catch {
          // Non-blocking: case is created; denial can be added later.
        }
      }

      // 3. Emit a placeholder trace event for visibility.
      try {
        await fetch(`/api/cases/${caseId}/trace`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_name: 'system',
            step: 'case_created',
            status: 'completed',
            details: { message: 'Case created — denial attached' },
          }),
        });
      } catch {
        // Non-blocking: trace event is optional.
      }

      toast.success('Case created successfully', {
        description: `Case ID: ${caseId.slice(0, 12)}…`,
      });

      onCaseCreated?.(data.case);
      setOpen(false);
      setPatientId('');
      setPersona('general_appeal');
      setDeadline('');
      setPayer('Medicare');
      setReasonCode('CO50 — Medical Necessity');
      setDenialText('');
    } catch (err) {
      toast.error('Failed to create case', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 h-11 bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          New case
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Create new appeal case
          </DialogTitle>
          <DialogDescription>
            Initialize a new denial appeal case. Add the denial details now
            or paste them later from the case detail panel.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 max-h-[60vh] overflow-y-auto scrollbar-premium pr-1">
          <div className="grid gap-2">
            <Label htmlFor="patient-id">Patient ID (hashed)</Label>
            <Input
              id="patient-id"
              placeholder="e.g., hash:a1b2c3d4…"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Always use hashed patient identifiers — never raw PII.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="persona">Persona</Label>
              <Select value={persona} onValueChange={setPersona}>
                <SelectTrigger id="persona" className="h-10">
                  <SelectValue placeholder="Select persona" />
                </SelectTrigger>
                <SelectContent>
                  {PERSONA_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="deadline">Deadline</Label>
              <Input
                id="deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="h-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="payer">Payer</Label>
              <Select value={payer} onValueChange={setPayer}>
                <SelectTrigger id="payer" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYERS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reason-code">Reason code</Label>
              <Select
                value={reasonCode}
                onValueChange={setReasonCode}
              >
                <SelectTrigger id="reason-code" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REASON_CODES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="denial-text">Denial letter (optional)</Label>
            <Textarea
              id="denial-text"
              placeholder="Paste the denial letter text…"
              value={denialText}
              onChange={(e) => setDenialText(e.target.value)}
              className="min-h-[120px] text-sm font-mono"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={loading}
            className="h-10"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !patientId.trim()}
            className="gap-2 h-10"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Create case
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Keep motion import active for potential future use.
export const __motion = motion;
