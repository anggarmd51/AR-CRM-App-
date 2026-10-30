import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handleMakeLeadWebhook,
  isValidMakeWebhookServiceAccountJson,
  makeLeadDocumentId,
  mapMakeLeadPayload,
  MAKE_WEBHOOK_LOCAL_PROJECT_ID,
  MAKE_WEBHOOK_APPROVED_PREVIEW_BRANCH,
  MAKE_WEBHOOK_STAGING_PROJECT_ID,
  resolveMakeWebhookTarget,
} from './makeLeadWebhook.ts';
import { FIREBASE_STAGING_WORKSPACE_ID } from '../firebaseRulesBinding.ts';

const ownerUid = 'synthetic-staging-owner-uid';
const secret = 'synthetic-webhook-secret-with-at-least-32-bytes';
function stagingEnvironment(overrides: Record<string, string | undefined> = {}) {
  return {
    MAKE_WEBHOOK_ENABLED: 'true',
    MAKE_WEBHOOK_SECRET: secret,
    MAKE_WEBHOOK_OWNER_UID: ownerUid,
    VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_REF: MAKE_WEBHOOK_APPROVED_PREVIEW_BRANCH,
    VITE_FIREBASE_TARGET: 'staging',
    VITE_FIREBASE_PROJECT_ID: MAKE_WEBHOOK_STAGING_PROJECT_ID,
    VITE_FIREBASE_STAGING_PROJECT_ID_ALLOWLIST: MAKE_WEBHOOK_STAGING_PROJECT_ID,
    VITE_FIREBASE_WORKSPACE_ID: FIREBASE_STAGING_WORKSPACE_ID,
    VITE_FIREBASE_OWNER_UID: ownerUid,
    FIREBASE_ADMIN_PROJECT_ID: MAKE_WEBHOOK_STAGING_PROJECT_ID,
    ...overrides,
  };
}
function request(body: unknown, overrides: Record<string, string | string[]> = {}) {
  return {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
      ...overrides,
    },
    body,
  };
}

test('maps Make labels in Indonesian and English into the CRM fields without guessing city or address', () => {
  const mapped = mapMakeLeadPayload({
    event_id: 'source-event-42',
    'Nama Usaha/Orang': 'Siti Rahma',
    Perusahaan: 'PT Contoh Niaga',
    'Kontak/WhatsApp': '+62 812-3456-7890',
    Email: 'SALES@CONTOH.ID',
    Alamat: 'Jl. Melati No. 7, Jakarta Selatan',
  });
  assert.deepEqual(mapped.lead, {
    company_name: 'PT Contoh Niaga',
    contact_person: 'Siti Rahma',
    email: 'sales@contoh.id',
    phone: '+62 812-3456-7890',
    address: 'Jl. Melati No. 7, Jakarta Selatan',
    industry: '',
    city: '',
    pipeline_stage: 'Prospect',
    deal_value: 0,
    next_followup_date: '',
    lead_score: 'Unrated',
  });
  assert.equal(mapped.idempotencyKey, 'source-event-42');
});

test('supports a nested Make lead bundle and fallback name for an individual prospect', () => {
  const mapped = mapMakeLeadPayload({
    data: {
      name: 'Rina Pertiwi',
      whatsapp: '081234567890',
      address: 'Bandung',
      city: 'Bandung',
      industry: 'Retail',
    },
  });
  assert.equal(mapped.lead.company_name, 'Rina Pertiwi');
  assert.equal(mapped.lead.contact_person, 'Rina Pertiwi');
  assert.equal(mapped.lead.phone, '081234567890');
  assert.equal(mapped.lead.address, 'Bandung');
  assert.equal(mapped.lead.city, 'Bandung');
  assert.equal(mapped.lead.industry, 'Retail');
});

test('rejects missing required names, malformed email, oversized address, and non-object input', () => {
  assert.throws(() => mapMakeLeadPayload({ phone: '0812' }), /wajib diisi/);
  assert.throws(() => mapMakeLeadPayload({ name: 'Ayu' }), /Kontak\/WhatsApp atau Email wajib/);
  assert.throws(() => mapMakeLeadPayload({ name: 'Ayu', email: 'not-an-email' }), /Email tidak valid/);
  assert.throws(() => mapMakeLeadPayload({ name: 'Ayu', phone: '0812', address: 'x'.repeat(501) }), /Alamat melebihi/);
  assert.throws(() => mapMakeLeadPayload([]), /objek JSON/);
});

