export const ACCOUNT_PIN_DIAGNOSTIC_STAGES = [
  'status_handler',
  'production_runtime_configuration',
  'owner_binding_configuration',
  'wif_credential_build',
  'wif_token_exchange',
  'admin_app_initialize',
  'firebase_admin_app',
  'firestore_client_get',
  'firestore_status_verification',
] as const;

export type AccountPinDiagnosticStage = typeof ACCOUNT_PIN_DIAGNOSTIC_STAGES[number];

interface DiagnosticContext {
  stage: AccountPinDiagnosticStage;
  code?: string;
}

const diagnosticContexts = new WeakMap<object, DiagnosticContext>();

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
  'invalid_credential',
  'invalid_request',
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

const ALLOWED_ERROR_NAMES = new Set([
  'AbortError',
  'ApiError',
  'Error',
  'FetchError',
  'FirebaseError',
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

function errorRecord(error: unknown): Record<string, unknown> | undefined {
  if (!error || (typeof error !== 'object' && typeof error !== 'function')) return undefined;
  return error as Record<string, unknown>;
}

function safeErrorCode(error: unknown): string {
  try {
    const record = errorRecord(error);
    const code = record?.code;
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

export function markAccountPinDiagnostic(
  error: unknown,
  stage: AccountPinDiagnosticStage,
  code?: string,
): void {
  const record = errorRecord(error);
  if (!record) return;
  if (diagnosticContexts.has(record)) return;
  diagnosticContexts.set(record, {
    stage,
    ...(code && ALLOWED_ERROR_CODES.has(code) ? { code } : {}),
  });
}

/** Emits only fixed stage, allowlisted provider code, and allowlisted exception name. */
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
  };
  console.error('account_pin_diagnostic', JSON.stringify(fields));
}
