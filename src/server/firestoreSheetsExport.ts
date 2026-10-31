import { createPrivateKey } from 'node:crypto';
import { FIREBASE_RULES_OWNER_UID, FIREBASE_RULES_WORKSPACE_ID } from '../firebaseRulesBinding.ts';

export const FIRESTORE_EXPORT_ALLOWED_PROJECT_ID = 'ar-crm-73222';
export const FIRESTORE_EXPORT_HEADERS = [
  'source_key',
  'company_name',
  'pipeline_stage',
  'deal_value',
  'lead_score',
  'next_followup_date',
  'created_at',
  'updated_at',
] as const;

export type ExportCell = string | number;
export type ExportRow = ExportCell[];

export interface ExportTarget {
  projectId: string;
  workspaceId: string;
  ownerUid: string;
  spreadsheetId: string;
  sheetName: string;
}

export interface FirestoreExportConfig extends ExportTarget {
  cronSecret: string;
  serviceAccountEmail: string;
  serviceAccountPrivateKey: string;
}

export interface FirestoreLeadDocument {
  id: string;
  data: Record<string, unknown>;
}

export interface FirestoreReadAdapter {
  listOwnerLeads(target: Pick<ExportTarget, 'projectId' | 'workspaceId' | 'ownerUid'>): Promise<FirestoreLeadDocument[]>;
}

export interface SheetsUpsertAdapter {
  upsertRows(input: {
    spreadsheetId: string;
    sheetName: string;
    headers: readonly string[];
    rows: ExportRow[];
  }): Promise<{ inserted: number; updated: number }>;
}

export interface ExportAdapters {
  firestore: FirestoreReadAdapter;
  sheets: SheetsUpsertAdapter;
}

const ALLOWED_STAGES = new Set(['Prospect', 'Meeting', 'Negotiation', 'Closing Won', 'Closing Lost']);
const ALLOWED_SCORES = new Set(['Hot', 'Warm', 'Cold', 'Unrated']);
const SPREADSHEET_ID_PATTERN = /^[A-Za-z0-9_-]{20,200}$/;
const SERVICE_ACCOUNT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/i;
const SHEET_NAME_PATTERN = /^[^\u0000-\u001f\u007f:\\/?*\[\]]{1,100}$/;

function requiredEnv(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

export function validateExportTarget(target: ExportTarget): void {
  if (target.projectId !== FIRESTORE_EXPORT_ALLOWED_PROJECT_ID) {
    throw new Error('Firestore export project does not match the locally approved project.');
  }
  if (target.workspaceId !== FIREBASE_RULES_WORKSPACE_ID || target.ownerUid !== FIREBASE_RULES_OWNER_UID) {
    throw new Error('Firestore export owner/workspace does not match the local Firestore Rules binding.');
  }
  if (!SPREADSHEET_ID_PATTERN.test(target.spreadsheetId)) {
    throw new Error('Google Sheets spreadsheet ID is missing or invalid.');
  }
  if (!SHEET_NAME_PATTERN.test(target.sheetName) || target.sheetName.trim() !== target.sheetName) {
    throw new Error('Google Sheets tab name is missing or invalid.');
  }
}

export function loadFirestoreExportConfig(env: Record<string, string | undefined>): FirestoreExportConfig {
  const config: FirestoreExportConfig = {
    cronSecret: requiredEnv(env, 'CRON_SECRET'),
    projectId: requiredEnv(env, 'FIRESTORE_EXPORT_PROJECT_ID'),
    workspaceId: requiredEnv(env, 'FIRESTORE_EXPORT_WORKSPACE_ID'),
    ownerUid: requiredEnv(env, 'FIRESTORE_EXPORT_OWNER_UID'),
    spreadsheetId: requiredEnv(env, 'GOOGLE_SHEETS_SPREADSHEET_ID'),
    sheetName: requiredEnv(env, 'GOOGLE_SHEETS_TAB_NAME'),
    serviceAccountEmail: requiredEnv(env, 'GOOGLE_SERVICE_ACCOUNT_EMAIL'),
    serviceAccountPrivateKey: requiredEnv(env, 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n'),
  };

  if (config.cronSecret.length < 32) throw new Error('CRON_SECRET must contain at least 32 characters.');
  if (!SERVICE_ACCOUNT_EMAIL_PATTERN.test(config.serviceAccountEmail)) {
    throw new Error('Google service-account email is invalid.');
  }
  if (!config.serviceAccountPrivateKey.includes('-----BEGIN PRIVATE KEY-----') || !config.serviceAccountPrivateKey.includes('-----END PRIVATE KEY-----')) {
    throw new Error('Google service-account private key is missing or invalid.');
  }
  try {
    createPrivateKey(config.serviceAccountPrivateKey);
  } catch {
    throw new Error('Google service-account private key is not a valid PEM key.');
  }

  validateExportTarget(config);
  return config;
}

function requiredString(data: Record<string, unknown>, field: string, maxLength: number): string {
  const value = data[field];
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new Error(`Firestore lead has an invalid ${field} field.`);
  }
  return value;
}

function timestampToIso(value: unknown, field: string): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  if (value && typeof value === 'object') {
    const timestamp = value as { seconds?: unknown; nanoseconds?: unknown };
    const seconds = typeof timestamp.seconds === 'string' ? Number(timestamp.seconds) : timestamp.seconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds)) {
      const nanos = typeof timestamp.nanoseconds === 'number' && Number.isFinite(timestamp.nanoseconds)
        ? timestamp.nanoseconds
        : 0;
      return new Date(seconds * 1000 + nanos / 1_000_000).toISOString();
    }
  }
  throw new Error(`Firestore lead has an invalid ${field} timestamp.`);
}

