import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearPinSessionHint,
  createSerializedQueueLifecycle,
  hasFreshPinSessionHint,
  resolvePinSessionStartupView,
  savePinSessionHint,
  validatePinSessionInBackground,
  type PinSessionHintStorage,
} from './accountPinSessionUi.ts';
import type { AccountPinClientStatus } from './accountPinClient.ts';

class MemoryStorage implements PinSessionHintStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const NOW = Date.parse('2026-11-05T12:00:00.000Z');
const ACTIVE_STATUS: AccountPinClientStatus = {
  credentialRegistered: true,
  enrollmentEnabled: true,
  sessionActive: true,
  sessionExpiresAt: '2026-11-05T20:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

test('server expiry metadata is scoped by UID and expired or malformed hints are removed', () => {
  const storage = new MemoryStorage();
  assert.equal(savePinSessionHint('owner-a', ACTIVE_STATUS.sessionExpiresAt!, NOW, storage), true);
  assert.equal(hasFreshPinSessionHint('owner-a', NOW, storage), true);
  assert.equal(hasFreshPinSessionHint('owner-b', NOW, storage), false);
  assert.equal(hasFreshPinSessionHint('owner-a', Date.parse(ACTIVE_STATUS.sessionExpiresAt!), storage), false);
  assert.equal(storage.values.size, 0);

  storage.setItem('ar-crm:pin-session-hint:v1:owner-a', '{bad json');
  assert.equal(hasFreshPinSessionHint('owner-a', NOW, storage), false);
  clearPinSessionHint('owner-a', storage);
  assert.equal(storage.values.has('ar-crm:pin-session-hint:v1:owner-a'), false);
});

test('local expiry hint can select only a warm checking shell, never authorize CRM', () => {
  assert.equal(resolvePinSessionStartupView({ gateState: 'checking', sessionRevalidating: false, hasFreshHint: true }), 'warm-shell');
  assert.equal(resolvePinSessionStartupView({ gateState: 'checking', sessionRevalidating: false, hasFreshHint: false }), 'checking-shell');
  assert.equal(resolvePinSessionStartupView({ gateState: 'pin-required', sessionRevalidating: false, hasFreshHint: true }), 'pin-gate');
  assert.equal(resolvePinSessionStartupView({ gateState: 'verified', sessionRevalidating: true, hasFreshHint: true }), 'warm-shell');
  assert.equal(resolvePinSessionStartupView({ gateState: 'verified', sessionRevalidating: false, hasFreshHint: false }), 'crm');
});

test('without a fresh hint the pending PIN check uses the generic checking shell', () => {
  assert.equal(resolvePinSessionStartupView({ gateState: 'checking', sessionRevalidating: false, hasFreshHint: false }), 'checking-shell');
});

test('a stale server response after logout or account change is discarded before queue activation', async () => {
  let current = true;
  let activated = 0;
  const result = await validatePinSessionInBackground({
    user: { uid: 'owner-a' },
    fetchStatus: async () => { current = false; return ACTIVE_STATUS; },
    activateQueue: async () => { activated += 1; return true; },
    deactivateQueue: async () => {},
    isCurrent: () => current,
  });
  assert.deepEqual(result, { outcome: 'stale' });
  assert.equal(activated, 0);
});

test('a server response without an active session transitions to PIN required, regardless of a warm hint', async () => {
  const result = await validatePinSessionInBackground({
    user: { uid: 'owner-a' },
    fetchStatus: async () => ({ credentialRegistered: true, enrollmentEnabled: true, sessionActive: false }),
    activateQueue: async () => { throw new Error('must not activate'); },
    deactivateQueue: async () => {},
    isCurrent: () => true,
  });
  assert.equal(result.outcome, 'pin-required');
  assert.equal(resolvePinSessionStartupView({ gateState: result.outcome, sessionRevalidating: false, hasFreshHint: true }), 'pin-gate');
});

test('server response without a registered PIN offers enrollment only when the server allows it', async () => {
  const result = await validatePinSessionInBackground({
    user: { uid: 'owner-a' },
    fetchStatus: async () => ({ credentialRegistered: false, enrollmentEnabled: true, sessionActive: false }),
    activateQueue: async () => { throw new Error('must not activate'); },
    deactivateQueue: async () => {},
    isCurrent: () => true,
  });
  assert.equal(result.outcome, 'enrollment-available');
});

test('network/server failure returns unavailable and never activates the queue', async () => {
  let activated = false;
  const result = await validatePinSessionInBackground({
    user: { uid: 'owner-a' },
    fetchStatus: async () => { throw new Error('offline'); },
    activateQueue: async () => { activated = true; return true; },
    deactivateQueue: async () => {},
    isCurrent: () => true,
  });
  assert.deepEqual(result, { outcome: 'unavailable' });
  assert.equal(activated, false);
});

test('queue restoration failure closes the queue and reports unavailable rather than verified', async () => {
  const events: string[] = [];
  const result = await validatePinSessionInBackground({
    user: { uid: 'owner-a' },
    fetchStatus: async () => ACTIVE_STATUS,
    activateQueue: async () => { throw new Error('outbox restore failed'); },
    deactivateQueue: async () => { events.push('deactivated'); },
    isCurrent: () => true,
  });
  assert.equal(result.outcome, 'queue-unavailable');
  assert.deepEqual(events, ['deactivated']);
});

test('a pending queue activation invalidated by a newer auth event is deactivated before the new activation', async () => {
  const activation = deferred<void>();
  const events: string[] = [];
  let generation = 1;
  let firstCall = true;
  const queue = createSerializedQueueLifecycle({
    activate: async (uid) => {
      events.push(`activate-start:${uid}`);
      if (firstCall) {
        firstCall = false;
        await activation.promise;
      }
      events.push(`activate-end:${uid}`);
    },
    deactivate: () => { events.push('deactivate'); },
  });

  const staleActivation = queue.activate('owner-a', () => generation === 1);
  await turn();
  generation = 2;
  const newAuthDeactivation = queue.deactivate();
  const currentActivation = queue.activate('owner-a', () => generation === 2);
  activation.resolve();

  assert.equal(await staleActivation, false);
  await newAuthDeactivation;
  assert.equal(await currentActivation, true);
  assert.deepEqual(events, [
    'activate-start:owner-a',
    'activate-end:owner-a',
    'deactivate',
    'deactivate',
    'activate-start:owner-a',
    'activate-end:owner-a',
  ]);
});

test('an auth generation change during queue activation cannot mark the stale session verified', async () => {
  const activation = deferred<void>();
  let current = true;
  const queue = createSerializedQueueLifecycle({
    activate: async () => activation.promise,
    deactivate: () => {},
  });
  const pending = validatePinSessionInBackground({
    user: { uid: 'owner-a' },
    fetchStatus: async () => ACTIVE_STATUS,
    activateQueue: queue.activate,
    deactivateQueue: queue.deactivate,
    isCurrent: () => current,
  });
  await turn();
  current = false;
  activation.resolve();
  assert.deepEqual(await pending, { outcome: 'stale' });
});

test('server-confirmed active session is required before the validator reports verified', async () => {
  const result = await validatePinSessionInBackground({
    user: { uid: 'owner-a' },
    fetchStatus: async () => ACTIVE_STATUS,
    activateQueue: async (_uid, isCurrent) => isCurrent(),
    deactivateQueue: async () => {},
    isCurrent: () => true,
  });
  assert.deepEqual(result, { outcome: 'verified', status: ACTIVE_STATUS });
});
