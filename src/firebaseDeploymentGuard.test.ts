import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getStagingAppCheckSiteKey,
  initializeStagingAppCheck,
  shouldBypassAppCheckForExactStagingPreview,
  STAGING_PREVIEW_ALIAS_ORIGIN,
} from './firebaseAppCheckPolicy.ts';
import { KNOWN_PRODUCTION_FIREBASE_PROJECT_ID, resolveFirebaseTarget } from './firebaseDeploymentGuard.ts';

const productionProjectId = KNOWN_PRODUCTION_FIREBASE_PROJECT_ID;
const syntheticStagingProjectId = 'ar-crm-staging-synthetic';

test('local development defaults to the emulator-only target', () => {
  assert.equal(resolveFirebaseTarget({ isDevelopment: true, projectId: productionProjectId }), 'local');
});

test('local development cannot opt into a hosted Firebase target', () => {
  assert.throws(() => resolveFirebaseTarget({
    isDevelopment: true,
    declaredTarget: 'production',
    projectId: productionProjectId,
  }), /must use VITE_FIREBASE_TARGET=local/);
});

test('Vercel Preview requires an explicitly separate staging project', () => {
  assert.equal(resolveFirebaseTarget({
    isDevelopment: false,
    declaredTarget: 'staging',
    projectId: syntheticStagingProjectId,
    stagingProjectIdAllowlist: syntheticStagingProjectId,
    vercelEnvironment: 'preview',
  }), 'staging');
});

test('staging fails closed without exact allowlist match and recognizable project ID', () => {
  assert.throws(() => resolveFirebaseTarget({
    isDevelopment: false,
    declaredTarget: 'staging',
    projectId: syntheticStagingProjectId,
    vercelEnvironment: 'preview',
  }), /must exactly match VITE_FIREBASE_STAGING_PROJECT_ID_ALLOWLIST/);
  assert.throws(() => resolveFirebaseTarget({
    isDevelopment: false,
    declaredTarget: 'staging',
    projectId: 'arbitrary-nonproduction-project',
    stagingProjectIdAllowlist: 'arbitrary-nonproduction-project',
    vercelEnvironment: 'preview',
  }), /ar-crm-staging-<suffix> pattern/);
  assert.throws(() => resolveFirebaseTarget({
    isDevelopment: false,
    declaredTarget: 'staging',
    projectId: syntheticStagingProjectId,
    stagingProjectIdAllowlist: 'ar-crm-staging-other',
    vercelEnvironment: 'preview',
  }), /must exactly match VITE_FIREBASE_STAGING_PROJECT_ID_ALLOWLIST/);
});

test('Vercel Preview fails closed when target is missing or production is selected', () => {
  assert.throws(() => resolveFirebaseTarget({
    isDevelopment: false,
    projectId: productionProjectId,
    vercelEnvironment: 'preview',
  }), /requires VITE_FIREBASE_TARGET=staging/);
  assert.throws(() => resolveFirebaseTarget({
    isDevelopment: false,
    declaredTarget: 'production',
    projectId: productionProjectId,
    vercelEnvironment: 'preview',
  }), /requires VITE_FIREBASE_TARGET=staging/);
});

test('staging rejects the known production project ID', () => {
  assert.throws(() => resolveFirebaseTarget({
    isDevelopment: false,
    declaredTarget: 'staging',
    projectId: productionProjectId,
    vercelEnvironment: 'preview',
  }), /separate, non-production Firebase project ID/);
});

test('production is allowed only for the known project in a Vercel Production build', () => {
  assert.equal(resolveFirebaseTarget({
    isDevelopment: false,
    declaredTarget: 'production',
    projectId: productionProjectId,
    vercelEnvironment: 'production',
  }), 'production');
  assert.throws(() => resolveFirebaseTarget({
    isDevelopment: false,
    declaredTarget: 'production',
    projectId: productionProjectId,
  }), /only in a Vercel Production build/);
  assert.throws(() => resolveFirebaseTarget({
    isDevelopment: false,
    declaredTarget: 'production',
    projectId: syntheticStagingProjectId,
    vercelEnvironment: 'production',
  }), /verified production project ID/);
});

