import type { PipelineStage } from '../types/crm.ts';

export const SALES_TEXT_LIMITS = {
  company_name: 200,
  contact_person: 200,
  industry: 120,
  city: 120,
} as const;

export interface CreateLeadInput {
  company_name: string;
  contact_person: string;
  phone: string;
  industry: string;
  city: string;
  pipeline_stage: PipelineStage;
  deal_value: number;
  next_followup_date: string;
  lead_score: 'Hot' | 'Warm' | 'Cold' | 'Unrated';
}

function boundedText(value: unknown, field: keyof typeof SALES_TEXT_LIMITS, required = false): string {
  if (typeof value !== 'string') throw new Error(`${field} must be text.`);
  const normalized = value.trim();
  if (normalized.length > SALES_TEXT_LIMITS[field] || (required && normalized.length === 0)) {
    throw new Error(`${field} must be ${required ? 'non-empty and ' : ''}at most ${SALES_TEXT_LIMITS[field]} characters.`);
  }
  return normalized;
}

export function assertSafeInitialLeadStage(stage: PipelineStage, code: 'invalid-argument' | 'failed-precondition' = 'invalid-argument'): void {
  if (stage === 'Closing Won') {
    throw Object.assign(new Error('Lead baru tidak dapat dibuat langsung sebagai Closing Won. Buat lead sebagai Prospect, lalu pindahkan ke Closing Won untuk membuat arsip.'), { code });
  }
}

/** Normalize only NEW input, never an already persisted/idempotent intent. */
export function normalizeCreateLeadPayload(input: CreateLeadInput): CreateLeadInput {
  assertSafeInitialLeadStage(input.pipeline_stage);
  return {
    ...input,
    company_name: boundedText(input.company_name, 'company_name', true),
    contact_person: boundedText(input.contact_person, 'contact_person', true),
    phone: typeof input.phone === 'string' ? input.phone.trim() : (() => { throw new Error('phone must be text.'); })(),
    industry: boundedText(input.industry, 'industry'),
    city: boundedText(input.city, 'city'),
  };
}

export function canTransitionFromAuthoritativeStage(current: PipelineStage, requested: PipelineStage): boolean {
  return current !== 'Closing Won' || requested === 'Closing Won';
}