test('uses an opaque deterministic document ID and never embeds the source key', () => {
  const id = makeLeadDocumentId('sensitive-source-key-123');
  assert.equal(id, makeLeadDocumentId('sensitive-source-key-123'));
  assert.match(id, /^make_[a-f0-9]{48}$/);
  assert.equal(id.includes('sensitive'), false);
  assert.notEqual(id, makeLeadDocumentId('different-key'));
});

test('enables only the exact staging Preview binding or an explicitly enabled loopback emulator', () => {
  const staging = stagingEnvironment();
  assert.equal(MAKE_WEBHOOK_APPROVED_PREVIEW_BRANCH, 'cue/firebase-stabilization');
  assert.equal(resolveMakeWebhookTarget(staging)?.projectId, MAKE_WEBHOOK_STAGING_PROJECT_ID);
  assert.equal(resolveMakeWebhookTarget(staging)?.workspaceId, FIREBASE_STAGING_WORKSPACE_ID);
  assert.equal(resolveMakeWebhookTarget(stagingEnvironment({ VITE_FIREBASE_PROJECT_ID: 'ar-crm-73222' })), undefined);
  assert.equal(resolveMakeWebhookTarget(stagingEnvironment({ VERCEL_GIT_COMMIT_REF: 'main' })), undefined);
  assert.equal(resolveMakeWebhookTarget(stagingEnvironment({ VERCEL_GIT_COMMIT_REF: 'cue/ar-crm-operational-features' })), undefined);
});

test('does not expose the endpoint on production, local without emulator gate, or a wrong Firebase owner/workspace', () => {
  assert.equal(resolveMakeWebhookTarget(stagingEnvironment({ VERCEL_ENV: 'production', VITE_FIREBASE_TARGET: 'production' })), undefined);
  assert.equal(resolveMakeWebhookTarget(stagingEnvironment({ VERCEL_ENV: 'development' })), undefined);
  assert.equal(resolveMakeWebhookTarget(stagingEnvironment({ VITE_FIREBASE_WORKSPACE_ID: 'ar-crm-owner' })), undefined);
  assert.equal(resolveMakeWebhookTarget(stagingEnvironment({ MAKE_WEBHOOK_OWNER_UID: 'MlJVDEJvxrhdlwX87OGED0VfD6t1' })), undefined);
});

test('local writes require a demo project and an explicit loopback emulator flag', () => {
  const local = {
    ...stagingEnvironment(),
    VERCEL_ENV: '',
    NODE_ENV: 'development',
    VITE_FIREBASE_TARGET: 'local',
    VITE_FIREBASE_PROJECT_ID: '',
    VITE_FIREBASE_STAGING_PROJECT_ID_ALLOWLIST: '',
    FIREBASE_ADMIN_PROJECT_ID: MAKE_WEBHOOK_LOCAL_PROJECT_ID,
    MAKE_WEBHOOK_LOCAL_EMULATOR_ENABLED: 'true',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  };
  assert.equal(resolveMakeWebhookTarget(local)?.kind, 'local-emulator');
  assert.equal(resolveMakeWebhookTarget({ ...local, FIRESTORE_EMULATOR_HOST: 'remote.example:8080' }), undefined);
  assert.equal(resolveMakeWebhookTarget({ ...local, FIREBASE_ADMIN_PROJECT_ID: MAKE_WEBHOOK_STAGING_PROJECT_ID }), undefined);
});

test('requires a correctly bound staging service-account JSON without revealing its contents', () => {
  const serviceAccount = JSON.stringify({
    project_id: MAKE_WEBHOOK_STAGING_PROJECT_ID,
    client_email: 'synthetic@example.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nsynthetic\n-----END PRIVATE KEY-----',
  });
  assert.equal(isValidMakeWebhookServiceAccountJson(serviceAccount, MAKE_WEBHOOK_STAGING_PROJECT_ID), true);
  assert.equal(isValidMakeWebhookServiceAccountJson(serviceAccount, 'ar-crm-73222'), false);
  assert.equal(isValidMakeWebhookServiceAccountJson('{not-json', MAKE_WEBHOOK_STAGING_PROJECT_ID), false);
});

