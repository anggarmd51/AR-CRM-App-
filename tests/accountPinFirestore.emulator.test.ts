import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { FirestoreAccountPinStore } from '../src/server/accountPinFirestoreStore.ts';
import { ACCOUNT_PIN_SESSION_TTL_MS } from '../src/server/accountPinVerification.ts';

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

test('Firestore Emulator atomically shares PIN attempt limits across independent Admin clients', { skip: !emulatorAvailable }, async () => {
  const suffix = randomUUID();
  const ownerUid = `pin-test-${suffix}`;
  const sessionId = randomBytes(32).toString('base64url');
  const projectId = 'demo-ar-crm-rules';
  const firstApp = initializeApp({ projectId }, `account-pin-emulator-one-${suffix}`);
  const secondApp = initializeApp({ projectId }, `account-pin-emulator-two-${suffix}`);
  const firstFirestore = getFirestore(firstApp);
  const secondFirestore = getFirestore(secondApp);
  const firstInstance = new FirestoreAccountPinStore(firstFirestore);
  const secondInstance = new FirestoreAccountPinStore(secondFirestore);
  const now = new Date();
  const policy = { maxAttempts: 5, windowMs: 60_000, lockoutMs: 30_000 };

  try {
    const decisions = await Promise.all(Array.from({ length: 16 }, (_, index) =>
      (index % 2 === 0 ? firstInstance : secondInstance).reserveAttempt(ownerUid, now, policy)));
    assert.equal(decisions.filter((decision) => decision.allowed).length, 5);
    assert.equal(decisions.filter((decision) => !decision.allowed).length, 11);

    const rateLimitRef = firstFirestore.collection('accountPinRateLimits').doc(ownerUid);
    const rateLimit = await rateLimitRef.get();
    assert.equal(rateLimit.get('attemptCount'), 5);
    assert.equal(rateLimit.get('ownerUid'), ownerUid);
    assert.ok(rateLimit.get('lockedUntil').toDate().getTime() > now.getTime());

    await firstInstance.clearAttempts(ownerUid);
    assert.equal((await secondFirestore.collection('accountPinRateLimits').doc(ownerUid).get()).exists, false);

    await rateLimitRef.set({
      ownerUid,
      attemptCount: 1,
      windowStartedAt: Timestamp.fromDate(now),
      // Deliberately omit lockedUntil to simulate damaged server-side state.
    });
    await assert.rejects(() => secondInstance.reserveAttempt(ownerUid, now, policy), /lock field is missing/);
    await firstInstance.clearAttempts(ownerUid);

    const credential = {
      ownerUid,
      verifier: 'scrypt$16384$8$1$synthetic-server-verifier-one',
      createdAt: now,
      enrolledAtAuthTimeSeconds: Math.floor(now.getTime() / 1_000),
    };
    const enrollmentRace = await Promise.allSettled([
      firstInstance.createIfAbsent(credential),
      secondInstance.createIfAbsent({ ...credential, verifier: 'scrypt$16384$8$1$synthetic-server-verifier-two' }),
    ]);
    assert.equal(enrollmentRace.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(enrollmentRace.filter((result) => result.status === 'rejected').length, 1);
    const storedCredential = await firstFirestore.collection('accountPinCredentials').doc(ownerUid).get();
    assert.equal(storedCredential.get('ownerUid'), ownerUid);
    assert.match(storedCredential.get('verifier'), /^scrypt\$/);
    await assert.rejects(() => firstInstance.createIfAbsent(credential), /already registered/);

    await firstInstance.create({
      id: sessionId,
      ownerUid,
      status: 'active',
      createdAt: now,
      expiresAt: new Date(now.getTime() + ACCOUNT_PIN_SESSION_TTL_MS),
    });
    const session = await secondFirestore.collection('accountPinSessions').doc(sessionId).get();
    assert.equal(session.get('ownerUid'), ownerUid);
    assert.equal(session.get('status'), 'active');
    assert.equal(session.get('expiresAt').toDate().getTime(), now.getTime() + ACCOUNT_PIN_SESSION_TTL_MS);
    await secondInstance.revoke(sessionId);
    assert.equal((await firstFirestore.collection('accountPinSessions').doc(sessionId).get()).exists, false);
  } finally {
    await Promise.all([
      firstFirestore.collection('accountPinRateLimits').doc(ownerUid).delete(),
      firstFirestore.collection('accountPinCredentials').doc(ownerUid).delete(),
      firstFirestore.collection('accountPinSessions').doc(sessionId).delete(),
    ]);
    await Promise.all([deleteApp(firstApp), deleteApp(secondApp)]);
  }
});
