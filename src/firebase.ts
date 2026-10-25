import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { firebaseOwnerBindingMatchesRules } from './firebaseRulesBinding.ts';
import { shouldUseFirebaseEmulators } from './firebaseEmulatorMode.ts';

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

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let authEmulatorConnected = false;
let firestoreEmulatorConnected = false;
const useFirebaseEmulators = shouldUseFirebaseEmulators(
  import.meta.env.DEV,
  import.meta.env.VITE_FIREBASE_USE_EMULATOR,
);

export function getFirebaseApp(): FirebaseApp {
  if (!firebaseIsConfigured) throw new Error('Firebase is not configured. Set the VITE_FIREBASE_* environment variables.');
  app ??= getApps().length ? getApp() : initializeApp(requiredConfig);
  return app;
}

export function getFirebaseAuth(): Auth {
  auth ??= getAuth(getFirebaseApp());
  if (useFirebaseEmulators && !authEmulatorConnected) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    authEmulatorConnected = true;
  }
  return auth;
}

export function getFirebaseDb(): Firestore {
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
