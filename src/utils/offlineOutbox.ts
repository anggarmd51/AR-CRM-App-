import type { LeadScore, PipelineStage } from '../types/crm.ts';

export type DurableMutation =
  | {
      kind: 'create-lead';
      payload: {
        company_name: string;
        contact_person: string;
        phone: string;
        industry: string;
        city: string;
        pipeline_stage: PipelineStage;
        deal_value: number;
        next_followup_date: string;
        lead_score: LeadScore;
      };
    }
  | {
      kind: 'update-lead-stage';
      payload: {
        lead_id: string;
        pipeline_stage: PipelineStage;
        next_followup_date?: string;
      };
    }
  | {
      kind: 'create-activity';
      payload: {
        lead_id: string;
        activity_type: string;
        notes: string;
      };
    };

export type DurableQueueState = 'pending' | 'syncing' | 'failed' | 'acknowledged';

export interface QueueOwnerScope {
  workspaceId: string;
  ownerId: string;
}

interface DurableQueueMetadata extends QueueOwnerScope {
  id: string;
  documentId: string;
  label: string;
  createdAt: number;
  attempts: number;
  state: DurableQueueState;
  errorMessage?: string;
  dependsOn?: string;
}

export type DurableQueueRecord = DurableQueueMetadata & DurableMutation;
type OptionalPayload<T> = T extends { payload: unknown }
  ? Omit<T, 'payload'> & { payload?: T['payload'] }
  : never;
export type RestoredQueueRecord = OptionalPayload<DurableQueueRecord>;
type WithoutQueueState<T> = T extends DurableQueueRecord ? Omit<T, 'attempts' | 'state'> : never;
export type DurableQueueInput = WithoutQueueState<DurableQueueRecord>;

export interface OfflineOutboxStore {
  list(scope: QueueOwnerScope): Promise<RestoredQueueRecord[]>;
  insert(record: DurableQueueRecord): Promise<void>;
  update(record: DurableQueueRecord): Promise<void>;
  acknowledge(scope: QueueOwnerScope, id: string): Promise<void>;
  remove(scope: QueueOwnerScope, id: string): Promise<void>;
}

const DATABASE_NAME = 'ar-crm-offline-outbox';
const DATABASE_VERSION = 1;
const OPERATIONS_STORE = 'operations';
const KEYS_STORE = 'encryption-keys';
const ALLOWED_STAGES = new Set<PipelineStage>([
  'Prospect', 'Meeting', 'Negotiation', 'Closing Won', 'Closing Lost',
]);
const ALLOWED_SCORES = new Set<LeadScore>(['Hot', 'Warm', 'Cold', 'Unrated']);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

interface StoredOperation {
  storageKey: string;
  scopeKey: string;
  workspaceId: string;
  ownerId: string;
  id: string;
  documentId: string;
  label: string;
  kind: DurableMutation['kind'];
  createdAt: number;
  attempts: number;
  state: DurableQueueState;
  errorMessage?: string;
  dependsOn?: string;
  cryptoVersion?: number;
  iv?: Uint8Array;
  ciphertext?: ArrayBuffer;
}

interface StoredEncryptionKey {
  scopeKey: string;
  key: CryptoKey;
}

function scopeKey(scope: QueueOwnerScope): string {
  if (!scope.workspaceId.trim() || !scope.ownerId.trim()) {
    throw new Error('Offline queue requires an authenticated owner and workspace.');
  }
  return JSON.stringify([scope.workspaceId, scope.ownerId]);
}

function storageKey(scope: QueueOwnerScope, id: string): string {
  return JSON.stringify([scopeKey(scope), id]);
}

function associatedDataFor(record: Pick<DurableQueueRecord, 'workspaceId' | 'ownerId' | 'id' | 'documentId' | 'label' | 'kind' | 'createdAt' | 'dependsOn'>): Uint8Array {
  return textEncoder.encode(JSON.stringify([
    scopeKey(record), record.id, record.documentId, record.label, record.kind,
    record.createdAt, record.dependsOn ?? null, 2,
  ]));
}

function assertText(value: unknown, maxLength: number, allowEmpty = true): string {
  if (typeof value !== 'string' || value.length > maxLength || (!allowEmpty && value.trim().length === 0)) {
    throw new Error('Offline operation data failed local validation.');
  }
  return value;
}

function assertId(value: unknown): string {
  const id = assertText(value, 150, false);
  if (id.includes('/')) throw new Error('Offline operation identifier is invalid.');
  return id;
}

