import type { AccountPinClientStatus } from './accountPinClient.ts';

export interface PinSessionHintStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PIN_SESSION_HINT_PREFIX = 'ar-crm:pin-session-hint:v1:';

function browserStorage(): PinSessionHintStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function storageKey(uid: string): string | undefined {
  return uid.trim() ? `${PIN_SESSION_HINT_PREFIX}${encodeURIComponent(uid)}` : undefined;
}

/** This value is a visual hint only. It never establishes or extends authorization. */
export function hasFreshPinSessionHint(
  uid: string,
  now = Date.now(),
  storage = browserStorage(),
): boolean {
  const key = storageKey(uid);
  if (!key || !storage) return false;
  try {
    const raw = storage.getItem(key);
    if (!raw) return false;
    const record: unknown = JSON.parse(raw);
    const expiresAt = record && typeof record === 'object'
      ? (record as { expiresAt?: unknown }).expiresAt
      : undefined;
    const expiryMs = typeof expiresAt === 'string' ? Date.parse(expiresAt) : Number.NaN;
    if (!Number.isFinite(expiryMs) || expiryMs <= now) {
      storage.removeItem(key);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Stores only server-reported expiry metadata, never PINs, tokens, or session IDs. */
export function savePinSessionHint(
  uid: string,
  expiresAt: string,
  now = Date.now(),
  storage = browserStorage(),
): boolean {
  const key = storageKey(uid);
  const expiryMs = Date.parse(expiresAt);
  if (!key || !storage || !Number.isFinite(expiryMs) || expiryMs <= now) return false;
  try {
    storage.setItem(key, JSON.stringify({ expiresAt }));
    return true;
  } catch {
    return false;
  }
}

export function clearPinSessionHint(uid: string, storage = browserStorage()): void {
  const key = storageKey(uid);
  if (!key || !storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Storage may be unavailable; authorization does not depend on this cleanup.
  }
}

export type PinSessionStartupView = 'checking-shell' | 'warm-shell' | 'pin-gate' | 'crm';

/** A local hint may select a shell variant, but only a fresh server result reaches `crm`. */
export function resolvePinSessionStartupView(input: {
  gateState: 'checking' | 'verified' | 'pin-required' | 'enrollment-available' | 'enrollment-blocked' | 'unavailable';
  sessionRevalidating: boolean;
  hasFreshHint: boolean;
}): PinSessionStartupView {
  if (input.gateState === 'verified' && !input.sessionRevalidating) return 'crm';
  if (input.gateState === 'checking' || input.sessionRevalidating) {
    return input.hasFreshHint ? 'warm-shell' : 'checking-shell';
  }
  return 'pin-gate';
}

export interface QueueLifecycleDependencies {
  activate(ownerId: string): Promise<void>;
  deactivate(): void;
}

/** Serializes async queue transitions and discards activations invalidated by a newer auth event. */
export function createSerializedQueueLifecycle(dependencies: QueueLifecycleDependencies) {
  let tail: Promise<void> = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
    const result = tail.then(operation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  }

  return {
    deactivate(): Promise<void> {
      return enqueue(() => dependencies.deactivate());
    },
    activate(ownerId: string, isCurrent: () => boolean): Promise<boolean> {
      return enqueue(async () => {
        if (!isCurrent()) return false;
        await dependencies.activate(ownerId);
        if (!isCurrent()) {
          dependencies.deactivate();
          return false;
        }
        return true;
      });
    },
  };
}

export interface PinSessionIdentity {
  uid: string;
}

export type PinSessionValidationResult =
  | { outcome: 'verified'; status: AccountPinClientStatus }
  | { outcome: 'pin-required'; status: AccountPinClientStatus }
  | { outcome: 'enrollment-available'; status: AccountPinClientStatus }
  | { outcome: 'enrollment-blocked'; status: AccountPinClientStatus }
  | { outcome: 'unavailable' }
  | { outcome: 'queue-unavailable' }
  | { outcome: 'stale' };

/** Revalidates with the server; it never reads the local UI hint. */
export async function validatePinSessionInBackground<UserLike extends PinSessionIdentity>(input: {
  user: UserLike;
  fetchStatus(user: UserLike): Promise<AccountPinClientStatus>;
  activateQueue(ownerId: string, isCurrent: () => boolean): Promise<boolean>;
  deactivateQueue(): Promise<void>;
  isCurrent(): boolean;
}): Promise<PinSessionValidationResult> {
  let status: AccountPinClientStatus;
  try {
    status = await input.fetchStatus(input.user);
  } catch {
    return input.isCurrent() ? { outcome: 'unavailable' } : { outcome: 'stale' };
  }
  if (!input.isCurrent()) return { outcome: 'stale' };
  if (!status.sessionActive) {
    return {
      outcome: status.credentialRegistered
        ? 'pin-required'
        : status.enrollmentEnabled ? 'enrollment-available' : 'enrollment-blocked',
      status,
    };
  }

  try {
    const activated = await input.activateQueue(input.user.uid, input.isCurrent);
    if (!activated || !input.isCurrent()) return { outcome: 'stale' };
    return { outcome: 'verified', status };
  } catch {
    if (!input.isCurrent()) return { outcome: 'stale' };
    try {
      await input.deactivateQueue();
    } catch {
      // The UI remains closed; Firestore Rules and server checks remain authoritative.
    }
    return input.isCurrent() ? { outcome: 'queue-unavailable' } : { outcome: 'stale' };
  }
}
