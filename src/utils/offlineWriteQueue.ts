import {
  indexedDbOfflineOutboxStore,
  allowlistedMutation,
  type DurableMutation,
  type DurableQueueInput,
  type DurableQueueRecord,
  type DurableQueueState,
  type OfflineOutboxStore,
  type QueueOwnerScope,
  type RestoredQueueRecord,
} from './offlineOutbox.ts';

export type SyncOperationState = DurableQueueState;

export interface SyncQueueOperation {
  id: string;
  label: string;
  state: SyncOperationState;
  attempts: number;
  canRetry: boolean;
  dependencyBlocked: boolean;
  requiresManualReplay: boolean;
  errorMessage?: string;
}

export interface SyncQueueSnapshot {
  operations: SyncQueueOperation[];
  pendingCount: number;
  syncingCount: number;
  failedCount: number;
  acknowledgedCount: number;
  manualReplayCount: number;
  isSyncing: boolean;
  isRestoring: boolean;
}

interface ConnectivitySource {
  isOnline(): boolean;
  subscribe(listener: (isOnline: boolean) => void): () => void;
}

export type DurableOperationInput = DurableQueueInput;

interface EnqueueInput<T> {
  id: string;
  label: string;
  run: () => Promise<T>;
  runDurable?: (record: RestoredQueueRecord) => Promise<T>;
  durable?: DurableOperationInput;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
  settled: boolean;
}

interface QueuedOperation<T = unknown> {
  id: string;
  label: string;
  activationVersion: number;
  deactivation: Deferred<void>;
  run: () => Promise<T>;
  runDurable?: (record: RestoredQueueRecord) => Promise<T>;
  durable?: DurableOperationInput;
  state: SyncOperationState;
  attempts: number;
  inFlight: boolean;
  accepted: boolean;
  persisted: boolean;
  requiresManualReplay: boolean;
  errorMessage?: string;
  currentAttempt?: Promise<void>;
  acceptedPromise: Promise<void>;
  acknowledgement: Deferred<T>;
  retryTimer?: ReturnType<typeof setTimeout>;
}

export interface QueueWriteReceipt<T> {
  operationId: string;
  /** Resolves only after the local outbox transaction has committed. */
  accepted: Promise<void>;
  /** Resolves on Firestore acknowledgement; transient/offline retries may keep it pending. */
  acknowledged: Promise<T>;
}

export class QueueScopeDeactivatedError extends Error {
  constructor() {
    super('Offline write queue scope was deactivated before the operation completed.');
    this.name = 'QueueScopeDeactivatedError';
  }
}

export class OfflineWriteBlockedError extends Error {
  constructor() {
    super('Perangkat sedang offline. Perubahan baru tidak disimpan. Sambungkan kembali lalu coba lagi; perubahan tertunda sebelumnya tetap aman dan menunggu koneksi.');
    this.name = 'OfflineWriteBlockedError';
  }
}

export interface OfflineWriteQueueOptions {
  retryBaseMs?: number;
  retryMaxMs?: number;
}

const PERMANENT_FIRESTORE_ERRORS = new Set([
  'permission-denied',
  'invalid-argument',
  'failed-precondition',
  'unauthenticated',
  'not-found',
  'already-exists',
  'out-of-range',
]);

function safeErrorMessage(error: unknown): string {
  const rawCode = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  const code = rawCode.slice(rawCode.lastIndexOf('/') + 1);
  if (PERMANENT_FIRESTORE_ERRORS.has(code)) {
    return 'Firestore menolak operasi (akses atau validasi). Periksa akun/data sebelum mencoba lagi.';
  }
  return 'Gangguan sementara. Operasi tetap tersimpan lokal dan akan dicoba lagi saat koneksi tersedia.';
}

const browserConnectivity: ConnectivitySource = {
  isOnline() {
    return typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean' || navigator.onLine;
  },
  subscribe(listener) {
    if (typeof window === 'undefined') return () => undefined;
    const onOnline = () => listener(true);
    const onOffline = () => listener(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  },
};

function createDeferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  // The UI primarily observes the queue snapshot; a caller may choose not to await this receipt.
  void promise.catch(() => undefined);
  return {
    promise,
    resolve(value) { if (!this.settled) { this.settled = true; resolvePromise(value); } },
    reject(error) { if (!this.settled) { this.settled = true; rejectPromise(error); } },
    settled: false,
  };
}

