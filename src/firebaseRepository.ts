import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb, workspaceId } from './firebase.ts';
import type { Activity, Lead, PipelineStage } from './types/crm.ts';
import { firestoreWriteQueue, type QueueWriteReceipt as QueueReceipt } from './utils/syncQueue.ts';
import type { DurableMutation, DurableQueueInput, DurableQueueRecord, RestoredQueueRecord } from './utils/offlineOutbox.ts';
import { setDocWithServerReconciliation } from './utils/idempotentFirestoreCreate.ts';

export interface RepositoryWriteReceipt<T = void> {
  operationId: string;
  state: 'queued-locally';
  acknowledged: Promise<void>;
  id?: string;
}

function requireWorkspace(): string {
  if (!workspaceId) throw new Error('Firebase workspace is not configured.');
  return workspaceId;
}

function requireOwner(ownerId: string): void {
  const currentUid = getFirebaseAuth().currentUser?.uid;
  if (!currentUid || currentUid !== ownerId) {
    throw Object.assign(new Error('The authenticated owner changed before the write could be sent.'), { code: 'auth/unauthenticated' });
  }
}

function createOperationId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function timestampToIso(value: DocumentData['created_at']): string | undefined {
  return value?.toDate?.()?.toISOString?.() ?? (typeof value === 'string' ? value : undefined);
}

function mapLead(id: string, data: DocumentData): Lead {
  return {
    ...data,
    id,
    created_at: timestampToIso(data.created_at),
    updated_at: timestampToIso(data.updated_at),
    _syncStatus: firestoreWriteQueue.getDocumentSyncStatus(id),
  } as Lead;
}

function mapActivity(id: string, data: DocumentData): Activity {
  return {
    ...data,
    id,
    created_at: timestampToIso(data.created_at),
    _syncStatus: firestoreWriteQueue.getDocumentSyncStatus(id),
  } as Activity;
}

function createDurableRecord(
  ownerId: string,
  id: string,
  mutation: DurableMutation,
  documentId: string,
  dependsOn?: string,
): DurableQueueInput {
  return {
    id,
    label: mutation.kind === 'create-lead' ? 'Tambah prospek' : mutation.kind === 'create-activity' ? 'Simpan aktivitas' : 'Ubah tahap prospek',
    ownerId,
    workspaceId: requireWorkspace(),
    documentId,
    createdAt: Date.now(),
    ...(dependsOn ? { dependsOn } : {}),
    ...mutation,
  } as DurableQueueInput;
}

function durableRecordForReplay(record: RestoredQueueRecord): DurableQueueRecord {
  if (!record.payload) throw new Error('Offline operation is missing its encrypted payload.');
  return { ...record, payload: record.payload, state: record.state, attempts: record.attempts } as DurableQueueRecord;
}

async function executeDurableMutation(restored: RestoredQueueRecord): Promise<void> {
  const record = durableRecordForReplay(restored);
  const activeWorkspace = requireWorkspace();
  if (record.workspaceId !== activeWorkspace) {
    throw Object.assign(new Error('Offline operation belongs to another workspace.'), { code: 'permission-denied' });
  }
  requireOwner(record.ownerId);
  const db = getFirebaseDb();

  switch (record.kind) {
    case 'create-lead': {
      const ref = doc(db, 'workspaces', record.workspaceId, 'leads', record.documentId);
      const expected = {
        ...record.payload,
        ownerId: record.ownerId,
        role: 'owner',
      };
      await setDocWithServerReconciliation(ref, {
        ...expected,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      }, expected);
      return;
    }
    case 'update-lead-stage': {
      if (record.payload.lead_id !== record.documentId) {
        throw Object.assign(new Error('Invalid lead-stage operation.'), { code: 'invalid-argument' });
      }
      const ref = doc(db, 'workspaces', record.workspaceId, 'leads', record.documentId);
      await updateDoc(ref, {
        pipeline_stage: record.payload.pipeline_stage,
        ...(record.payload.next_followup_date !== undefined
          ? { next_followup_date: record.payload.next_followup_date }
          : {}),
        updated_at: serverTimestamp(),
      });
      return;
    }
    case 'create-activity': {
      const ref = doc(db, 'workspaces', record.workspaceId, 'activities', record.documentId);
      const expected = {
        lead_id: record.payload.lead_id,
        activity_type: record.payload.activity_type,
        notes: record.payload.notes,
        ownerId: record.ownerId,
        role: 'owner',
      };
      await setDocWithServerReconciliation(ref, {
        ...expected,
        created_at: serverTimestamp(),
      }, expected);
      return;
    }
  }
}

