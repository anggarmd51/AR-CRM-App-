import {
  addDoc,
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
import { getFirebaseDb, workspaceId } from './firebase.ts';
import type { Activity, Lead, PipelineStage } from './types/crm.ts';

function requireWorkspace(): string {
  if (!workspaceId) throw new Error('Firebase workspace is not configured.');
  return workspaceId;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
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
    _syncStatus: 'synced',
  } as Lead;
}

function mapActivity(id: string, data: DocumentData): Activity {
  return {
    ...data,
    id,
    created_at: timestampToIso(data.created_at),
    _syncStatus: 'synced',
  } as Activity;
}

export function subscribeToLeads(ownerId: string, onData: (leads: Lead[]) => void, onError: (error: Error) => void): Unsubscribe {
  const ref = collection(getFirebaseDb(), 'workspaces', requireWorkspace(), 'leads');
  return onSnapshot(
    query(ref, where('ownerId', '==', ownerId), orderBy('created_at', 'desc')),
    (snapshot) => onData(snapshot.docs.map((item) => mapLead(item.id, item.data()))),
    onError,
  );
}

export function subscribeToActivities(ownerId: string, onData: (activities: Activity[]) => void, onError: (error: Error) => void): Unsubscribe {
  const ref = collection(getFirebaseDb(), 'workspaces', requireWorkspace(), 'activities');
  return onSnapshot(
    query(ref, where('ownerId', '==', ownerId), orderBy('created_at', 'desc')),
    (snapshot) => onData(snapshot.docs.map((item) => mapActivity(item.id, item.data()))),
    onError,
  );
}

export async function createLead(ownerId: string, lead: Omit<Lead, 'id' | '_syncStatus'>): Promise<string> {
  const ref = collection(getFirebaseDb(), 'workspaces', requireWorkspace(), 'leads');
  const result = await addDoc(ref, stripUndefined({
    ...lead,
    ownerId,
    role: 'owner',
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  }));
  return result.id;
}

export async function updateLeadStage(ownerId: string, leadId: string, pipeline_stage: PipelineStage, next_followup_date?: string): Promise<void> {
  const ref = doc(getFirebaseDb(), 'workspaces', requireWorkspace(), 'leads', leadId);
  // ownerId is intentionally not supplied: ownership is immutable in Rules.
  await updateDoc(ref, stripUndefined({ pipeline_stage, next_followup_date, updated_at: serverTimestamp() }));
}

export async function createActivity(ownerId: string, activity: Omit<Activity, 'id' | '_syncStatus' | 'created_at'>): Promise<string> {
  const ref = collection(getFirebaseDb(), 'workspaces', requireWorkspace(), 'activities');
  const result = await addDoc(ref, stripUndefined({
    lead_id: activity.lead_id,
    activity_type: activity.activity_type,
    notes: activity.notes,
    ownerId,
    role: 'owner',
    created_at: serverTimestamp(),
  }));
  return result.id;
}

export function toFirestoreDate(value: DocumentData['created_at']): string | undefined {
  return timestampToIso(value);
}
