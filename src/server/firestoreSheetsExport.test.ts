import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  FIRESTORE_EXPORT_ALLOWED_PROJECT_ID,
  FIRESTORE_EXPORT_HEADERS,
  buildAllowlistedExportRows,
  loadFirestoreExportConfig,
  runFirestoreSheetsExport,
  validateExportTarget,
  type ExportRow,
  type ExportTarget,
  type FirestoreLeadDocument,
  type SheetsUpsertAdapter,
} from './firestoreSheetsExport.ts';
import { createGoogleExportAdapters, isCronAuthorized } from './googleExportAdapters.ts';
import type { FirestoreExportConfig } from './firestoreSheetsExport.ts';

const target: ExportTarget = {
  projectId: FIRESTORE_EXPORT_ALLOWED_PROJECT_ID,
  workspaceId: 'ar-crm-owner',
  ownerUid: 'MlJVDEJvxrhdlwX87OGED0VfD6t1',
  spreadsheetId: 'abcdefghijklmnopqrstuvwx1234567890',
  sheetName: 'CRM Export',
};

function lead(id: string, overrides: Record<string, unknown> = {}): FirestoreLeadDocument {
  return {
    id,
    data: {
      ownerId: target.ownerUid,
      company_name: 'Example Trading Ltd',
      contact_person: 'Must not export',
      phone: '+628111111111',
      email: 'private@example.invalid',
      activity_notes: 'Private free text must not export',
      pipeline_stage: 'Meeting',
      deal_value: 1250000,
      lead_score: 'Warm',
      next_followup_date: '2026-10-30',
      created_at: '2026-10-20T12:30:00.000Z',
      updated_at: '2026-10-25T09:00:00.000Z',
      ...overrides,
    },
  };
}

class FakeFirestore {
  reads = 0;
  writes = 0;
  documents: FirestoreLeadDocument[];

  constructor(documents: FirestoreLeadDocument[]) {
    this.documents = documents;
  }

  async listOwnerLeads(input: { projectId: string; workspaceId: string; ownerUid: string }): Promise<FirestoreLeadDocument[]> {
    this.reads += 1;
    assert.equal(input.projectId, target.projectId);
    assert.equal(input.workspaceId, target.workspaceId);
    assert.equal(input.ownerUid, target.ownerUid);
    return structuredClone(this.documents);
  }
}

class FakeSheets implements SheetsUpsertAdapter {
  rows = new Map<string, ExportRow>();
  headers: readonly string[] | undefined;
  failNext = false;
  calls: Array<{ inputMode: string; rows: ExportRow[] }> = [];

  async upsertRows(input: { spreadsheetId: string; sheetName: string; headers: readonly string[]; rows: ExportRow[] }) {
    assert.equal(input.spreadsheetId, target.spreadsheetId);
    assert.equal(input.sheetName, target.sheetName);
    this.headers = input.headers;
    this.calls.push({ inputMode: 'RAW', rows: structuredClone(input.rows) });
    if (this.failNext) {
      this.failNext = false;
      for (const row of input.rows) this.rows.set(String(row[0]), structuredClone(row));
      throw new Error('simulated provider failure after rows were persisted');
    }

    let inserted = 0;
    let updated = 0;
    for (const row of input.rows) {
      const key = String(row[0]);
      if (this.rows.has(key)) updated += 1;
      else inserted += 1;
      this.rows.set(key, structuredClone(row));
    }
    return { inserted, updated };
  }
}

function validEnv() {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return {
    CRON_SECRET: 'c'.repeat(48),
    FIRESTORE_EXPORT_PROJECT_ID: FIRESTORE_EXPORT_ALLOWED_PROJECT_ID,
    FIRESTORE_EXPORT_WORKSPACE_ID: target.workspaceId,
    FIRESTORE_EXPORT_OWNER_UID: target.ownerUid,
    GOOGLE_SHEETS_SPREADSHEET_ID: target.spreadsheetId,
    GOOGLE_SHEETS_TAB_NAME: target.sheetName,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'exporter@example-project.iam.gserviceaccount.com',
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey,
  };
}

