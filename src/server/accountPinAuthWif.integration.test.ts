import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { getAuth } from 'firebase-admin/auth';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import {
  ACCOUNT_PIN_PRODUCTION_PROJECT_ID,
  ACCOUNT_PIN_PRODUCTION_SERVICE_ACCOUNT_ID,
  ACCOUNT_PIN_PRODUCTION_WIF_AUDIENCE,
  ACCOUNT_PIN_PRODUCTION_GCP_PROJECT_NUMBER,
  ACCOUNT_PIN_PRODUCTION_WIF_POOL_ID,
  ACCOUNT_PIN_PRODUCTION_WIF_PROVIDER_ID,
  ACCOUNT_PIN_APPROVED_RELEASE_BRANCH,
  createProductionAccountPinCredential,
} from './accountPinFirebaseAdmin.ts';
import { FIREBASE_RULES_WORKSPACE_ID, FIREBASE_RULES_OWNER_UID } from '../firebaseRulesBinding.ts';
import { logAccountPinRequestDiagnostic } from './accountPinDiagnostics.ts';

const require = createRequire(import.meta.url);
interface InterceptedHttpRequest {
  url: string;
  headers?: Record<string, string>;
  data?: unknown;
}
const HttpClient = require(join(dirname(require.resolve('firebase-admin')), 'utils/api-request.js')).HttpClient as {
  prototype: { send: (config: InterceptedHttpRequest) => Promise<unknown> };
};

const FAKE_ACCESS_BEARER = 'synthetic-firebase-admin-access-bearer';
const SYNTHETIC_UID = 'synthetic-owner-uid';
const SYNTHETIC_KID = 'synthetic-key-id';
const NOW_SECONDS = Math.floor(Date.now() / 1_000);

