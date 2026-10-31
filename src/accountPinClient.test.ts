import assert from 'node:assert/strict';
import test from 'node:test';
import type { Auth, GoogleAuthProvider, User } from 'firebase/auth';
import { createAccountPinClient, safeAccountPinRedirectErrorCode } from './accountPinClient.ts';

const SESSION_ID = 'S'.repeat(43);

function createHarness(options: {
  claim?: unknown;
  responses?: Array<{ status: number; body: Record<string, unknown> }>;
  reauthentication?: 'redirect-started' | void;
  redirectUserUid?: string;
  redirectError?: 'auth/invalid-credential' | 'auth/network-request-failed' | 'auth/operation-not-allowed' | 'auth/unauthorized-domain' | 'auth/internal-error' | 'redirect_result_missing';
  requireRedirectResult?: boolean;
} = {}) {
  const calls: {
    requests: Array<{ path: string; init: RequestInit }>;
    authSteps: string[];
    exchangedTokens: string[];
  } = { requests: [], authSteps: [], exchangedTokens: [] };
  let responseIndex = 0;
  const responses = options.responses ?? [{
    status: 200,
    body: { credentialRegistered: true, enrollmentEnabled: false, sessionActive: true, sessionExpiresAt: '2026-10-28T08:00:00.000Z' },
  }];
  const client = createAccountPinClient({
    async fetch(input, init = {}) {
      calls.requests.push({ path: String(input), init });
      const response = responses[Math.min(responseIndex, responses.length - 1)];
      responseIndex += 1;
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        async json() { return response.body; },
      } as Response;
    },
    getAuth: () => ({ currentUser: null } as Auth),
    getGoogleProvider: () => ({} as GoogleAuthProvider),
    requireRedirectResultForEnrollment: options.requireRedirectResult,
    async reauthenticate() { calls.authSteps.push('reauth'); return options.reauthentication; },
    async consumeRedirectReauthentication() {
      calls.authSteps.push('redirect-result');
      if (options.redirectError) return { errorCode: options.redirectError };
      return options.redirectUserUid ? { userUid: options.redirectUserUid } : undefined;
    },
    async signInWithCustomToken(_auth, token) { calls.exchangedTokens.push(token); calls.authSteps.push('custom-token'); },
  });
  const user = {
    uid: 'owner-uid',
    async getIdToken(forceRefresh?: boolean) {
      calls.authSteps.push(forceRefresh ? 'id-token-force-refresh' : 'id-token');
      return 'fake.firebase.id.token';
    },
    async getIdTokenResult() {
      return { token: 'fake.firebase.id.token', claims: { ...(options.claim ? { pinSessionId: options.claim } : {}) } };
    },
  } as unknown as User;
  return { client, user, calls };
}

test('status client requires both server session response and a well-formed signed claim', async () => {
  const valid = createHarness({ claim: SESSION_ID });
  const status = await valid.client.fetchStatus(valid.user);
  assert.equal(status.credentialRegistered, true);
  assert.equal(status.sessionActive, true);
  assert.equal(status.sessionExpiresAt, '2026-10-28T08:00:00.000Z');
  assert.equal(valid.calls.requests[0].path, '/api/account-pin/status');
  assert.equal(valid.calls.requests[0].init.cache, 'no-store');
  assert.equal(valid.calls.requests[0].init.credentials, 'same-origin');
  assert.equal((valid.calls.requests[0].init.headers as Record<string, string>).authorization, 'Bearer fake.firebase.id.token');
  assert.deepEqual(valid.calls.authSteps, []);

  const missingClaim = createHarness();
  assert.equal((await missingClaim.client.fetchStatus(missingClaim.user)).sessionActive, false);
});

test('PIN verification sends a transient request and exchanges only the server custom token', async () => {
  const testHarness = createHarness({ responses: [{ status: 200, body: { customToken: 'server.custom.token' } }] });
  await testHarness.client.verifyAndExchange(testHarness.user, '123456');
  assert.equal(testHarness.calls.requests[0].path, '/api/account-pin/verify');
  assert.equal(testHarness.calls.requests[0].init.cache, 'no-store');
  assert.deepEqual(JSON.parse(String(testHarness.calls.requests[0].init.body)), { pin: '123456' });
  assert.deepEqual(testHarness.calls.exchangedTokens, ['server.custom.token']);
  assert.equal(testHarness.calls.requests.some(({ init }) => JSON.stringify(init).includes('localStorage')), false);
});

