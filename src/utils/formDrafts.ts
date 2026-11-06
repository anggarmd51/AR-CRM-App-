import { PIPELINE_STAGES, type LeadScore, type PipelineStage } from '../types/crm.ts';
import type { ActivitySummarySource } from '../types/crm.ts';

export type FormDraftKind = 'quick_lead' | 'activity';

export interface FormDraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ScopedFormDraftWriter<T extends object> {
  readonly key: string | undefined;
  read(): T | null;
  schedule(draft: T): void;
  flush(): void;
  clear(): void;
  resume(): void;
  dispose(): void;
}

export interface QuickLeadFormDraft {
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  industry: string;
  city: string;
  pipelineStage: PipelineStage;
  dealValue: number;
  nextFollowupDate: string;
  leadScore: LeadScore;
  isVerified: boolean;
}

export interface ActivityFormDraft {
  selectedLeadId: string;
  activityType: string;
  notes: string;
  aiSummary: string;
  summarySource: ActivitySummarySource | null;
}

export const EMPTY_QUICK_LEAD_FORM_DRAFT: QuickLeadFormDraft = {
  companyName: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
  industry: '',
  city: '',
  pipelineStage: 'Prospect',
  dealValue: 0,
  nextFollowupDate: '',
  leadScore: 'Unrated',
  isVerified: false,
};

export const EMPTY_ACTIVITY_FORM_DRAFT: ActivityFormDraft = {
  selectedLeadId: '',
  activityType: 'Meeting Check-In',
  notes: '',
  aiSummary: '',
  summarySource: null,
};

const ACTIVITY_TYPES = ['Meeting Check-In', 'Phone Call', 'WhatsApp Message', 'Proposal Sent', 'Site Visit'] as const;
const LEAD_SCORES: readonly LeadScore[] = ['Hot', 'Warm', 'Cold', 'Unrated'];

