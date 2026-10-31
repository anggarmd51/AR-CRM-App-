import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeApp, type App, type AppOptions } from 'firebase-admin/app';
import type { ExternalAccountSupplierContext, IdentityPoolClientOptions } from 'google-auth-library';
import {
  ACCOUNT_PIN_APPROVED_RELEASE_BRANCH,
  ACCOUNT_PIN_PRODUCTION_GCP_PROJECT_NUMBER,
  ACCOUNT_PIN_PRODUCTION_WIF_AUDIENCE,
  ACCOUNT_PIN_PRODUCTION_WIF_STS_AUDIENCE,
  ACCOUNT_PIN_PRODUCTION_PROJECT_ID,
  ACCOUNT_PIN_PRODUCTION_SERVICE_ACCOUNT_ID,
  ACCOUNT_PIN_PRODUCTION_WIF_POOL_ID,
  ACCOUNT_PIN_PRODUCTION_WIF_PROVIDER_ID,
  createProductionAccountPinCredential,
  createProductionAccountPinRuntime,
  createProductionFirestore,
  createProductionFirebaseAdminApp,
  resolveProductionAccountPinOwnerUid,
} from './accountPinFirebaseAdmin.ts';
import { FIREBASE_RULES_OWNER_UID, FIREBASE_RULES_WORKSPACE_ID } from '../firebaseRulesBinding.ts';

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

test('Production PIN Admin rejects Preview, disabled, wrong-project, and wrong-service-account configurations before initialization', () => {
  let initializeCalls = 0;
  const dependencies = {
    getApps: () => [],
    initializeApp: () => {
      initializeCalls += 1;
      throw new Error('Admin initialization must not run for rejected configuration.');
    },
  };

  assert.throws(
    () => createProductionFirebaseAdminApp({ ...productionEnvironment, VERCEL_ENV: 'preview' }, dependencies),
    /disabled outside the explicitly enabled Production environment/,
  );
  assert.throws(
    () => createProductionFirebaseAdminApp({ ...productionEnvironment, ACCOUNT_PIN_ENABLED: 'false' }, dependencies),
    /disabled outside the explicitly enabled Production environment/,
  );
  assert.throws(
    () => createProductionFirebaseAdminApp({ ...productionEnvironment, VERCEL_GIT_COMMIT_REF: 'main' }, dependencies),
    /approved release branch and Firebase target/,
  );
  assert.throws(
    () => createProductionFirebaseAdminApp({ ...productionEnvironment, VITE_FIREBASE_TARGET: 'staging' }, dependencies),
    /approved release branch and Firebase target/,
  );
  assert.throws(
    () => createProductionFirebaseAdminApp({ ...productionEnvironment, FIREBASE_ADMIN_PROJECT_ID: 'not-production' }, dependencies),
    /restricted to the approved Firebase project/,
  );
  assert.throws(
    () => createProductionFirebaseAdminApp({ ...productionEnvironment, FIREBASE_ADMIN_SERVICE_ACCOUNT_ID: 'other@ar-crm-73222.iam.gserviceaccount.com' }, dependencies),
    /restricted to the approved service account/,
  );
  assert.throws(
    () => createProductionFirebaseAdminApp({ ...productionEnvironment, GCP_PROJECT_NUMBER: 'not-a-number' }, dependencies),
    /approved Workload Identity Federation provider/,
  );
  assert.throws(
    () => createProductionFirebaseAdminApp({ ...productionEnvironment, GCP_WORKLOAD_IDENTITY_POOL_ID: 'bad' }, dependencies),
    /approved Workload Identity Federation provider/,
  );
  assert.throws(
    () => createProductionFirebaseAdminApp({ ...productionEnvironment, GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'INVALID' }, dependencies),
    /approved Workload Identity Federation provider/,
  );
  assert.equal(initializeCalls, 0);
});

