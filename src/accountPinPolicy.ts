import type { FirebaseTarget } from './firebaseDeploymentGuard.ts';

/**
 * Hosted Firebase targets must not mount the CRM until a trusted server-issued
 * account PIN session has been integrated. The current client intentionally has
 * no way to assert that a session is verified, so hosted access fails closed.
 */
export function requiresServerIssuedPinSession(target: FirebaseTarget): boolean {
  return target !== 'local';
}