/** Copy only fields required by the Firestore Rules; arbitrary properties are never persisted. */
export function allowlistedMutation(mutation: DurableMutation): DurableMutation {
  const payload = mutation.payload as Record<string, unknown>;
  switch (mutation.kind) {
    case 'create-lead': {
      if (!ALLOWED_STAGES.has(payload.pipeline_stage as PipelineStage)
        || !ALLOWED_SCORES.has(payload.lead_score as LeadScore)
        || typeof payload.deal_value !== 'number'
        || !Number.isFinite(payload.deal_value)
        || payload.deal_value < 0) {
        throw new Error('Offline operation data failed local validation.');
      }
      return {
        kind: mutation.kind,
        payload: {
          company_name: assertText(payload.company_name, 200, false),
          contact_person: assertText(payload.contact_person, 200, false),
          phone: assertText(payload.phone, 200),
          industry: assertText(payload.industry, 120),
          city: assertText(payload.city, 120),
          pipeline_stage: payload.pipeline_stage as PipelineStage,
          deal_value: payload.deal_value,
          next_followup_date: assertText(payload.next_followup_date, 10),
          lead_score: payload.lead_score as LeadScore,
        },
      };
    }
    case 'update-lead-stage': {
      if (!ALLOWED_STAGES.has(payload.pipeline_stage as PipelineStage)) {
        throw new Error('Offline operation data failed local validation.');
      }
      return {
        kind: mutation.kind,
        payload: {
          lead_id: assertId(payload.lead_id),
          pipeline_stage: payload.pipeline_stage as PipelineStage,
          ...(payload.next_followup_date === undefined
            ? {}
            : { next_followup_date: assertText(payload.next_followup_date, 10) }),
        },
      };
    }
    case 'create-activity':
      return {
        kind: mutation.kind,
        payload: {
          lead_id: assertId(payload.lead_id),
          activity_type: assertText(payload.activity_type, 80, false),
          notes: assertText(payload.notes, 12_000),
        },
      };
    default:
      throw new Error('Offline operation type is not supported.');
  }
}

