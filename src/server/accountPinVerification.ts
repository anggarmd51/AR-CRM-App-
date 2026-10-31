import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_BYTES = 32;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_MAX_MEMORY_BYTES = 64 * 1024 * 1024;
const SCRYPT_VERIFIER_PREFIX = `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$`;
const MAX_RECENT_AUTH_AGE_SECONDS = 5 * 60;
const MAX_FUTURE_AUTH_SKEW_SECONDS = 30;

export const ACCOUNT_PIN_RATE_LIMIT_POLICY: PinRateLimitPolicy = Object.freeze({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
  lockoutMs: 15 * 60 * 1000,
});

export const ACCOUNT_PIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export interface PinRateLimitPolicy {
  maxAttempts: number;
  windowMs: number;
  lockoutMs: number;
}

export type PinRateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export interface AccountPinRateLimiter {
  reserveAttempt(ownerUid: string, now: Date, policy: PinRateLimitPolicy): Promise<PinRateLimitDecision>;
  clearAttempts(ownerUid: string): Promise<void>;
}

export interface AccountPinSession {
  id: string;
  ownerUid: string;
  status: 'active' | 'revoked';
  createdAt: Date;
  expiresAt: Date;
}

export interface AccountPinSessionStore {
  create(session: AccountPinSession): Promise<void>;
  getSession(sessionId: string): Promise<AccountPinSession | null>;
  revoke(sessionId: string): Promise<void>;
}

export interface AccountPinCredential {
  ownerUid: string;
  verifier: string;
  createdAt: Date;
  enrolledAtAuthTimeSeconds: number;
}

export interface AccountPinCredentialStore {
  getCredential(ownerUid: string): Promise<AccountPinCredential | null>;
  createIfAbsent(credential: AccountPinCredential): Promise<void>;
}

export class AccountPinCredentialAlreadyExistsError extends Error {
  constructor() {
    super('An account PIN credential is already registered.');
    this.name = 'AccountPinCredentialAlreadyExistsError';
  }
}

export interface VerifiedFirebaseIdentity {
  uid: string;
  authTimeSeconds: number;
  pinSessionId?: string;
}

export interface PinVerificationRequest {
  method?: string;
  authorization?: string | string[];
  origin?: string | string[];
  host?: string;
  forwardedProto?: string | string[];
  fetchSite?: string | string[];
  body?: unknown;
}

export interface PinVerificationResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface PinVerificationDependencies {
  ownerUid: string;
  verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseIdentity>;
  credentials: AccountPinCredentialStore;
  verifyAccountPin(pin: string, verifier: string): Promise<boolean>;
  createAccountPinVerifier(pin: string): Promise<string>;
  rateLimiter: AccountPinRateLimiter;
  sessions: AccountPinSessionStore;
  createCustomToken(uid: string, claims: { pinSessionId: string }): Promise<string>;
  now?: () => Date;
  createSessionId?: () => string;
}

export function isValidAccountPin(pin: string): boolean {
  return /^[0-9]{6,12}$/.test(pin);
}

function serverHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, max-age=0',
    pragma: 'no-cache',
    'x-content-type-options': 'nosniff',
    ...extra,
  };
}

function result(statusCode: number, body: Record<string, unknown>, headers: Record<string, string> = {}): PinVerificationResponse {
  return { statusCode, headers: serverHeaders(headers), body };
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function originIsSameSecureOrigin(
  request: PinVerificationRequest,
  allowMissingOriginForSameOriginGet = false,
): boolean {
  const origin = singleHeader(request.origin);
  const host = request.host?.trim().toLowerCase();
  const forwardedProto = singleHeader(request.forwardedProto)?.split(',')[0]?.trim().toLowerCase();
  if (!host || forwardedProto !== 'https') return false;
  if (!origin) {
    return allowMissingOriginForSameOriginGet
      && request.method === 'GET'
      && singleHeader(request.fetchSite)?.trim().toLowerCase() === 'same-origin';
  }
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'https:' && parsed.host.toLowerCase() === host;
  } catch {
    return false;
  }
}

