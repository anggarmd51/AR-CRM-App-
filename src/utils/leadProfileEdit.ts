import type { Lead, LeadScore, WonDealArchiveRecord } from '../types/crm.ts';

export type LeadProfileEdit = Pick<Lead, 'contact_person' | 'phone' | 'deal_value' | 'lead_score'>;

export const LEAD_PROFILE_SCORES: readonly LeadScore[] = ['Hot', 'Warm', 'Cold', 'Unrated'];

export function normalizeLeadProfileEdit(input: unknown): LeadProfileEdit {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw Object.assign(new Error('Data profil lead tidak valid.'), { code: 'invalid-argument' });
  }
  const value = input as Record<string, unknown>;
  if (typeof value.contact_person !== 'string'
    || value.contact_person.trim().length === 0
    || value.contact_person.trim().length > 200) {
    throw Object.assign(new Error('Nama kontak wajib diisi dan maksimal 200 karakter.'), { code: 'invalid-argument' });
  }
  if (typeof value.phone !== 'string' || value.phone.trim().length > 200) {
    throw Object.assign(new Error('Nomor telepon harus berupa teks maksimal 200 karakter.'), { code: 'invalid-argument' });
  }
  if (typeof value.deal_value !== 'number' || !Number.isFinite(value.deal_value) || value.deal_value < 0) {
    throw Object.assign(new Error('Nilai deal harus berupa angka tidak negatif.'), { code: 'invalid-argument' });
  }
  if (typeof value.lead_score !== 'string' || !LEAD_PROFILE_SCORES.includes(value.lead_score as LeadScore)) {
    throw Object.assign(new Error('Skor lead tidak valid.'), { code: 'invalid-argument' });
  }

  // Copy only the four mutable profile fields. Never accept identity, stage,
  // follow-up, ownership, or timestamp data from the caller.
  return {
    contact_person: value.contact_person.trim(),
    phone: value.phone.trim(),
    deal_value: value.deal_value,
    lead_score: value.lead_score as LeadScore,
  };
}

export function leadProfileFrom(lead: Pick<Lead, 'contact_person' | 'phone' | 'deal_value' | 'lead_score'>): LeadProfileEdit {
  return {
    contact_person: lead.contact_person,
    phone: lead.phone,
    deal_value: lead.deal_value,
    lead_score: lead.lead_score,
  };
}

export async function submitLeadProfileEdit(
  leadId: string,
  input: unknown,
  save: (leadId: string, profile: LeadProfileEdit) => Promise<void>,
): Promise<LeadProfileEdit> {
  const profile = normalizeLeadProfileEdit(input);
  await save(leadId, profile);
  return profile;
}

type LeadProfileArchiveSnapshot = Pick<WonDealArchiveRecord,
  'lead_id' | 'company_name' | 'contact_person' | 'phone' | 'industry' | 'city' | 'deal_value'>;

type LeadProfileCurrentRecord = Pick<Lead,
  'id' | 'company_name' | 'contact_person' | 'phone' | 'industry' | 'city' | 'deal_value' | 'pipeline_stage'>;

function failedPrecondition(message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code: 'failed-precondition' });
}

/** Fail closed if a Won lead or an existing archive is inconsistent. */
export function assertLeadProfileEditAllowed(
  current: LeadProfileCurrentRecord,
  archive: LeadProfileArchiveSnapshot | null,
  edit: LeadProfileEdit,
): void {
  if (current.pipeline_stage !== 'Closing Won') {
    if (archive) throw failedPrecondition('Arsip lead tidak konsisten dengan stage saat ini; perubahan profil ditolak.');
    return;
  }

  if (!archive
    || archive.lead_id !== current.id
    || archive.company_name !== current.company_name
    || archive.contact_person !== current.contact_person
    || archive.phone !== current.phone
    || archive.industry !== current.industry
    || archive.city !== current.city
    || archive.deal_value !== current.deal_value) {
    throw failedPrecondition('Lead Closing Won tidak memiliki arsip yang cocok; perubahan profil ditolak.');
  }

  // lead_score is intentionally absent from the immutable archive snapshot;
  // the other three editable fields may not diverge from that snapshot.
  if (edit.contact_person !== archive.contact_person
    || edit.phone !== archive.phone
    || edit.deal_value !== archive.deal_value) {
    throw failedPrecondition('Kontak, telepon, dan nilai deal pada lead Closing Won terkunci oleh arsip transaksi.');
  }
}

export interface LeadProfileEditorState {
  editing: boolean;
  saving: boolean;
  draft: LeadProfileEdit;
  error: string | null;
}

export type LeadProfileEditorAction =
  | { type: 'reset' | 'begin'; profile: LeadProfileEdit }
  | { type: 'change'; field: 'contact_person' | 'phone'; value: string }
  | { type: 'change'; field: 'deal_value'; value: number }
  | { type: 'change'; field: 'lead_score'; value: LeadScore }
  | { type: 'cancel'; profile: LeadProfileEdit }
  | { type: 'save-start' }
  | { type: 'save-success'; profile: LeadProfileEdit }
  | { type: 'save-error'; message: string };

export function createLeadProfileEditorState(profile: LeadProfileEdit): LeadProfileEditorState {
  return { editing: false, saving: false, draft: { ...profile }, error: null };
}

export function leadProfileEditorReducer(
  state: LeadProfileEditorState,
  action: LeadProfileEditorAction,
): LeadProfileEditorState {
  switch (action.type) {
    case 'reset':
      return createLeadProfileEditorState(action.profile);
    case 'begin':
      return { editing: true, saving: false, draft: { ...action.profile }, error: null };
    case 'change':
      return { ...state, draft: { ...state.draft, [action.field]: action.value }, error: null };
    case 'cancel':
      return createLeadProfileEditorState(action.profile);
    case 'save-start':
      return { ...state, saving: true, error: null };
    case 'save-success':
      return createLeadProfileEditorState(action.profile);
    case 'save-error':
      return { ...state, saving: false, error: action.message };
  }
}
