import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { CrmSyncEngine, CrmStorage, OfflineWriteQueue } from './syncQueue.ts';
import { allowlistedMutation, IndexedDbOfflineOutboxStore, type DurableMutation, type DurableQueueInput, type DurableQueueRecord, type OfflineOutboxStore, type QueueOwnerScope, type RestoredQueueRecord } from './offlineOutbox.ts';

// Mock localStorage for Node environment testing
const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => storageMap.get(k) || null,
  setItem: (k: string, v: string) => storageMap.set(k, v),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

test('CrmStorage initializes in clean empty state when storage is fresh', () => {
  storageMap.clear();
  const leads = CrmStorage.getLeads();
  assert.equal(leads.length, 0, 'Clean state should have 0 leads initially');
  const activities = CrmStorage.getActivities();
  assert.equal(activities.length, 0, 'Clean state should have 0 activities initially');
  const globalLeads = CrmStorage.getGlobalLeads();
  assert.equal(globalLeads.length, 0, 'Clean state should have 0 global leads initially');
});

test('CrmStorage automatically purges legacy mock lead and activity records', () => {
  storageMap.clear();
  // Simulate legacy dirty localStorage containing old mock items
  storageMap.set(
    'personal_crm_leads_v2',
    JSON.stringify([
      { id: 'LEAD-101', company_name: 'PT Nusantara Logistics' },
      { id: 'LEAD-REAL-99', company_name: 'PT Mitra Sukses Asli' },
    ])
  );
  storageMap.set(
    'personal_crm_activities_v2',
    JSON.stringify([
      { id: 'ACT-201', lead_id: 'LEAD-101' },
      { id: 'ACT-REAL-99', lead_id: 'LEAD-REAL-99' },
    ])
  );

  const cleanedLeads = CrmStorage.getLeads();
  assert.equal(cleanedLeads.length, 1);
  assert.equal(cleanedLeads[0].id, 'LEAD-REAL-99');

  const cleanedActs = CrmStorage.getActivities();
  assert.equal(cleanedActs.length, 1);
  assert.equal(cleanedActs[0].id, 'ACT-REAL-99');
});

test('CrmSyncEngine adds lead optimistically to local cache and queue', () => {
  storageMap.clear();
  const engine = new CrmSyncEngine();
  
  // Set simulated offline so it doesn't try fetch in test
  CrmStorage.setSimulatedOffline(true);
  assert.equal(engine.isOnline(), false);

  const created = engine.enqueueAddLead({
    company_name: 'Test Corp',
    contact_person: 'Tester',
    phone: '08123',
    industry: 'Fintech',
    city: 'Jakarta',
    pipeline_stage: 'Prospect',
    deal_value: 50000000,
    next_followup_date: '2026-10-30',
    lead_score: 'Hot',
  });

  assert.ok(created.id.startsWith('TEMP-LEAD-'));
  assert.equal(created._syncStatus, 'pending_insert');

  // Verify it appears at the front of stored leads
  const stored = CrmStorage.getLeads();
  assert.equal(stored[0].company_name, 'Test Corp');
  assert.equal(stored[0].id, created.id);

  // Verify mutation queue
  const queue = CrmStorage.getQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].action, 'addLead');
  assert.equal(queue[0].payload.company_name, 'Test Corp');
});

test('CrmSyncEngine enqueues stage updates correctly', () => {
  const engine = new CrmSyncEngine();
  CrmStorage.setSimulatedOffline(true);

  const leads = CrmStorage.getLeads();
  const targetId = leads[0].id;

  engine.enqueueUpdateLeadStage(targetId, 'Negotiation', '2026-11-01');

  const updatedLeads = CrmStorage.getLeads();
  const updated = updatedLeads.find((l) => l.id === targetId);
  assert.equal(updated?.pipeline_stage, 'Negotiation');
  assert.equal(updated?.next_followup_date, '2026-11-01');
  assert.equal(updated?._syncStatus, 'pending_update');
});

