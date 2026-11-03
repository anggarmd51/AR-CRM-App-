export const ACCOUNT_PIN_DIAGNOSTIC_STAGES = [
  'status_handler',
  'production_runtime_configuration',
  'owner_binding_configuration',
  'wif_credential_build',
  'wif_token_exchange',
  'admin_app_initialize',
  'firebase_admin_app',
  'auth_client_get',
  'auth_token_verify',
  'firestore_client_get',
  'firestore_status_verification',
] as const;

export type AccountPinDiagnosticStage = typeof ACCOUNT_PIN_DIAGNOSTIC_STAGES[number];

export const ACCOUNT_PIN_REQUEST_DIAGNOSTIC_TAGS = [
  'auth_bearer_missing',
  'auth_token_verify_failed',
  'auth_token_claims_invalid',
  'auth_token_auth_time_invalid',
  'forbidden_origin_mismatch',
  'forbidden_owner_uid_mismatch',
] as const;

export type AccountPinRequestDiagnosticTag = typeof ACCOUNT_PIN_REQUEST_DIAGNOSTIC_TAGS[number];

interface DiagnosticContext {
  stage: AccountPinDiagnosticStage;
  code?: string;
  reason?: 'project_mismatch' | 'audience_mismatch' | 'issuer_mismatch';
}

const diagnosticContexts = new WeakMap<object, DiagnosticContext>();
const ALLOWED_TOKEN_BINDING_REASONS = new Set(['project_mismatch', 'audience_mismatch', 'issuer_mismatch']);

const ALLOWED_ERROR_CODES = new Set([
  'app/invalid-credential',
  'app/no-app',
  'auth/argument-error',
  'auth/internal-error',
  'auth/invalid-credential',
  'auth/network-request-failed',
  'deadline-exceeded',
  'failed-precondition',
  'internal',
  'invalid-argument',
  'invalid_grant',
  'invalid_access_token',
  'invalid_client',
  'invalid_credential',
  'invalid-credential',
  'invalid_request',
  'firestore/invalid-credential',
  'not-found',
  'permission-denied',
  'resource-exhausted',
  'unauthenticated',
  'unauthorized_client',
  'unavailable',
  'aborted',
  'ERR_BAD_REQUEST',
  'ERR_CANCELED',
  'ERR_NETWORK',
  'ECONNRESET',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ETIMEDOUT',
]);

const ALLOWED_FIREBASE_AUTH_ERROR_CODES = new Set([
  'app/invalid-credential',
  'auth/argument-error',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/insufficient-permission',
  'auth/internal-error',
  'auth/invalid-credential',
  'auth/invalid-id-token',
  'auth/invalid-tenant-id',
  'auth/network-request-failed',
  'auth/tenant-id-mismatch',
  'auth/user-disabled',
  'auth/user-not-found',
]);

const ALLOWED_ERROR_CODE_ALIASES = new Map<string, string>([
  ['UNAVAILABLE', 'unavailable'],
  ['PERMISSION_DENIED', 'permission-denied'],
  ['NOT_FOUND', 'not-found'],
  ['invalid_argument', 'invalid-argument'],
  ['MODULE_NOT_FOUND', 'module-not-found'],
]);

const ALLOWED_ERROR_NAMES = new Set([
  'AbortError',
  'ApiError',
  'Error',
  'FetchError',
  'FirebaseAppError',
  'FirebaseAuthError',
  'FirebaseError',
  'FirebaseFirestoreError',
  'FirestoreError',
  'GaxiosError',
  'GoogleAuthError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
]);

const ALLOWED_GRPC_CODES: Record<number, string> = {
  3: 'invalid-argument',
  4: 'deadline-exceeded',
  5: 'not-found',
  6: 'already-exists',
  7: 'permission-denied',
  8: 'resource-exhausted',
  9: 'failed-precondition',
  10: 'aborted',
  13: 'internal',
  14: 'unavailable',
  16: 'unauthenticated',
};

const ALLOWED_ERROR_MESSAGES = new Set([
  'Failed to initialize Google Cloud Firestore client with the available credentials. Must initialize the SDK with a certificate credential or application default credentials to use Cloud Firestore API.',
  'The default Firebase app does not exist. Make sure you call initializeApp() before using any of the Firebase services.',
  "No Firebase App '[DEFAULT]' has been created - call initializeApp() first",
  'Firebase app named "[DEFAULT]" does not exist. Make sure you call initializeApp() before using any of the Firebase services.',
  'Missing or insufficient permissions.',
]);