test('Production runtime rejects missing or short pepper before Firebase Admin initialization', () => {
  assert.throws(() => createProductionAccountPinRuntime(productionEnvironment), /configuration is incomplete/);
  const ownerConfigured = { ...productionEnvironment, ACCOUNT_PIN_OWNER_UID: FIREBASE_RULES_OWNER_UID };
  assert.throws(() => createProductionAccountPinRuntime(ownerConfigured), /configuration is incomplete/);
  assert.throws(
    () => createProductionAccountPinRuntime({ ...ownerConfigured, ACCOUNT_PIN_PEPPER: 'too-short' }),
    /configuration is incomplete/,
  );
});

test('Production owner UID falls back to the server VITE binding and rejects empty or mismatched bindings', () => {
  const environmentWithoutDedicatedUid = { ...productionEnvironment };
  delete (environmentWithoutDedicatedUid as { ACCOUNT_PIN_OWNER_UID?: string }).ACCOUNT_PIN_OWNER_UID;
  assert.equal(resolveProductionAccountPinOwnerUid(environmentWithoutDedicatedUid), FIREBASE_RULES_OWNER_UID);

  const invalidBindings = [
    { ...environmentWithoutDedicatedUid, VITE_FIREBASE_OWNER_UID: '' },
    { ...productionEnvironment, ACCOUNT_PIN_OWNER_UID: '' },
    { ...productionEnvironment, ACCOUNT_PIN_OWNER_UID: 'synthetic-mismatched-owner' },
    { ...productionEnvironment, VITE_FIREBASE_OWNER_UID: 'synthetic-mismatched-owner' },
    { ...productionEnvironment, VITE_FIREBASE_WORKSPACE_ID: 'synthetic-mismatched-workspace' },
    { ...productionEnvironment, VITE_FIREBASE_PROJECT_ID: 'synthetic-mismatched-project' },
  ];
  for (const environment of invalidBindings) {
    assert.throws(() => resolveProductionAccountPinOwnerUid(environment), /configuration is incomplete/);
  }
});