function scopeMatches(record: QueueOwnerScope, scope: QueueOwnerScope): boolean {
  return record.ownerId === scope.ownerId && record.workspaceId === scope.workspaceId;
}

function sortByCreation(left: QueuedOperation, right: QueuedOperation): number {
  const leftTime = left.durable?.createdAt ?? 0;
  const rightTime = right.durable?.createdAt ?? 0;
  return leftTime - rightTime || left.id.localeCompare(right.id);
}

export class OfflineWriteQueue {
  private readonly operations = new Map<string, QueuedOperation>();
  private readonly listeners = new Set<(snapshot: SyncQueueSnapshot) => void>();
  private readonly unsubscribeConnectivity: () => void;
  private online: boolean;
  private scope?: QueueOwnerScope;
  private replay?: (record: RestoredQueueRecord) => Promise<unknown>;
  private restoring = false;
  private pumpPromise?: Promise<void>;
  private activationVersion = 0;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;

  constructor(
    private readonly connectivity: ConnectivitySource = browserConnectivity,
    private readonly store: OfflineOutboxStore = indexedDbOfflineOutboxStore,
    options: OfflineWriteQueueOptions = {},
  ) {
    this.online = connectivity.isOnline();
    this.retryBaseMs = options.retryBaseMs ?? 1_000;
    this.retryMaxMs = options.retryMaxMs ?? 30_000;
    this.unsubscribeConnectivity = connectivity.subscribe((isOnline) => this.handleConnectivityChange(isOnline));
  }

  getSnapshot(): SyncQueueSnapshot {
    const operations = [...this.operations.values()]
      .filter((operation) => operation.accepted)
      .sort(sortByCreation)
      .map((operation) => ({
        id: operation.id,
        label: operation.label,
        state: operation.state,
        attempts: operation.attempts,
        canRetry: !operation.inFlight && !this.isDependencyBlocked(operation)
          && (operation.state === 'pending' || operation.state === 'failed'),
        dependencyBlocked: this.isDependencyBlocked(operation),
        requiresManualReplay: operation.requiresManualReplay,
        ...(operation.errorMessage ? { errorMessage: operation.errorMessage } : {}),
      }));
    const pendingCount = operations.filter((operation) => operation.state === 'pending').length;
    const syncingCount = operations.filter((operation) => operation.state === 'syncing').length;
    const failedCount = operations.filter((operation) => operation.state === 'failed').length;
    const acknowledgedCount = operations.filter((operation) => operation.state === 'acknowledged').length;
    return {
      operations,
      pendingCount,
      syncingCount,
      failedCount,
      acknowledgedCount,
      manualReplayCount: operations.filter((operation) => operation.requiresManualReplay).length,
      isSyncing: syncingCount > 0,
      isRestoring: this.restoring,
    };
  }