function bearerToken(value: string | string[] | undefined): string | undefined {
  const header = singleHeader(value);
  if (!header || header.length > 8_200) return undefined;
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(header);
  return match?.[1];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isPinBody(value: unknown): value is { pin: string } {
  return isRecord(value) && hasOnlyKeys(value, ['pin'])
    && typeof value.pin === 'string' && value.pin.length <= 1_024;
}

function isEnrollmentBody(value: unknown): value is { pin: string; confirmPin: string } {
  return isRecord(value) && hasOnlyKeys(value, ['pin', 'confirmPin'])
    && typeof value.pin === 'string' && value.pin.length <= 1_024
    && typeof value.confirmPin === 'string' && value.confirmPin.length <= 1_024;
}

function requestFailure(
  request: PinVerificationRequest,
  method: 'GET' | 'POST',
  allowMissingOriginForSameOriginGet = false,
): PinVerificationResponse | undefined {
  if (request.method !== method) return result(405, { code: 'method_not_allowed', error: 'Method not allowed.' }, { allow: method });
  if (!originIsSameSecureOrigin(request, allowMissingOriginForSameOriginGet)) {
    return result(403, { code: 'forbidden', error: 'Forbidden.' });
  }
  return undefined;
}

async function authenticateOwner(
  request: PinVerificationRequest,
  dependencies: PinVerificationDependencies,
): Promise<{ identity: VerifiedFirebaseIdentity } | { response: PinVerificationResponse }> {
  const token = bearerToken(request.authorization);
  if (!token) return { response: result(401, { code: 'invalid_credentials', error: 'Invalid credentials.' }) };
  try {
    const identity = await dependencies.verifyFirebaseIdToken(token);
    if (!identity?.uid || identity.uid !== dependencies.ownerUid) {
      return { response: result(403, { code: 'forbidden', error: 'Forbidden.' }) };
    }
    return { identity };
  } catch {
    return { response: result(401, { code: 'invalid_credentials', error: 'Invalid credentials.' }) };
  }
}

async function reserveAttempt(
  dependencies: PinVerificationDependencies,
  ownerUid: string,
  attemptedAt: Date,
): Promise<PinVerificationResponse | undefined> {
  try {
    const decision = await dependencies.rateLimiter.reserveAttempt(ownerUid, attemptedAt, ACCOUNT_PIN_RATE_LIMIT_POLICY);
    if (decision.allowed) return undefined;
    const retryAfterSeconds = Number.isFinite(decision.retryAfterSeconds)
      ? Math.max(1, Math.min(86_400, Math.ceil(decision.retryAfterSeconds)))
      : ACCOUNT_PIN_RATE_LIMIT_POLICY.lockoutMs / 1_000;
    return result(429, { code: 'rate_limited', error: 'Too many attempts. Try again later.' }, { 'retry-after': String(retryAfterSeconds) });
  } catch {
    return result(503, { code: 'service_unavailable', error: 'PIN verification is temporarily unavailable.' });
  }
}

async function issueSession(
  dependencies: PinVerificationDependencies,
  ownerUid: string,
  createdAt: Date,
): Promise<PinVerificationResponse> {
  const expiresAt = new Date(createdAt.getTime() + ACCOUNT_PIN_SESSION_TTL_MS);
  const sessionId = (dependencies.createSessionId ?? (() => randomBytes(32).toString('base64url')))();
  if (!/^[A-Za-z0-9_-]{43}$/.test(sessionId)) {
    return result(503, { code: 'service_unavailable', error: 'PIN verification is temporarily unavailable.' });
  }

  let sessionCreated = false;
  try {
    await dependencies.sessions.create({ id: sessionId, ownerUid, status: 'active', createdAt, expiresAt });
    sessionCreated = true;
    const customToken = await dependencies.createCustomToken(ownerUid, { pinSessionId: sessionId });
    if (typeof customToken !== 'string' || customToken.length === 0) throw new Error('Custom token issuance failed.');
    await dependencies.rateLimiter.clearAttempts(ownerUid);
    return result(200, { customToken, sessionExpiresAt: expiresAt.toISOString() });
  } catch {
    if (sessionCreated) {
      try {
        await dependencies.sessions.revoke(sessionId);
      } catch {
        // Do not disclose provider details; an unissued session expires and remains inaccessible to clients.
      }
    }
    return result(503, { code: 'service_unavailable', error: 'PIN verification is temporarily unavailable.' });
  }
}

export function createAccountPinVerificationService(dependencies: PinVerificationDependencies) {
  if (!dependencies.ownerUid.trim()) throw new Error('Account PIN owner is not configured.');
  const now = dependencies.now ?? (() => new Date());

  return async (request: PinVerificationRequest): Promise<PinVerificationResponse> => {
    const failedRequest = requestFailure(request, 'POST');
    if (failedRequest) return failedRequest;
    if (!isPinBody(request.body)) return result(400, { code: 'invalid_request', error: 'Invalid request.' });

    const authentication = await authenticateOwner(request, dependencies);
    if ('response' in authentication) return authentication.response;

    let credential: AccountPinCredential | null;
    try {
      credential = await dependencies.credentials.getCredential(authentication.identity.uid);
    } catch {
      return result(503, { code: 'service_unavailable', error: 'PIN verification is temporarily unavailable.' });
    }
    if (!credential) return result(409, { code: 'pin_not_enrolled', error: 'Account PIN is not enrolled.' });

    const attemptedAt = now();
    const limitResponse = await reserveAttempt(dependencies, authentication.identity.uid, attemptedAt);
    if (limitResponse) return limitResponse;

    let pinMatches = false;
    try {
      if (isValidAccountPin(request.body.pin)) {
        pinMatches = await dependencies.verifyAccountPin(request.body.pin, credential.verifier);
      }
    } catch {
      return result(503, { code: 'service_unavailable', error: 'PIN verification is temporarily unavailable.' });
    }
    if (!pinMatches) return result(401, { code: 'invalid_pin', error: 'Invalid credentials.' });
    return issueSession(dependencies, authentication.identity.uid, attemptedAt);
  };
}

export function createAccountPinEnrollmentService(dependencies: PinVerificationDependencies) {
  if (!dependencies.ownerUid.trim()) throw new Error('Account PIN owner is not configured.');
  const now = dependencies.now ?? (() => new Date());

  return async (request: PinVerificationRequest): Promise<PinVerificationResponse> => {
    const failedRequest = requestFailure(request, 'POST');
    if (failedRequest) return failedRequest;
    if (!isEnrollmentBody(request.body)) return result(400, { code: 'invalid_request', error: 'Invalid request.' });

    const authentication = await authenticateOwner(request, dependencies);
    if ('response' in authentication) return authentication.response;

    const attemptedAt = now();
    const authAgeSeconds = attemptedAt.getTime() / 1_000 - authentication.identity.authTimeSeconds;
    if (!Number.isFinite(authAgeSeconds) || authAgeSeconds < -MAX_FUTURE_AUTH_SKEW_SECONDS
      || authAgeSeconds > MAX_RECENT_AUTH_AGE_SECONDS) {
      return result(428, { code: 'reauthentication_required', error: 'Recent Google reauthentication is required.' });
    }
    if (!isValidAccountPin(request.body.pin)) {
      return result(400, { code: 'invalid_pin_policy', error: 'PIN must contain 6 to 12 digits.' });
    }
    if (request.body.pin !== request.body.confirmPin) {
      return result(400, { code: 'pin_confirmation_mismatch', error: 'PIN confirmation does not match.' });
    }

    try {
      if (await dependencies.credentials.getCredential(authentication.identity.uid)) {
        return result(409, { code: 'pin_already_enrolled', error: 'An account PIN is already enrolled.' });
      }
    } catch {
      return result(503, { code: 'service_unavailable', error: 'PIN enrollment is temporarily unavailable.' });
    }

    const limitResponse = await reserveAttempt(dependencies, authentication.identity.uid, attemptedAt);
    if (limitResponse) return limitResponse;

    let verifier: string;
    try {
      verifier = await dependencies.createAccountPinVerifier(request.body.pin);
      await dependencies.credentials.createIfAbsent({
        ownerUid: authentication.identity.uid,
        verifier,
        createdAt: attemptedAt,
        enrolledAtAuthTimeSeconds: authentication.identity.authTimeSeconds,
      });
    } catch (error) {
      if (error instanceof AccountPinCredentialAlreadyExistsError) {
        return result(409, { code: 'pin_already_enrolled', error: 'An account PIN is already enrolled.' });
      }
      return result(503, { code: 'service_unavailable', error: 'PIN enrollment is temporarily unavailable.' });
    }

    return issueSession(dependencies, authentication.identity.uid, attemptedAt);
  };
}

export function createAccountPinStatusService(
  dependencies: PinVerificationDependencies,
  enrollmentEnabled: boolean,
) {
  if (!dependencies.ownerUid.trim()) throw new Error('Account PIN owner is not configured.');
  const now = dependencies.now ?? (() => new Date());

  return async (request: PinVerificationRequest): Promise<PinVerificationResponse> => {
    const failedRequest = requestFailure(request, 'GET', true);
    if (failedRequest) return failedRequest;
    const authentication = await authenticateOwner(request, dependencies);
    if ('response' in authentication) return authentication.response;

    try {
      const credential = await dependencies.credentials.getCredential(authentication.identity.uid);
      let sessionActive = false;
      let sessionExpiresAt: string | undefined;
      const sessionId = authentication.identity.pinSessionId;
      if (credential && typeof sessionId === 'string' && /^[A-Za-z0-9_-]{43}$/.test(sessionId)) {
        const session = await dependencies.sessions.getSession(sessionId);
        if (session && session.ownerUid === authentication.identity.uid && session.status === 'active'
          && session.expiresAt.getTime() > now().getTime()) {
          sessionActive = true;
          sessionExpiresAt = session.expiresAt.toISOString();
        }
      }
      return result(200, {
        credentialRegistered: Boolean(credential),
        enrollmentEnabled,
        sessionActive,
        ...(sessionExpiresAt ? { sessionExpiresAt } : {}),
      });
    } catch {
      return result(503, { code: 'service_unavailable', error: 'PIN session status is temporarily unavailable.' });
    }
  };
}

function assertPepper(pepper: string): Buffer {
  if (typeof pepper !== 'string' || Buffer.byteLength(pepper, 'utf8') < 32) {
    throw new Error('Account PIN pepper is not configured securely.');
  }
  return Buffer.from(pepper, 'utf8');
}

function derivePinKey(pin: string, pepper: Buffer, salt: Buffer): Promise<Buffer> {
  const input = Buffer.concat([Buffer.from(pin, 'utf8'), Buffer.from([0]), pepper]);
  return new Promise((resolve, reject) => {
    scryptCallback(input, salt, SCRYPT_KEY_BYTES, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: SCRYPT_MAX_MEMORY_BYTES,
    }, (error, derivedKey) => {
      input.fill(0);
      if (error) reject(error);
      else resolve(derivedKey as Buffer);
    });
  });
}

