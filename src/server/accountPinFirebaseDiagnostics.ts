export const ACCOUNT_PIN_FIREBASE_DIAGNOSTIC_EVENT = 'account_pin_firebase_error' as const;

const STAGES = new Set(['production_wif_get_access_token', 'firebase_id_token_verification'] as const);
type DiagnosticStage = typeof STAGES extends Set<infer T> ? T | 'unknown' : never;
const STANDARD_CODES = new Set([
  'app/invalid-credential',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/user-disabled',
  'auth/user-not-found',
  'auth/insufficient-permission',
  'auth/invalid-id-token',
  'auth/argument-error',
  'auth/internal-error',
  'invalid_target',
  'invalid_grant',
  'invalid_request',
  'invalid_scope',
  'unauthorized_client',
  'access_denied',
  'PERMISSION_DENIED',
  'UNAUTHENTICATED',
  'UNAVAILABLE',
] as const);
type StandardCode = typeof STANDARD_CODES extends Set<infer T> ? T : never;

type DiagnosticReason = 'invalid_target' | 'invalid_grant' | 'audience' | 'attribute_condition'
  | 'permission_denied' | 'service_disabled' | 'oidc_missing' | 'unknown';

export interface AccountPinFirebaseDiagnostic {
  event: typeof ACCOUNT_PIN_FIREBASE_DIAGNOSTIC_EVENT;
  stage: DiagnosticStage;
  code?: StandardCode;
  status?: StandardCode;
  httpStatus?: number;
  grpcCode?: number;
  reason: DiagnosticReason;
}

export type AccountPinFirebaseDiagnosticLogger = (diagnostic: AccountPinFirebaseDiagnostic) => void;

const defaultLogger: AccountPinFirebaseDiagnosticLogger = (diagnostic) => {
  console.error(JSON.stringify(diagnostic));
};

function readProperty(value: unknown, key: string): unknown {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
  try {
    // FirebaseError.code is an inherited getter. Only fixed keys are read and all returned values are allowlisted.
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function isSafeCode(value: unknown): value is StandardCode {
  return typeof value === 'string' && STANDARD_CODES.has(value as StandardCode);
}

function safeInteger(value: unknown, minimum: number, maximum: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum ? value : undefined;
}

function findSafeCode(error: unknown, key: 'code' | 'status'): StandardCode | undefined {
  const direct = readProperty(error, key);
  if (isSafeCode(direct)) return direct;
  const response = readProperty(error, 'response');
  const data = readProperty(response, 'data');
  const nested = readProperty(data, key);
  if (isSafeCode(nested)) return nested;
  const nestedError = readProperty(data, 'error');
  if (isSafeCode(nestedError)) return nestedError;
  const nestedErrorValue = readProperty(nestedError, key);
  return isSafeCode(nestedErrorValue) ? nestedErrorValue : undefined;
}

function findHttpStatus(error: unknown): number | undefined {
  const direct = safeInteger(readProperty(error, 'status'), 100, 599);
  if (direct !== undefined) return direct;
  return safeInteger(readProperty(readProperty(error, 'response'), 'status'), 100, 599);
}

function findGrpcCode(error: unknown): number | undefined {
  const direct = safeInteger(readProperty(error, 'code'), 0, 16);
  if (direct !== undefined) return direct;
  return safeInteger(readProperty(readProperty(readProperty(error, 'response'), 'data'), 'code'), 0, 16);
}

function findReason(error: unknown, code?: StandardCode, status?: StandardCode): DiagnosticReason {
  const data = readProperty(readProperty(error, 'response'), 'data');
  const nestedError = readProperty(data, 'error');
  const messages = [readProperty(error, 'message'), readProperty(data, 'error_description'), readProperty(nestedError, 'message')]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.slice(0, 4000));
  const contains = (pattern: RegExp) => messages.some((message) => pattern.test(message));
  // Only fixed category names are emitted. None of these strings is included in the diagnostic.
  if (contains(/audience|\baud\b/i)) return 'audience';
  if (contains(/attribute[_ -]?condition|condition.*failed/i)) return 'attribute_condition';
  if (contains(/service[_ -]?disabled|api.*(disabled|not.*enabled)|has not been used/i)) return 'service_disabled';
  if (contains(/oidc.*(missing|not found|not available)|missing.*oidc|(?:failed|unable) to.*oidc/i)) return 'oidc_missing';
  if (code === 'invalid_target' || status === 'invalid_target' || contains(/invalid[_ -]?target/i)) return 'invalid_target';
  if (code === 'invalid_grant' || status === 'invalid_grant' || contains(/invalid[_ -]?grant/i)) return 'invalid_grant';
  if (code === 'PERMISSION_DENIED' || status === 'PERMISSION_DENIED' || code === 'auth/insufficient-permission'
    || contains(/permission[_ -]?denied|forbidden/i)) return 'permission_denied';
  return 'unknown';
}

export function emitAccountPinFirebaseDiagnostic(
  stage: string,
  error: unknown,
  logger: AccountPinFirebaseDiagnosticLogger = defaultLogger,
): void {
  const code = findSafeCode(error, 'code');
  const status = findSafeCode(error, 'status');
  const httpStatus = findHttpStatus(error);
  const grpcCode = findGrpcCode(error);
  const diagnostic: AccountPinFirebaseDiagnostic = {
    event: ACCOUNT_PIN_FIREBASE_DIAGNOSTIC_EVENT,
    stage: STAGES.has(stage as Exclude<DiagnosticStage, 'unknown'>) ? stage as DiagnosticStage : 'unknown',
    ...(code ? { code } : {}),
    ...(status ? { status } : {}),
    ...(httpStatus !== undefined ? { httpStatus } : {}),
    ...(grpcCode !== undefined ? { grpcCode } : {}),
    reason: findReason(error, code, status),
  };
  try {
    logger(diagnostic);
  } catch {
    // Diagnostics must never change authentication or credential behavior.
  }
}

export async function withAccountPinFirebaseDiagnostics<T>(
  stage: string,
  operation: () => Promise<T>,
  logger: AccountPinFirebaseDiagnosticLogger = defaultLogger,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    emitAccountPinFirebaseDiagnostic(stage, error, logger);
    throw error;
  }
}