const productionEnvironment = {
  VERCEL_ENV: 'production',
  VERCEL_GIT_COMMIT_REF: ACCOUNT_PIN_APPROVED_RELEASE_BRANCH,
  VITE_FIREBASE_TARGET: 'production',
  VITE_FIREBASE_PROJECT_ID: ACCOUNT_PIN_PRODUCTION_PROJECT_ID,
  VITE_FIREBASE_WORKSPACE_ID: FIREBASE_RULES_WORKSPACE_ID,
  VITE_FIREBASE_OWNER_UID: FIREBASE_RULES_OWNER_UID,
  ACCOUNT_PIN_ENABLED: 'true',
  FIREBASE_ADMIN_PROJECT_ID: ACCOUNT_PIN_PRODUCTION_PROJECT_ID,
  FIREBASE_ADMIN_SERVICE_ACCOUNT_ID: ACCOUNT_PIN_PRODUCTION_SERVICE_ACCOUNT_ID,
  GCP_PROJECT_NUMBER: ACCOUNT_PIN_PRODUCTION_GCP_PROJECT_NUMBER,
  GCP_WORKLOAD_IDENTITY_POOL_ID: ACCOUNT_PIN_PRODUCTION_WIF_POOL_ID,
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: ACCOUNT_PIN_PRODUCTION_WIF_PROVIDER_ID,
};

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function syntheticFirebaseIdToken(): string {
  const header = base64Url(JSON.stringify({ alg: 'RS256', kid: SYNTHETIC_KID, typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({
    aud: ACCOUNT_PIN_PRODUCTION_PROJECT_ID,
    iss: `https://securetoken.google.com/${ACCOUNT_PIN_PRODUCTION_PROJECT_ID}`,
    sub: SYNTHETIC_UID,
    user_id: SYNTHETIC_UID,
    iat: NOW_SECONDS - 30,
    exp: NOW_SECONDS + 3_600,
    auth_time: NOW_SECONDS - 30,
    firebase: { sign_in_provider: 'custom' },
  }));
  const signingInput = `${header}.${payload}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey);
  return `${signingInput}.${base64Url(signature)}`;
}

function jsonResponse(data: unknown, headers: Record<string, string> = {}) {
  return {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
    data,
    text: JSON.stringify(data),
    isJson: () => true,
  };
}

function createWifCredential(options: { fail?: boolean; onAcquire?: () => void } = {}) {
  return createProductionAccountPinCredential(productionEnvironment, {
    now: () => NOW_SECONDS * 1_000,
    createExternalAccountClient: () => ({
      credentials: { expiry_date: (NOW_SECONDS + 3_600) * 1_000 },
      async getAccessToken() {
        options.onAcquire?.();
        if (options.fail) throw new Error('synthetic provider failure must not be logged');
        return { token: FAKE_ACCESS_BEARER };
      },
    }),
  });
}

  test('firebase-admin 14.5.0 preserves local verification without WIF, and uses WIF bearer for checkRevoked', async () => {
  const originalSend = HttpClient.prototype.send;
  const requests: Array<{ url: string; authorization?: string; data?: unknown }> = [];
  let credentialAcquisitions = 0;
  HttpClient.prototype.send = async function send(config: { url: string; headers?: Record<string, string>; data?: unknown }) {
    requests.push({ url: config.url, authorization: config.headers?.Authorization, data: config.data });
    if (config.url.includes('metadata/x509/securetoken@system.gserviceaccount.com')) {
      return jsonResponse({ [SYNTHETIC_KID]: publicKeyPem }, { 'cache-control': 'public, max-age=3600' });
    }
    assert.match(config.url, /identitytoolkit\.googleapis\.com/);
    assert.equal(config.headers?.Authorization, `Bearer ${FAKE_ACCESS_BEARER}`);
    return jsonResponse({ users: [{ localId: SYNTHETIC_UID, disabled: false, tokensValidAfterTime: '0' }] });
  };

  const app = initializeApp({
    credential: createWifCredential({ onAcquire: () => { credentialAcquisitions += 1; } }),
    projectId: ACCOUNT_PIN_PRODUCTION_PROJECT_ID,
    serviceAccountId: ACCOUNT_PIN_PRODUCTION_SERVICE_ACCOUNT_ID,
  }, `synthetic-wif-integration-${Date.now()}`);
  try {
    const auth = getAuth(app);
    const token = syntheticFirebaseIdToken();

    const decodedWithoutRevocation = await auth.verifyIdToken(token, false);
    assert.equal(decodedWithoutRevocation.uid, SYNTHETIC_UID);
    assert.equal(requests.length, 1, 'false must fetch only public signing certificates');
    assert.equal(credentialAcquisitions, 0, 'false must not acquire a WIF credential');
    assert.equal(requests[0]?.authorization, undefined, 'false must not acquire or send a WIF bearer');

    const decodedWithRevocation = await auth.verifyIdToken(token, true);
    assert.equal(decodedWithRevocation.uid, SYNTHETIC_UID);
    assert.equal(requests.length, 2, 'true must add the Firebase Auth account lookup');
    assert.equal(credentialAcquisitions, 1, 'true must use the Firebase App WIF credential');
    assert.equal(requests[1]?.authorization, `Bearer ${FAKE_ACCESS_BEARER}`);
    assert.deepEqual(requests[1]?.data, { localId: [SYNTHETIC_UID] });
  } finally {
    await deleteApp(app);
    HttpClient.prototype.send = originalSend;
  }
});

test('FirebaseAppInternals credential failures retain allowlisted class/code/reason without provider text', async () => {
  const originalSend = HttpClient.prototype.send;
  HttpClient.prototype.send = async function send(config: { url: string }) {
    assert.match(config.url, /metadata\/x509\/securetoken@system\.gserviceaccount\.com/);
    return jsonResponse({ [SYNTHETIC_KID]: publicKeyPem }, { 'cache-control': 'public, max-age=3600' });
  };

  const app = initializeApp({
    credential: createWifCredential({ fail: true }),
    projectId: ACCOUNT_PIN_PRODUCTION_PROJECT_ID,
    serviceAccountId: ACCOUNT_PIN_PRODUCTION_SERVICE_ACCOUNT_ID,
  }, `synthetic-wif-failure-${Date.now()}`);
  const logged: string[] = [];
  const originalConsoleError = console.error;
  console.error = (...values: unknown[]) => { logged.push(values.map(String).join(' ')); };
  try {
    const auth = getAuth(app);
    let wrappedError: unknown;
    await assert.rejects(
      auth.verifyIdToken(syntheticFirebaseIdToken(), true),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'app/invalid-credential');
        wrappedError = error;
        return true;
      },
    );

    logAccountPinRequestDiagnostic('auth_token_verify_failed', wrappedError);
    const diagnostics = logged.map(line => JSON.parse(line.replace(/^account_pin_diagnostic /, '')) as Record<string, unknown>);
    assert.ok(diagnostics.some(entry => entry.stage === 'wif_token_exchange'));
    const diagnostic = diagnostics.find(entry => entry.tag === 'auth_token_verify_failed');
    assert.ok(diagnostic);
    assert.equal(diagnostic.code, 'app/invalid-credential');
    assert.equal(diagnostic.name, 'Error');
    assert.equal(diagnostic.reason, 'credentials_error');
    assert.doesNotMatch(JSON.stringify(diagnostics), /synthetic provider failure/);
  } finally {
    console.error = originalConsoleError;
    await deleteApp(app);
    HttpClient.prototype.send = originalSend;
  }
});