test('mocked Production WIF uses the exact audience and service account, and adapts OAuth access tokens for Firebase Admin without network calls', async () => {
  const now = 1_800_000_000_000;
  const environmentWithUnusedLegacyKey = {
    ...productionEnvironment,
    FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON: '{"type":"service_account","private_key":"synthetic-test-only"}',
  };
  let capturedExternalOptions: IdentityPoolClientOptions | undefined;
  let requestedAudience: string | undefined;
  let capturedAppOptions: AppOptions | undefined;
  let capturedAppName: string | undefined;
  const credential = createProductionAccountPinCredential(environmentWithUnusedLegacyKey, {
    now: () => now,
    getVercelOidcToken: async ({ audience }) => {
      requestedAudience = audience;
      return 'mock-vercel-oidc-subject-token';
    },
    createExternalAccountClient: (options) => {
      capturedExternalOptions = options;
      return {
        credentials: { expiry_date: now + 3_600_000 },
        async getAccessToken() {
          const context: ExternalAccountSupplierContext = {
            audience: options.audience,
            subjectTokenType: options.subject_token_type,
            transporter: {} as ExternalAccountSupplierContext['transporter'],
          };
          const subjectToken = await options.subject_token_supplier?.getSubjectToken(context);
          assert.equal(subjectToken, 'mock-vercel-oidc-subject-token');
          return { token: 'mock-google-access-token' };
        },
      };
    },
  });

  const app = createProductionFirebaseAdminApp(environmentWithUnusedLegacyKey, {
    getApps: () => [],
    createCredential: () => credential,
    initializeApp: (options, name) => {
      capturedAppOptions = options;
      capturedAppName = name;
      return { name, options } as App;
    },
  });

  assert.equal(app.name, 'ar-crm-account-pin-production-wif');
  assert.equal(capturedAppOptions?.projectId, ACCOUNT_PIN_PRODUCTION_PROJECT_ID);
  assert.equal(capturedAppOptions?.serviceAccountId, ACCOUNT_PIN_PRODUCTION_SERVICE_ACCOUNT_ID);
  assert.equal(capturedAppOptions?.credential, credential);
  assert.equal(capturedAppName, app.name);

  const token = await credential.getAccessToken();
  assert.equal(token.access_token, 'mock-google-access-token');
  assert.equal(token.expires_in, 3_600);

  assert.notEqual(ACCOUNT_PIN_PRODUCTION_WIF_AUDIENCE, ACCOUNT_PIN_PRODUCTION_WIF_STS_AUDIENCE);
  assert.equal(requestedAudience, 'https://iam.googleapis.com/projects/577829773376/locations/global/workloadIdentityPools/vercel-prod/providers/vercel-prod');
  assert.equal(capturedExternalOptions?.audience, '//iam.googleapis.com/projects/577829773376/locations/global/workloadIdentityPools/vercel-prod/providers/vercel-prod');
  assert.equal('credential_source' in (capturedExternalOptions ?? {}), false);
  assert.equal('private_key' in (capturedExternalOptions ?? {}), false);
  assert.equal(capturedExternalOptions?.subject_token_type, 'urn:ietf:params:oauth:token-type:jwt');
  assert.equal(capturedExternalOptions?.token_url, 'https://sts.googleapis.com/v1/token');
  assert.equal(
    capturedExternalOptions?.service_account_impersonation_url,
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${ACCOUNT_PIN_PRODUCTION_SERVICE_ACCOUNT_ID}:generateAccessToken`,
  );
});

test('OIDC subject-token supplier accepts STS audience and rejects HTTPS or wrong audiences', async () => {
  let suppliedTokenCalls = 0;
  let externalOptions: IdentityPoolClientOptions | undefined;
  createProductionAccountPinCredential(productionEnvironment, {
    getVercelOidcToken: async () => {
      suppliedTokenCalls += 1;
      return '   ';
    },
    createExternalAccountClient: (options) => {
      externalOptions = options;
      return {
        credentials: { expiry_date: 1_900_000_000_000 },
        async getAccessToken() { return { token: 'unused' }; },
      };
    },
  });

  const supplier = externalOptions?.subject_token_supplier;
  assert.ok(supplier);
  const context: ExternalAccountSupplierContext = {
    audience: externalOptions?.audience ?? '',
    subjectTokenType: externalOptions?.subject_token_type ?? '',
    transporter: {} as ExternalAccountSupplierContext['transporter'],
  };
  await assert.rejects(supplier.getSubjectToken({ ...context, audience: ACCOUNT_PIN_PRODUCTION_WIF_AUDIENCE }), /does not match the approved Google identity provider/);
  await assert.rejects(supplier.getSubjectToken({ ...context, audience: `${context.audience}/wrong` }), /does not match the approved Google identity provider/);
  assert.equal(suppliedTokenCalls, 0);
  await assert.rejects(supplier.getSubjectToken(context), /did not return a valid subject token/);
  assert.equal(suppliedTokenCalls, 1);
});

test('Firebase Admin adapter rejects empty access tokens and missing, invalid, or expired token lifetimes', async () => {
  const now = 1_800_000_000_000;
  const invalidResponses: Array<{ name: string; token: string | null | undefined; expiry: number | null | undefined }> = [
    { name: 'empty token', token: '', expiry: now + 3_600_000 },
    { name: 'whitespace token', token: '   ', expiry: now + 3_600_000 },
    { name: 'missing token', token: undefined, expiry: now + 3_600_000 },
    { name: 'missing expiry', token: 'mock-token', expiry: undefined },
    { name: 'null expiry', token: 'mock-token', expiry: null },
    { name: 'invalid expiry', token: 'mock-token', expiry: Number.NaN },
    { name: 'expired token', token: 'mock-token', expiry: now - 1_000 },
    { name: 'subsecond token lifetime', token: 'mock-token', expiry: now + 500 },
  ];

  for (const entry of invalidResponses) {
    const credential = createProductionAccountPinCredential(productionEnvironment, {
      now: () => now,
      getVercelOidcToken: async () => 'unused-mock-token',
      createExternalAccountClient: () => ({
        credentials: { expiry_date: entry.expiry },
        async getAccessToken() { return { token: entry.token }; },
      }),
    });
    await assert.rejects(credential.getAccessToken(), /returned an invalid access token/, entry.name);
  }
});

test('google-auth-library accepts the real WIF configuration without requesting a token or contacting Google', () => {
  let oidcTokenRequests = 0;
  const credential = createProductionAccountPinCredential(productionEnvironment, {
    getVercelOidcToken: async () => {
      oidcTokenRequests += 1;
      return 'unused-mock-token';
    },
  });

  assert.equal(typeof credential.getAccessToken, 'function');
  assert.equal(oidcTokenRequests, 0);
});

test('Production Firebase Admin refuses to reuse an app with a non-WIF credential', () => {
  const app = {
    name: 'ar-crm-account-pin-production-wif',
    options: {
      projectId: ACCOUNT_PIN_PRODUCTION_PROJECT_ID,
      serviceAccountId: ACCOUNT_PIN_PRODUCTION_SERVICE_ACCOUNT_ID,
      credential: { getAccessToken: async () => ({ access_token: 'untrusted', expires_in: 3_600 }) },
    },
  } as unknown as App;

  assert.throws(
    () => createProductionFirebaseAdminApp(productionEnvironment, { getApps: () => [app] }),
    /not bound to the approved keyless Production configuration/,
  );
});

test('real Production bootstrap creates Firestore with the existing WIF client and no ADC fallback', () => {
  const externalAccountClient = {
    credentials: { expiry_date: Date.now() + 3_600_000 },
    async getAccessToken() { return { token: 'synthetic-test-only-access-token' }; },
  };
  const credential = createProductionAccountPinCredential(productionEnvironment, {
    getVercelOidcToken: async () => 'synthetic-test-only-oidc-token',
    createExternalAccountClient: () => externalAccountClient,
  });
  const app = createProductionFirebaseAdminApp(productionEnvironment, {
    getApps: () => [],
    createCredential: () => credential,
    initializeApp,
  });

  const firestore = createProductionFirestore(app) as unknown as {
    projectId: string;
    _settings?: { projectId?: string; authClient?: unknown };
  };
  assert.equal(firestore.projectId, ACCOUNT_PIN_PRODUCTION_PROJECT_ID);
  assert.equal(firestore._settings?.projectId, ACCOUNT_PIN_PRODUCTION_PROJECT_ID);
  assert.equal(firestore._settings?.authClient, externalAccountClient);

  const runtime = createProductionAccountPinRuntime({
    ...productionEnvironment,
    ACCOUNT_PIN_OWNER_UID: FIREBASE_RULES_OWNER_UID,
    ACCOUNT_PIN_PEPPER: 'synthetic-test-only-pepper-32-bytes-minimum',
  });
  assert.equal(typeof runtime.verify, 'function');
  assert.equal(typeof runtime.enroll, 'function');
});

test('Production Firestore refuses a cross-project or unbound credential and requires explicit auth client binding', () => {
  const untrustedApp = {
    name: 'ar-crm-account-pin-production-wif',
    options: {
      projectId: ACCOUNT_PIN_PRODUCTION_PROJECT_ID,
      serviceAccountId: ACCOUNT_PIN_PRODUCTION_SERVICE_ACCOUNT_ID,
      credential: { getAccessToken: async () => ({ access_token: 'untrusted', expires_in: 3_600 }) },
    },
  } as unknown as App;
  assert.throws(
    () => createProductionFirestore(untrustedApp),
    /not bound to the approved keyless Production configuration/,
  );

  const wrongProjectApp = {
    ...untrustedApp,
    options: { ...untrustedApp.options, projectId: 'wrong-project' },
  } as unknown as App;
  assert.throws(
    () => createProductionFirestore(wrongProjectApp),
    /not bound to the approved keyless Production configuration/,
  );
});
