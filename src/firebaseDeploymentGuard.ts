export const KNOWN_PRODUCTION_FIREBASE_PROJECT_ID = 'ar-crm-73222';
export const STAGING_FIREBASE_PROJECT_ID_PATTERN = /^ar-crm-staging-[a-z0-9][a-z0-9-]{2,}$/;

export type FirebaseTarget = 'local' | 'staging' | 'production';

export interface FirebaseTargetInput {
  isDevelopment: boolean;
  declaredTarget?: string;
  projectId?: string;
  stagingProjectIdAllowlist?: string;
  vercelEnvironment?: string;
}

function isExplicitlyAllowedStagingProject(projectId: string, rawAllowlist?: string): boolean {
  const allowed = (rawAllowlist ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
  return allowed.length > 0 && allowed.includes(projectId);
}

/**
 * Resolve the Firebase project role and fail closed on ambiguous hosted builds.
 * Local development remains emulator-only; hosted Preview must be explicitly
 * assigned an explicitly allowlisted staging project.
 */
export function resolveFirebaseTarget(input: FirebaseTargetInput): FirebaseTarget {
  const declaredTarget = input.declaredTarget?.trim().toLowerCase();
  const projectId = input.projectId?.trim() ?? '';
  const vercelEnvironment = input.vercelEnvironment?.trim().toLowerCase() ?? '';

  if (input.isDevelopment) {
    if (declaredTarget && declaredTarget !== 'local') {
      throw new Error('Local development must use VITE_FIREBASE_TARGET=local and Firebase emulators.');
    }
    return 'local';
  }

  if (vercelEnvironment === 'preview' && declaredTarget !== 'staging') {
    throw new Error('Vercel Preview requires VITE_FIREBASE_TARGET=staging.');
  }
  if (declaredTarget === 'staging') {
    if (vercelEnvironment === 'production') {
      throw new Error('Vercel Production cannot use the staging Firebase target.');
    }
    if (!projectId || projectId === KNOWN_PRODUCTION_FIREBASE_PROJECT_ID) {
      throw new Error('Staging requires a separate, non-production Firebase project ID.');
    }
    if (!STAGING_FIREBASE_PROJECT_ID_PATTERN.test(projectId)) {
      throw new Error('Staging Firebase project ID must use the ar-crm-staging-<suffix> pattern.');
    }
    if (!isExplicitlyAllowedStagingProject(projectId, input.stagingProjectIdAllowlist)) {
      throw new Error('Staging Firebase project ID must exactly match VITE_FIREBASE_STAGING_PROJECT_ID_ALLOWLIST.');
    }
    return 'staging';
  }

  if (declaredTarget === 'production') {
    if (vercelEnvironment !== 'production') {
      throw new Error('The production Firebase target is allowed only in a Vercel Production build.');
    }
    if (projectId !== KNOWN_PRODUCTION_FIREBASE_PROJECT_ID) {
      throw new Error('Production Firebase target must use the verified production project ID.');
    }
    return 'production';
  }

  throw new Error('Hosted builds require an explicit VITE_FIREBASE_TARGET=staging or production.');
}