export function buildAllowlistedExportRows(documents: FirestoreLeadDocument[], ownerUid: string): ExportRow[] {
  const seen = new Set<string>();
  const rows = documents.map(({ id, data }): ExportRow => {
    if (typeof id !== 'string' || id.length === 0 || id.includes('/') || id.length > 150) {
      throw new Error('Firestore returned an invalid lead document key.');
    }
    if (seen.has(id)) throw new Error('Firestore returned duplicate lead document keys.');
    seen.add(id);
    if (data.ownerId !== ownerUid) throw new Error('Firestore returned a lead outside the configured owner.');

    const companyName = requiredString(data, 'company_name', 200);
    if (companyName.trim().length === 0) throw new Error('Firestore lead has an empty company_name field.');

    const pipelineStage = data.pipeline_stage;
    if (typeof pipelineStage !== 'string' || !ALLOWED_STAGES.has(pipelineStage)) {
      throw new Error('Firestore lead has an invalid pipeline_stage field.');
    }

    const dealValue = data.deal_value;
    if (typeof dealValue !== 'number' || !Number.isFinite(dealValue) || dealValue < 0) {
      throw new Error('Firestore lead has an invalid deal_value field.');
    }

    const leadScore = data.lead_score;
    if (typeof leadScore !== 'string' || !ALLOWED_SCORES.has(leadScore)) {
      throw new Error('Firestore lead has an invalid lead_score field.');
    }

    const nextFollowupDate = requiredString(data, 'next_followup_date', 10);
    if (nextFollowupDate !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(nextFollowupDate)) {
      throw new Error('Firestore lead has an invalid next_followup_date field.');
    }

    return [
      id,
      companyName,
      pipelineStage,
      dealValue,
      leadScore,
      nextFollowupDate,
      timestampToIso(data.created_at, 'created_at'),
      timestampToIso(data.updated_at, 'updated_at'),
    ];
  });

  return rows.sort((left, right) => String(left[0]).localeCompare(String(right[0])));
}

export async function runFirestoreSheetsExport(target: ExportTarget, adapters: ExportAdapters): Promise<{
  exported: number;
  inserted: number;
  updated: number;
}> {
  validateExportTarget(target);
  const documents = await adapters.firestore.listOwnerLeads({
    projectId: target.projectId,
    workspaceId: target.workspaceId,
    ownerUid: target.ownerUid,
  });
  const rows = buildAllowlistedExportRows(documents, target.ownerUid);
  const result = await adapters.sheets.upsertRows({
    spreadsheetId: target.spreadsheetId,
    sheetName: target.sheetName,
    headers: FIRESTORE_EXPORT_HEADERS,
    rows,
  });
  return { exported: rows.length, ...result };
}
