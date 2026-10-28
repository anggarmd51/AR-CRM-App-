import assert from 'node:assert/strict';
import test from 'node:test';
import type { Auth, GoogleAuthProvider, User } from 'firebase/auth';
import { createAccountPinClient } from './accountPinClient.ts';

const SESSION_ID = 'S'.repeat(43);

function createHarness(options: {
  claim?: unknown;
  responses?: Array<{ status: number; body: Record<string, unknown> }>;
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
    async reauthenticate() { calls.authSteps.push('reauth'); },
    async signInWithCustomToken(_auth, token) { calls.exchangedTokens.push(token); calls.authSteps.push('custom-token'); },
  });
  const user = {
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

test('API errors remain fail-closed and never exchange a token', async () => {
  const testHarness = createHarness({ responses: [{ status: 404, body: { code: 'not_found', error: 'Not found.' } }] });
  await assert.rejects(
    () => testHarness.client.verifyAndExchange(testHarness.user, '123456'),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'not_found',
  );
  assert.deepEqual(testHarness.calls.exchangedTokens, []);
});