test('enrollment completes fresh Google re-auth before sending PIN and forces a fresh ID token', async () => {
  const testHarness = createHarness({ responses: [{ status: 200, body: { customToken: 'enrollment.custom.token' } }] });
  await testHarness.client.enrollAndExchange(testHarness.user, '654321', '654321');
  assert.deepEqual(testHarness.calls.authSteps, ['reauth', 'id-token-force-refresh', 'custom-token']);
  assert.equal(testHarness.calls.requests[0].path, '/api/account-pin/enroll');
  assert.deepEqual(JSON.parse(String(testHarness.calls.requests[0].init.body)), { pin: '654321', confirmPin: '654321' });
  assert.deepEqual(testHarness.calls.exchangedTokens, ['enrollment.custom.token']);
});

test('redirect enrollment sends no PIN before return and accepts only the matching reauthenticated user', async () => {
  const testHarness = createHarness({
    responses: [{ status: 200, body: { customToken: 'enrollment.custom.token' } }],
    reauthentication: 'redirect-started',
    redirectUserUid: 'owner-uid',
  });

  assert.equal(await testHarness.client.enrollAndExchange(testHarness.user, '654321', '654321'), false);
  assert.equal(testHarness.calls.requests.length, 0);
  assert.deepEqual(testHarness.calls.authSteps, ['reauth']);

  await testHarness.client.completeRedirectReauthentication();
  assert.equal(await testHarness.client.enrollAndExchange(testHarness.user, '654321', '654321'), true);
  assert.deepEqual(testHarness.calls.authSteps, ['reauth', 'redirect-result', 'id-token-force-refresh', 'custom-token']);
  const [enrollmentRequest] = testHarness.calls.requests;
  assert.ok(enrollmentRequest);
  assert.equal(enrollmentRequest.path, '/api/account-pin/enroll');
  assert.deepEqual(JSON.parse(String(enrollmentRequest.init.body)), { pin: '654321', confirmPin: '654321' });
});

test('redirect result for another account cannot bypass fresh enrollment reauthentication', async () => {
  const testHarness = createHarness({
    reauthentication: 'redirect-started',
    redirectUserUid: 'different-user',
  });
  await testHarness.client.completeRedirectReauthentication();
  assert.equal(await testHarness.client.enrollAndExchange(testHarness.user, '654321', '654321'), false);
  assert.equal(testHarness.calls.requests.length, 0);
  assert.deepEqual(testHarness.calls.authSteps, ['redirect-result', 'reauth']);
});

test('redirect Auth errors are reduced to the small allowlist or generic missing-result code', () => {
  assert.equal(safeAccountPinRedirectErrorCode({ code: 'auth/network-request-failed', message: 'private provider details' }), 'auth/network-request-failed');
  assert.equal(safeAccountPinRedirectErrorCode({ code: 'auth/unauthorized-domain', email: 'private@example.com' }), 'auth/unauthorized-domain');
  assert.equal(safeAccountPinRedirectErrorCode({ code: 'auth/unrecognized-provider-error', message: 'private provider details' }), 'redirect_result_missing');
  assert.equal(safeAccountPinRedirectErrorCode(new Error('private provider details')), 'redirect_result_missing');
});

test('redirect Auth error blocks staging enrollment POST', async () => {
  const testHarness = createHarness({
    requireRedirectResult: true,
    redirectError: 'auth/network-request-failed',
    reauthentication: 'redirect-started',
  });
  assert.equal(await testHarness.client.completeRedirectReauthentication(), 'auth/network-request-failed');
  await assert.rejects(
    () => testHarness.client.enrollAndExchange(testHarness.user, '654321', '654321'),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'auth/network-request-failed',
  );
  assert.deepEqual(testHarness.calls.requests, []);
  assert.deepEqual(testHarness.calls.authSteps, ['redirect-result']);
});

test('missing redirect result blocks staging enrollment POST', async () => {
  const testHarness = createHarness({
    requireRedirectResult: true,
    redirectError: 'redirect_result_missing',
    reauthentication: 'redirect-started',
  });
  assert.equal(await testHarness.client.completeRedirectReauthentication(), 'redirect_result_missing');
  await assert.rejects(
    () => testHarness.client.enrollAndExchange(testHarness.user, '654321', '654321'),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'redirect_result_missing',
  );
  assert.deepEqual(testHarness.calls.requests, []);
  assert.deepEqual(testHarness.calls.authSteps, ['redirect-result']);
});

test('API errors remain fail-closed and never exchange a token', async () => {
  const testHarness = createHarness({ responses: [{ status: 404, body: { code: 'not_found', error: 'Not found.' } }] });
  await assert.rejects(
    () => testHarness.client.verifyAndExchange(testHarness.user, '123456'),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'not_found',
  );
  assert.deepEqual(testHarness.calls.exchangedTokens, []);
});
