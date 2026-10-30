import { createHash, timingSafeEqual } from 'node:crypto';
import {
  FIREBASE_RULES_OWNER_UID,
  FIREBASE_STAGING_WORKSPACE_ID,
  firebaseStagingOwnerBindingMatchesRules,
} from '../firebaseRulesBinding.ts';
import type { LeadScore, PipelineStage } from '../types/crm.ts';

export const MAKE_WEBHOOK_STAGING_PROJECT_ID = 'ar-crm-staging-angga-20261027';
export const MAKE_WEBHOOK_LOCAL_PROJECT_ID = 'demo-ar-crm-make-webhook';
export const MAKE_WEBHOOK_APPROVED_PREVIEW_BRANCH = 'cue/ar-crm-operational-features';
export const MAKE_WEBHOOK_MAX_BODY_BYTES = 32 * 1024;
const STRONG_SECRET_MIN_BYTES = 32;

export interface MakeWebhookTarget {
  kind: 'staging-preview' | 'local-emulator';
  projectId: string;
  workspaceId: typeof FIREBASE_STAGING_WORKSPACE_ID;
  ownerUid: string;
}

export interface MakeLeadPayload {
  company_name: string;
  contact_person: string;
  email?: string;
  phone: string;
  address?: string;
  industry: string;
  city: string;
  pipeline_stage: PipelineStage;
  deal_value: number;
  next_followup_date: string;
  lead_score: LeadScore;
}

export interface MappedMakeLead {
  lead: MakeLeadPayload;
  idempotencyKey: string;
}

export interface MakeWebhookRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface MakeWebhookResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface MakeWebhookWriter {
  createLead(documentId: string, lead: MakeLeadPayload, target: MakeWebhookTarget): Promise<'created' | 'duplicate'>;
}

export class MakeLeadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MakeLeadValidationError';
  }
}

export class MakeWebhookConflictError extends Error {
  constructor() {
    super('An event with this identifier was already received with different data.');
    this.name = 'MakeWebhookConflictError';
  }
}

function textValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function normalizeKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function flattenRecord(value: Record<string, unknown>): Map<string, unknown> {
  return new Map(Object.entries(value).map(([key, field]) => [normalizeKey(key), field]));
}

function firstValue(record: Map<string, unknown>, names: string[]): string | undefined {
  for (const name of names) {
    const value = textValue(record.get(name));
    if (value) return value;
  }
  return undefined;
}

function boundedText(value: string | undefined, field: string, maximum: number, required = false): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  if (required && !normalized) throw new MakeLeadValidationError(`Field ${field} wajib diisi.`);
  if (normalized.length > maximum) throw new MakeLeadValidationError(`Field ${field} melebihi batas ${maximum} karakter.`);
  return normalized;
}

function extractLeadRecord(root: Record<string, unknown>): Record<string, unknown> {
  const nestedLead = asRecord(root.lead);
  if (nestedLead) return nestedLead;
  const nestedData = asRecord(root.data);
  return nestedData ?? root;
}

function idempotencyValue(root: Record<string, unknown>, record: Map<string, unknown>, lead: MakeLeadPayload): string {
  const key = firstValue(record, ['event_id', 'eventid', 'submission_id', 'submissionid', 'external_id', 'externalid', 'source_id', 'sourceid', 'id']);
  const top = flattenRecord(root);
  const rootKey = firstValue(top, ['event_id', 'eventid', 'submission_id', 'submissionid', 'external_id', 'externalid', 'source_id', 'sourceid', 'id']);
  return (rootKey ?? key) || JSON.stringify(lead);
}

