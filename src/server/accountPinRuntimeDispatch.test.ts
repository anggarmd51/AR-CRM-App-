import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCOUNT_PIN_APPROVED_RELEASE_BRANCH,
  ACCOUNT_PIN_APPROVED_STAGING_BRANCHES,
  ACCOUNT_PIN_PRODUCTION_GCP_PROJECT_NUMBER,
  ACCOUNT_PIN_PRODUCTION_PROJECT_ID,
  ACCOUNT_PIN_PRODUCTION_SERVICE_ACCOUNT_ID,
  ACCOUNT_PIN_PRODUCTION_WIF_POOL_ID,
  ACCOUNT_PIN_PRODUCTION_WIF_PROVIDER_ID,
  ACCOUNT_PIN_STAGING_PROJECT_ID,
} from './accountPinFirebaseAdmin.ts';
import { FIREBASE_RULES_OWNER_UID, FIREBASE_RULES_WORKSPACE_ID } from '../firebaseRulesBinding.ts';
import {
  createConfiguredAccountPinRuntime,
  getAccountPinRuntimeTarget,
  isAccountPinEnrollmentEnabled,
} from './accountPinRuntimeDispatch.ts';

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
  ACCOUNT_PIN_OWNER_UID: FIREBASE_RULES_OWNER_UID,
  ACCOUNT_PIN_PEPPER: 'synthetic-test-pepper-at-least-thirty-two-bytes',
};

const stagingEnvironment = {
  VERCEL_ENV: 'preview',
  VERCEL_GIT_COMMIT_REF: ACCOUNT_PIN_APPROVED_STAGING_BRANCHES[1],
  VITE_FIREBASE_TARGET: 'staging',
  ACCOUNT_PIN_ENABLED: 'true',
  FIREBASE_ADMIN_PROJECT_ID: ACCOUNT_PIN_STAGING_PROJECT_ID,
  FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON: JSON.stringify({
    project_id: ACCOUNT_PIN_STAGING_PROJECT_ID,
    client_email: 'synthetic-staging@test.invalid',
    private_key: 'synthetic-only-not-a-real-private-key',
  }),
  ACCOUNT_PIN_OWNER_UID: 'synthetic-staging-owner',
  ACCOUNT_PIN_PEPPER: 'synthetic-test-pepper-at-least-thirty-two-bytes',
};

test('runtime dispatch uses the Production factory only for the exact approved Production binding', () => {
  const calls = { production: 0, staging: 0 };
  const factories = {
    production() { calls.production += 1; return 'production-runtime'; },
    staging() { calls.staging += 1; return 'staging-runtime'; },
  };

  assert.equal(getAccountPinRuntimeTarget(productionEnvironment), 'production');
  assert.equal(createConfiguredAccountPinRuntime(productionEnvironment, factories), 'production-runtime');
  assert.equal(getAccountPinRuntimeTarget({ ...productionEnvironment, ACCOUNT_PIN_OWNER_UID: undefined }), 'production');
  assert.deepEqual(calls, { production: 1, staging: 0 });
});

test('Production route dispatch fails closed for wrong project, service account, WIF binding, branch, or target', () => {
  const invalidEnvironments = [
    { ...productionEnvironment, FIREBASE_ADMIN_PROJECT_ID: 'wrong-project' },
    { ...productionEnvironment, FIREBASE_ADMIN_SERVICE_ACCOUNT_ID: 'other@ar-crm-73222.iam.gserviceaccount.com' },
    { ...productionEnvironment, GCP_PROJECT_NUMBER: '123456789012' },
    { ...productionEnvironment, GCP_WORKLOAD_IDENTITY_POOL_ID: 'other-pool' },
    { ...productionEnvironment, GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'other-provider' },
    { ...productionEnvironment, VERCEL_GIT_COMMIT_REF: 'main' },
    { ...productionEnvironment, VITE_FIREBASE_TARGET: 'staging' },
    { ...productionEnvironment, ACCOUNT_PIN_OWNER_UID: 'synthetic-mismatched-owner' },
    { ...productionEnvironment, VITE_FIREBASE_OWNER_UID: 'synthetic-mismatched-owner' },
    { ...productionEnvironment, VITE_FIREBASE_WORKSPACE_ID: 'synthetic-mismatched-workspace' },
    { ...productionEnvironment, VITE_FIREBASE_PROJECT_ID: 'synthetic-mismatched-project' },
  ];
  let factoryCalls = 0;
  const factories = {
    production() { factoryCalls += 1; return 'production-runtime'; },
    staging() { factoryCalls += 1; return 'staging-runtime'; },
  };

  for (const environment of invalidEnvironments) {
    assert.equal(getAccountPinRuntimeTarget(environment), undefined);
    assert.equal(createConfiguredAccountPinRuntime(environment, factories), undefined);
  }
  assert.equal(factoryCalls, 0);
});

