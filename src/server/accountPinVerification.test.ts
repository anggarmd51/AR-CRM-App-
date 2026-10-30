import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AccountPinCredentialAlreadyExistsError,
  ACCOUNT_PIN_SESSION_TTL_MS,
  createAccountPinEnrollmentService,
  createAccountPinStatusService,
  createAccountPinVerificationService,
  createAccountPinVerifier,
  isValidAccountPin,
  verifyAccountPinVerifier,
  type AccountPinCredential,
  type AccountPinRateLimiter,
  type AccountPinSession,
  type PinRateLimitPolicy,
  type PinVerificationDependencies,
  type PinVerificationRequest,
  type VerifiedFirebaseIdentity,
} from './accountPinVerification.ts';

const OWNER_UID = 'staging-owner-uid';
const SESSION_ID = 'S'.repeat(43);
const FIXED_NOW = new Date('2026-10-28T00:00:00.000Z');

function request(body: unknown = { pin: '123456' }, overrides: Partial<PinVerificationRequest> = {}): PinVerificationRequest {
  return {
    method: 'POST',
    authorization: 'Bearer valid.firebase.id.token',
    origin: 'https://arcrm-preview.example.test',
    host: 'arcrm-preview.example.test',
    forwardedProto: 'https',
    body,
    ...overrides,
  };
}

function statusRequest(overrides: Partial<PinVerificationRequest> = {}): PinVerificationRequest {
  return request(undefined, { method: 'GET', ...overrides });
}

function harness(options: {
  verifyToken?: PinVerificationDependencies['verifyFirebaseIdToken'];
  verifyPin?: PinVerificationDependencies['verifyAccountPin'];
  reserve?: AccountPinRateLimiter['reserveAttempt'];
  clear?: AccountPinRateLimiter['clearAttempts'];
  createToken?: PinVerificationDependencies['createCustomToken'];
  sessionId?: () => string;
  credentialInitiallyEnrolled?: boolean;
} = {}) {
  const calls = {
    reserved: 0,
    cleared: 0,
    pinChecks: 0,
    createdSessions: [] as AccountPinSession[],
    revokedSessions: [] as string[],
    createdCredentials: [] as AccountPinCredential[],
    customTokens: [] as Array<{ uid: string; claims: { pinSessionId: string } }>,
    policy: undefined as PinRateLimitPolicy | undefined,
  };
  const identity: VerifiedFirebaseIdentity = {
    uid: OWNER_UID,
    authTimeSeconds: FIXED_NOW.getTime() / 1_000,
  };
  const credentials = new Map<string, AccountPinCredential>();
  if (options.credentialInitiallyEnrolled !== false) {
    credentials.set(OWNER_UID, {
      ownerUid: OWNER_UID,
      verifier: 'test-verifier-123456',
      createdAt: FIXED_NOW,
      enrolledAtAuthTimeSeconds: identity.authTimeSeconds,
    });
  }
  const rateLimiter: AccountPinRateLimiter = {
    async reserveAttempt(uid, now, policy) {
      calls.reserved += 1;
      calls.policy = policy;
      if (options.reserve) return options.reserve(uid, now, policy);
      return { allowed: true };
    },
    async clearAttempts(uid) {
      calls.cleared += 1;
      await options.clear?.(uid);
    },
  };
  const storedSessions = new Map<string, AccountPinSession>();
  const sessions = {
    async create(session: AccountPinSession) {
      calls.createdSessions.push(session);
      storedSessions.set(session.id, session);
    },
    async getSession(sessionId: string) { return storedSessions.get(sessionId) ?? null; },
    async revoke(sessionId: string) {
      calls.revokedSessions.push(sessionId);
      storedSessions.delete(sessionId);
    },
  };
  const dependencies: PinVerificationDependencies = {
    ownerUid: OWNER_UID,
    async verifyFirebaseIdToken(token) {
      if (options.verifyToken) return options.verifyToken(token);
      assert.equal(token, 'valid.firebase.id.token');
      return identity;
    },
    credentials: {
      async getCredential(uid) { return credentials.get(uid) ?? null; },
      async createIfAbsent(credential) {
        if (credentials.has(credential.ownerUid)) throw new AccountPinCredentialAlreadyExistsError();
        credentials.set(credential.ownerUid, credential);
        calls.createdCredentials.push(credential);
      },
    },
    async verifyAccountPin(pin, verifier) {
      calls.pinChecks += 1;
      if (options.verifyPin) return options.verifyPin(pin, verifier);
      return verifier === `test-verifier-${pin}`;
    },
    async createAccountPinVerifier(pin) { return `test-verifier-${pin}`; },
    rateLimiter,
    sessions,
    async createCustomToken(uid, claims) {
      calls.customTokens.push({ uid, claims });
      if (options.createToken) return options.createToken(uid, claims);
      return 'custom.firebase.token';
    },
    now: () => new Date(FIXED_NOW),
    createSessionId: options.sessionId ?? (() => SESSION_ID),
  };
  return {
    dependencies,
    calls,
    credentials,
    verify: createAccountPinVerificationService(dependencies),
    enroll: createAccountPinEnrollmentService(dependencies),
    status: createAccountPinStatusService(dependencies, true),
  };
}