/** Maps one Make bundle. Prefer explicit company/person fields; the generic name field fills the missing side only. */
export function mapMakeLeadPayload(input: unknown): MappedMakeLead {
  const root = asRecord(input);
  if (!root) throw new MakeLeadValidationError('Body harus berupa satu objek JSON prospek.');
  const recordObject = extractLeadRecord(root);
  const record = flattenRecord(recordObject);
  const genericName = firstValue(record, ['nama_usaha_orang', 'nama_usaha_atau_orang', 'business_or_person', 'business_or_person_name', 'name', 'nama']);
  const explicitCompany = firstValue(record, ['company_name', 'companyname', 'company', 'perusahaan', 'nama_perusahaan', 'business_name', 'businessname', 'nama_usaha']);
  const explicitContact = firstValue(record, ['contact_person', 'contactperson', 'contact_name', 'contactname', 'person_name', 'personname', 'nama_orang', 'nama_kontak', 'pic']);
  const companyName = boundedText(explicitCompany ?? genericName ?? explicitContact, 'Perusahaan / Nama Usaha', 200, true);
  const contactPerson = boundedText(explicitContact ?? genericName, 'Nama Usaha/Orang / Contact Person', 200, true);
  const rawEmail = firstValue(record, ['email', 'email_address', 'emailaddress', 'alamat_email']);
  const email = boundedText(rawEmail, 'Email', 320).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new MakeLeadValidationError('Field Email tidak valid.');
  }
  const rawPhone = firstValue(record, ['phone', 'phone_number', 'phonenumber', 'mobile', 'telephone', 'whatsapp', 'whatsapp_number', 'whatsappnumber', 'kontak', 'kontak_whatsapp', 'telepon', 'nomor_telepon']);
  const phone = boundedText(rawPhone, 'Kontak/WhatsApp', 200);
  if (!phone && !email) throw new MakeLeadValidationError('Kontak/WhatsApp atau Email wajib diisi.');
  const rawAddress = firstValue(record, ['address', 'alamat', 'street_address', 'business_address', 'alamat_usaha']);
  const address = boundedText(rawAddress, 'Alamat', 500);
  const industry = boundedText(firstValue(record, ['industry', 'industri', 'sector']), 'Industri', 120);
  const city = boundedText(firstValue(record, ['city', 'kota', 'kabupaten', 'municipality']), 'Kota', 120);
  const lead: MakeLeadPayload = {
    company_name: companyName,
    contact_person: contactPerson,
    ...(email ? { email } : {}),
    phone,
    ...(address ? { address } : {}),
    industry,
    city,
    pipeline_stage: 'Prospect',
    deal_value: 0,
    next_followup_date: '',
    lead_score: 'Unrated',
  };
  return { lead, idempotencyKey: idempotencyValue(root, record, lead) };
}

export function makeLeadDocumentId(idempotencyKey: string): string {
  const canonicalKey = `ar-crm:${FIREBASE_STAGING_WORKSPACE_ID}:make-lead:v1:${idempotencyKey}`;
  return `make_${createHash('sha256').update(canonicalKey).digest('hex').slice(0, 48)}`;
}

function isLoopbackEmulatorHost(value: string | undefined): boolean {
  return value === '127.0.0.1:8080' || value === 'localhost:8080' || value === '[::1]:8080';
}

/** Returns a write target only for the fixed staging project or a local Firestore Emulator. */
export function resolveMakeWebhookTarget(environment: Record<string, string | undefined>): MakeWebhookTarget | undefined {
  if (environment.MAKE_WEBHOOK_ENABLED !== 'true'
    || environment.VITE_FIREBASE_WORKSPACE_ID !== FIREBASE_STAGING_WORKSPACE_ID) return undefined;
  const ownerUid = environment.MAKE_WEBHOOK_OWNER_UID?.trim() ?? '';
  if (!ownerUid || ownerUid === FIREBASE_RULES_OWNER_UID
    || !firebaseStagingOwnerBindingMatchesRules(ownerUid, FIREBASE_STAGING_WORKSPACE_ID)) return undefined;

  if (environment.VERCEL_ENV === 'preview'
    && environment.VERCEL_GIT_COMMIT_REF === MAKE_WEBHOOK_APPROVED_PREVIEW_BRANCH
    && environment.VITE_FIREBASE_TARGET === 'staging'
    && environment.VITE_FIREBASE_PROJECT_ID === MAKE_WEBHOOK_STAGING_PROJECT_ID
    && environment.VITE_FIREBASE_STAGING_PROJECT_ID_ALLOWLIST === MAKE_WEBHOOK_STAGING_PROJECT_ID
    && environment.FIREBASE_ADMIN_PROJECT_ID === MAKE_WEBHOOK_STAGING_PROJECT_ID
    && environment.VITE_FIREBASE_OWNER_UID === ownerUid) {
    return {
      kind: 'staging-preview',
      projectId: MAKE_WEBHOOK_STAGING_PROJECT_ID,
      workspaceId: FIREBASE_STAGING_WORKSPACE_ID,
      ownerUid,
    };
  }

  const localEmulatorEnabled = !environment.VERCEL_ENV
    && environment.NODE_ENV !== 'production'
    && environment.VITE_FIREBASE_TARGET === 'local'
    && environment.FIREBASE_ADMIN_PROJECT_ID === MAKE_WEBHOOK_LOCAL_PROJECT_ID
    && environment.MAKE_WEBHOOK_LOCAL_EMULATOR_ENABLED === 'true'
    && isLoopbackEmulatorHost(environment.FIRESTORE_EMULATOR_HOST);
  if (localEmulatorEnabled) {
    return {
      kind: 'local-emulator',
      projectId: MAKE_WEBHOOK_LOCAL_PROJECT_ID,
      workspaceId: FIREBASE_STAGING_WORKSPACE_ID,
      ownerUid,
    };
  }
  return undefined;
}

