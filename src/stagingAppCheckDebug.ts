// TEMPORARY PRIVATE STAGING TEST ONLY. Remove after the authorized debug test.
// This never contains a token; the Firebase SDK generates one in this browser's local storage.
declare const __VERCEL_ENV__: string;
declare const __VERCEL_GIT_COMMIT_REF__: string;

const exactStagingOrigin = 'https://arcrm-app-git-cue-firebase-stabilization-anggaramadhan538-8607.vercel.app';
const registrationReadyKey = 'arcrm:private-staging-app-check:registration-ready';
export const privateStagingPreviewDebug = !import.meta.env.DEV
  && typeof window !== 'undefined'
  && window.location.origin === exactStagingOrigin
  && typeof __VERCEL_ENV__ !== 'undefined'
  && __VERCEL_ENV__ === 'preview'
  && typeof __VERCEL_GIT_COMMIT_REF__ !== 'undefined'
  && __VERCEL_GIT_COMMIT_REF__ === 'cue/firebase-stabilization';

if (privateStagingPreviewDebug) {
  const firebaseGlobals = globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean };
  firebaseGlobals.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

/** Non-secret browser-local pause; set only after staging Console registration is verified. */
export function privateStagingDebugRegistrationReady(): boolean {
  if (!privateStagingPreviewDebug) return false;
  try {
    return window.sessionStorage.getItem(registrationReadyKey) === 'registered';
  } catch {
    return false;
  }
}