test('hosted builds without an explicit target fail closed', () => {
  assert.throws(() => resolveFirebaseTarget({
    isDevelopment: false,
    projectId: syntheticStagingProjectId,
  }), /require an explicit VITE_FIREBASE_TARGET/);
});

test('App Check site key is required and returned only for staging', () => {
  assert.equal(getStagingAppCheckSiteKey('staging', '  synthetic-site-key  '), 'synthetic-site-key');
  assert.throws(() => getStagingAppCheckSiteKey('staging', ''), /requires a valid VITE_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY/);
  assert.throws(() => getStagingAppCheckSiteKey('staging', 'bad key'), /requires a valid VITE_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY/);
  assert.equal(getStagingAppCheckSiteKey('local', 'synthetic-site-key'), undefined);
  assert.equal(getStagingAppCheckSiteKey('production', 'synthetic-site-key'), undefined);
});

test('App Check initialization errors are contained and never expose provider text', () => {
  let calls = 0;
  const missing = initializeStagingAppCheck('staging', undefined, () => { calls += 1; });
  assert.equal(missing.status, 'error');
  assert.match(missing.message, /Auth dan Firestore diblokir/);
  assert.equal(calls, 0);

  const providerFailure = initializeStagingAppCheck('staging', 'synthetic-site-key', () => {
    calls += 1;
    throw new Error('provider raw private detail');
  });
  assert.equal(providerFailure.status, 'error');
  assert.doesNotMatch(providerFailure.message, /private detail/);
  assert.equal(calls, 1);
});

test('Firebase initializes App Check before creating Auth or Firestore clients', () => {
  const firebaseModule = readFileSync(new URL('./firebase.ts', import.meta.url), 'utf8');
  const appCheckInit = firebaseModule.indexOf('initializeAppCheck(');
  const authInit = firebaseModule.indexOf('getAuth(getFirebaseApp())');
  const firestoreInit = firebaseModule.indexOf('getFirestore(getFirebaseApp())');
  assert.ok(appCheckInit >= 0, 'staging App Check initialization should exist');
  assert.ok(appCheckInit < authInit, 'App Check must initialize before Auth');
  assert.ok(appCheckInit < firestoreInit, 'App Check must initialize before Firestore');
  assert.match(firebaseModule, /initializeStagingAppCheck\(\s*firebaseTarget/);
  assert.match(firebaseModule, /getToken\(appCheck, true\)/);
  assert.match(firebaseModule, /assertAppCheckVerified\(\)/);
  assert.match(firebaseModule, /firebaseTarget !== 'staging' \|\| isExactStagingPreviewBypass\(\)/);
  assert.match(firebaseModule, /if \(isExactStagingPreviewBypass\(\)\)/);
  assert.match(firebaseModule, /!isExactStagingPreviewBypass\(\) && !appCheckVerified/);
});

test('temporary App Check bypass requires the exact staging Preview, branch, and runtime alias', () => {
  const exactContext = {
    firebaseTarget: 'staging' as const,
    vercelEnvironment: 'preview',
    gitRef: 'cue/firebase-stabilization',
    runtimeOrigin: STAGING_PREVIEW_ALIAS_ORIGIN,
  };

  assert.equal(shouldBypassAppCheckForExactStagingPreview(exactContext), true);

  const outOfBoundaryContexts = [
    { ...exactContext, firebaseTarget: 'local' as const },
    { ...exactContext, firebaseTarget: 'production' as const },
    { ...exactContext, vercelEnvironment: 'development' },
    { ...exactContext, vercelEnvironment: 'production' },
    { ...exactContext, vercelEnvironment: '' },
    { ...exactContext, gitRef: 'main' },
    { ...exactContext, gitRef: '' },
    { ...exactContext, runtimeOrigin: 'https://another-preview.vercel.app' },
    { ...exactContext, runtimeOrigin: `${STAGING_PREVIEW_ALIAS_ORIGIN}/` },
    { ...exactContext, runtimeOrigin: 'http://arcrm-app-git-cue-firebase-stabilization-anggaramadhan538-8607.vercel.app' },
    { ...exactContext, runtimeOrigin: '' },
  ];

  for (const context of outOfBoundaryContexts) {
    assert.equal(shouldBypassAppCheckForExactStagingPreview(context), false);
  }
});