test('export schema contains only report fields plus stable Firestore source key', () => {
  assert.deepEqual(FIRESTORE_EXPORT_HEADERS, [
    'source_key', 'company_name', 'pipeline_stage', 'deal_value', 'lead_score',
    'next_followup_date', 'created_at', 'updated_at',
  ]);
  const [row] = buildAllowlistedExportRows([lead('stable-doc-key')], target.ownerUid);
  assert.deepEqual(row, [
    'stable-doc-key', 'Example Trading Ltd', 'Meeting', 1250000, 'Warm',
    '2026-10-30', '2026-10-20T12:30:00.000Z', '2026-10-25T09:00:00.000Z',
  ]);
  assert.equal(row.length, FIRESTORE_EXPORT_HEADERS.length);
  assert.equal(row.includes('+628111111111'), false);
  assert.equal(row.includes('Must not export'), false);
  assert.equal(row.includes('private@example.invalid'), false);
  assert.equal(row.includes('Private free text must not export'), false);
});

test('stable source key updates an existing Sheets row on rerun instead of duplicating it', async () => {
  const firestore = new FakeFirestore([lead('stable-doc-key')]);
  const sheets = new FakeSheets();
  const adapters = { firestore, sheets };

  const first = await runFirestoreSheetsExport(target, adapters);
  assert.deepEqual(first, { exported: 1, inserted: 1, updated: 0 });

  firestore.documents = [lead('stable-doc-key', {
    pipeline_stage: 'Negotiation',
    deal_value: 2500000,
    updated_at: '2026-10-26T10:00:00.000Z',
  })];
  const second = await runFirestoreSheetsExport(target, adapters);
  assert.deepEqual(second, { exported: 1, inserted: 0, updated: 1 });
  assert.equal(sheets.rows.size, 1);
  assert.equal(sheets.rows.get('stable-doc-key')?.[2], 'Negotiation');
  assert.equal(sheets.rows.get('stable-doc-key')?.[3], 2500000);
  assert.equal(firestore.writes, 0);
  assert.equal(sheets.calls[0].inputMode, 'RAW');
});

test('a failure after a Sheets write can be safely retried by stable key', async () => {
  const firestore = new FakeFirestore([lead('retry-key')]);
  const sheets = new FakeSheets();
  sheets.failNext = true;
  const adapters = { firestore, sheets };

  await assert.rejects(runFirestoreSheetsExport(target, adapters), /simulated provider failure/);
  assert.equal(sheets.rows.size, 1);
  const retry = await runFirestoreSheetsExport(target, adapters);
  assert.deepEqual(retry, { exported: 1, inserted: 0, updated: 1 });
  const rerun = await runFirestoreSheetsExport(target, adapters);
  assert.deepEqual(rerun, { exported: 1, inserted: 0, updated: 1 });
  assert.equal(sheets.rows.size, 1);
});

test('formula-looking text stays a string and the Google Sheets adapter sends RAW values', async () => {
  const maliciousText = '=HYPERLINK("https://example.invalid","click")';
  const rows = buildAllowlistedExportRows([lead('formula-key', { company_name: maliciousText })], target.ownerUid);
  assert.equal(rows[0][1], maliciousText);

  const config: FirestoreExportConfig = { ...loadFirestoreExportConfig(validEnv()) };
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'mock-access-token-123456' }), { status: 200 });
    }
    if (url.includes('/values/') && init?.method === 'GET') {
      return new Response(JSON.stringify({ values: [['source_key', ...FIRESTORE_EXPORT_HEADERS.slice(1)]] }), { status: 200 });
    }
    if (url.includes(':append?')) return new Response(JSON.stringify({ updates: { updatedRows: 1 } }), { status: 200 });
    return new Response(JSON.stringify({ totalUpdatedRows: 1 }), { status: 200 });
  }) as typeof fetch;

  const adapters = createGoogleExportAdapters(config, fakeFetch);
  await adapters.sheets.upsertRows({
    spreadsheetId: target.spreadsheetId,
    sheetName: target.sheetName,
    headers: FIRESTORE_EXPORT_HEADERS,
    rows,
  });
  const writeRequest = requests.find(({ url }) => url.includes(':append?'));
  assert.ok(writeRequest);
  assert.match(writeRequest.url, /valueInputOption=RAW/);
  assert.equal(JSON.parse(String(writeRequest.init?.body)).values[0][1], maliciousText);
});

