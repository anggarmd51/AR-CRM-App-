export type LocalSyncStatus = 'synced' | 'pending_insert' | 'pending_update' | 'error';

export interface SyncStatusRecord {
  id: string;
  _syncStatus?: LocalSyncStatus;
}

/** Reconcile rendered document statuses whenever the write queue changes. */
export function reconcileDocumentSyncStatuses<T extends SyncStatusRecord>(
  records: T[],
  getStatus: (documentId: string) => LocalSyncStatus,
): T[] {
  let changed = false;
  const reconciled = records.map((record) => {
    const status = getStatus(record.id);
    if (record._syncStatus === status) return record;
    changed = true;
    return { ...record, _syncStatus: status } as T;
  });
  return changed ? reconciled : records;
}