test('verification accepts only same-origin HTTPS POST with one PIN field', async () => {
  const testHarness = harness();
  assert.equal((await testHarness.verify(request({ pin: '123456' }, { method: 'GET' }))).statusCode, 405);
  assert.equal((await testHarness.verify(request({ pin: '123456' }, { forwardedProto: 'http' }))).statusCode, 403);
  assert.equal((await testHarness.verify(request({ pin: '123456' }, { origin: undefined, fetchSite: 'same-origin' }))).statusCode, 403);
  assert.equal((await testHarness.verify(request({ pin: '123456' }, { origin: 'https://attacker.example.test' }))).statusCode, 403);
  assert.equal((await testHarness.verify(request({ pin: '123456', ownerUid: OWNER_UID }))).statusCode, 400);
  assert.equal(testHarness.calls.reserved, 0);
});

test('rejects missing, invalid, and non-owner Firebase identity before reserving PIN attempts', async () => {
  const invalidToken = harness({ verifyToken: async () => { throw new Error('invalid'); } });
  assert.equal((await invalidToken.verify(request({ pin: '123456' }, { authorization: 'Bearer malformed token' }))).statusCode, 401);
  assert.equal(invalidToken.calls.reserved, 0);

  const nonOwner = harness({ verifyToken: async () => ({ uid: 'different-user', authTimeSeconds: 0 }) });
  assert.equal((await nonOwner.verify(request())).statusCode, 403);
  assert.equal(nonOwner.calls.reserved, 0);
});

test('verification remains blocked when the server-only credential doc does not exist', async () => {
  const testHarness = harness({ credentialInitiallyEnrolled: false });
  const response = await testHarness.verify(request());
  assert.equal(response.statusCode, 409);
  assert.equal(response.body.code, 'pin_not_enrolled');
  assert.equal(testHarness.calls.reserved, 0);
  assert.equal(testHarness.calls.pinChecks, 0);
});

test('counts malformed-length PINs as attempts without running the KDF', async () => {
  const testHarness = harness();
  const response = await testHarness.verify(request({ pin: '1234' }));
  assert.equal(response.statusCode, 401);
  assert.equal(testHarness.calls.reserved, 1);
  assert.equal(testHarness.calls.pinChecks, 0);
  assert.equal(testHarness.calls.createdSessions.length, 0);
  assert.equal(testHarness.calls.policy?.maxAttempts, 5);
});

test('wrong PIN is rejected without creating a server session or exposing the input', async () => {
  const testHarness = harness();
  const response = await testHarness.verify(request({ pin: '654321' }));
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.code, 'invalid_pin');
  assert.equal(testHarness.calls.createdSessions.length, 0);
  assert.equal(JSON.stringify(response.body).includes('654321'), false);
});

test('honors durable rate-limit decisions and returns a bounded Retry-After header', async () => {
  const testHarness = harness({ reserve: async () => ({ allowed: false, retryAfterSeconds: 9_999_999 }) });
  const response = await testHarness.verify(request());
  assert.equal(response.statusCode, 429);
  assert.equal(response.headers['retry-after'], '86400');
  assert.equal(testHarness.calls.pinChecks, 0);
});

