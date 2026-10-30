import type { Auth, GoogleAuthProvider, User } from 'firebase/auth';

const ACCOUNT_PIN_REDIRECT_ERROR_CODES = [
  'auth/invalid-credential',
  'auth/network-request-failed',
  'auth/operation-not-allowed',
  'auth/unauthorized-domain',
  'auth/internal-error',
] as const;

export type AccountPinRedirectErrorCode = typeof ACCOUNT_PIN_REDIRECT_ERROR_CODES[number] | 'redirect_result_missing';

export function safeAccountPinRedirectErrorCode(cause: unknown): AccountPinRedirectErrorCode {
  const code = cause && typeof cause === 'object' && 'code' in cause
    ? (cause as { code?: unknown }).code
    : undefined;
  return typeof code === 'string' && (ACCOUNT_PIN_REDIRECT_ERROR_CODES as readonly string[]).includes(code)
    ? code as AccountPinRedirectErrorCode
    : 'redirect_result_missing';
}

type RedirectReauthenticationResult =
  | { userUid: string }
  | { errorCode: AccountPinRedirectErrorCode }
  | undefined;

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
  consumeRedirectReauthentication?(): Promise<RedirectReauthenticationResult>;
  requireRedirectResultForEnrollment?: boolean;
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
  let redirectReauthenticationError: AccountPinRedirectErrorCode | undefined;

  return {
    async completeRedirectReauthentication(): Promise<AccountPinRedirectErrorCode | undefined> {
      redirectReauthenticatedUid = undefined;
      redirectReauthenticationError = undefined;
      const result = await dependencies.consumeRedirectReauthentication?.();
      if (!result) return undefined;
      if ('errorCode' in result) {
        redirectReauthenticationError = result.errorCode;
        return result.errorCode;
      }
      redirectReauthenticatedUid = result.userUid;
      return undefined;
    },
    fetchStatus,
    async verifyAndExchange(user: User, pin: string): Promise<void> {
      await exchangeCustomToken(user, '/api/account-pin/verify', { pin });
    },
    async enrollAndExchange(user: User, pin: string, confirmPin: string): Promise<boolean> {
      const matchingRedirectResult = redirectReauthenticatedUid === user.uid;
      if (matchingRedirectResult) {
        redirectReauthenticatedUid = undefined;
      } else {
        if (redirectReauthenticationError) {
          throw new AccountPinClientError(redirectReauthenticationError, 'Google redirect reauthentication could not be verified.');
        }
        const reauthentication = await dependencies.reauthenticate(user, await dependencies.getGoogleProvider());
        if (reauthentication === 'redirect-started') return false;
      }
      if (dependencies.requireRedirectResultForEnrollment && !matchingRedirectResult) {
        throw new AccountPinClientError('redirect_result_missing', 'A matching Google redirect result is required for enrollment.');
      }
      await exchangeCustomToken(user, '/api/account-pin/enroll', { pin, confirmPin }, true);
      return true;
    },
  };
}

export type AccountPinClient = ReturnType<typeof createAccountPinClient>;