test('rejects unauthorized requests before constructing a Firestore writer', async () => {
  let writerFactoryCalls = 0;
  const result = await handleMakeLeadWebhook(request({ name: 'Ayu' }, { authorization: 'Bearer incorrect' }), stagingEnvironment(), () => {
    writerFactoryCalls += 1;
    throw new Error('must not initialize');
  });
  assert.equal(result.statusCode, 401);
  assert.equal(writerFactoryCalls, 0);
  const duplicateHeaders = await handleMakeLeadWebhook(request({ name: 'Ayu' }, {
    authorization: [`Bearer ${secret}`, `Bearer ${secret}`],
  }), stagingEnvironment(), () => {
    writerFactoryCalls += 1;
    throw new Error('must not initialize');
  });
  assert.equal(duplicateHeaders.statusCode, 401);
  assert.equal(writerFactoryCalls, 0);
});

test('is inert by default when the deployment has no explicit staging/emulator binding', async () => {
  let writerFactoryCalls = 0;
  const result = await handleMakeLeadWebhook(request({ name: 'Ayu', phone: '0812' }), {}, () => {
    writerFactoryCalls += 1;
    throw new Error('must not initialize');
  });
  assert.equal(result.statusCode, 404);
  assert.equal(writerFactoryCalls, 0);
});

test('creates a Lead once and responds idempotently to Make retries', async () => {
  const received = new Map<string, unknown>();
  const writer = {
    async createLead(id: string, lead: unknown) {
      if (received.has(id)) {
        assert.deepEqual(received.get(id), lead);
        return 'duplicate' as const;
      }
      received.set(id, lead);
      return 'created' as const;
    },
  };
  const body = { event_id: 'event-1', name: 'Dewi Sari', perusahaan: 'PT Maju', whatsapp: '+628123' };
  const first = await handleMakeLeadWebhook(request(body), stagingEnvironment(), () => writer);
  const retry = await handleMakeLeadWebhook(request(body), stagingEnvironment(), () => writer);
  assert.equal(first.statusCode, 201);
  assert.equal(retry.statusCode, 200);
  assert.equal(first.body.lead_id, retry.body.lead_id);
  assert.equal(received.size, 1);
});

test('rejects reuse of the same event ID for a different Lead payload', async () => {
  let storedLead: unknown;
  const writer = {
    async createLead(_id: string, lead: unknown) {
      if (storedLead !== undefined) {
        if (JSON.stringify(storedLead) !== JSON.stringify(lead)) {
          const { MakeWebhookConflictError } = await import('./makeLeadWebhook.ts');
          throw new MakeWebhookConflictError();
        }
        return 'duplicate' as const;
      }
      storedLead = lead;
      return 'created' as const;
    },
  };
  const first = await handleMakeLeadWebhook(request({ event_id: 'stable-id', name: 'Ayu', phone: '0812' }), stagingEnvironment(), () => writer);
  const changed = await handleMakeLeadWebhook(request({ event_id: 'stable-id', name: 'Ayu', phone: '0813' }), stagingEnvironment(), () => writer);
  assert.equal(first.statusCode, 201);
  assert.equal(changed.statusCode, 409);
});

test('returns safe validation, size, method, content-type and missing-secret responses', async () => {
  const writer = { async createLead() { throw new Error('not called'); } };
  assert.equal((await handleMakeLeadWebhook({ ...request({}), method: 'GET' }, stagingEnvironment(), () => writer)).statusCode, 405);
  assert.equal((await handleMakeLeadWebhook(request({}, { 'content-type': 'text/plain' }), stagingEnvironment(), () => writer)).statusCode, 415);
  assert.equal((await handleMakeLeadWebhook(request({ phone: '0812' }), stagingEnvironment(), () => writer)).statusCode, 400);
  assert.equal((await handleMakeLeadWebhook(request('x'.repeat(32 * 1024 + 1)), stagingEnvironment(), () => writer)).statusCode, 413);
  assert.equal((await handleMakeLeadWebhook(request({ name: 'Ayu' }), stagingEnvironment({ MAKE_WEBHOOK_SECRET: 'short' }), () => writer)).statusCode, 503);
});

test('writer errors are generic and do not echo incoming prospect data', async () => {
  const result = await handleMakeLeadWebhook(request({ event_id: 'safe-id', name: 'PII Name', email: 'a@b.co' }), stagingEnvironment(), () => ({
    async createLead() { throw new Error('PII Name a@b.co private key'); },
  }));
  assert.equal(result.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(result.body), /PII Name|a@b\.co|private key/);
});