function parseVerifier(verifier: string): { salt: Buffer; expected: Buffer } {
  const parts = verifier.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt'
    || parts[1] !== String(SCRYPT_N) || parts[2] !== String(SCRYPT_R) || parts[3] !== String(SCRYPT_P)) {
    throw new Error('Account PIN verifier configuration is invalid.');
  }
  const [, , , , saltText, keyText] = parts;
  const salt = Buffer.from(saltText, 'base64url');
  const expected = Buffer.from(keyText, 'base64url');
  if (salt.length !== SCRYPT_SALT_BYTES || expected.length !== SCRYPT_KEY_BYTES
    || salt.toString('base64url') !== saltText || expected.toString('base64url') !== keyText) {
    throw new Error('Account PIN verifier configuration is invalid.');
  }
  return { salt, expected };
}

/** Create this verifier in trusted server code; the returned verifier and pepper must never be exposed to the browser. */
export async function createAccountPinVerifier(pin: string, pepper: string): Promise<string> {
  if (!isValidAccountPin(pin)) throw new Error('Account PIN must contain 6 to 12 digits.');
  const pepperBytes = assertPepper(pepper);
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derived = await derivePinKey(pin, pepperBytes, salt);
  return `${SCRYPT_VERIFIER_PREFIX}${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

/** Verify a PIN against a server-only scrypt verifier and server-only pepper. */
export async function verifyAccountPinVerifier(pin: string, verifier: string, pepper: string): Promise<boolean> {
  if (!isValidAccountPin(pin)) return false;
  const pepperBytes = assertPepper(pepper);
  const { salt, expected } = parseVerifier(verifier);
  const actual = await derivePinKey(pin, pepperBytes, salt);
  return timingSafeEqual(actual, expected);
}