const ERROR_SIGNAL_PATTERNS = [
  ['google-auth-default-credentials', /\bcould not load the default credentials\b/i],
  ['invalid-grant', /\binvalid_grant\b/i],
  ['invalid-client', /\binvalid_client\b/i],
  ['service-account-impersonation', /\bservice account\b|\bimpersonat(?:e|ion|ing)\b/i],
  ['sts-token-exchange', /\b(?:sts|security token service)\b/i],
  ['audience', /\baudienc(?:e|es)\b/i],
  ['token', /\btoken\b/i],
  ['invalid-credential', /\binvalid[-_]credential\b/i],
  ['grpc', /\bgrpc\b/i],
  ['transport', /\btransport\b/i],
  ['channel', /\bchannel\b/i],
  ['database', /\bdatabase\b/i],
  ['project', /\bproject\b/i],
  ['credential', /\bcredential\b/i],
  ['scope', /\bscope\b/i],
  ['unavailable', /\bunavailable\b/i],
  ['permission-denied', /\bpermission[-_]denied\b/i],
  ['not-found', /\bnot[-_]found\b/i],
  ['invalid-argument', /\binvalid[-_]argument\b/i],
  ['module-not-found', /\bMODULE_NOT_FOUND\b/i],
  ['connection-reset', /\bECONNRESET\b/i],
  ['connection-refused', /\bECONNREFUSED\b/i],
  ['dns-lookup', /\b(?:EAI_AGAIN|ENOTFOUND)\b/i],
  ['timeout', /\b(?:ETIMEDOUT|DEADLINE[_-]EXCEEDED)\b/i],
] as const;

function errorRecord(error: unknown): Record<string, unknown> | undefined {
  if (!error || (typeof error !== 'object' && typeof error !== 'function')) return undefined;
  return error as Record<string, unknown>;
}

function safeFirebaseAuthErrorCode(error: unknown): string {
  try {
    const code = errorRecord(error)?.code;
    return typeof code === 'string' && ALLOWED_FIREBASE_AUTH_ERROR_CODES.has(code)
      ? code
      : 'unknown_error';
  } catch {
    return 'unknown_error';
  }
}