test('non-Production Preview deploys only the staging runtime on explicitly approved staging branches', () => {
  const calls = { production: 0, staging: 0 };
  const factories = {
    production() { calls.production += 1; return 'production-runtime'; },
    staging() { calls.staging += 1; return 'staging-runtime'; },
  };

  assert.equal(getAccountPinRuntimeTarget(stagingEnvironment), 'staging');
  assert.equal(createConfiguredAccountPinRuntime(stagingEnvironment, factories), 'staging-runtime');
  assert.deepEqual(calls, { production: 0, staging: 1 });

  const existingStagingBranch = { ...stagingEnvironment, VERCEL_GIT_COMMIT_REF: ACCOUNT_PIN_APPROVED_STAGING_BRANCHES[0] };
  assert.equal(getAccountPinRuntimeTarget(existingStagingBranch), 'staging');

  const wrongBranch = { ...stagingEnvironment, VERCEL_GIT_COMMIT_REF: 'feature/other' };
  assert.equal(getAccountPinRuntimeTarget(wrongBranch), undefined);
  assert.equal(createConfiguredAccountPinRuntime(wrongBranch, factories), undefined);
  const stagingBranchOnProduction = { ...productionEnvironment, VERCEL_GIT_COMMIT_REF: ACCOUNT_PIN_APPROVED_STAGING_BRANCHES[1] };
  assert.equal(getAccountPinRuntimeTarget(stagingBranchOnProduction), undefined);
  assert.deepEqual(calls, { production: 0, staging: 1 });
});

test('missing or malformed configuration never constructs either runtime', () => {
  const invalidEnvironments = [
    { ...productionEnvironment, VERCEL_ENV: 'preview' },
    { ...productionEnvironment, ACCOUNT_PIN_ENABLED: 'false' },
    { ...productionEnvironment, VITE_FIREBASE_TARGET: undefined },
    { ...productionEnvironment, ACCOUNT_PIN_OWNER_UID: '' },
    { ...productionEnvironment, ACCOUNT_PIN_PEPPER: 'too-short' },
    { ...stagingEnvironment, FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON: '{not-json' },
    { ...stagingEnvironment, FIREBASE_ADMIN_PROJECT_ID: 'wrong-project' },
    { ...stagingEnvironment, ACCOUNT_PIN_OWNER_UID: undefined, VITE_FIREBASE_OWNER_UID: 'synthetic-staging-owner' },
  ];
  let factoryCalls = 0;
  const factories = {
    production() { factoryCalls += 1; return 'production-runtime'; },
    staging() { factoryCalls += 1; return 'staging-runtime'; },
  };

  for (const environment of invalidEnvironments) {
    assert.equal(getAccountPinRuntimeTarget(environment), undefined);
    assert.equal(createConfiguredAccountPinRuntime(environment, factories), undefined);
  }
  assert.equal(factoryCalls, 0);
});

test('Production enrollment is off by default and only turns on with the explicit server flag', () => {
  assert.equal(isAccountPinEnrollmentEnabled(productionEnvironment), false);
  assert.equal(isAccountPinEnrollmentEnabled({ ...productionEnvironment, ACCOUNT_PIN_ENROLLMENT_ENABLED: 'true' }), true);
  assert.equal(isAccountPinEnrollmentEnabled({ ...productionEnvironment, ACCOUNT_PIN_ENABLED: 'false', ACCOUNT_PIN_ENROLLMENT_ENABLED: 'true' }), false);
  assert.equal(isAccountPinEnrollmentEnabled({ ...stagingEnvironment, ACCOUNT_PIN_ENROLLMENT_ENABLED: 'true' }), true);
  assert.equal(isAccountPinEnrollmentEnabled(stagingEnvironment), false);
});
