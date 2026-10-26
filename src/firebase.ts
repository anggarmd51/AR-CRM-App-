import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { firebaseOwnerBindingMatchesRules } from './firebaseRulesBinding.ts';
import { shouldUseFirebaseEmulators } from './firebaseEmulatorMode.ts';
import { initializeStagingAppCheck } from './firebaseAppCheckPolicy.ts';
import { resolveFirebaseTarget, type FirebaseTarget } from './firebaseDeploymentGuard.ts';

declare const __VERCEL_ENV__: string;

const requiredConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
} as const;

export const firebaseIsConfigured = Object.values(requiredConfig).every(
  (value) => typeof value === 'string' && value.trim().length > 0,
);

let targetConfigurationError: Error | undefined;
export let firebaseTarget: FirebaseTarget = 'local';
try {
  firebaseTarget = resolveFirebaseTarget({
    isDevelopment: import.meta.env.DEV,
    declaredTarget: import.meta.env.VITE_FIREBASE_TARGET,
    projectId: requiredConfig.projectId,
    stagingProjectIdAllowlist: import.meta.env.VITE_FIREBASE_STAGING_PROJECT_ID_ALLOWLIST,
    vercelEnvironment: typeof __VERCEL_ENV__ === 'undefined' ? '' : __VERCEL_ENV__,
  });
} catch (error) {
  targetConfigurationError = error instanceof Error ? error : new Error('Firebase deployment target is invalid.');
}

let app: FirebaseApp | undefined;
let appCheck: AppCheck | undefined;
let appCheckStartupError: Error | undefined;
let appCheckVerified = false;
let auth: Auth | undefined;
let db: Firestore | undefined;
let authEmulatorConnected = false;
let firestoreEmulatorConnected = false;
const useFirebaseEmulators = shouldUseFirebaseEmulators(import.meta.env.DEV);

export function getFirebaseStartupErrorMessage(): string | undefined {
  return targetConfigurationError?.message ?? appCheckStartupError?.message;
}

function assertTargetConfiguration(): void {
  if (targetConfigurationError) throw targetConfigurationError;
}

function initializeRequiredAppCheck(firebaseApp: FirebaseApp): void {
  if (firebaseTarget !== 'staging') return;
  if (appCheckStartupError) throw appCheckStartupError;
  if (appCheck) return;

  const result = initializeStagingAppCheck(
    firebaseTarget,
    import.meta.env.VITE_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY,
    (siteKey) => {
      appCheck = initializeAppCheck(firebaseApp, {
        provider: new ReCaptchaEnterpriseProvider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
    },
  );
  if (result.status === 'error') {
    appCheckStartupError = new Error(result.message);
    throw appCheckStartupError;
  }
}

export function getFirebaseApp(): FirebaseApp {
  assertTargetConfiguration();
  if (!firebaseIsConfigured) throw new Error('Firebase is not configured. Set the VITE_FIREBASE_* environment variables.');
  if (appCheckStartupError) throw appCheckStartupError;
  const firebaseApp = app ??= getApps().length ? getApp() : initializeApp(requiredConfig);
  initializeRequiredAppCheck(firebaseApp);
  return firebaseApp;
}

/** Verify staging App Check before exposing either Auth or Firestore to application code. */
export async function verifyFirebaseStartup(): Promise<void> {
  assertTargetConfiguration();
  if (!firebaseIsConfigured) throw new Error('Firebase is not configured.');
  const firebaseApp = getFirebaseApp();
  if (firebaseTarget !== 'staging') return;
  if (appCheckStartupError) throw appCheckStartupError;
  if (!appCheck) throw new Error('App Check staging failed closed before Firebase clients were created.');
  try {
    const token = await getToken(appCheck, true);
    if (!token.token) throw new Error('App Check returned an empty token.');
    appCheckVerified = true;
  } catch {
    appCheckStartupError = new Error('App Check staging tidak dapat memverifikasi site key/provider. Firebase Auth dan Firestore diblokir untuk sesi ini.');
    throw appCheckStartupError;
  }
  // Keep a local reference to make the preflight explicitly depend on the configured app.
  void firebaseApp;
}

function assertAppCheckVerified(): void {
  if (firebaseTarget === 'staging' && !appCheckVerified) {
    throw appCheckStartupError ?? new Error('App Check staging must be verified before Firebase Auth or Firestore is used.');
  }
}

export function getFirebaseAuth(): Auth {
  assertTargetConfiguration();
  assertAppCheckVerified();
  auth ??= getAuth(getFirebaseApp());
  if (useFirebaseEmulators && !authEmulatorConnected) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    authEmulatorConnected = true;
  }
  return auth;
}

export function getFirebaseDb(): Firestore {
  assertTargetConfiguration();
  assertAppCheckVerified();
  db ??= getFirestore(getFirebaseApp());
  if (useFirebaseEmulators && !firestoreEmulatorConnected) {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    firestoreEmulatorConnected = true;
  }
  return db;
}

export function getGoogleProvider(): GoogleAuthProvider {
  return new GoogleAuthProvider();
}

export const workspaceId = import.meta.env.VITE_FIREBASE_WORKSPACE_ID?.trim() || '';
// Deliberately empty unless the administrator has configured the exact Firebase Auth UID.
export const designatedOwnerUid = import.meta.env.VITE_FIREBASE_OWNER_UID?.trim() || '';

export function hasWorkspaceConfiguration(): boolean {
  return firebaseIsConfigured && firebaseOwnerBindingMatchesRules(designatedOwnerUid, workspaceId);
}

export function isDesignatedOwner(uid: string | undefined): boolean {
  return Boolean(uid && firebaseOwnerBindingMatchesRules(designatedOwnerUid, workspaceId) && uid === designatedOwnerUid);
}