function safeFirebaseAuthErrorReason(error: unknown): string {
  try {
    // Provider error codes are authoritative for these two states; hostile
    // message text must not override an SDK expiration/revocation result.
    switch (safeFirebaseAuthErrorCode(error)) {
      case 'auth/id-token-expired':
        return 'token_expired';
      case 'auth/id-token-revoked':
        return 'revoked';
      case 'app/invalid-credential':
      case 'auth/invalid-credential':
      case 'auth/insufficient-permission':
        return 'credentials_error';
      case 'auth/network-request-failed':
        return 'network_error';
      default:
        break;
    }
    const message = errorRecord(error)?.message;
    if (typeof message === 'string') {
      // Only classify project mismatch for explicit identity-difference
      // wording, never for a generic "expected project" mention.
      if (/(?:project(?:\s+id)?|configured project)\s+(?:mismatch(?:es)?|does not match|is different from)\s+(?:the\s+)?(?:configured\s+)?project/i.test(message)
        || /(?:mismatch(?:es)?|does not match|is different from)\s+(?:the\s+)?(?:configured\s+)?project(?:\s+id)?/i.test(message)) return 'project_mismatch';
      if (/Firebase ID token has incorrect ["']?aud["']? \(audience\) claim/i.test(message)) return 'audience_mismatch';
      if (/Firebase ID token has incorrect ["']?iss["']? \(issuer\) claim/i.test(message)) return 'issuer_mismatch';
      if (/Firebase ID token has expired/i.test(message)) return 'token_expired';
      if (/Firebase ID token has been revoked/i.test(message)) return 'revoked';
      if (/Firebase ID token has invalid signature|Failed to verify the signature of the Firebase ID token|signature(?:\s+is)? invalid|(?:no matching|no) ["']?kid["']? claim|kid["']? claim which does not correspond to a known public key|Error fetching public keys for Google certs/i.test(message)) return 'signature_error';
    }

    switch (safeFirebaseAuthErrorCode(error)) {
      case 'auth/argument-error':
      case 'auth/invalid-id-token':
        return 'unknown_error';
      default:
        return 'unknown_error';
    }
  } catch {
    // SDK error messages are untrusted input and are never copied to logs.
    return 'unknown_error';
  }
}

function safeErrorCode(error: unknown): string {
  try {
    const record = errorRecord(error);
    const code = record?.code;
    if (typeof code === 'string') {
      const alias = ALLOWED_ERROR_CODE_ALIASES.get(code);
      if (alias) return alias;
    }
    if (typeof code === 'string' && ALLOWED_ERROR_CODES.has(code)) return code;
    if (typeof code === 'number' && Number.isInteger(code) && ALLOWED_GRPC_CODES[code]) {
      return ALLOWED_GRPC_CODES[code];
    }
    const status = record?.status ?? (record?.response && typeof record.response === 'object'
      ? (record.response as Record<string, unknown>).status
      : undefined);
    if (typeof status === 'number' && [400, 401, 403, 404, 408, 409, 429, 500, 502, 503, 504].includes(status)) {
      return `http_${status}`;
    }
  } catch {
    // A malformed provider error must not affect the response or logging.
  }
  return 'unknown_error';
}

function safeErrorName(error: unknown): string {
  try {
    const name = errorRecord(error)?.name;
    return typeof name === 'string' && ALLOWED_ERROR_NAMES.has(name) ? name : 'Error';
  } catch {
    return 'Error';
  }
}

function safeErrorMessage(error: unknown): string {
  try {
    const message = errorRecord(error)?.message;
    if (typeof message !== 'string') return '[redacted:unrecognized_error_message]';
    const normalized = message.trim();
    if (ALLOWED_ERROR_MESSAGES.has(normalized)) return normalized;
    const firebaseError = /^Firebase: Error \(([^)]+)\)\.$/.exec(normalized);
    const code = firebaseError?.[1];
    if (code && ALLOWED_ERROR_CODES.has(code)) return `Firebase error (${code}).`;
    if (/\bcould not load the default credentials\b/i.test(normalized)) {
      return 'Could not load the default credentials.';
    }
    if (/\binvalid_grant\b/i.test(normalized)) return 'Google authentication failed (invalid_grant).';
    if (/\binvalid_client\b/i.test(normalized)) return 'Google authentication failed (invalid_client).';
    if (/\bservice account\b|\bimpersonat(?:e|ion|ing)\b/i.test(normalized)) {
      return 'Google service-account impersonation failure.';
    }
    if (/\b(?:sts|security token service)\b/i.test(normalized)) {
      return 'Google STS token-exchange failure.';
    }
    if (/\baudienc(?:e|es)\b/i.test(normalized)) return 'Google authentication audience validation failure.';
    if (/\b(?:google|oauth|oidc|workload identity|sts)\b.{0,80}\btoken\b|\btoken\b.{0,80}\b(?:google|oauth|oidc|workload identity|sts)\b/i.test(normalized)) {
      return 'Google authentication token failure.';
    }
  } catch {
    // Error messages are untrusted input and must never interfere with logging.
  }
  return '[redacted:unrecognized_error_message]';
}

function safeErrorSignals(error: unknown): string[] {
  const record = errorRecord(error);
  if (!record) return [];

  const sources: string[] = [];
  for (const key of ['code', 'details', 'message'] as const) {
    try {
      const value = record[key];
      if (typeof value === 'string') {
        sources.push(value, ALLOWED_ERROR_CODE_ALIASES.get(value) ?? '');
      } else if (key === 'code' && typeof value === 'number' && Number.isInteger(value)) {
        sources.push(ALLOWED_GRPC_CODES[value] ?? '');
      }
    } catch {
      // Provider properties are untrusted; ignore unreadable values.
    }
  }

  return ERROR_SIGNAL_PATTERNS
    .filter(([, pattern]) => sources.some((source) => pattern.test(source)))
    .map(([signal]) => signal);
}

export function markAccountPinDiagnostic(
  error: unknown,
  stage: AccountPinDiagnosticStage,
  code?: string,
  reason?: DiagnosticContext['reason'],
): void {
  const record = errorRecord(error);
  if (!record) return;
  if (diagnosticContexts.has(record)) return;
  diagnosticContexts.set(record, {
    stage,
    ...(code && ALLOWED_ERROR_CODES.has(code) ? { code } : {}),
    ...(reason && ALLOWED_TOKEN_BINDING_REASONS.has(reason) ? { reason } : {}),
  });
}

/** Emits fixed stage, allowlisted code/name/signals, and only allowlisted error-message text. */
export function logAccountPinDiagnostic(
  error: unknown,
  fallbackStage: AccountPinDiagnosticStage,
): void {
  let context: DiagnosticContext | undefined;
  const record = errorRecord(error);
  if (record) context = diagnosticContexts.get(record);
  const fields = {
    stage: context?.stage ?? fallbackStage,
    code: context?.code ?? safeErrorCode(error),
    name: safeErrorName(error),
    message: safeErrorMessage(error),
    signals: safeErrorSignals(error),
    ...(context?.reason ? { reason: context.reason } : {}),
  };
  console.error('account_pin_diagnostic', JSON.stringify(fields));
}

/** Emits only fixed request tags and allowlisted SDK names, codes and reasons. */
export function logAccountPinRequestDiagnostic(
  tag: AccountPinRequestDiagnosticTag,
  error?: unknown,
): void {
  const fields = {
    tag,
    ...(tag === 'auth_token_verify_failed' ? { stage: 'auth_token_verify' as const } : {}),
    ...(tag === 'auth_token_verify_failed' ? {
      code: safeFirebaseAuthErrorCode(error),
      name: safeErrorName(error),
      reason: safeFirebaseAuthErrorReason(error),
    } : {}),
    ...(tag === 'auth_token_claims_invalid' && errorRecord(error)
      ? (() => {
        const reason = diagnosticContexts.get(errorRecord(error) as object)?.reason;
        return reason ? { reason } : {};
      })()
      : {}),
  };
  console.error('account_pin_diagnostic', JSON.stringify(fields));
}
