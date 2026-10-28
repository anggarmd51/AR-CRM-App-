import type { FirebaseTarget } from './firebaseDeploymentGuard.ts';

/** Device-only SecurityVault PINs are intentionally excluded from every hosted target. */
export function shouldUseLocalSecurityVault(target: FirebaseTarget): boolean {
  return target === 'local';
}
