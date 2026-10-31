export const STAGING_ACCOUNT_PIN_REDIRECT_ORIGIN =
  'https://arcrm-app-git-cue-firebase-stabilization-anggaramadhan538-8607.vercel.app';

/** Restrict enrollment reauthentication redirects to the approved staging alias. */
export function isStagingAccountPinRedirectEnabled(target: string, origin: string): boolean {
  return target === 'staging' && origin === STAGING_ACCOUNT_PIN_REDIRECT_ORIGIN;
}
