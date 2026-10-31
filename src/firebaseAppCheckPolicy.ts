import type { FirebaseTarget } from './firebaseDeploymentGuard.ts';

export type AppCheckStartupResult =
  | { status: 'not-required' }
  | { status: 'ready'; siteKey: string }
  | { status: 'error'; message: string };

/** App Check is intentionally prepared for staging monitoring only. */
export function getStagingAppCheckSiteKey(target: FirebaseTarget, configuredSiteKey?: string): string | undefined {
  if (target !== 'staging') return undefined;

  const siteKey = configuredSiteKey?.trim();
  if (!siteKey || !/^[A-Za-z0-9_-]{8,512}$/.test(siteKey)) {
    throw new Error('Staging requires a valid VITE_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY before Firebase services are used.');
  }
  return siteKey;
}

/** Contains both missing-key and provider initialization failures; never returns raw provider text. */
export function initializeStagingAppCheck(
  target: FirebaseTarget,
  configuredSiteKey: string | undefined,
  initialize: (siteKey: string) => void,
): AppCheckStartupResult {
  if (target !== 'staging') return { status: 'not-required' };
  try {
    const siteKey = getStagingAppCheckSiteKey(target, configuredSiteKey);
    if (!siteKey) return { status: 'not-required' };
    initialize(siteKey);
    return { status: 'ready', siteKey };
  } catch {
    return {
      status: 'error',
      message: 'App Check staging tidak dapat diinisialisasi. Periksa site key serta konfigurasi provider/origin; permintaan Firebase Auth dan Firestore diblokir.',
    };
  }
}

export interface StagingPreviewAppCheckBypassContext {
  firebaseTarget: FirebaseTarget;
  vercelEnvironment: string;
  gitRef: string;
  runtimeOrigin: string;
}

export const STAGING_PREVIEW_ALIAS_ORIGIN =
  'https://arcrm-app-git-cue-firebase-stabilization-anggaramadhan538-8607.vercel.app';

/**
 * Temporary emergency bypass: all four deployment/runtime boundaries must
 * match. Any missing or unexpected value keeps strict App Check enabled.
 */
export function shouldBypassAppCheckForExactStagingPreview(
  context: StagingPreviewAppCheckBypassContext,
): boolean {
  return context.firebaseTarget === 'staging'
    && context.vercelEnvironment === 'preview'
    && context.gitRef === 'cue/firebase-stabilization'
    && context.runtimeOrigin === STAGING_PREVIEW_ALIAS_ORIGIN;
}