function headerValue(headers: MakeWebhookRequest['headers'], name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value.length === 1 ? value[0] : undefined;
  return value;
}

function hasValidBearerToken(authorization: string | undefined, secret: string): boolean {
  if (!authorization?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(authorization.slice(7), 'utf8');
  const expected = Buffer.from(secret, 'utf8');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function bodyByteLength(body: unknown): number | undefined {
  if (typeof body === 'string' || Buffer.isBuffer(body)) return Buffer.byteLength(body);
  if (body === undefined) return 0;
  try {
    return Buffer.byteLength(JSON.stringify(body));
  } catch {
    return undefined;
  }
}

function jsonResponse(statusCode: number, body: Record<string, unknown>, extra: Record<string, string> = {}): MakeWebhookResponse {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      pragma: 'no-cache',
      'x-content-type-options': 'nosniff',
      ...extra,
    },
    body,
  };
}

export async function handleMakeLeadWebhook(
  request: MakeWebhookRequest,
  environment: Record<string, string | undefined>,
  createWriter: (target: MakeWebhookTarget) => MakeWebhookWriter,
): Promise<MakeWebhookResponse> {
  const target = resolveMakeWebhookTarget(environment);
  if (!target) return jsonResponse(404, { code: 'not_found', error: 'Not found.' });
  if (request.method !== 'POST') return jsonResponse(405, { code: 'method_not_allowed', error: 'Method not allowed.' }, { allow: 'POST' });
  const contentType = headerValue(request.headers, 'content-type')?.split(';')[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') return jsonResponse(415, { code: 'invalid_content_type', error: 'Gunakan application/json.' });
  const secret = environment.MAKE_WEBHOOK_SECRET?.trim() ?? '';
  if (Buffer.byteLength(secret, 'utf8') < STRONG_SECRET_MIN_BYTES) {
    return jsonResponse(503, { code: 'not_configured', error: 'Penerima Make webhook belum dikonfigurasi.' });
  }
  if (!hasValidBearerToken(headerValue(request.headers, 'authorization'), secret)) {
    return jsonResponse(401, { code: 'unauthorized', error: 'Unauthorized.' });
  }
  const contentLength = Number(headerValue(request.headers, 'content-length'));
  const actualLength = bodyByteLength(request.body);
  if ((Number.isFinite(contentLength) && contentLength > MAKE_WEBHOOK_MAX_BODY_BYTES)
    || actualLength === undefined || actualLength > MAKE_WEBHOOK_MAX_BODY_BYTES) {
    return jsonResponse(413, { code: 'payload_too_large', error: 'Payload terlalu besar.' });
  }
  let input = request.body;
  if (typeof input === 'string' || Buffer.isBuffer(input)) {
    try {
      input = JSON.parse(input.toString());
    } catch {
      return jsonResponse(400, { code: 'invalid_json', error: 'Body bukan JSON yang valid.' });
    }
  }
  let mapped: MappedMakeLead;
  try {
    mapped = mapMakeLeadPayload(input);
  } catch (error) {
    if (error instanceof MakeLeadValidationError) {
      return jsonResponse(400, { code: 'validation_error', error: error.message });
    }
    return jsonResponse(400, { code: 'invalid_payload', error: 'Payload prospek tidak valid.' });
  }
  const documentId = makeLeadDocumentId(mapped.idempotencyKey);
  try {
    const result = await createWriter(target).createLead(documentId, mapped.lead, target);
    return jsonResponse(result === 'created' ? 201 : 200, {
      status: result,
      lead_id: documentId,
      pipeline_stage: 'Prospect',
    });
  } catch (error) {
    if (error instanceof MakeWebhookConflictError) {
      return jsonResponse(409, { code: 'idempotency_conflict', error: 'ID event telah pernah dipakai dengan payload berbeda.' });
    }
    return jsonResponse(503, { code: 'write_failed', error: 'Lead tidak dapat disimpan. Periksa konfigurasi staging lalu coba lagi.' });
  }
}

export function isValidMakeWebhookServiceAccountJson(raw: string | undefined, expectedProjectId: string): boolean {
  if (!raw) return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const serviceAccount = parsed as Record<string, unknown>;
    return serviceAccount.project_id === expectedProjectId
      && typeof serviceAccount.client_email === 'string'
      && serviceAccount.client_email.trim().length > 0
      && typeof serviceAccount.private_key === 'string'
      && serviceAccount.private_key.includes('PRIVATE KEY');
  } catch {
    return false;
  }
}
