export interface GoogleIdentityCredentialResponse {
  credential?: string;
}

interface Attempt {
  nonce: string;
  resolve: (token: string) => void;
  reject: (cause: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface GoogleIdentityReauthBroker {
  begin(): { nonce: string; promise: Promise<string> };
  cancel(): void;
  handleResponse(response: GoogleIdentityCredentialResponse): void;
  getActiveNonce(): string | undefined;
  isPending(): boolean;
  subscribe(listener: () => void): () => void;
}

function randomNonce(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  if (!cryptoApi?.getRandomValues) throw new Error('Secure randomness is unavailable for Google re-authentication.');
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function credentialNonce(credential: string): string | undefined {
  try {
    const payload = credential.split('.')[1];
    if (!payload) return undefined;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const decoded = typeof atob === 'function'
      ? atob(normalized)
      : Buffer.from(normalized, 'base64').toString('utf8');
    const parsed: unknown = JSON.parse(decoded);
    return parsed && typeof parsed === 'object' && typeof (parsed as { nonce?: unknown }).nonce === 'string'
      ? (parsed as { nonce: string }).nonce
      : undefined;
  } catch {
    return undefined;
  }
}

export function createGoogleIdentityReauthBroker(timeoutMs = 60_000): GoogleIdentityReauthBroker {
  let attempt: Attempt | undefined;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const finish = (current: Attempt, action: (current: Attempt) => void) => {
    if (attempt !== current) return;
    attempt = undefined;
    clearTimeout(current.timer);
    action(current);
    notify();
  };

  return {
    begin() {
      if (attempt) {
        finish(attempt, (current) => current.reject(new Error('A newer Google re-authentication request replaced this request.')));
      }
      const nonce = randomNonce();
      let resolvePromise!: (token: string) => void;
      let rejectPromise!: (cause: unknown) => void;
      const promise = new Promise<string>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
      });
      const current: Attempt = {
        nonce,
        resolve: resolvePromise,
        reject: rejectPromise,
        timer: setTimeout(() => finish(current, (active) => active.reject(new Error('Google re-authentication timed out.'))), timeoutMs),
      };
      attempt = current;
      notify();
      return { nonce, promise };
    },
    cancel() {
      if (attempt) finish(attempt, (current) => current.reject(new Error('Google re-authentication was cancelled.')));
    },
    handleResponse(response) {
      const current = attempt;
      if (!current || typeof response.credential !== 'string' || response.credential.length === 0) return;
      if (credentialNonce(response.credential) !== current.nonce) return;
      finish(current, (active) => active.resolve(response.credential as string));
    },
    getActiveNonce: () => attempt?.nonce,
    isPending: () => Boolean(attempt),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const googleIdentityReauthBroker = createGoogleIdentityReauthBroker();