test('CrmSyncEngine auto-archives won deals to Archive_Logs when moved to Closing Won', () => {
  const engine = new CrmSyncEngine();
  CrmStorage.setSimulatedOffline(true);

  const leads = CrmStorage.getLeads();
  const target = leads[0];

  engine.enqueueUpdateLeadStage(target.id, 'Closing Won');

  // Verify stored archive record
  const archives = CrmStorage.getWonArchives();
  assert.ok(archives.length >= 1);
  assert.equal(archives[0].lead_id, target.id);
  assert.equal(archives[0].company_name, target.company_name);

  // Verify archive mutation is queued
  const queue = CrmStorage.getQueue();
  const archiveMutation = queue.find((m) => m.action === 'archiveClosingWon');
  assert.ok(archiveMutation);
  assert.equal(archiveMutation?.payload.company_name, target.company_name);
});

test('CrmSyncEngine keeps queued mutations local and never calls the network', async () => {
  storageMap.clear();
  const engine = new CrmSyncEngine();
  CrmStorage.setSimulatedOffline(false);
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error('Network access is disabled in this test');
  }) as typeof fetch;

  try {
    engine.enqueueAddLead({
      company_name: 'Local-only Corp',
      contact_person: 'Tester',
      phone: '08123',
      industry: 'Software',
      city: 'Jakarta',
      pipeline_stage: 'Prospect',
      deal_value: 0,
      next_followup_date: '',
      lead_score: 'Warm',
    });

    const result = await engine.processQueue();
    assert.deepEqual(result, { processed: 0, failed: 0 });
    assert.equal(fetchCalled, false);
    assert.equal(CrmStorage.getQueue().length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('importing a prospect does not invent a deal value, follow-up date, or lead score', () => {
  storageMap.clear();
  const engine = new CrmSyncEngine();
  CrmStorage.setSimulatedOffline(true);

  const imported = engine.enqueueImportGlobalLead({
    company_name: 'Review Needed Ltd',
    contact_person: 'Contact to verify',
    phone: '',
    industry: '',
    city: '',
  });

  assert.equal(imported.deal_value, 0);
  assert.equal(imported.next_followup_date, '');
  assert.equal(imported.lead_score, 'Unrated');
});


class FakeConnectivity {
  private listeners = new Set<(isOnline: boolean) => void>();

  constructor(private online: boolean) {}

  isOnline(): boolean { return this.online; }

  subscribe(listener: (isOnline: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setOnline(online: boolean): void {
    this.online = online;
    for (const listener of this.listeners) listener(online);
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.fail('Timed out waiting for queue state.');
}

const ownerScope = { workspaceId: 'workspace-test', ownerId: 'owner-test' };

class MemoryOutboxStore implements OfflineOutboxStore {
  private records = new Map<string, RestoredQueueRecord>();
  private key(scope: QueueOwnerScope, id: string): string { return JSON.stringify([scope.workspaceId, scope.ownerId, id]); }
  private clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

  async list(scope: QueueOwnerScope): Promise<RestoredQueueRecord[]> {
    return [...this.records.values()]
      .filter((record) => record.workspaceId === scope.workspaceId && record.ownerId === scope.ownerId)
      .map((record) => this.clone(record));
  }
  async insert(record: DurableQueueRecord): Promise<void> {
    const key = this.key(record, record.id);
    if (this.records.has(key)) throw new Error('duplicate operation');
    this.records.set(key, this.clone(record));
  }
  async update(record: DurableQueueRecord): Promise<void> {
    this.records.set(this.key(record, record.id), this.clone(record));
  }
  async acknowledge(scope: QueueOwnerScope, id: string): Promise<void> {
    const key = this.key(scope, id);
    const record = this.records.get(key);
    if (record) this.records.set(key, { ...record, state: 'acknowledged', payload: undefined });
  }
  async remove(scope: QueueOwnerScope, id: string): Promise<void> { this.records.delete(this.key(scope, id)); }
}

function leadRecord(id: string, overrides: Partial<DurableQueueInput> = {}): DurableQueueInput {
  return {
    id,
    label: 'Tambah prospek',
    ownerId: ownerScope.ownerId,
    workspaceId: ownerScope.workspaceId,
    documentId: `doc-${id}`,
    kind: 'create-lead',
    payload: {
      company_name: 'Synthetic Company',
      contact_person: 'Synthetic Contact',
      phone: '0000000000',
      industry: 'Test',
      city: 'Jakarta',
      pipeline_stage: 'Prospect',
      deal_value: 0,
      next_followup_date: '',
      lead_score: 'Unrated',
    },
    createdAt: Date.now(),
    ...overrides,
  } as DurableQueueInput;
}

test('offline outbox accepts only real YYYY-MM-DD calendar dates', () => {
  const record = leadRecord('calendar-date-validation');
  const createLeadMutation = (date: string): DurableMutation => ({
    kind: 'create-lead',
    payload: { ...(record.payload as Extract<DurableMutation, { kind: 'create-lead' }>['payload']), next_followup_date: date },
  });
  const updateStageMutation = (date: string): DurableMutation => ({
    kind: 'update-lead-stage',
    payload: { lead_id: 'stable-lead-id', pipeline_stage: 'Meeting', next_followup_date: date },
  });

  for (const date of ['', '2024-02-29', '2026-02-28', '2000-02-29']) {
    const lead = allowlistedMutation(createLeadMutation(date));
    const stage = allowlistedMutation(updateStageMutation(date));
    if (lead.kind !== 'create-lead') assert.fail('Expected a sanitized create-lead mutation.');
    if (stage.kind !== 'update-lead-stage') assert.fail('Expected a sanitized stage mutation.');
    assert.equal(lead.payload.next_followup_date, date);
    assert.equal(stage.payload.next_followup_date, date);
  }
  for (const date of ['2026-99-99', '2026-02-29', '2026-04-31', '2026-2-03', '0000-01-01', 'tomorrow']) {
    assert.throws(() => allowlistedMutation(createLeadMutation(date)), /local validation/);
    assert.throws(() => allowlistedMutation(updateStageMutation(date)), /local validation/);
  }
});

test('offline write is persisted locally, then acknowledged after reconnect', async () => {
  const connectivity = new FakeConnectivity(false);
  const queue = new OfflineWriteQueue(connectivity);
  let calls = 0;
  try {
    const receipt = queue.enqueue({ id: 'lead-create-1', label: 'Tambah prospek', run: async () => { calls += 1; } });
    await receipt.accepted;
    assert.equal(queue.getSnapshot().pendingCount, 1);
    assert.equal(queue.getSnapshot().operations[0].state, 'pending');
    assert.equal(calls, 0, 'offline writes must not be sent before reconnect');

    connectivity.setOnline(true);
    await receipt.acknowledged;
    assert.equal(calls, 1);
    assert.equal(queue.getSnapshot().acknowledgedCount, 1);
  } finally { queue.dispose(); }
});

test('offline-aware Firestore write stays pending until the server promise resolves', async () => {
  const connectivity = new FakeConnectivity(false);
  const store = new MemoryOutboxStore();
  const queue = new OfflineWriteQueue(connectivity, store);
  const sdkWrite = createDeferred<void>();
  const record = leadRecord('offline-sdk-write');
  let calls = 0;
  try {
    await queue.activateScope(ownerScope, async () => undefined);
    const receipt = queue.enqueue({
      id: record.id,
      label: record.label,
      durable: record,
      runWhenOffline: true,
      run: () => { calls += 1; return sdkWrite.promise; },
    });
    await receipt.accepted;
    await waitFor(() => calls === 1);
    assert.equal(queue.getSnapshot().pendingCount, 1);
    assert.equal(queue.getSnapshot().syncingCount, 0);
    assert.equal(queue.getSnapshot().operations[0].state, 'pending');

    connectivity.setOnline(true);
    assert.equal(queue.getSnapshot().syncingCount, 1);
    sdkWrite.resolve();
    await receipt.acknowledged;
    assert.equal(queue.getSnapshot().operations[0].state, 'acknowledged');
  } finally { queue.dispose(); }
});

test('scope deactivation settles in-flight and dependency-blocked receipts without stale finalization', async () => {
  const connectivity = new FakeConnectivity(false);
  const store = new MemoryOutboxStore();
  const queue = new OfflineWriteQueue(connectivity, store);
  const sdkAttempt = createDeferred<void>();
  const parent = leadRecord('scope-deactivation-parent');
  const child = {
    id: 'scope-deactivation-child',
    label: 'Simpan aktivitas',
    ownerId: ownerScope.ownerId,
    workspaceId: ownerScope.workspaceId,
    documentId: 'scope-deactivation-activity-document',
    kind: 'create-activity',
    payload: { lead_id: parent.documentId, activity_type: 'Call', notes: 'Deferred dependency test' },
    createdAt: Date.now() + 1,
    dependsOn: parent.id,
  } as DurableQueueInput;
  let parentCalls = 0;
  let childCalls = 0;

  try {
    await queue.activateScope(ownerScope, async () => undefined);
    const parentReceipt = queue.enqueue({
      id: parent.id,
      label: parent.label,
      durable: parent,
      runWhenOffline: true,
      run: () => { parentCalls += 1; return sdkAttempt.promise; },
    });
    await parentReceipt.accepted;
    await waitFor(() => parentCalls === 1);
    const childReceipt = queue.enqueue({
      id: child.id,
      label: child.label,
      durable: child,
      runWhenOffline: true,
      run: async () => { childCalls += 1; },
    });
    await childReceipt.accepted;
    const activeAttempt = queue.retry(parent.id);

    queue.deactivateScope();

    await assert.rejects(parentReceipt.acknowledged, { name: 'QueueScopeDeactivatedError' });
    await assert.rejects(childReceipt.acknowledged, { name: 'QueueScopeDeactivatedError' });
    await activeAttempt;
    assert.equal(queue.getSnapshot().operations.length, 0);
    assert.equal(childCalls, 0, 'dependency-blocked child must not run after scope deactivation');

    sdkAttempt.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const persisted = await store.list(ownerScope);
    assert.equal(persisted.length, 2, 'unconfirmed writes remain recoverable in the outbox');
    assert.equal(persisted.find((record) => record.id === parent.id)?.state, 'pending');
  } finally { queue.dispose(); }
});

test('scope deactivation settles an accepted receipt waiting on local outbox persistence', async () => {
  const store = new MemoryOutboxStore();
  const insertGate = createDeferred<void>();
  const originalInsert = store.insert.bind(store);
  store.insert = async (record) => {
    await insertGate.promise;
    await originalInsert(record);
  };
  const queue = new OfflineWriteQueue(new FakeConnectivity(false), store);
  const record = leadRecord('scope-deactivation-pending-insert');

  try {
    await queue.activateScope(ownerScope, async () => undefined);
    const receipt = queue.enqueue({
      id: record.id,
      label: record.label,
      durable: record,
      runWhenOffline: true,
      run: async () => undefined,
    });

    queue.deactivateScope();

    await assert.rejects(receipt.accepted, { name: 'QueueScopeDeactivatedError' });
    await assert.rejects(receipt.acknowledged, { name: 'QueueScopeDeactivatedError' });
    insertGate.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal((await store.list(ownerScope)).length, 1, 'a late local commit remains recoverable but is not sent');
  } finally { queue.dispose(); }
});

test('transient failures remain pending and can retry using the same operation ID', async () => {
  const queue = new OfflineWriteQueue(new FakeConnectivity(true), new MemoryOutboxStore(), { retryBaseMs: 60_000 });
  let calls = 0;
  try {
    const receipt = queue.enqueue({
      id: 'lead-update-transient',
      label: 'Ubah tahap prospek',
      run: async () => { calls += 1; if (calls === 1) throw { code: 'unavailable' }; },
    });
    await receipt.accepted;
    await waitFor(() => queue.getSnapshot().operations[0]?.state === 'pending' && queue.getSnapshot().operations[0]?.attempts === 1);
    const pending = queue.getSnapshot().operations[0];
    assert.equal(pending.canRetry, true);
    assert.match(pending.errorMessage ?? '', /Gangguan sementara/);

    await queue.retry('lead-update-transient');
    await receipt.acknowledged;
    assert.equal(calls, 2);
    assert.equal(queue.getSnapshot().acknowledgedCount, 1);
  } finally { queue.dispose(); }
});

test('permanent Rules rejection is visible and only recovers after explicit retry', async () => {
  const queue = new OfflineWriteQueue(new FakeConnectivity(true));
  let allowWrite = false;
  let calls = 0;
  try {
    const receipt = queue.enqueue({
      id: 'activity-create-1',
      label: 'Simpan aktivitas',
      run: async () => { calls += 1; if (!allowWrite) throw { code: 'permission-denied' }; },
    });
    await receipt.accepted;
    await assert.rejects(receipt.acknowledged);
    const failed = queue.getSnapshot().operations[0];
    assert.equal(failed.state, 'failed');
    assert.equal(failed.canRetry, true);
    assert.match(failed.errorMessage ?? '', /menolak operasi/);

    allowWrite = true;
    await queue.retry('activity-create-1');
    assert.equal(calls, 2);
    assert.equal(queue.getSnapshot().operations[0].state, 'acknowledged');
  } finally { queue.dispose(); }
});

test('failed validation payload can be corrected and retried with the original document ID', async () => {
  const store = new MemoryOutboxStore();
  const queue = new OfflineWriteQueue(new FakeConnectivity(true), store);
  const id = 'corrected-lead-operation';
  const record = leadRecord(id, {
    documentId: 'stable-corrected-lead-document',
    payload: {
      company_name: 'Invalid Draft',
      contact_person: 'Synthetic Contact',
      phone: '0000000000',
      industry: 'Test',
      city: 'Jakarta',
      pipeline_stage: 'Prospect',
      deal_value: 0,
      next_followup_date: '',
      lead_score: 'Unrated',
    },
  } as Partial<DurableQueueInput>);
  const attempted: Array<{ documentId: string; companyName: string }> = [];
  try {
    await queue.activateScope(ownerScope, async () => undefined);
    const receipt = queue.enqueue({
      id,
      label: record.label,
      durable: record,
      run: async () => undefined,
      runDurable: async (restored) => {
        const lead = restored as Extract<RestoredQueueRecord, { kind: 'create-lead' }>;
        attempted.push({ documentId: lead.documentId, companyName: lead.payload?.company_name ?? '' });
        if (lead.payload?.company_name === 'Invalid Draft') throw { code: 'invalid-argument' };
      },
    });
    await receipt.accepted;
    await assert.rejects(receipt.acknowledged);
    await waitFor(() => queue.getSnapshot().failedCount === 1);

    const draft = queue.getFailedMutation(id);
    assert.equal(draft?.kind, 'create-lead');
    if (draft?.kind !== 'create-lead') assert.fail('Expected create-lead correction draft.');
    await queue.correctFailedOperation(id, {
      kind: 'create-lead',
      payload: { ...draft.payload, company_name: 'Corrected Synthetic Company' },
    });
    await waitFor(() => queue.getSnapshot().acknowledgedCount === 1);
    assert.deepEqual(attempted, [
      { documentId: 'stable-corrected-lead-document', companyName: 'Invalid Draft' },
      { documentId: 'stable-corrected-lead-document', companyName: 'Corrected Synthetic Company' },
    ]);
  } finally { queue.dispose(); }
});

test('duplicate operation IDs share one acknowledgement and issue one write', async () => {
  const queue = new OfflineWriteQueue(new FakeConnectivity(true));
  const writeResult = createDeferred<void>();
  let calls = 0;
  try {
    const input = { id: 'stable-firestore-document-id', label: 'Tambah prospek', run: () => { calls += 1; return writeResult.promise; } };
    const first = queue.enqueue(input);
    const duplicate = queue.enqueue(input);
    assert.equal(duplicate.acknowledged, first.acknowledged);
    await Promise.all([first.accepted, duplicate.accepted]);
    await waitFor(() => calls === 1);
    assert.equal(queue.getSnapshot().syncingCount, 1);
    writeResult.resolve();
    await Promise.all([first.acknowledged, duplicate.acknowledged]);
    assert.equal(queue.getSnapshot().acknowledgedCount, 1);
  } finally { queue.dispose(); }
});

test('permanent failures are not automatically replayed on reconnect', async () => {
  const connectivity = new FakeConnectivity(true);
  const queue = new OfflineWriteQueue(connectivity);
  let calls = 0;
  try {
    const receipt = queue.enqueue({ id: 'permanent-rejection', label: 'Simpan perubahan', run: async () => { calls += 1; throw { code: 'invalid-argument' }; } });
    await receipt.accepted;
    await assert.rejects(receipt.acknowledged);
    connectivity.setOnline(false);
    connectivity.setOnline(true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(calls, 1);
    assert.equal(queue.getSnapshot().failedCount, 1);
  } finally { queue.dispose(); }
});

test('pending durable operation survives queue recreation and resumes for the same owner/workspace', async () => {
  const store = new MemoryOutboxStore();
  const firstConnectivity = new FakeConnectivity(false);
  const firstQueue = new OfflineWriteQueue(firstConnectivity, store);
  const record = leadRecord('durable-lead-op');
  let sendsBeforeReload = 0;
  await firstQueue.activateScope(ownerScope, async () => undefined);
  const receipt = firstQueue.enqueue({ id: record.id, label: record.label, durable: record, run: async () => { sendsBeforeReload += 1; } });
  await receipt.accepted;
  assert.equal(firstQueue.getSnapshot().pendingCount, 1);
  assert.equal((await store.list(ownerScope)).length, 1);
  firstQueue.dispose();

  const recoveredConnectivity = new FakeConnectivity(false);
  const recoveredQueue = new OfflineWriteQueue(recoveredConnectivity, store);
  let recoveredRecord: RestoredQueueRecord | undefined;
  try {
    await recoveredQueue.activateScope(ownerScope, async (restored) => { recoveredRecord = restored; });
    assert.equal(recoveredQueue.getSnapshot().pendingCount, 1);
    assert.equal(recoveredQueue.getSnapshot().operations[0].state, 'pending');
    assert.equal(sendsBeforeReload, 0);
    recoveredConnectivity.setOnline(true);
    await waitFor(() => recoveredQueue.getSnapshot().acknowledgedCount === 1);
    assert.equal(recoveredRecord?.documentId, record.documentId);
    assert.equal(recoveredRecord?.ownerId, ownerScope.ownerId);
    assert.equal(recoveredRecord?.workspaceId, ownerScope.workspaceId);
    assert.equal((await store.list(ownerScope)).length, 0);
  } finally { recoveredQueue.dispose(); }
});

test('outbox restore is isolated by both workspace and owner', async () => {
  const store = new MemoryOutboxStore();
  const firstQueue = new OfflineWriteQueue(new FakeConnectivity(false), store);
  await firstQueue.activateScope(ownerScope, async () => undefined);
  const record = leadRecord('partitioned-op');
  const receipt = firstQueue.enqueue({ id: record.id, label: record.label, durable: record, run: async () => undefined });
  await receipt.accepted;
  firstQueue.dispose();

  const otherQueue = new OfflineWriteQueue(new FakeConnectivity(false), store);
  try {
    await otherQueue.activateScope({ workspaceId: 'other-workspace', ownerId: ownerScope.ownerId }, async () => assert.fail('wrong partition sent'));
    assert.equal(otherQueue.getSnapshot().operations.length, 0);
    assert.equal((await store.list(ownerScope)).length, 1, 'another partition must not delete the original pending item');
  } finally { otherQueue.dispose(); }
});

test('activity waits for its pending lead create to be acknowledged', async () => {
  const connectivity = new FakeConnectivity(false);
  const queue = new OfflineWriteQueue(connectivity, new MemoryOutboxStore());
  const writes: string[] = [];
  const lead = leadRecord('lead-parent');
  const activity: DurableQueueInput = {
    id: 'activity-child',
    label: 'Simpan aktivitas',
    ownerId: ownerScope.ownerId,
    workspaceId: ownerScope.workspaceId,
    documentId: 'activity-doc',
    kind: 'create-activity',
    payload: { lead_id: lead.documentId, activity_type: 'Call', notes: 'Synthetic note' },
    createdAt: lead.createdAt + 1,
    dependsOn: lead.id,
  };
  try {
    await queue.activateScope(ownerScope, async () => undefined);
    const leadReceipt = queue.enqueue({ id: lead.id, label: lead.label, durable: lead, run: async () => { writes.push('lead'); } });
    const activityReceipt = queue.enqueue({ id: activity.id, label: activity.label, durable: activity, run: async () => { writes.push('activity'); } });
    await Promise.all([leadReceipt.accepted, activityReceipt.accepted]);
    const waitingActivity = queue.getSnapshot().operations.find((operation) => operation.id === activity.id);
    assert.equal(waitingActivity?.dependencyBlocked, true);
    assert.equal(waitingActivity?.canRetry, false);
    connectivity.setOnline(true);
    await Promise.all([leadReceipt.acknowledged, activityReceipt.acknowledged]);
    assert.deepEqual(writes, ['lead', 'activity']);
  } finally { queue.dispose(); }
});

test('real IndexedDB outbox encrypts a pending lead and restores it in a fresh queue instance', async () => {
  const scope = { ownerId: `owner-${Date.now()}`, workspaceId: `workspace-${Date.now()}` };
  const id = `reload-${Date.now()}`;
  const firstStore = new IndexedDbOfflineOutboxStore();
  const firstQueue = new OfflineWriteQueue(new FakeConnectivity(false), firstStore);
  const record = { ...leadRecord(id), ownerId: scope.ownerId, workspaceId: scope.workspaceId } as DurableQueueInput;
  try {
    await firstQueue.activateScope(scope, async () => undefined);
    const receipt = firstQueue.enqueue({ id, label: record.label, durable: record, run: async () => undefined });
    await receipt.accepted;
    firstQueue.dispose();

    const open = indexedDB.open('ar-crm-offline-outbox', 1);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const transaction = database.transaction('operations', 'readonly');
    const transactionDone = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    const rowsRequest = transaction.objectStore('operations').getAll();
    const rows = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      rowsRequest.onsuccess = () => resolve(rowsRequest.result as Array<Record<string, unknown>>);
      rowsRequest.onerror = () => reject(rowsRequest.error);
    });
    await transactionDone;
    database.close();
    const stored = rows.find((row) => row.id === id);
    assert.ok(stored);
    assert.equal('payload' in stored, false, 'PII payload must not be stored as an IndexedDB object field');
    assert.ok(stored.ciphertext instanceof ArrayBuffer);
    assert.equal(Buffer.from(stored.ciphertext as ArrayBuffer).includes(Buffer.from('Synthetic Company')), false);

    const recoveredConnectivity = new FakeConnectivity(false);
    const recoveredQueue = new OfflineWriteQueue(recoveredConnectivity, new IndexedDbOfflineOutboxStore());
    const replayAck = createDeferred<void>();
    let replayed: RestoredQueueRecord | undefined;
    try {
      await recoveredQueue.activateScope(scope, async (restored) => {
        replayed = restored;
        return replayAck.promise;
      });
      await waitFor(() => Boolean(replayed));
      assert.equal(recoveredQueue.getSnapshot().pendingCount, 1);
      assert.equal((replayed?.payload as Extract<DurableMutation, { kind: 'create-lead' }>['payload']).company_name, 'Synthetic Company');

      recoveredConnectivity.setOnline(true);
      replayAck.resolve();
      await waitFor(() => recoveredQueue.getSnapshot().acknowledgedCount === 1);
      assert.equal((await new IndexedDbOfflineOutboxStore().list(scope)).length, 0);
    } finally { recoveredQueue.dispose(); }
  } finally { firstQueue.dispose(); }
});

test('outbox allowlist strips unknown properties before they reach storage', () => {
  const sanitized = allowlistedMutation({
    kind: 'create-activity',
    payload: { lead_id: 'lead-safe', activity_type: 'Call', notes: 'Synthetic note', authToken: 'must-not-persist' },
  } as any);
  assert.deepEqual(sanitized, {
    kind: 'create-activity',
    payload: { lead_id: 'lead-safe', activity_type: 'Call', notes: 'Synthetic note' },
  });
});

test('stage mutation keeps follow-up date optional instead of clearing it', () => {
  const sanitized = allowlistedMutation({
    kind: 'update-lead-stage',
    payload: { lead_id: 'lead-safe', pipeline_stage: 'Meeting' },
  } as DurableMutation);
  assert.deepEqual(sanitized, {
    kind: 'update-lead-stage',
    payload: { lead_id: 'lead-safe', pipeline_stage: 'Meeting' },
  });
});
