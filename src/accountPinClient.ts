import type { Auth, GoogleAuthProvider, User } from 'firebase/auth';

export interface AccountPinClientStatus {
  credentialRegistered: boolean;
  enrollmentEnabled: boolean;
  sessionActive: boolean;
  sessionExpiresAt?: string;
}

export class AccountPinClientError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'AccountPinClientError';
  }
}

export interface AccountPinClientDependencies {
  fetch: typeof fetch;
  getAuth(): Auth | Promise<Auth>;
  getGoogleProvider(): GoogleAuthProvider | Promise<GoogleAuthProvider>;
  reauthenticate(user: User, provider: GoogleAuthProvider): Promise<'redirect-started' | void>;
  consumeRedirectReauthentication?(): Promise<string | undefined>;
  signInWithCustomToken(auth: Auth, token: string): Promise<unknown>;
}

export function createAccountPinClient(dependencies: AccountPinClientDependencies) {
  async function requestApi(
    user: User,
    path: string,
    method: 'GET' | 'POST',
    body?: Record<string, string>,
    forceRefresh = false,
    idTokenOverride?: string,
  ): Promise<Record<string, unknown>> {
    const idToken = idTokenOverride ?? await user.getIdToken(forceRefresh);
    const response = await dependencies.fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers: {
        authorization: `Bearer ${idToken}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    const record = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
    if (!response.ok) {
      throw new AccountPinClientError(
        typeof record.code === 'string' ? record.code : `http_${response.status}`,
        typeof record.error === 'string' ? record.error : 'Server account PIN flow is unavailable.',
      );
    }
    return record;
  }

  async function fetchStatus(user: User): Promise<AccountPinClientStatus> {
    const tokenResult = await user.getIdTokenResult();
    const response = await requestApi(user, '/api/account-pin/status', 'GET', undefined, false, tokenResult.token);
    if (typeof response.credentialRegistered !== 'boolean'
      || typeof response.enrollmentEnabled !== 'boolean'
      || typeof response.sessionActive !== 'boolean') {
      throw new AccountPinClientError('invalid_status_response', 'Server account PIN status was invalid.');
    }
    const claim = tokenResult.claims.pinSessionId;
    const hasWellFormedSessionClaim = typeof claim === 'string' && /^[A-Za-z0-9_-]{43}$/.test(claim);
    const sessionActive = response.sessionActive && hasWellFormedSessionClaim;
    const sessionExpiresAt = typeof response.sessionExpiresAt === 'string' ? response.sessionExpiresAt : undefined;
    if (sessionActive && (!sessionExpiresAt || !Number.isFinite(Date.parse(sessionExpiresAt)))) {
      throw new AccountPinClientError('invalid_status_response', 'Server account PIN session expiry was invalid.');
    }
    return {
      credentialRegistered: response.credentialRegistered,
      enrollmentEnabled: response.enrollmentEnabled,
      // The API also verifies this claim against an active, unexpired server-only Firestore session doc.
      sessionActive,
      ...(sessionExpiresAt ? { sessionExpiresAt } : {}),
    };
  }

  async function exchangeCustomToken(user: User, path: string, body: Record<string, string>, forceRefresh = false): Promise<void> {
    const response = await requestApi(user, path, 'POST', body, forceRefresh);
    if (typeof response.customToken !== 'string' || response.customToken.length === 0) {
      throw new AccountPinClientError('invalid_custom_token_response', 'Server did not issue a custom token.');
    }
    await dependencies.signInWithCustomToken(await dependencies.getAuth(), response.customToken);
  }

  let redirectReauthenticatedUid: string | undefined;

  return {
    async completeRedirectReauthentication(): Promise<void> {
      redirectReauthenticatedUid = await dependencies.consumeRedirectReauthentication?.();
    },
    fetchStatus,
    async verifyAndExchange(user: User, pin: string): Promise<void> {
      await exchangeCustomToken(user, '/api/account-pin/verify', { pin });
    },
    async enrollAndExchange(user: User, pin: string, confirmPin: string): Promise<boolean> {
      if (redirectReauthenticatedUid === user.uid) {
        redirectReauthenticatedUid = undefined;
      } else {
        const reauthentication = await dependencies.reauthenticate(user, await dependencies.getGoogleProvider());
        if (reauthentication === 'redirect-started') return false;
      }
      await exchangeCustomToken(user, '/api/account-pin/enroll', { pin, confirmPin }, true);
      return true;
    },
  };
}

export type AccountPinClient = ReturnType<typeof createAccountPinClient>;
