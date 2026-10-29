import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb, workspaceId } from './firebase.ts';
import type { Activity, Lead, LeadCorrection, PipelineStage, WonDealArchiveRecord } from './types/crm.ts';
import { firestoreWriteQueue, type QueueWriteReceipt as QueueReceipt } from './utils/offlineWriteQueue.ts';
import type { DurableMutation, DurableQueueInput, DurableQueueRecord, RestoredQueueRecord } from './utils/offlineOutbox.ts';
import { setDocWithServerReconciliation } from './utils/idempotentFirestoreCreate.ts';
import type { LeadSnapshotState } from './utils/optimisticLeadStages.ts';
import { wonArchiveMatchesLeadSnapshot } from './utils/wonArchivePolicy.ts';

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

function todayInJakarta(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
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

function mapWonDealArchive(id: string, data: DocumentData): WonDealArchiveRecord {
  return {
    ...data,
    id,
    archived_at: timestampToIso(data.archived_at) ?? '',
  } as WonDealArchiveRecord;
}

function matchesCreatedDocument(
  actual: DocumentData,
  expected: DocumentData,
  timestampKeys: string[],
): boolean {
  const expectedKeys = [...Object.keys(expected), ...timestampKeys].sort();
  const actualKeys = Object.keys(actual).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index])
    && Object.entries(expected).every(([key, value]) => Object.is(actual[key], value))
    && timestampKeys.every((key) => typeof actual[key]?.toDate === 'function');
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
    label: mutation.kind === 'create-lead'
      ? 'Tambah prospek'
      : mutation.kind === 'create-activity'
        ? 'Simpan aktivitas'
        : mutation.kind === 'update-lead-details'
          ? 'Koreksi data prospek'
          : 'Ubah tahap prospek',
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
      const { won_date: queuedWonDate, ...leadPayload } = record.payload;
      const expected = {
        ...leadPayload,
        ownerId: record.ownerId,
        role: 'owner',
      };
      if (leadPayload.pipeline_stage === 'Closing Won') {
        const archiveRef = doc(db, 'workspaces', record.workspaceId, 'wonDealArchives', record.documentId);
        const wonDate = queuedWonDate ?? todayInJakarta();
        const archiveExpected = {
          lead_id: record.documentId,
          company_name: leadPayload.company_name,
          contact_person: leadPayload.contact_person,
          phone: leadPayload.phone,
          industry: leadPayload.industry,
          city: leadPayload.city,
          deal_value: leadPayload.deal_value,
          won_date: wonDate,
          ownerId: record.ownerId,
          role: 'owner',
        };
        await runTransaction(db, async (transaction) => {
          const [leadSnapshot, archiveSnapshot] = await Promise.all([
            transaction.get(ref),
            transaction.get(archiveRef),
          ]);
          if (leadSnapshot.exists() || archiveSnapshot.exists()) {
            const actualArchive = archiveSnapshot.exists() ? archiveSnapshot.data() : undefined;
            const reconciledWonDate = queuedWonDate
              ?? (typeof actualArchive?.won_date === 'string' ? actualArchive.won_date : undefined);
            const reconciledArchive = reconciledWonDate
              ? { ...archiveExpected, won_date: reconciledWonDate }
              : archiveExpected;
            if (leadSnapshot.exists() && archiveSnapshot.exists() && actualArchive
              && matchesCreatedDocument(leadSnapshot.data(), expected, ['created_at', 'updated_at'])
              && matchesCreatedDocument(actualArchive, reconciledArchive, ['archived_at'])) return;
            throw Object.assign(new Error('Lead atau arsip dengan ID ini sudah ada dan tidak cocok dengan mutasi create.'), { code: 'already-exists' });
          }
          transaction.set(ref, {
            ...expected,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
          });
          transaction.set(archiveRef, {
            ...archiveExpected,
            archived_at: serverTimestamp(),
          });
        });
        return;
      }
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
      if (record.payload.pipeline_stage === 'Closing Won') {
        const archiveRef = doc(db, 'workspaces', record.workspaceId, 'wonDealArchives', record.documentId);
        await runTransaction(db, async (transaction) => {
          const leadSnapshot = await transaction.get(ref);
          if (!leadSnapshot.exists()) {
            throw Object.assign(new Error('Lead tidak ditemukan untuk perubahan stage.'), { code: 'not-found' });
          }
          const archiveSnapshot = await transaction.get(archiveRef);
          const lead = leadSnapshot.data();
          if (archiveSnapshot.exists() && lead.pipeline_stage !== 'Closing Won'
            && !wonArchiveMatchesLeadSnapshot(archiveSnapshot.data(), lead, record.documentId, record.ownerId)) {
            throw Object.assign(new Error('Arsip kemenangan pertama tidak cocok dengan data Lead saat ini. Arsip tidak diubah; buat Lead baru untuk peluang yang berbeda.'), { code: 'failed-precondition' });
          }
          if (!archiveSnapshot.exists()) {
            if (lead.pipeline_stage === 'Closing Won') {
              throw Object.assign(new Error('Lead Won ini belum memiliki arsip yang valid. Rekonsiliasi administratif diperlukan; arsip historis tidak dibuat ulang otomatis.'), { code: 'failed-precondition' });
            }
            transaction.set(archiveRef, {
              lead_id: record.documentId,
              company_name: lead.company_name,
              contact_person: lead.contact_person,
              phone: lead.phone,
              industry: lead.industry,
              city: lead.city,
              deal_value: lead.deal_value,
              won_date: todayInJakarta(),
              archived_at: serverTimestamp(),
              ownerId: record.ownerId,
              role: 'owner',
            });
          }
          transaction.update(ref, {
            pipeline_stage: record.payload.pipeline_stage,
            ...(record.payload.next_followup_date !== undefined
              ? { next_followup_date: record.payload.next_followup_date }
              : {}),
            updated_at: serverTimestamp(),
          });
        });
        return;
      }
      await updateDoc(ref, {
        pipeline_stage: record.payload.pipeline_stage,
        ...(record.payload.next_followup_date !== undefined
          ? { next_followup_date: record.payload.next_followup_date }
          : {}),
        updated_at: serverTimestamp(),
      });
      return;
    }
    case 'update-lead-details': {
      if (record.payload.lead_id !== record.documentId) {
        throw Object.assign(new Error('Invalid lead-details operation.'), { code: 'invalid-argument' });
      }
      const ref = doc(db, 'workspaces', record.workspaceId, 'leads', record.documentId);
      const { lead_id: _leadId, ...fields } = record.payload;
      await updateDoc(ref, { ...fields, updated_at: serverTimestamp() });
      return;
    }
    case 'create-activity': {
      const ref = doc(db, 'workspaces', record.workspaceId, 'activities', record.documentId);
      const expected = {
        lead_id: record.payload.lead_id,
        activity_type: record.payload.activity_type,
        notes: record.payload.notes,
        ...(record.payload.ai_summary !== undefined ? { ai_summary: record.payload.ai_summary } : {}),
        ...(record.payload.ai_summary_source !== undefined ? { ai_summary_source: record.payload.ai_summary_source } : {}),
        ...(record.payload.location_gps !== undefined ? { location_gps: record.payload.location_gps } : {}),
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

export function subscribeToLeads(ownerId: string, onData: (leads: Lead[], state: LeadSnapshotState) => void, onError: (error: Error) => void): Unsubscribe {
  requireOwner(ownerId);
  const ref = collection(getFirebaseDb(), 'workspaces', requireWorkspace(), 'leads');
  return onSnapshot(
    query(ref, where('ownerId', '==', ownerId), orderBy('created_at', 'desc')),
    { includeMetadataChanges: true },
    (snapshot) => onData(
      snapshot.docs.map((item) => mapLead(item.id, item.data())),
      {
        fromCache: snapshot.metadata.fromCache,
        pendingWriteIds: new Set(snapshot.docs.filter((item) => item.metadata.hasPendingWrites).map((item) => item.id)),
      },
    ),
    onError,
  );
}

export function subscribeToActivities(ownerId: string, onData: (activities: Activity[], fromCache: boolean) => void, onError: (error: Error) => void): Unsubscribe {
  requireOwner(ownerId);
  const ref = collection(getFirebaseDb(), 'workspaces', requireWorkspace(), 'activities');
  return onSnapshot(
    query(ref, where('ownerId', '==', ownerId), orderBy('created_at', 'desc')),
    { includeMetadataChanges: true },
    (snapshot) => onData(snapshot.docs.map((item) => mapActivity(item.id, item.data())), snapshot.metadata.fromCache),
    onError,
  );
}

export function subscribeToWonDealArchives(
  ownerId: string,
  onData: (archives: WonDealArchiveRecord[], fromCache: boolean) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  requireOwner(ownerId);
  const ref = collection(getFirebaseDb(), 'workspaces', requireWorkspace(), 'wonDealArchives');
  return onSnapshot(
    query(ref, where('ownerId', '==', ownerId)),
    { includeMetadataChanges: true },
    (snapshot) => onData(snapshot.docs.map((item) => mapWonDealArchive(item.id, item.data())), snapshot.metadata.fromCache),
    onError,
  );
}

export async function createLead(
  ownerId: string,
  lead: Omit<Lead, 'id' | '_syncStatus'>,
  options: { documentId?: string } = {},
): Promise<RepositoryWriteReceipt<string>> {
  const db = getFirebaseDb();
  const leadCollection = collection(db, 'workspaces', requireWorkspace(), 'leads');
  const ref = options.documentId ? doc(leadCollection, options.documentId) : doc(leadCollection);
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
      ...(lead.pipeline_stage === 'Closing Won' ? { won_date: todayInJakarta() } : {}),
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

export async function updateLeadDetails(
  ownerId: string,
  leadId: string,
  changes: LeadCorrection,
): Promise<RepositoryWriteReceipt<void>> {
  getFirebaseDb();
  const operationId = `lead-details:${leadId}:${createOperationId()}`;
  const payload: DurableMutation = {
    kind: 'update-lead-details',
    payload: { lead_id: leadId, ...changes },
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
      ...(activity.ai_summary !== undefined ? { ai_summary: activity.ai_summary } : {}),
      ...(activity.ai_summary_source !== undefined ? { ai_summary_source: activity.ai_summary_source } : {}),
      ...(activity.location_gps !== undefined ? { location_gps: activity.location_gps } : {}),
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
