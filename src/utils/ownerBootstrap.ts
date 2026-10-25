const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];
const WEB_PROTOCOLS = ['http:', 'https:'];

export function isOwnerBootstrapEnabled(development: boolean, hostname: string, protocol: string): boolean {
  return development && LOOPBACK_HOSTS.includes(hostname) && WEB_PROTOCOLS.includes(protocol);
}
