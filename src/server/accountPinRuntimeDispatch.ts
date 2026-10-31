import {
  ACCOUNT_PIN_APPROVED_RELEASE_BRANCH,
  ACCOUNT_PIN_PRODUCTION_GCP_PROJECT_NUMBER,
  ACCOUNT_PIN_PRODUCTION_PROJECT_ID,
  ACCOUNT_PIN_PRODUCTION_SERVICE_ACCOUNT_ID,
  ACCOUNT_PIN_PRODUCTION_WIF_POOL_ID,
  ACCOUNT_PIN_PRODUCTION_WIF_PROVIDER_ID,
  ACCOUNT_PIN_STAGING_PROJECT_ID,
  isAccountPinApprovedStagingBranch,
  resolveProductionAccountPinOwnerUid,
} from './accountPinFirebaseAdmin.ts';
import { isAccountPinEnrollmentFlagEnabled } from './accountPinEnrollmentPolicy.ts';

export type AccountPinRuntimeTarget = 'production' | 'staging';
export type AccountPinEnvironment = Record<string, string | undefined>;

function hasText(environment: AccountPinEnvironment, name: string): boolean {
  return typeof environment[name] === 'string' && environment[name]!.trim().length > 0;
}

function hasValidPepper(environment: AccountPinEnvironment): boolean {
  const pepper = environment.ACCOUNT_PIN_PEPPER;
  return typeof pepper === 'string' && Buffer.byteLength(pepper, 'utf8') >= 32;
}

function hasValidProductionOwnerBinding(environment: AccountPinEnvironment): boolean {
  try {
    resolveProductionAccountPinOwnerUid(environment);
    return true;
  } catch {
    return false;
  }
}

function hasProductionConfig(environment: AccountPinEnvironment): boolean {
  return environment.VERCEL_ENV === 'production'
    && environment.VERCEL_GIT_COMMIT_REF === ACCOUNT_PIN_APPROVED_RELEASE_BRANCH
    && environment.VITE_FIREBASE_TARGET === 'production'
    && environment.ACCOUNT_PIN_ENABLED === 'true'
    && environment.FIREBASE_ADMIN_PROJECT_ID === ACCOUNT_PIN_PRODUCTION_PROJECT_ID
    && environment.FIREBASE_ADMIN_SERVICE_ACCOUNT_ID === ACCOUNT_PIN_PRODUCTION_SERVICE_ACCOUNT_ID
    && environment.GCP_PROJECT_NUMBER === ACCOUNT_PIN_PRODUCTION_GCP_PROJECT_NUMBER
    && environment.GCP_WORKLOAD_IDENTITY_POOL_ID === ACCOUNT_PIN_PRODUCTION_WIF_POOL_ID
    && environment.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID === ACCOUNT_PIN_PRODUCTION_WIF_PROVIDER_ID
    && hasValidProductionOwnerBinding(environment)
    && hasValidPepper(environment);
}

function hasStagingConfig(environment: AccountPinEnvironment): boolean {
  if (environment.VERCEL_ENV !== 'preview'
    || !isAccountPinApprovedStagingBranch(environment.VERCEL_GIT_COMMIT_REF)
    || environment.VITE_FIREBASE_TARGET !== 'staging'
    || environment.ACCOUNT_PIN_ENABLED !== 'true'
    || environment.FIREBASE_ADMIN_PROJECT_ID !== ACCOUNT_PIN_STAGING_PROJECT_ID
    || !hasText(environment, 'ACCOUNT_PIN_OWNER_UID')
    || !hasValidPepper(environment)) {
    return false;
  }

  try {
    const serviceAccount: unknown = JSON.parse(environment.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON ?? '');
    if (!serviceAccount || typeof serviceAccount !== 'object' || Array.isArray(serviceAccount)) return false;
    const record = serviceAccount as Record<string, unknown>;
    return record.project_id === ACCOUNT_PIN_STAGING_PROJECT_ID
      && typeof record.client_email === 'string'
      && record.client_email.trim().length > 0
      && typeof record.private_key === 'string'
      && record.private_key.trim().length > 0;
  } catch {
    return false;
  }
}

/** Returns a runtime target only when all target-specific bindings are exact and complete. */
export function getAccountPinRuntimeTarget(environment: AccountPinEnvironment): AccountPinRuntimeTarget | undefined {
  if (hasProductionConfig(environment)) return 'production';
  if (hasStagingConfig(environment)) return 'staging';
  return undefined;
}

/** Enrollment requires a valid runtime binding and an explicit server-side opt-in flag. */
export function isAccountPinEnrollmentEnabled(environment: AccountPinEnvironment): boolean {
  return getAccountPinRuntimeTarget(environment) !== undefined
    && isAccountPinEnrollmentFlagEnabled(environment);
}

export interface AccountPinRuntimeFactories<Runtime> {
  production(): Runtime;
  staging(): Runtime;
}

/** Creates no runtime for incomplete, mismatched, or non-approved environments. */
export function createConfiguredAccountPinRuntime<Runtime>(
  environment: AccountPinEnvironment,
  factories: AccountPinRuntimeFactories<Runtime>,
): Runtime | undefined {
  const target = getAccountPinRuntimeTarget(environment);
  if (!target) return undefined;
  return target === 'production' ? factories.production() : factories.staging();
}