function browserStorage(): FormDraftStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function buildScopedFormDraftKey(kind: FormDraftKind, workspace: string, ownerUid: string): string | undefined {
  const safeWorkspace = workspace.trim();
  const safeOwnerUid = ownerUid.trim();
  if (!safeWorkspace || !safeOwnerUid) return undefined;
  return `arcrm_draft_${kind}:v1:${encodeURIComponent(safeWorkspace)}:${encodeURIComponent(safeOwnerUid)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Drafts contain only form values and may include plaintext PII in same-origin
 * localStorage. Owner/workspace scoping isolates normal app reads but is not an
 * XSS boundary; never add credentials, tokens, PINs, or authorization data here.
 */
export function createScopedFormDraftWriter<T extends object>(
  kind: FormDraftKind,
  workspace: string,
  ownerUid: string,
  storage: FormDraftStorage | undefined = browserStorage(),
  delayMs = 300,
): ScopedFormDraftWriter<T> {
  const key = buildScopedFormDraftKey(kind, workspace, ownerUid);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingDraft: T | undefined;
  let hasPendingDraft = false;
  let paused = false;

  const cancelTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const flush = () => {
    cancelTimer();
    if (!hasPendingDraft) return;
    const draft = pendingDraft;
    pendingDraft = undefined;
    hasPendingDraft = false;
    if (paused || !storage || !key || !draft) return;
    try {
      storage.setItem(key, JSON.stringify({ version: 1, draft }));
    } catch {
      // Storage may be unavailable or full; keep the form usable in memory.
    }
  };

  return {
    key,
    read(): T | null {
      if (!storage || !key) return null;
      try {
        const raw = storage.getItem(key);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.draft)) return null;
        return parsed.draft as T;
      } catch {
        return null;
      }
    },
    schedule(draft) {
      if (paused || !storage || !key) return;
      pendingDraft = draft;
      hasPendingDraft = true;
      cancelTimer();
      timer = setTimeout(flush, Math.max(0, delayMs));
    },
    flush,
    clear() {
      cancelTimer();
      pendingDraft = undefined;
      hasPendingDraft = false;
      paused = true;
      if (!storage || !key) return;
      try {
        storage.removeItem(key);
      } catch {
        // Storage cleanup must not block the CRM form.
      }
    },
    resume() {
      paused = false;
    },
    dispose() {
      flush();
    },
  };
}

/** Save failures leave the draft untouched; only a fulfilled save clears it. */
export async function saveWithDraftCleanup<T, Draft extends object>(
  writer: ScopedFormDraftWriter<Draft>,
  save: () => Promise<T>,
): Promise<T> {
  const result = await save();
  writer.clear();
  return result;
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function safeString(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === 'string' && value.length <= maxLength ? value : fallback;
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isQuickLeadFormDraft(value: unknown): value is QuickLeadFormDraft {
  if (!isRecord(value)) return false;
  return typeof value.companyName === 'string'
    && typeof value.contactPerson === 'string'
    && typeof value.email === 'string'
    && typeof value.phone === 'string'
    && typeof value.address === 'string'
    && typeof value.industry === 'string'
    && typeof value.city === 'string'
    && PIPELINE_STAGES.includes(value.pipelineStage as PipelineStage)
    && typeof value.dealValue === 'number' && Number.isFinite(value.dealValue)
    && typeof value.nextFollowupDate === 'string'
    && LEAD_SCORES.includes(value.leadScore as LeadScore)
    && typeof value.isVerified === 'boolean';
}

export function isActivityFormDraft(value: unknown): value is ActivityFormDraft {
  if (!isRecord(value)) return false;
  return typeof value.selectedLeadId === 'string'
    && typeof value.activityType === 'string'
    && ACTIVITY_TYPES.includes(value.activityType as (typeof ACTIVITY_TYPES)[number])
    && typeof value.notes === 'string'
    && typeof value.aiSummary === 'string'
    && (value.summarySource === null || value.summarySource === 'local' || value.summarySource === 'gemini');
}

export function restoreQuickLeadFormDraft(value: unknown, initialCompanyName = ''): QuickLeadFormDraft {
  const draft = recordOrEmpty(value);
  const pipelineStage = PIPELINE_STAGES.includes(draft.pipelineStage as PipelineStage)
    ? draft.pipelineStage as PipelineStage
    : EMPTY_QUICK_LEAD_FORM_DRAFT.pipelineStage;
  const leadScore = LEAD_SCORES.includes(draft.leadScore as LeadScore)
    ? draft.leadScore as LeadScore
    : EMPTY_QUICK_LEAD_FORM_DRAFT.leadScore;
  const dateValue = safeString(draft.nextFollowupDate, '', 10);

  return {
    companyName: safeString(draft.companyName, initialCompanyName, 2_000),
    contactPerson: safeString(draft.contactPerson, '', 2_000),
    email: safeString(draft.email, '', 320),
    phone: safeString(draft.phone, '', 50),
    address: safeString(draft.address, '', 500),
    industry: safeString(draft.industry, '', 200),
    city: safeString(draft.city, '', 200),
    pipelineStage,
    dealValue: typeof draft.dealValue === 'number' && Number.isFinite(draft.dealValue)
      ? draft.dealValue
      : EMPTY_QUICK_LEAD_FORM_DRAFT.dealValue,
    nextFollowupDate: isCalendarDate(dateValue) ? dateValue : '',
    leadScore,
    isVerified: typeof draft.isVerified === 'boolean' ? draft.isVerified : false,
  };
}

export function restoreActivityFormDraft(value: unknown, initialLeadId = ''): ActivityFormDraft {
  const draft = recordOrEmpty(value);
  const activityType = typeof draft.activityType === 'string'
    && ACTIVITY_TYPES.includes(draft.activityType as (typeof ACTIVITY_TYPES)[number])
    ? draft.activityType
    : EMPTY_ACTIVITY_FORM_DRAFT.activityType;

  return {
    selectedLeadId: safeString(draft.selectedLeadId, initialLeadId, 256),
    activityType,
    notes: safeString(draft.notes, '', 12_000),
    aiSummary: safeString(draft.aiSummary, '', 4_000),
    summarySource: draft.summarySource === 'local' || draft.summarySource === 'gemini'
      ? draft.summarySource
      : null,
  };
}