function labelFor(kind: DurableMutation['kind']): string {
  switch (kind) {
    case 'create-lead': return 'Tambah prospek';
    case 'update-lead-stage': return 'Ubah tahap prospek';
    case 'create-activity': return 'Simpan aktivitas';
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Browser persistence is unavailable.'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OPERATIONS_STORE)) {
        const operations = db.createObjectStore(OPERATIONS_STORE, { keyPath: 'storageKey' });
        operations.createIndex('scopeKey', 'scopeKey', { unique: false });
      }
      if (!db.objectStoreNames.contains(KEYS_STORE)) {
        db.createObjectStore(KEYS_STORE, { keyPath: 'scopeKey' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Browser persistence could not be opened.'));
    request.onblocked = () => reject(new Error('Browser persistence is blocked by another tab.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Browser persistence request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(new Error('Browser persistence transaction was aborted.'));
    transaction.onerror = () => reject(new Error('Browser persistence transaction failed.'));
  });
}

export class IndexedDbOfflineOutboxStore implements OfflineOutboxStore {
  private database?: Promise<IDBDatabase>;

  private db(): Promise<IDBDatabase> {
    this.database ??= openDatabase();
    return this.database;
  }

  private async readKey(key: string): Promise<CryptoKey | undefined> {
    const db = await this.db();
    const transaction = db.transaction(KEYS_STORE, 'readonly');
    const done = transactionDone(transaction);
    const stored = await requestResult(transaction.objectStore(KEYS_STORE).get(key) as IDBRequest<StoredEncryptionKey | undefined>);
    await done;
    return stored?.key;
  }

  private async encryptionKey(key: string, create: boolean): Promise<CryptoKey | undefined> {
    const existing = await this.readKey(key);
    if (existing || !create) return existing;
    if (!globalThis.crypto?.subtle) throw new Error('Secure browser cryptography is unavailable.');

    const generated = await globalThis.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    const db = await this.db();
    const transaction = db.transaction(KEYS_STORE, 'readwrite');
    const done = transactionDone(transaction);
    try {
      await requestResult(transaction.objectStore(KEYS_STORE).add({ scopeKey: key, key: generated } satisfies StoredEncryptionKey));
      await done;
      return generated;
    } catch {
      // Another tab may have created the partition key first; use that key rather than replacing it.
      try { await done; } catch { /* expected if add() aborted the transaction */ }
      const winner = await this.readKey(key);
      if (winner) return winner;
      throw new Error('Secure browser key storage is unavailable.');
    }
  }

  private async encode(record: DurableQueueRecord, state = record.state): Promise<StoredOperation> {
    const key = scopeKey(record);
    const base: StoredOperation = {
      storageKey: storageKey(record, record.id),
      scopeKey: key,
      workspaceId: record.workspaceId,
      ownerId: record.ownerId,
      id: record.id,
      documentId: record.documentId,
      label: labelFor(record.kind),
      kind: record.kind,
      createdAt: record.createdAt,
      attempts: record.attempts,
      state,
      ...(record.errorMessage ? { errorMessage: record.errorMessage } : {}),
      ...(record.dependsOn ? { dependsOn: record.dependsOn } : {}),
    };
    if (state === 'acknowledged') return base;

    const cryptoKey = await this.encryptionKey(key, true);
    if (!cryptoKey || !globalThis.crypto?.subtle) throw new Error('Secure browser cryptography is unavailable.');
    const allowlisted = allowlistedMutation({ kind: record.kind, payload: record.payload } as DurableMutation);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const additionalData = associatedDataFor(record);
    const ciphertext = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: asArrayBuffer(iv), additionalData: asArrayBuffer(additionalData) },
      cryptoKey,
      textEncoder.encode(JSON.stringify(allowlisted.payload)),
    );
    return { ...base, cryptoVersion: 2, iv, ciphertext };
  }

  async list(scope: QueueOwnerScope): Promise<RestoredQueueRecord[]> {
    const partition = scopeKey(scope);
    const db = await this.db();
    const transaction = db.transaction(OPERATIONS_STORE, 'readonly');
    const done = transactionDone(transaction);
    const rows = await requestResult(
      transaction.objectStore(OPERATIONS_STORE).index('scopeKey').getAll(partition) as IDBRequest<StoredOperation[]>,
    );
    await done;
    const rowsWithPayload = rows.filter((row) => row.state !== 'acknowledged');
    const cryptoKey = rowsWithPayload.length ? await this.encryptionKey(partition, false) : undefined;
    if (rowsWithPayload.length && (!cryptoKey || !globalThis.crypto?.subtle)) {
      throw new Error('Encrypted pending operations are unavailable; they were preserved and not sent.');
    }

    return Promise.all(rows.map(async (row) => {
      const metadata: RestoredQueueRecord = {
        id: row.id,
        ownerId: row.ownerId,
        workspaceId: row.workspaceId,
        documentId: row.documentId,
        label: row.label,
        kind: row.kind,
        createdAt: row.createdAt,
        attempts: row.attempts,
        state: row.state,
        ...(row.errorMessage ? { errorMessage: row.errorMessage } : {}),
        ...(row.dependsOn ? { dependsOn: row.dependsOn } : {}),
      };
      if (row.state === 'acknowledged') return metadata;
      if (!row.iv || !row.ciphertext || !cryptoKey || !globalThis.crypto?.subtle) {
        throw new Error('Encrypted pending operations are incomplete; they were preserved and not sent.');
      }
      try {
        const additionalData = row.cryptoVersion === 2
          ? associatedDataFor({
            workspaceId: row.workspaceId,
            ownerId: row.ownerId,
            id: row.id,
            documentId: row.documentId,
            label: row.label,
            kind: row.kind,
            createdAt: row.createdAt,
            ...(row.dependsOn ? { dependsOn: row.dependsOn } : {}),
          })
          : textEncoder.encode(JSON.stringify([partition, row.id, 1]));
        const plaintext = await globalThis.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: asArrayBuffer(new Uint8Array(row.iv)), additionalData: asArrayBuffer(additionalData) },
          cryptoKey,
          row.ciphertext,
        );
        const rawPayload = JSON.parse(textDecoder.decode(plaintext)) as Record<string, unknown>;
        const payload = allowlistedMutation({ kind: row.kind, payload: rawPayload } as DurableMutation).payload;
        return { ...metadata, payload } as RestoredQueueRecord;
      } catch {
        throw new Error('An encrypted pending operation could not be verified; it was preserved and not sent.');
      }
    }));
  }

  async insert(record: DurableQueueRecord): Promise<void> {
    const stored = await this.encode(record);
    const db = await this.db();
    const transaction = db.transaction(OPERATIONS_STORE, 'readwrite');
    const done = transactionDone(transaction);
    try {
      await requestResult(transaction.objectStore(OPERATIONS_STORE).add(stored));
      await done;
    } catch {
      try { await done; } catch { /* transaction may abort on duplicate ID */ }
      throw new Error('Offline operation identifier already exists or browser persistence failed.');
    }
  }

  async update(record: DurableQueueRecord): Promise<void> {
    const stored = await this.encode(record);
    const db = await this.db();
    const transaction = db.transaction(OPERATIONS_STORE, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(OPERATIONS_STORE).put(stored);
    await done;
  }

  async acknowledge(scope: QueueOwnerScope, id: string): Promise<void> {
    const db = await this.db();
    const transaction = db.transaction(OPERATIONS_STORE, 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore(OPERATIONS_STORE);
    const key = storageKey(scope, id);
    const existing = await requestResult(store.get(key) as IDBRequest<StoredOperation | undefined>);
    if (existing) {
      const { iv: _iv, ciphertext: _ciphertext, ...metadata } = existing;
      store.put({ ...metadata, state: 'acknowledged', errorMessage: undefined } satisfies StoredOperation);
    }
    await done;
  }

  async remove(scope: QueueOwnerScope, id: string): Promise<void> {
    const db = await this.db();
    const transaction = db.transaction(OPERATIONS_STORE, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(OPERATIONS_STORE).delete(storageKey(scope, id));
    await done;
  }
}

export const indexedDbOfflineOutboxStore = new IndexedDbOfflineOutboxStore();
