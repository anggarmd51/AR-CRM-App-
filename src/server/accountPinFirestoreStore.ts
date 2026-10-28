import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  AccountPinCredentialAlreadyExistsError,
  type AccountPinCredential,
  type AccountPinCredentialStore,
  type AccountPinRateLimiter,
  type AccountPinSession,
  type AccountPinSessionStore,
  type PinRateLimitDecision,
  type PinRateLimitPolicy,
} from './accountPinVerification.ts';

interface RateLimitDocument {
  ownerUid: string;
  attemptCount: number;
  windowStartedAt: Timestamp;
  lockedUntil: Timestamp | null;
  updatedAt: Timestamp;
}

function readTimestamp(value: unknown, field: string): Timestamp | null {
  if (value === null || value === undefined) return null;
  if (!(value instanceof Timestamp)) throw new Error(`Invalid Firestore timestamp: ${field}`);
  return value;
}

function requireTimestamp(value: unknown, field: string): Timestamp {
  const timestamp = readTimestamp(value, field);
  if (!timestamp) throw new Error(`Missing Firestore timestamp: ${field}`);
  return timestamp;
}

function retryAfterSeconds(until: Date, now: Date): number {
  return Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1_000));
}

/** Server-only adapter. Its collections remain inaccessible to browser clients under the default-deny Rules. */
export class FirestoreAccountPinStore implements AccountPinRateLimiter, AccountPinSessionStore, AccountPinCredentialStore {
  constructor(private readonly firestore: Firestore) {}

  async reserveAttempt(ownerUid: string, now: Date, policy: PinRateLimitPolicy): Promise<PinRateLimitDecision> {
    if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1
      || !Number.isFinite(policy.windowMs) || policy.windowMs < 1
      || !Number.isFinite(policy.lockoutMs) || policy.lockoutMs < 1) {
      throw new Error('Invalid rate-limit policy.');
    }

    const reference = this.firestore.collection('accountPinRateLimits').doc(ownerUid);
    return this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const nowMs = now.getTime();
      let stored: Partial<RateLimitDocument> | undefined;
      let storedWindow: Timestamp | null = null;
      let storedLock: Timestamp | null = null;

      if (snapshot.exists) {
        stored = snapshot.data() as Partial<RateLimitDocument>;
        if (stored.ownerUid !== ownerUid || !Number.isInteger(stored.attemptCount) || (stored.attemptCount as number) < 0) {
          throw new Error('Invalid rate-limit document.');
        }
        if (!Object.hasOwn(stored, 'lockedUntil')) throw new Error('Rate-limit lock field is missing.');
        storedLock = readTimestamp(stored.lockedUntil, 'lockedUntil');
        if (storedLock && storedLock.toMillis() > nowMs) {
          return { allowed: false, retryAfterSeconds: retryAfterSeconds(storedLock.toDate(), now) };
        }
        storedWindow = requireTimestamp(stored.windowStartedAt, 'windowStartedAt');
        if (storedWindow.toMillis() > nowMs + 60_000) throw new Error('Rate-limit clock moved backwards.');
      }

      const inWindow = Boolean(stored && storedLock === null && storedWindow
        && nowMs >= storedWindow.toMillis()
        && nowMs - storedWindow.toMillis() < policy.windowMs);
      const previousCount = inWindow ? stored?.attemptCount as number : 0;
      const windowStartedAt = inWindow ? storedWindow as Timestamp : Timestamp.fromDate(now);
      const nextCount = previousCount + 1;
      const lockedUntil = nextCount >= policy.maxAttempts
        ? Timestamp.fromDate(new Date(nowMs + policy.lockoutMs))
        : null;

      const document: RateLimitDocument = {
        ownerUid,
        attemptCount: nextCount,
        windowStartedAt,
        lockedUntil,
        updatedAt: Timestamp.fromDate(now),
      };
      transaction.set(reference, document);
      return { allowed: true };
    });
  }

  async clearAttempts(ownerUid: string): Promise<void> {
    await this.firestore.collection('accountPinRateLimits').doc(ownerUid).delete();
  }

  async getCredential(ownerUid: string): Promise<AccountPinCredential | null> {
    const snapshot = await this.firestore.collection('accountPinCredentials').doc(ownerUid).get();
    if (!snapshot.exists) return null;
    const data = snapshot.data() as Record<string, unknown>;
    if (data.ownerUid !== ownerUid || typeof data.verifier !== 'string'
      || !data.verifier.startsWith('scrypt$') || !Number.isInteger(data.enrolledAtAuthTimeSeconds)) {
      throw new Error('Invalid server-only account PIN credential.');
    }
    return {
      ownerUid,
      verifier: data.verifier,
      createdAt: requireTimestamp(data.createdAt, 'credential.createdAt').toDate(),
      enrolledAtAuthTimeSeconds: data.enrolledAtAuthTimeSeconds as number,
    };
  }

  async createIfAbsent(credential: AccountPinCredential): Promise<void> {
    if (!credential.ownerUid || !credential.verifier.startsWith('scrypt$')
      || !Number.isInteger(credential.enrolledAtAuthTimeSeconds)) {
      throw new Error('Invalid account PIN credential.');
    }
    const reference = this.firestore.collection('accountPinCredentials').doc(credential.ownerUid);
    await this.firestore.runTransaction(async (transaction) => {
      const existing = await transaction.get(reference);
      if (existing.exists) throw new AccountPinCredentialAlreadyExistsError();
      transaction.create(reference, {
        ownerUid: credential.ownerUid,
        verifier: credential.verifier,
        createdAt: Timestamp.fromDate(credential.createdAt),
        enrolledAtAuthTimeSeconds: credential.enrolledAtAuthTimeSeconds,
      });
    });
  }

  async create(session: AccountPinSession): Promise<void> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(session.id) || !session.ownerUid || session.status !== 'active'
      || session.expiresAt.getTime() <= session.createdAt.getTime()) {
      throw new Error('Invalid account PIN session.');
    }
    await this.firestore.collection('accountPinSessions').doc(session.id).create({
      ownerUid: session.ownerUid,
      status: 'active',
      createdAt: Timestamp.fromDate(session.createdAt),
      expiresAt: Timestamp.fromDate(session.expiresAt),
    });
  }

  async getSession(sessionId: string): Promise<AccountPinSession | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(sessionId)) return null;
    const snapshot = await this.firestore.collection('accountPinSessions').doc(sessionId).get();
    if (!snapshot.exists) return null;
    const data = snapshot.data() as Record<string, unknown>;
    if (typeof data.ownerUid !== 'string' || (data.status !== 'active' && data.status !== 'revoked')) {
      throw new Error('Invalid account PIN session document.');
    }
    return {
      id: sessionId,
      ownerUid: data.ownerUid,
      status: data.status,
      createdAt: requireTimestamp(data.createdAt, 'session.createdAt').toDate(),
      expiresAt: requireTimestamp(data.expiresAt, 'session.expiresAt').toDate(),
    };
  }

  async revoke(sessionId: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(sessionId)) throw new Error('Invalid account PIN session ID.');
    await this.firestore.collection('accountPinSessions').doc(sessionId).delete();
  }
}