test('issues a server session and custom-token claim only after successful PIN verification', async () => {
  const testHarness = harness();
  const response = await testHarness.verify(request());
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store, max-age=0');
  assert.equal(response.headers.pragma, 'no-cache');
  assert.equal(testHarness.calls.createdSessions.length, 1);
  assert.match(testHarness.calls.createdSessions[0].id, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(testHarness.calls.createdSessions[0].ownerUid, OWNER_UID);
  assert.equal(testHarness.calls.createdSessions[0].status, 'active');
  assert.equal(testHarness.calls.createdSessions[0].expiresAt.getTime() - FIXED_NOW.getTime(), ACCOUNT_PIN_SESSION_TTL_MS);
  assert.deepEqual(testHarness.calls.customTokens, [{ uid: OWNER_UID, claims: { pinSessionId: SESSION_ID } }]);
  assert.equal(response.body.customToken, 'custom.firebase.token');
  assert.equal(testHarness.calls.cleared, 1);
  assert.equal(JSON.stringify(response.body).includes('123456'), false);
});

test('revokes an unissued session and fails closed when custom-token issuance fails', async () => {
  const testHarness = harness({ createToken: async () => { throw new Error('provider details'); } });
  const response = await testHarness.verify(request());
  assert.equal(response.statusCode, 503);
  assert.deepEqual(testHarness.calls.revokedSessions, [SESSION_ID]);
  assert.equal(JSON.stringify(response.body).includes('provider details'), false);
});

test('fails closed when the durable rate-limit store is unavailable', async () => {
  const testHarness = harness({ reserve: async () => { throw new Error('storage unavailable'); } });
  const response = await testHarness.verify(request());
  assert.equal(response.statusCode, 503);
  assert.equal(testHarness.calls.pinChecks, 0);
  assert.equal(testHarness.calls.createdSessions.length, 0);
});

test('first enrollment requires fresh Google auth, matching PIN confirmation, and creates a credential only once', async () => {
  const notRecent = harness({
    credentialInitiallyEnrolled: false,
    verifyToken: async () => ({ uid: OWNER_UID, authTimeSeconds: FIXED_NOW.getTime() / 1_000 - 301 }),
  });
  const staleResponse = await notRecent.enroll(request({ pin: '654321', confirmPin: '654321' }));
  assert.equal(staleResponse.statusCode, 428);
  assert.equal(staleResponse.body.code, 'reauthentication_required');
  assert.equal(notRecent.calls.createdCredentials.length, 0);

  const mismatched = harness({ credentialInitiallyEnrolled: false });
  const mismatchResponse = await mismatched.enroll(request({ pin: '654321', confirmPin: '654322' }));
  assert.equal(mismatchResponse.statusCode, 400);
  assert.equal(mismatched.calls.createdCredentials.length, 0);

  const testHarness = harness({ credentialInitiallyEnrolled: false });
  const enrollment = await testHarness.enroll(request({ pin: '654321', confirmPin: '654321' }));
  assert.equal(enrollment.statusCode, 200);
  assert.equal(testHarness.calls.createdCredentials.length, 1);
  assert.equal(testHarness.calls.createdCredentials[0].ownerUid, OWNER_UID);
  assert.equal(testHarness.calls.createdCredentials[0].verifier, 'test-verifier-654321');
  assert.equal(JSON.stringify(enrollment.body).includes('654321'), false);
  assert.equal(testHarness.calls.createdSessions.length, 1);

  const secondEnrollment = await testHarness.enroll(request({ pin: '654322', confirmPin: '654322' }));
  assert.equal(secondEnrollment.statusCode, 409);
  assert.equal(secondEnrollment.body.code, 'pin_already_enrolled');
  assert.equal(testHarness.calls.createdCredentials.length, 1);
});

test('first enrollment enforces same-origin HTTPS, PIN policy, confirmation, and attempt limit', async () => {
  const testHarness = harness({ credentialInitiallyEnrolled: false });
  assert.equal((await testHarness.enroll(request({ pin: '1234', confirmPin: '1234' }))).statusCode, 400);
  assert.equal((await testHarness.enroll(request({ pin: '123456', confirmPin: '123456' }, { origin: 'https://attacker.test' }))).statusCode, 403);
  const limited = harness({
    credentialInitiallyEnrolled: false,
    reserve: async () => ({ allowed: false, retryAfterSeconds: 60 }),
  });
  assert.equal((await limited.enroll(request({ pin: '654321', confirmPin: '654321' }))).statusCode, 429);
  assert.equal(limited.calls.createdCredentials.length, 0);
});

test('status reports only owner registration and an active server-side session', async () => {
  const testHarness = harness();
  assert.equal((await testHarness.status(statusRequest())).body.credentialRegistered, true);
  assert.equal((await testHarness.status(statusRequest())).body.sessionActive, false);

  await testHarness.verify(request());
  const activeSessionRequest = statusRequest({
    authorization: 'Bearer valid.firebase.id.token',
  });
  testHarness.dependencies.verifyFirebaseIdToken = async () => ({
    uid: OWNER_UID,
    authTimeSeconds: FIXED_NOW.getTime() / 1_000,
    pinSessionId: SESSION_ID,
  });
  const activeStatus = await testHarness.status(activeSessionRequest);
  assert.equal(activeStatus.body.sessionActive, true);
  assert.equal(activeStatus.body.sessionExpiresAt, new Date(FIXED_NOW.getTime() + ACCOUNT_PIN_SESSION_TTL_MS).toISOString());

  const foreignSession = harness({
    verifyToken: async () => ({ uid: OWNER_UID, authTimeSeconds: 0, pinSessionId: 'F'.repeat(43) }),
  });
  const foreignStatus = await foreignSession.status(statusRequest());
  assert.equal(foreignStatus.body.sessionActive, false);
});

test('status requires authenticated same-origin GET and fails closed on storage errors', async () => {
  const testHarness = harness();
  assert.equal((await testHarness.status(statusRequest({ forwardedProto: 'http' }))).statusCode, 403);
  assert.equal((await testHarness.status(request())).statusCode, 405);
  const failedStorage = harness();
  failedStorage.dependencies.credentials.getCredential = async () => { throw new Error('storage failure'); };
  assert.equal((await failedStorage.status(statusRequest())).statusCode, 503);
});

test('status accepts missing Origin only for same-origin HTTPS GET and rejects cross-origin or ambiguous requests', async () => {
  const testHarness = harness();
  assert.equal((await testHarness.status(statusRequest({ origin: undefined, fetchSite: 'same-origin' }))).statusCode, 200);
  assert.equal((await testHarness.status(statusRequest({ origin: undefined }))).statusCode, 403);
  assert.equal((await testHarness.status(statusRequest({ origin: undefined, fetchSite: 'cross-site' }))).statusCode, 403);
  assert.equal((await testHarness.status(statusRequest({ origin: undefined, fetchSite: 'same-site' }))).statusCode, 403);
  assert.equal((await testHarness.status(statusRequest({ origin: 'https://attacker.example.test', fetchSite: 'same-origin' }))).statusCode, 403);
  assert.equal((await testHarness.status(statusRequest({ origin: undefined, fetchSite: 'same-origin', forwardedProto: 'http' }))).statusCode, 403);
});

test('uses a salted scrypt verifier and rejects wrong PINs, peppers, and malformed verifier material', async () => {
  const pepper = 'unit-test-only-pepper-material-at-least-32-bytes';
  const verifier = await createAccountPinVerifier('123456', pepper);
  assert.match(verifier, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyAccountPinVerifier('123456', verifier, pepper), true);
  assert.equal(await verifyAccountPinVerifier('654321', verifier, pepper), false);
  assert.equal(await verifyAccountPinVerifier('123456', verifier, `${pepper}-different`), false);
  await assert.rejects(() => verifyAccountPinVerifier('123456', 'not-a-verifier', pepper));
  assert.equal(isValidAccountPin('1234'), false);
  assert.equal(isValidAccountPin('123456'), true);
  assert.equal(isValidAccountPin('1234567890123'), false);
});

test('Firebase Admin runtime refuses production and any non-staging branch/project before Admin initialization', async () => {
  const { createStagingAccountPinRuntime } = await import('./accountPinFirebaseAdmin.ts');
  const sharedPreviewEnv = {
    VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_REF: 'cue/ar-crm-operational-features',
    VITE_FIREBASE_TARGET: 'staging',
    ACCOUNT_PIN_ENABLED: 'true',
    ACCOUNT_PIN_OWNER_UID: 'test-owner',
    ACCOUNT_PIN_PEPPER: 'test-only-pepper-material-that-is-not-a-secret',
    FIREBASE_ADMIN_PROJECT_ID: 'ar-crm-staging-angga-20261027',
  };
  assert.throws(() => createStagingAccountPinRuntime({ ...sharedPreviewEnv, VERCEL_ENV: 'production' }), /disabled outside the approved staging Preview/);
  assert.throws(() => createStagingAccountPinRuntime({ ...sharedPreviewEnv, FIREBASE_ADMIN_PROJECT_ID: 'not-the-staging-project' }), /restricted to the staging Firebase project/);
  assert.throws(() => createStagingAccountPinRuntime({ ...sharedPreviewEnv, VERCEL_GIT_COMMIT_REF: 'main' }), /disabled outside the approved staging Preview/);
});
