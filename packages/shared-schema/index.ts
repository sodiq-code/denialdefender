/**
 * DenialDefender Shared Schema
 * TypeScript interfaces and Zod validation schemas matching the Prisma data model.
 */

import { z } from "zod";

// ============================================
// ENUMS
// ============================================

export const CaseStateEnum = z.enum([
  "created",
  "triage_active",
  "triage_complete",
  "hitl_gate_1",
  "evidence_active",
  "drafting_active",
  "quality_review",
  "hitl_gate_2",
  "approved",
  "submitted",
  "won",
  "lost",
]);
export type CaseState = z.infer<typeof CaseStateEnum>;

export const DenialCategoryEnum = z.enum([
  "medical_necessity",
  "coding",
  "prior_auth",
  "experimental",
  "out_of_network",
  "other",
]);
export type DenialCategory = z.infer<typeof DenialCategoryEnum>;

export const ProvenanceTierEnum = z.enum([
  "primary_source",
  "secondary_summary",
  "tertiary_commentary",
]);
export type ProvenanceTier = z.infer<typeof ProvenanceTierEnum>;

export const EvidenceStatusEnum = z.enum(["active", "superseded", "retired"]);
export type EvidenceStatus = z.infer<typeof EvidenceStatusEnum>;

export const CitationStatusEnum = z.enum([
  "verified",
  "unverified",
  "disputed",
  "unsupported",
]);
export type CitationStatus = z.infer<typeof CitationStatusEnum>;

export const OutcomeVerdictEnum = z.enum(["won", "lost", "partial", "pending"]);
export type OutcomeVerdict = z.infer<typeof OutcomeVerdictEnum>;

export const OutcomeLevelEnum = z.enum([
  "initial",
  "first_appeal",
  "second_appeal",
  "external_review",
]);
export type OutcomeLevel = z.infer<typeof OutcomeLevelEnum>;

export const TraceStatusEnum = z.enum(["started", "completed", "error", "blocked"]);
export type TraceStatus = z.infer<typeof TraceStatusEnum>;

export const HitlGateStatusEnum = z.enum([
  "pending",
  "approved",
  "rejected",
  "edited",
]);
export type HitlGateStatus = z.infer<typeof HitlGateStatusEnum>;

// ============================================
// INTERFACES
// ============================================

export interface Case {
  id: string;
  patient_id: string;
  state: CaseState;
  deadline: Date | null;
  persona: string | null;
  created_at: Date;
  updated_at: Date;
  denial?: Denial | null;
  outcomes?: Outcome[];
  traces?: DecisionTraceEvent[];
  gates?: HitlGate[];
}

export interface Denial {
  id: string;
  case_id: string;
  payer: string;
  reason_code: string;
  category: DenialCategory;
  denial_letter_text: string;
  deadline: Date | null;
  confidence: number | null;
  structured_json: string | null;
  created_at: Date;
}

export interface Evidence {
  id: string;
  source: string;
  document_name: string;
  section: string | null;
  effective_date: Date | null;
  content_hash: string | null;
  embedding: string | null;
  provenance_tier: ProvenanceTier;
  status: EvidenceStatus;
  retrieved_date: Date;
  content: string;
  created_at: Date;
  citations?: Citation[];
}

export interface Citation {
  id: string;
  evidence_id: string;
  span_start: number;
  span_end: number;
  claim_text: string;
  status: CitationStatus;
  created_at: Date;
}

export interface Outcome {
  id: string;
  case_id: string;
  verdict: OutcomeVerdict;
  level: OutcomeLevel;
  recorded_at: Date;
}

export interface DecisionTraceEvent {
  id: string;
  case_id: string;
  agent_name: string;
  step: string;
  status: TraceStatus;
  details: string | null;
  references: string | null;
  timestamp: Date;
}

export interface HitlGate {
  id: string;
  case_id: string;
  gate_number: number;
  status: HitlGateStatus;
  reviewer_note: string | null;
  resolved_at: Date | null;
  created_at: Date;
}

// ============================================
// ZOD SCHEMAS (for API validation)
// ============================================

export const CaseCreateSchema = z.object({
  patient_id: z.string().min(1, "patient_id is required"),
  deadline: z.string().datetime().optional().nullable(),
  persona: z.string().optional().nullable(),
});
export type CaseCreateInput = z.infer<typeof CaseCreateSchema>;

export const CaseUpdateSchema = z.object({
  state: CaseStateEnum.optional(),
  deadline: z.string().datetime().optional().nullable(),
  persona: z.string().optional().nullable(),
});
export type CaseUpdateInput = z.infer<typeof CaseUpdateSchema>;

export const DenialCreateSchema = z.object({
  payer: z.string().min(1, "payer is required"),
  reason_code: z.string().min(1, "reason_code is required"),
  category: DenialCategoryEnum,
  denial_letter_text: z.string().min(1, "denial_letter_text is required"),
  deadline: z.string().datetime().optional().nullable(),
  confidence: z.number().min(0).max(1).optional().nullable(),
  structured_json: z.record(z.unknown()).optional().nullable(),
});
export type DenialCreateInput = z.infer<typeof DenialCreateSchema>;

export const TraceEventCreateSchema = z.object({
  agent_name: z.string().min(1, "agent_name is required"),
  step: z.string().min(1, "step is required"),
  status: TraceStatusEnum.optional().default("started"),
  details: z.record(z.unknown()).optional().nullable(),
  references: z.record(z.unknown()).optional().nullable(),
});
export type TraceEventCreateInput = z.infer<typeof TraceEventCreateSchema>;

export const HitlGateCreateSchema = z.object({
  gate_number: z.union([z.literal(1), z.literal(2)]),
  status: HitlGateStatusEnum.optional().default("pending"),
  reviewer_note: z.string().optional().nullable(),
});
export type HitlGateCreateInput = z.infer<typeof HitlGateCreateSchema>;

export const HitlGateResolveSchema = z.object({
  gate_number: z.union([z.literal(1), z.literal(2)]),
  status: HitlGateStatusEnum,
  reviewer_note: z.string().optional().nullable(),
});
export type HitlGateResolveInput = z.infer<typeof HitlGateResolveSchema>;

export const EvidenceCreateSchema = z.object({
  source: z.string().min(1, "source is required"),
  document_name: z.string().min(1, "document_name is required"),
  section: z.string().optional().nullable(),
  effective_date: z.string().datetime().optional().nullable(),
  content_hash: z.string().optional().nullable(),
  embedding: z.string().optional().nullable(),
  provenance_tier: ProvenanceTierEnum.optional().default("primary_source"),
  status: EvidenceStatusEnum.optional().default("active"),
  content: z.string().min(1, "content is required"),
});
export type EvidenceCreateInput = z.infer<typeof EvidenceCreateSchema>;

export const CitationCreateSchema = z.object({
  evidence_id: z.string().min(1, "evidence_id is required"),
  span_start: z.number().int().min(0),
  span_end: z.number().int().min(0),
  claim_text: z.string().min(1, "claim_text is required"),
  status: CitationStatusEnum.optional().default("unverified"),
});
export type CitationCreateInput = z.infer<typeof CitationCreateSchema>;

export const OutcomeCreateSchema = z.object({
  verdict: OutcomeVerdictEnum,
  level: OutcomeLevelEnum.optional().default("initial"),
});
export type OutcomeCreateInput = z.infer<typeof OutcomeCreateSchema>;