test('invalid project/workspace/sheet targets are rejected before either adapter runs', async () => {
  assert.throws(() => validateExportTarget({ ...target, projectId: 'demo-ar-crm-rules' }), /project/);
  assert.throws(() => validateExportTarget({ ...target, workspaceId: 'other-workspace' }), /owner\/workspace/);
  assert.throws(() => validateExportTarget({ ...target, spreadsheetId: 'not-a-valid-id' }), /spreadsheet ID/);
  assert.throws(() => validateExportTarget({ ...target, sheetName: 'bad/name' }), /tab name/);

  const firestore = new FakeFirestore([lead('should-not-read')]);
  const sheets = new FakeSheets();
  await assert.rejects(runFirestoreSheetsExport({ ...target, projectId: 'wrong-project' }, { firestore, sheets }));
  assert.equal(firestore.reads, 0);
  assert.equal(sheets.calls.length, 0);
});

test('configuration fails closed when required credentials are missing or owner binding differs', () => {
  assert.throws(() => loadFirestoreExportConfig({}), /CRON_SECRET/);
  assert.throws(() => loadFirestoreExportConfig({
    ...validEnv(),
    FIRESTORE_EXPORT_OWNER_UID: 'another-owner',
  }), /owner\/workspace/);
  assert.throws(() => loadFirestoreExportConfig({
    ...validEnv(),
    FIRESTORE_EXPORT_PROJECT_ID: 'another-project',
  }), /project/);
});

test('invalid owner documents and duplicate source keys fail closed', () => {
  assert.throws(() => buildAllowlistedExportRows([lead('not-owned', { ownerId: 'someone-else' })], target.ownerUid), /outside the configured owner/);
  assert.throws(() => buildAllowlistedExportRows([lead('duplicate'), lead('duplicate')], target.ownerUid), /duplicate lead document keys/);
});

test('Firestore REST adapter reads only the fixed workspace leads collection with the fixed owner filter', async () => {
  const config = loadFirestoreExportConfig(validEnv());
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'mock-access-token-123456' }), { status: 200 });
    }
    if (url.endsWith(`/documents/workspaces/${target.workspaceId}`)) {
      return new Response(JSON.stringify({ fields: { ownerId: { stringValue: target.ownerUid } } }), { status: 200 });
    }
    if (url.endsWith(`/documents/workspaces/${target.workspaceId}/members/${target.ownerUid}`)) {
      return new Response(JSON.stringify({ fields: { role: { stringValue: 'owner' } } }), { status: 200 });
    }
    return new Response(JSON.stringify([{
      document: {
        name: `projects/${target.projectId}/databases/(default)/documents/workspaces/${target.workspaceId}/leads/rest-key`,
        fields: {
          ownerId: { stringValue: target.ownerUid },
          company_name: { stringValue: 'Example Trading Ltd' },
        },
      },
    }]), { status: 200 });
  }) as typeof fetch;

  const adapters = createGoogleExportAdapters(config, fakeFetch);
  const documents = await adapters.firestore.listOwnerLeads(target);
  assert.equal(documents[0].id, 'rest-key');
  assert.equal(documents[0].data.ownerId, target.ownerUid);
  assert.deepEqual(Object.keys(adapters.firestore), ['listOwnerLeads']);

  const firestoreRequest = requests.find(({ url }) => url.includes(':runQuery'));
  assert.ok(firestoreRequest);
  assert.equal(firestoreRequest.url, `https://firestore.googleapis.com/v1/projects/${target.projectId}/databases/(default)/documents/workspaces/${target.workspaceId}:runQuery`);
  assert.deepEqual(requests.filter(({ url }) => url.includes('firestore.googleapis.com')).map(({ url }) => url), [
    `https://firestore.googleapis.com/v1/projects/${target.projectId}/databases/(default)/documents/workspaces/${target.workspaceId}`,
    `https://firestore.googleapis.com/v1/projects/${target.projectId}/databases/(default)/documents/workspaces/${target.workspaceId}/members/${target.ownerUid}`,
    firestoreRequest.url,
  ]);
  const query = JSON.parse(String(firestoreRequest.init?.body)).structuredQuery;
  assert.deepEqual(query.from, [{ collectionId: 'leads' }]);
  assert.deepEqual(query.where.fieldFilter, {
    field: { fieldPath: 'ownerId' },
    op: 'EQUAL',
    value: { stringValue: target.ownerUid },
  });
});