function enqueueDurable(
  ownerId: string,
  record: DurableQueueInput,
): QueueReceipt<void> {
  requireOwner(ownerId);
  const receipt = firestoreWriteQueue.enqueue({
    id: record.id,
    label: record.label,
    durable: record,
    runWhenOffline: true,
    runDurable: executeDurableMutation,
    run: () => executeDurableMutation({ ...record, attempts: 0, state: 'pending' } as RestoredQueueRecord),
  });
  return receipt;
}

export async function activateFirestoreWriteQueue(ownerId: string): Promise<void> {
  requireOwner(ownerId);
  await firestoreWriteQueue.activateScope(
    { ownerId, workspaceId: requireWorkspace() },
    executeDurableMutation,
  );
}

export function deactivateFirestoreWriteQueue(): void {
  firestoreWriteQueue.deactivateScope();
}

export function subscribeToLeads(ownerId: string, onData: (leads: Lead[]) => void, onError: (error: Error) => void): Unsubscribe {
  requireOwner(ownerId);
  const ref = collection(getFirebaseDb(), 'workspaces', requireWorkspace(), 'leads');
  return onSnapshot(
    query(ref, where('ownerId', '==', ownerId), orderBy('created_at', 'desc')),
    { includeMetadataChanges: true },
    (snapshot) => onData(snapshot.docs.map((item) => mapLead(item.id, item.data()))),
    onError,
  );
}

export function subscribeToActivities(ownerId: string, onData: (activities: Activity[]) => void, onError: (error: Error) => void): Unsubscribe {
  requireOwner(ownerId);
  const ref = collection(getFirebaseDb(), 'workspaces', requireWorkspace(), 'activities');
  return onSnapshot(
    query(ref, where('ownerId', '==', ownerId), orderBy('created_at', 'desc')),
    { includeMetadataChanges: true },
    (snapshot) => onData(snapshot.docs.map((item) => mapActivity(item.id, item.data()))),
    onError,
  );
}

export async function createLead(ownerId: string, lead: Omit<Lead, 'id' | '_syncStatus'>): Promise<RepositoryWriteReceipt<string>> {
  const db = getFirebaseDb();
  const ref = doc(collection(db, 'workspaces', requireWorkspace(), 'leads'));
  const operationId = `lead-create:${ref.id}`;
  const payload: DurableMutation = {
    kind: 'create-lead',
    payload: {
      company_name: lead.company_name,
      contact_person: lead.contact_person,
      phone: String(lead.phone ?? ''),
      industry: lead.industry,
      city: lead.city,
      pipeline_stage: lead.pipeline_stage,
      deal_value: Number(lead.deal_value) || 0,
      next_followup_date: lead.next_followup_date || '',
      lead_score: lead.lead_score,
    },
  };
  const durable = createDurableRecord(ownerId, operationId, payload, ref.id);
  const receipt = enqueueDurable(ownerId, durable);
  await receipt.accepted;
  return { id: ref.id, operationId, state: 'queued-locally', acknowledged: receipt.acknowledged };
}

export async function updateLeadStage(
  ownerId: string,
  leadId: string,
  pipeline_stage: PipelineStage,
  next_followup_date?: string,
): Promise<RepositoryWriteReceipt<void>> {
  getFirebaseDb();
  const operationId = `lead-stage:${leadId}:${createOperationId()}`;
  const payload: DurableMutation = {
    kind: 'update-lead-stage',
    payload: {
      lead_id: leadId,
      pipeline_stage,
      ...(next_followup_date !== undefined ? { next_followup_date } : {}),
    },
  };
  const dependency = firestoreWriteQueue.dependencyForLead(leadId);
  const durable = createDurableRecord(ownerId, operationId, payload, leadId, dependency);
  const receipt = enqueueDurable(ownerId, durable);
  await receipt.accepted;
  return { operationId, state: 'queued-locally', acknowledged: receipt.acknowledged };
}

export async function createActivity(
  ownerId: string,
  activity: Omit<Activity, 'id' | '_syncStatus' | 'created_at'>,
): Promise<RepositoryWriteReceipt<string>> {
  const db = getFirebaseDb();
  const ref = doc(collection(db, 'workspaces', requireWorkspace(), 'activities'));
  const operationId = `activity-create:${ref.id}`;
  const payload: DurableMutation = {
    kind: 'create-activity',
    payload: {
      lead_id: activity.lead_id,
      activity_type: activity.activity_type,
      notes: activity.notes,
    },
  };
  const dependency = firestoreWriteQueue.dependencyForLead(activity.lead_id);
  const durable = createDurableRecord(ownerId, operationId, payload, ref.id, dependency);
  const receipt = enqueueDurable(ownerId, durable);
  await receipt.accepted;
  return { id: ref.id, operationId, state: 'queued-locally', acknowledged: receipt.acknowledged };
}

export function toFirestoreDate(value: DocumentData['created_at']): string | undefined {
  return timestampToIso(value);
}