  subscribe(listener: (snapshot: SyncQueueSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  async activateScope(scope: QueueOwnerScope, replay: (record: RestoredQueueRecord) => Promise<unknown>): Promise<void> {
    if (this.scope?.ownerId === scope.ownerId && this.scope.workspaceId === scope.workspaceId && this.replay) return;
    this.deactivateScope();
    const version = ++this.activationVersion;
    const activeScope = { ownerId: scope.ownerId, workspaceId: scope.workspaceId };
    this.scope = activeScope;
    this.replay = replay;
    this.restoring = true;
    this.notify();

    try {
      const records = await this.store.list(activeScope);
      if (version !== this.activationVersion) return;
      for (const record of records) {
        if (version !== this.activationVersion) return;
        if (!scopeMatches(record, activeScope)) continue;
        if (record.state === 'acknowledged') {
          await this.store.remove(activeScope, record.id);
          if (version !== this.activationVersion) return;
          continue;
        }
        if (!record.payload) throw new Error('Pending outbox record has no recoverable payload.');
        const restoredRecord: RestoredQueueRecord = {
          ...record,
          state: record.state === 'syncing' ? 'pending' : record.state,
        };
        const durable = {
          id: record.id,
          ownerId: record.ownerId,
          workspaceId: record.workspaceId,
          documentId: record.documentId,
          label: record.label,
          kind: record.kind,
          payload: record.payload,
          createdAt: record.createdAt,
          ...(record.dependsOn ? { dependsOn: record.dependsOn } : {}),
        } as DurableOperationInput;
        const operation = this.createOperation({
          id: record.id,
          label: record.label,
          durable,
          run: () => replay(restoredRecord),
          runDurable: replay,
          state: restoredRecord.state,
          attempts: record.attempts,
          accepted: true,
          persisted: true,
          requiresManualReplay: true,
          activationVersion: version,
        });
        if (version !== this.activationVersion) return;
        operation.errorMessage = record.state === 'syncing' ? undefined : record.errorMessage;
        this.operations.set(operation.id, operation);
        if (record.state === 'syncing') {
          await this.store.update(this.toRecord(operation));
          if (version !== this.activationVersion) return;
        }
      }
      if (version !== this.activationVersion) return;
      this.restoring = false;
      this.notify();
      this.schedulePump();
    } catch (error) {
      if (version === this.activationVersion) {
        this.restoring = false;
        this.notify();
      }
      throw error;
    }
  }

  deactivateScope(): void {
    this.activationVersion += 1;
    this.restoring = false;
    this.scope = undefined;
    this.replay = undefined;
    const deactivatedError = new QueueScopeDeactivatedError();
    for (const operation of this.operations.values()) {
      if (operation.retryTimer) clearTimeout(operation.retryTimer);
      operation.deactivation.resolve();
      operation.acknowledgement.reject(deactivatedError);
    }
    this.operations.clear();
    this.notify();
  }

  enqueue<T>(input: EnqueueInput<T>): QueueWriteReceipt<T> {
    const existing = this.operations.get(input.id) as QueuedOperation<T> | undefined;
    if (existing) {
      return { operationId: existing.id, accepted: existing.acceptedPromise, acknowledged: existing.acknowledgement.promise };
    }
    if (input.durable && !this.refreshConnectivity()) throw new OfflineWriteBlockedError();

    const operation = this.createOperation({
      ...input,
      state: this.online ? 'pending' : 'pending',
      attempts: 0,
      accepted: false,
      persisted: !input.durable,
      requiresManualReplay: false,
      activationVersion: this.activationVersion,
    });
    this.operations.set(operation.id, operation);
    operation.acceptedPromise = (async () => {
      try {
        if (operation.durable) {
          if (!this.scope || !scopeMatches(operation.durable, this.scope)) {
            throw new Error('Queue owner/workspace is not active.');
          }
          await this.awaitWhileActive(operation, this.store.insert(this.toRecord(operation)));
          operation.persisted = true;
        }
        if (!this.isOperationCurrent(operation)) throw new QueueScopeDeactivatedError();
        operation.accepted = true;
        this.notify();
        this.schedulePump();
      } catch (error) {
        if (!this.isOperationCurrent(operation)) throw error;
        operation.accepted = true;
        operation.persisted = false;
        operation.state = 'failed';
        operation.errorMessage = 'Tidak dapat menyimpan antrean lokal dengan aman; operasi belum dikirim ke Firestore.';
        operation.acknowledgement.reject(error);
        this.notify();
        throw error;
      }
    })();
    void operation.acceptedPromise.catch(() => undefined);
    return { operationId: operation.id, accepted: operation.acceptedPromise, acknowledged: operation.acknowledgement.promise };
  }

  retry(id: string): Promise<void> {
    const operation = this.operations.get(id);
    if (!operation || operation.state === 'acknowledged') return Promise.resolve();
    if (operation.requiresManualReplay) {
      if (!this.refreshConnectivity()) throw new OfflineWriteBlockedError();
      operation.requiresManualReplay = false;
      this.notify();
    }
    if (operation.currentAttempt) return operation.currentAttempt;
    return this.retryOperation(operation);
  }

  /** Explicitly releases restored operations for replay after an owner action. */
  startManualReplay(): number {
    if (!this.refreshConnectivity()) return 0;
    const awaitingOwner = [...this.operations.values()].filter((operation) =>
      operation.accepted
      && operation.requiresManualReplay
      && !operation.inFlight
      && (operation.state === 'pending' || operation.state === 'failed'));
    for (const operation of awaitingOwner) {
      if (operation.retryTimer) {
        clearTimeout(operation.retryTimer);
        operation.retryTimer = undefined;
      }
      operation.requiresManualReplay = false;
      if (operation.state === 'failed') {
        operation.state = 'pending';
        operation.errorMessage = undefined;
      }
    }
    if (awaitingOwner.length > 0) {
      this.notify();
      this.schedulePump();
    }
    return awaitingOwner.length;
  }

  retryFailed(): number {
    const failed = [...this.operations.values()].filter((operation) => operation.accepted && operation.state === 'failed' && !operation.inFlight);
    for (const operation of failed) void this.retry(operation.id).catch(() => undefined);
    return failed.length;
  }

  getFailedMutation(id: string): DurableMutation | undefined {
    const operation = this.operations.get(id);
    if (!operation?.durable || operation.state !== 'failed') return undefined;
    return allowlistedMutation({ kind: operation.durable.kind, payload: operation.durable.payload } as DurableMutation);
  }

  async correctFailedOperation(id: string, mutation: DurableMutation): Promise<void> {
    const operation = this.operations.get(id);
    if (!operation?.durable || operation.state !== 'failed') throw new Error('Only a failed durable operation can be corrected.');
    if (!this.refreshConnectivity()) throw new OfflineWriteBlockedError();
    const sanitized = allowlistedMutation(mutation);
    if (sanitized.kind !== operation.durable.kind) throw new Error('A correction cannot change the operation type.');
    if (sanitized.kind === 'update-lead-stage' && sanitized.payload.lead_id !== operation.durable.documentId) {
      throw new Error('A correction cannot change the lead document ID.');
    }

    const previousRecord = operation.durable;
    const previousError = operation.errorMessage;
    const previousManualReplayRequired = operation.requiresManualReplay;
    operation.durable = { ...previousRecord, payload: sanitized.payload } as DurableOperationInput;
    operation.state = 'pending';
    operation.errorMessage = undefined;
    operation.requiresManualReplay = false;
    try {
      if (!this.scope || !scopeMatches(operation.durable, this.scope)) throw new Error('Queue owner/workspace is not active.');
      await this.awaitWhileActive(operation, this.store.update(this.toRecord(operation)));
      if (!this.isOperationCurrent(operation)) throw new QueueScopeDeactivatedError();
    } catch (error) {
      if (!this.isOperationCurrent(operation)) throw new QueueScopeDeactivatedError();
      operation.durable = previousRecord;
      operation.state = 'failed';
      operation.errorMessage = previousError ?? 'Koreksi belum tersimpan ke outbox lokal; operasi tidak dikirim.';
      operation.requiresManualReplay = previousManualReplayRequired;
      this.notify();
      throw error;
    }
    this.notify();
    this.schedulePump();
  }

  /** Returns the pending lead-create operation ID so dependent writes wait for its acknowledgement. */
  dependencyForLead(documentId: string): string | undefined {
    for (const operation of this.operations.values()) {
      if (operation.durable?.kind === 'create-lead'
        && operation.durable.documentId === documentId
        && operation.state !== 'acknowledged') return operation.id;
    }
    return undefined;
  }

  getDocumentSyncStatus(documentId: string): 'synced' | 'pending_insert' | 'pending_update' | 'error' {
    const matching = [...this.operations.values()]
      .filter((operation) => operation.durable?.documentId === documentId)
      .sort((left, right) => sortByCreation(right, left));
    const latest = matching[0];
    if (!latest || latest.state === 'acknowledged') return 'synced';
    if (latest.state === 'failed') return 'error';
    return latest.durable?.kind === 'create-lead' || latest.durable?.kind === 'create-activity'
      ? 'pending_insert'
      : 'pending_update';
  }

  dispose(): void {
    this.deactivateScope();
    this.unsubscribeConnectivity();
    this.listeners.clear();
  }

  private createOperation<T>(input: {
    id: string;
    label: string;
    activationVersion: number;
    run: () => Promise<T>;
    runDurable?: (record: RestoredQueueRecord) => Promise<T>;
    durable?: DurableOperationInput;
    state: SyncOperationState;
    attempts: number;
    accepted: boolean;
    persisted: boolean;
    requiresManualReplay: boolean;
  }): QueuedOperation<T> {
    const acknowledgement = createDeferred<T>();
    const operation = {
      ...input,
      deactivation: createDeferred<void>(),
      inFlight: false,
      acceptedPromise: Promise.resolve(),
      acknowledgement,
    } satisfies QueuedOperation<T>;
    return operation;
  }

  private toRecord(operation: QueuedOperation, state = operation.state, attempts = operation.attempts): DurableQueueRecord {
    if (!operation.durable) throw new Error('Operation has no durable record.');
    return {
      ...operation.durable,
      attempts,
      state,
      ...(operation.errorMessage ? { errorMessage: operation.errorMessage } : {}),
    } as DurableQueueRecord;
  }

  private toRestoredRecord(operation: QueuedOperation): RestoredQueueRecord {
    return this.toRecord(operation) as RestoredQueueRecord;
  }

  private async retryOperation(operation: QueuedOperation): Promise<void> {
    await operation.acceptedPromise.catch(() => undefined);
    if (!this.isOperationCurrent(operation)) throw new QueueScopeDeactivatedError();
    if (operation.durable && !this.refreshConnectivity()) throw new OfflineWriteBlockedError();
    if (operation.state === 'acknowledged') return;
    if (this.isDependencyBlocked(operation)) return;
    if (operation.retryTimer) {
      clearTimeout(operation.retryTimer);
      operation.retryTimer = undefined;
    }
    if (!operation.persisted && operation.durable) {
      try {
        if (!this.scope || !scopeMatches(operation.durable, this.scope)) throw new Error('Queue owner/workspace is not active.');
        await this.awaitWhileActive(operation, this.store.insert(this.toRecord(operation, 'pending')));
        if (!this.isOperationCurrent(operation)) throw new QueueScopeDeactivatedError();
        operation.persisted = true;
      } catch (error) {
        if (!this.isOperationCurrent(operation)) throw new QueueScopeDeactivatedError();
        operation.state = 'failed';
        operation.errorMessage = 'Tidak dapat menyimpan antrean lokal dengan aman; operasi belum dikirim ke Firestore.';
        this.notify();
        throw error;
      }
    }
    operation.state = 'pending';
    operation.errorMessage = undefined;
    this.notify();
    return this.runOperation(operation);
  }

  private runOperation(operation: QueuedOperation): Promise<void> {
    if (!this.isOperationCurrent(operation)
      || !this.refreshConnectivity()
      || operation.inFlight
      || operation.state === 'acknowledged'
      || this.isDependencyBlocked(operation)) return Promise.resolve();
    if (operation.currentAttempt) return operation.currentAttempt;
    const running = this.performOperation(operation);
    operation.currentAttempt = running;
    void running.finally(() => {
      if (operation.currentAttempt === running) operation.currentAttempt = undefined;
    }).catch(() => undefined);
    return running;
  }

  private async performOperation(operation: QueuedOperation): Promise<void> {
    if (!this.isOperationCurrent(operation)
      || !this.refreshConnectivity()
      || operation.inFlight
      || operation.state === 'acknowledged'
      || this.isDependencyBlocked(operation)) return;
    operation.inFlight = true;
    operation.state = 'syncing';
    operation.attempts += 1;
    operation.errorMessage = undefined;
    this.notify();

    if (operation.durable && operation.persisted) {
      try {
        await this.awaitWhileActive(operation, this.store.update(this.toRecord(operation)));
      } catch (error) {
        if (!this.isOperationCurrent(operation)) {
          operation.inFlight = false;
          return;
        }
        operation.state = 'failed';
        operation.errorMessage = 'Tidak dapat memperbarui status antrean lokal; operasi tidak dikirim.';
        operation.acknowledgement.reject(error);
        operation.inFlight = false;
        this.notify();
        throw error;
      }
    }

    if (!this.isOperationCurrent(operation)) return;
    try {
      const attempt = Promise.resolve().then(() => operation.durable && operation.runDurable
        ? operation.runDurable(this.toRestoredRecord(operation))
        : operation.run());
      const result = await this.awaitWhileActive(operation, attempt);
      if (!this.isOperationCurrent(operation)) return;
      if (operation.durable && operation.persisted) {
        try {
          await this.awaitWhileActive(operation, this.store.acknowledge(operation.durable, operation.id));
          if (!this.isOperationCurrent(operation)) return;
          await this.awaitWhileActive(operation, this.store.remove(operation.durable, operation.id));
        } catch {
          if (!this.isOperationCurrent(operation)) return;
          // Firestore has acknowledged the stable document/patch. A leftover outbox row is safe to reconcile on next boot.
        }
      }
      if (!this.isOperationCurrent(operation)) return;
      operation.state = 'acknowledged';
      operation.errorMessage = undefined;
      operation.acknowledgement.resolve(result);
      this.pruneAcknowledgements();
    } catch (error) {
      if (!this.isOperationCurrent(operation)) return;
      const rawCode = error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : '';
      const code = rawCode.slice(rawCode.lastIndexOf('/') + 1);
      const permanent = PERMANENT_FIRESTORE_ERRORS.has(code);
      operation.state = permanent ? 'failed' : 'pending';
      operation.errorMessage = safeErrorMessage(error);
      if (permanent) operation.acknowledgement.reject(error);
      if (operation.durable && operation.persisted) {
        try {
          await this.awaitWhileActive(operation, this.store.update(this.toRecord(operation)));
        } catch {
          if (!this.isOperationCurrent(operation)) return;
          // Outbox remains recoverable with the prior safe status.
        }
      }
      if (!this.isOperationCurrent(operation)) return;
      if (!permanent) this.scheduleRetry(operation);
      this.notify();
      throw error;
    } finally {
      operation.inFlight = false;
      this.notify();
    }
  }

  private isOperationCurrent(operation: QueuedOperation): boolean {
    return operation.activationVersion === this.activationVersion
      && this.operations.get(operation.id) === operation
      && (!operation.durable || Boolean(this.scope && scopeMatches(operation.durable, this.scope)));
  }

  private async awaitWhileActive<T>(operation: QueuedOperation, promise: Promise<T>): Promise<T> {
    const outcome = await Promise.race([
      promise.then(
        (value) => ({ kind: 'resolved' as const, value }),
        (error: unknown) => ({ kind: 'rejected' as const, error }),
      ),
      operation.deactivation.promise.then(() => ({ kind: 'deactivated' as const })),
    ]);
    if (outcome.kind === 'deactivated') throw new QueueScopeDeactivatedError();
    if (outcome.kind === 'rejected') throw outcome.error;
    return outcome.value;
  }

  private schedulePump(): void {
    if (this.restoring || this.pumpPromise) return;
    this.pumpPromise = Promise.resolve().then(async () => {
      while (!this.restoring) {
        const operation = [...this.operations.values()]
          .filter((candidate) => candidate.accepted && !candidate.requiresManualReplay
            && candidate.state === 'pending' && !candidate.inFlight && !candidate.retryTimer
            && this.online && !this.isDependencyBlocked(candidate))
          .sort(sortByCreation)[0];
        if (!operation) break;
        try { await this.runOperation(operation); } catch { /* status and backoff are recorded by runOperation */ }
      }
    }).finally(() => {
      this.pumpPromise = undefined;
      const hasRunnable = [...this.operations.values()].some((operation) => operation.accepted && !operation.requiresManualReplay
        && operation.state === 'pending' && !operation.inFlight && !operation.retryTimer
        && this.online && !this.isDependencyBlocked(operation));
      if (hasRunnable) this.schedulePump();
    });
  }

  private scheduleRetry(operation: QueuedOperation): void {
    if (operation.retryTimer) return;
    const exponent = Math.min(Math.max(operation.attempts - 1, 0), 10);
    const delay = Math.min(this.retryBaseMs * 2 ** exponent, this.retryMaxMs);
    operation.retryTimer = setTimeout(() => {
      if (!this.isOperationCurrent(operation) || !this.online) return;
      operation.retryTimer = undefined;
      this.schedulePump();
    }, delay);
  }

  private isDependencyBlocked(operation: QueuedOperation): boolean {
    const dependencyId = operation.durable?.dependsOn;
    if (!dependencyId) return false;
    const dependency = this.operations.get(dependencyId);
    return Boolean(dependency && dependency.state !== 'acknowledged');
  }

  private refreshConnectivity(): boolean {
    const isOnline = this.connectivity.isOnline();
    if (isOnline !== this.online) this.handleConnectivityChange(isOnline);
    return isOnline;
  }

  private pruneAcknowledgements(): void {
    const acknowledged = [...this.operations.values()]
      .filter((operation) => operation.state === 'acknowledged')
      .sort(sortByCreation);
    for (const operation of acknowledged.slice(0, Math.max(0, acknowledged.length - 20))) {
      this.operations.delete(operation.id);
    }
  }

  private handleConnectivityChange(isOnline: boolean): void {
    this.online = isOnline;
    if (isOnline) {
      for (const operation of this.operations.values()) {
        if (operation.retryTimer) {
          clearTimeout(operation.retryTimer);
          operation.retryTimer = undefined;
        }
        if (operation.inFlight && operation.state === 'pending') operation.state = 'syncing';
      }
      this.notify();
      this.schedulePump();
    } else {
      for (const operation of this.operations.values()) {
        if (operation.retryTimer) {
          clearTimeout(operation.retryTimer);
          operation.retryTimer = undefined;
        }
        if (operation.state === 'syncing') operation.state = 'pending';
      }
      this.notify();
    }
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

export const firestoreWriteQueue = new OfflineWriteQueue();