test('Firestore REST adapter stops before listing leads when workspace membership is not owner', async () => {
  const config = loadFirestoreExportConfig(validEnv());
  let queryCalled = false;
  const fakeFetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'mock-access-token-123456' }), { status: 200 });
    }
    if (url.endsWith(`/documents/workspaces/${target.workspaceId}`)) {
      return new Response(JSON.stringify({ fields: { ownerId: { stringValue: target.ownerUid } } }), { status: 200 });
    }
    if (url.endsWith(`/members/${target.ownerUid}`)) {
      return new Response(JSON.stringify({ fields: { role: { stringValue: 'member' } } }), { status: 200 });
    }
    queryCalled = true;
    return new Response(JSON.stringify([]), { status: 200 });
  }) as typeof fetch;

  const adapter = createGoogleExportAdapters(config, fakeFetch).firestore;
  await assert.rejects(adapter.listOwnerLeads(target), /membership is not owner-role/);
  assert.equal(queryCalled, false);
});

test('Google Sheets REST adapter rereads stable keys and updates the existing row on retry', async () => {
  const config = loadFirestoreExportConfig(validEnv());
  const sheetValues: unknown[][] = [];
  let appendCalls = 0;
  let batchUpdateCalls = 0;
  const writeModes: string[] = [];
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = decodeURIComponent(url.pathname);
    if (url.toString() === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'mock-access-token-123456' }), { status: 200 });
    }
    if (init?.method === 'GET') {
      return new Response(JSON.stringify({ values: structuredClone(sheetValues) }), { status: 200 });
    }
    const body = JSON.parse(String(init?.body));
    writeModes.push(url.searchParams.get('valueInputOption') ?? body.valueInputOption ?? '');
    if (init?.method === 'PUT') {
      sheetValues[0] = body.values[0];
      return new Response(JSON.stringify({ updatedRows: 1 }), { status: 200 });
    }
    if (path.endsWith('/values:batchUpdate')) {
      batchUpdateCalls += 1;
      for (const entry of body.data) {
        const rowNumber = Number(entry.range.match(/!A(\d+):H\d+$/)?.[1]);
        sheetValues[rowNumber - 1] = entry.values[0];
      }
      return new Response(JSON.stringify({ totalUpdatedRows: body.data.length }), { status: 200 });
    }
    if (path.includes(':append')) {
      appendCalls += 1;
      sheetValues.push(...body.values);
      return new Response(JSON.stringify({ updates: { updatedRows: body.values.length } }), { status: 200 });
    }
    throw new Error(`Unexpected mocked Sheets request: ${path}`);
  }) as typeof fetch;

  const adapter = createGoogleExportAdapters(config, fakeFetch).sheets;
  const firstRow = buildAllowlistedExportRows([lead('rest-upsert-key')], target.ownerUid);
  const updatedRow = buildAllowlistedExportRows([lead('rest-upsert-key', {
    pipeline_stage: 'Negotiation',
    updated_at: '2026-10-26T10:00:00.000Z',
  })], target.ownerUid);
  assert.deepEqual(await adapter.upsertRows({
    spreadsheetId: target.spreadsheetId,
    sheetName: target.sheetName,
    headers: FIRESTORE_EXPORT_HEADERS,
    rows: firstRow,
  }), { inserted: 1, updated: 0 });
  assert.deepEqual(await adapter.upsertRows({
    spreadsheetId: target.spreadsheetId,
    sheetName: target.sheetName,
    headers: FIRESTORE_EXPORT_HEADERS,
    rows: updatedRow,
  }), { inserted: 0, updated: 1 });

  assert.equal(sheetValues.length, 2);
  assert.equal((sheetValues[1] as unknown[])[0], 'rest-upsert-key');
  assert.equal((sheetValues[1] as unknown[])[2], 'Negotiation');
  assert.equal(appendCalls, 1);
  assert.equal(batchUpdateCalls, 1);
  assert.ok(writeModes.every((mode) => mode === 'RAW'));
});

test('cron authorization requires a configured long bearer secret and rejects all other inputs', () => {
  const secret = 's'.repeat(40);
  assert.equal(isCronAuthorized(`Bearer ${secret}`, secret), true);
  assert.equal(isCronAuthorized(`Bearer ${'x'.repeat(40)}`, secret), false);
  assert.equal(isCronAuthorized(secret, secret), false);
  assert.equal(isCronAuthorized(`Bearer ${secret}`, undefined), false);
  assert.equal(isCronAuthorized(`Bearer short`, 'short'), false);
});
