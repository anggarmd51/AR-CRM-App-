export type AccountPinEnrollmentEnvironment = Record<string, string | undefined>;

/** Enrollment stays off by default and is scoped to the declared Firebase target. */
export function isAccountPinEnrollmentFlagEnabled(environment: AccountPinEnrollmentEnvironment): boolean {
  if (environment.ACCOUNT_PIN_ENROLLMENT_ENABLED !== 'true') return false;

  if (environment.VERCEL_ENV === 'production') {
    return environment.VITE_FIREBASE_TARGET === 'production'
      && environment.ACCOUNT_PIN_ENABLED === 'true';
  }

  return environment.VERCEL_ENV === 'preview'
    && environment.VITE_FIREBASE_TARGET === 'staging';
}
