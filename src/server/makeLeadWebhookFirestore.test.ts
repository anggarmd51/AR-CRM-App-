import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MakeLeadWebhookFirestoreWriter,
} from './makeLeadWebhookFirestore.ts';
import {
  MakeWebhookConflictError,
  makeLeadDocumentId,
  type MakeLeadPayload,
  type MakeWebhookTarget,
} from './makeLeadWebhook.ts';
import { FIREBASE_STAGING_WORKSPACE_ID } from '../firebaseRulesBinding.ts';
import type { Firestore } from 'firebase-admin/firestore';

interface Reference { path: string }
interface Snapshot {
  exists: boolean;
  get(key: string): unknown;
  data(): Record<string, unknown> | undefined;
}

class MemoryFirestore {
  readonly documents = new Map<string, Record<string, unknown>>();
  private lock: Promise<void> = Promise.resolve();

  doc(path: string): Reference { return { path }; }

  async runTransaction<T>(callback: (transaction: {
    get(reference: Reference): Promise<Snapshot>;
    create(reference: Reference, data: Record<string, unknown>): void;
  }) => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.lock;
    this.lock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const transaction = {
        get: async (reference: Reference): Promise<Snapshot> => {
          const data = this.documents.get(reference.path);
          return {
            exists: data !== undefined,
            get: (key) => data?.[key],
            data: () => data,
          };
        },
        create: (reference: Reference, data: Record<string, unknown>) => {
          if (this.documents.has(reference.path)) throw new Error('already-exists');
          this.documents.set(reference.path, {
            ...data,
            created_at: { toDate: () => new Date(0) },
            updated_at: { toDate: () => new Date(0) },
          });
        },
      };
      return await callback(transaction);
    } finally {
      release();
    }
  }
}

const ownerUid = 'staging-owner-test-uid';
const target: MakeWebhookTarget = {
  kind: 'staging-preview',
  projectId: 'ar-crm-staging-angga-20261027',
  workspaceId: FIREBASE_STAGING_WORKSPACE_ID,
  ownerUid,
};
const lead: MakeLeadPayload = {
  company_name: 'PT Uji Contoh',
  contact_person: 'Dewi Contoh',
  phone: '+62812345678',
  email: 'dewi@example.id',
  address: 'Jl. Contoh No. 1',
  industry: '',
  city: '',
  pipeline_stage: 'Prospect',
  deal_value: 0,
  next_followup_date: '',
  lead_score: 'Unrated',
};

function provisionedFirestore() {
  const memory = new MemoryFirestore();
  memory.documents.set(`workspaces/${target.workspaceId}`, { ownerId: ownerUid });
  memory.documents.set(`workspaces/${target.workspaceId}/members/${ownerUid}`, { role: 'owner' });
  return memory;
}

function writerFor(memory: MemoryFirestore) {
  return new MakeLeadWebhookFirestoreWriter(memory as unknown as Firestore);
}

test('Firestore Admin writer atomically creates one staging Lead and treats concurrent identical retries as duplicates', async () => {
  const memory = provisionedFirestore();
  const writer = writerFor(memory);
  const documentId = makeLeadDocumentId('source-event-1');
  const results = await Promise.all([
    writer.createLead(documentId, lead, target),
    writer.createLead(documentId, lead, target),
  ]);
  assert.deepEqual([...results].sort(), ['created', 'duplicate']);
  const path = `workspaces/${FIREBASE_STAGING_WORKSPACE_ID}/leads/${documentId}`;
  const saved = memory.documents.get(path);
  assert.ok(saved);
  assert.equal(saved.ownerId, ownerUid);
  assert.equal(saved.role, 'owner');
  assert.equal(saved.address, 'Jl. Contoh No. 1');
  assert.equal([...memory.documents.keys()].filter((key) => key.includes('/leads/')).length, 1);
});

test('Firestore Admin writer refuses different Lead data for an existing deterministic ID without overwriting', async () => {
  const memory = provisionedFirestore();
  const writer = writerFor(memory);
  const documentId = makeLeadDocumentId('source-event-2');
  await writer.createLead(documentId, lead, target);
  const path = `workspaces/${FIREBASE_STAGING_WORKSPACE_ID}/leads/${documentId}`;
  const before = memory.documents.get(path);
  await assert.rejects(
    writer.createLead(documentId, { ...lead, phone: '+62819999999' }, target),
    MakeWebhookConflictError,
  );
  assert.deepEqual(memory.documents.get(path), before);
});

test('Firestore Admin writer fails closed when the fixed owner membership binding is absent', async () => {
  const memory = new MemoryFirestore();
  memory.documents.set(`workspaces/${target.workspaceId}`, { ownerId: ownerUid });
  const writer = writerFor(memory);
  await assert.rejects(writer.createLead(makeLeadDocumentId('missing-membership'), lead, target), /workspace binding/);
  assert.equal([...memory.documents.keys()].some((key) => key.includes('/leads/')), false);
});
