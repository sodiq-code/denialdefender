'use client';

import { useState } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Loader2 } from 'lucide-react';
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

export function CaseCreateDialog({ onCaseCreated }: CaseCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [patientId, setPatientId] = useState('');
  const [persona, setPersona] = useState('general_appeal');
  const [deadline, setDeadline] = useState('');

  const handleSubmit = async () => {
    if (!patientId.trim()) {
      toast.error('Patient ID is required');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId.trim(),
          persona,
          deadline: deadline || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to create case');
      }

      const data = await res.json();
      toast.success('Case created successfully', {
        description: `Case ID: ${data.case.id.slice(0, 12)}...`,
      });

      // Emit placeholder trace event via API
      try {
        await fetch(`/api/cases/${data.case.id}/trace`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_name: 'system',
            step: 'case_created',
            status: 'completed',
            details: { message: 'Empty case created — awaiting denial input' },
          }),
        });
      } catch {
        // Non-blocking: trace event is optional
      }

      onCaseCreated?.(data.case);
      setOpen(false);
      setPatientId('');
      setPersona('general_appeal');
      setDeadline('');
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
        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
          <Plus className="h-4 w-4" />
          New Case
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Case</DialogTitle>
          <DialogDescription>
            Initialize a new denial appeal case. Start with an empty case and add denial details next.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="patient-id">Patient ID (hashed)</Label>
            <Input
              id="patient-id"
              placeholder="e.g., hash:a1b2c3d4..."
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Always use hashed patient identifiers — never raw PII
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="persona">Persona Type</Label>
            <Select value={persona} onValueChange={setPersona}>
              <SelectTrigger id="persona">
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
            <Label htmlFor="deadline">Appeal Deadline</Label>
            <Input
              id="deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !patientId.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Case'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
