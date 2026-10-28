import type { FirebaseTarget } from '../firebaseDeploymentGuard.ts';

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];
const WEB_PROTOCOLS = ['http:', 'https:'];

/**
 * Show the identity-only bootstrap screen on loopback origins only.
 * Development remains emulator-only; a non-development local preview may use
 * staging solely to reveal the signed-in Firebase Auth UID before any workspace
 * binding exists. Production and hosted Preview origins never qualify.
 */
export function isOwnerBootstrapEnabled(
  development: boolean,
  hostname: string,
  protocol: string,
  target: FirebaseTarget = 'local',
): boolean {
  const isLoopbackWebOrigin = LOOPBACK_HOSTS.includes(hostname) && WEB_PROTOCOLS.includes(protocol);
  if (!isLoopbackWebOrigin) return false;
  return (development && target === 'local') || (!development && target === 'staging');
}
