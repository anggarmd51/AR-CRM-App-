import assert from 'node:assert/strict';
import test from 'node:test';
import {
  logAccountPinDiagnostic,
  logAccountPinRequestDiagnostic,
  logAccountPinWifTokenExchangeDiagnostic,
  type AccountPinRequestDiagnosticTag,
} from './accountPinDiagnostics.ts';

function captureDiagnostic(error: unknown): Record<string, unknown> {
  const logged: string[] = [];
  const originalConsoleError = console.error;
  console.error = (...values: unknown[]) => { logged.push(values.map(String).join(' ')); };
  try {
    logAccountPinDiagnostic(error, 'firestore_client_get');
  } finally {
    console.error = originalConsoleError;
  }
  return JSON.parse(logged[0]?.replace(/^account_pin_diagnostic /, '') ?? '{}') as Record<string, unknown>;
}

function captureRequestDiagnostic(tag: AccountPinRequestDiagnosticTag, error?: unknown): Record<string, unknown> {
  const logged: string[] = [];
  const originalConsoleError = console.error;
  console.error = (...values: unknown[]) => { logged.push(values.map(String).join(' ')); };
  try {
    logAccountPinRequestDiagnostic(tag, error);
  } finally {
    console.error = originalConsoleError;
  }
  return JSON.parse(logged[0]?.replace(/^account_pin_diagnostic /, '') ?? '{}') as Record<string, unknown>;
}

function captureWifDiagnostic(error: unknown): Record<string, unknown> {
  const logged: string[] = [];
  const originalConsoleError = console.error;
  console.error = (...values: unknown[]) => { logged.push(values.map(String).join(' ')); };
  try {
    logAccountPinWifTokenExchangeDiagnostic(error);
  } finally {
    console.error = originalConsoleError;
  }
  return JSON.parse(logged[0]?.replace(/^account_pin_diagnostic /, '') ?? '{}') as Record<string, unknown>;
}

test('known Firebase Admin Firestore credential rejection is logged as the exact safe SDK message', () => {
  const error = Object.assign(
    new Error('Failed to initialize Google Cloud Firestore client with the available credentials. Must initialize the SDK with a certificate credential or application default credentials to use Cloud Firestore API.'),
    { code: 'firestore/invalid-credential', name: 'FirebaseFirestoreError' },
  );
  assert.deepEqual(captureDiagnostic(error), {
    stage: 'firestore_client_get',
    code: 'firestore/invalid-credential',
    name: 'FirebaseFirestoreError',
    message: 'Failed to initialize Google Cloud Firestore client with the available credentials. Must initialize the SDK with a certificate credential or application default credentials to use Cloud Firestore API.',
    signals: ['invalid-credential', 'credential'],
  });
});

test('Google authentication failures are converted to fixed safe messages and allowlisted categories', () => {
  const cases = [
    {
      raw: 'Could not load the default credentials. Private detail token=JWT_SECRET_1',
      message: 'Could not load the default credentials.',
      signal: 'google-auth-default-credentials',
    },
    {
      raw: 'invalid_grant: Private provider response token=JWT_SECRET_2',
      message: 'Google authentication failed (invalid_grant).',
      signal: 'invalid-grant',
    },
    {
      raw: 'invalid_client: client_secret=SECRET_3',
      message: 'Google authentication failed (invalid_client).',
      signal: 'invalid-client',
    },
    {
      raw: 'Service Account impersonation failed for pin-admin@example.invalid; token=JWT_SECRET_4',
      message: 'Google service-account impersonation failure.',
      signal: 'service-account-impersonation',
    },
    {
      raw: 'STS rejected audience https://private.invalid; token=JWT_SECRET_5',
      message: 'Google STS token-exchange failure.',
      signal: 'sts-token-exchange',
    },
    {
      raw: 'OIDC audience mismatch for private-project; token=JWT_SECRET_6',
      message: 'Google authentication audience validation failure.',
      signal: 'audience',
    },
    {
      raw: 'Google OAuth returned an opaque token=JWT_SECRET_7',
      message: 'Google authentication token failure.',
      signal: 'token',
    },
  ];

  for (const entry of cases) {
    const diagnostic = captureDiagnostic(new Error(entry.raw));
    assert.equal(diagnostic.message, entry.message, entry.signal);
    assert.ok((diagnostic.signals as string[]).includes(entry.signal), entry.signal);
    const serialized = JSON.stringify(diagnostic);
    assert.doesNotMatch(serialized, /Private detail|Private provider response|client_secret|pin-admin@example\.invalid|https:\/\/private\.invalid|private-project|JWT_SECRET|opaque/);
  }
});

test('unrecognized provider text and details remain redacted even when the code is safe', () => {
  const error = Object.assign(new Error('private opening text'), {
    code: 'invalid_grant',
    details: 'raw-bearer-secret-and-project-id',
  });
  const diagnostic = captureDiagnostic(error);
  assert.equal(diagnostic.code, 'invalid_grant');
  assert.equal(diagnostic.message, '[redacted:unrecognized_error_message]');
  assert.ok((diagnostic.signals as string[]).includes('invalid-grant'));
  assert.doesNotMatch(JSON.stringify(diagnostic), /private opening text|raw-bearer-secret-and-project-id/);

  assert.deepEqual(captureRequestDiagnostic('auth_token_verify_failed', Object.assign(new Error('private token'), {
    code: 'auth/id-token-expired',
    uid: 'owner-private-uid',
  })), {
    tag: 'auth_token_verify_failed',
    stage: 'auth_token_verify',
    code: 'auth/id-token-expired',
    name: 'Error',
    reason: 'token_expired',
  });
  assert.deepEqual(captureRequestDiagnostic('auth_token_verify_failed', Object.assign(new Error('private token'), {
    code: 'auth/id-token-expired;token=secret',
  })), {
    tag: 'auth_token_verify_failed',
    stage: 'auth_token_verify',
    code: 'unknown_error',
    name: 'Error',
    reason: 'unknown_error',
  });
  assert.deepEqual(captureRequestDiagnostic('forbidden_origin_mismatch'), {
    tag: 'forbidden_origin_mismatch',
  });
});

test('Firebase Admin verification logs only allowlisted codes and generic reason categories', () => {
  const cases = [
    {
      code: 'auth/argument-error',
      message: 'Firebase ID token has incorrect "aud" (audience) claim. Expected ar-crm-73222 but got private-project; Bearer eyJhbGciOiJIUzI1NiJ9.JWT_SECRET',
      reason: 'audience_mismatch',
    },
    {
      code: 'auth/argument-error',
      message: 'Firebase ID token has incorrect "iss" (issuer) claim. Expected private-project; token=JWT_SECRET',
      reason: 'issuer_mismatch',
    },
    {
      code: 'auth/argument-error',
      message: 'Firebase ID token has no matching "kid" claim; private-key=SECRET',
      reason: 'signing_key_not_found',
    },
    {
      code: 'auth/invalid-id-token',
      message: 'Decoding Firebase ID token failed. Raw token: eyJhbGciOiJIUzI1NiJ9.JWT_SECRET',
      reason: 'token_decode_failed',
    },
    {
      code: 'provider-private-error',
      message: 'private provider response with bearer JWT_SECRET and uid private-uid',
      reason: 'unrecognized_firebase_auth_error',
    },
  ];

  for (const entry of cases) {
    const diagnostic = captureRequestDiagnostic('auth_token_verify_failed', Object.assign(new Error(entry.message), {
      code: entry.code,
      uid: 'private-uid',
    }));
    assert.deepEqual(diagnostic, {
      tag: 'auth_token_verify_failed',
      stage: 'auth_token_verify',
      code: entry.code === 'provider-private-error' ? 'unknown_error' : entry.code,
      name: 'Error',
      reason: entry.reason === 'signing_key_not_found' ? 'signature_error'
        : entry.reason === 'token_decode_failed' || entry.reason === 'unrecognized_firebase_auth_error'
          ? 'unknown_error' : entry.reason,
    });
    assert.doesNotMatch(JSON.stringify(diagnostic), /ar-crm-73222|private-project|JWT_SECRET|eyJhbGci|Bearer|private-key|private provider|private-uid/);
  }
});

test('arbitrary non-authentication error messages remain redacted', () => {
  const diagnostic = captureDiagnostic(new Error('Unexpected private response with phone-5550100 and raw-key-ABC'));
  assert.equal(diagnostic.message, '[redacted:unrecognized_error_message]');
  assert.doesNotMatch(JSON.stringify(diagnostic), /Unexpected private response|phone-5550100|raw-key-ABC/);
});

test('token verification reasons are static, evidence-based, and redact hostile provider errors', () => {
  const cases = [
    ['auth/id-token-expired', 'provider text', 'token_expired'],
    ['auth/id-token-revoked', 'provider text', 'revoked'],
    ['app/invalid-credential', 'private provider response; token=PRIVATE', 'credentials_error'],
    ['auth/invalid-credential', 'private provider response; token=PRIVATE', 'credentials_error'],
    ['auth/insufficient-permission', 'private provider response; token=PRIVATE', 'credentials_error'],
    ['auth/network-request-failed', 'private network response; token=PRIVATE', 'network_error'],
    ['auth/argument-error', 'Firebase ID token project ID does not match the configured project; secret=PRIVATE', 'project_mismatch'],
    ['auth/argument-error', 'Firebase ID token has incorrect "aud" (audience) claim; token=PRIVATE', 'audience_mismatch'],
    ['auth/argument-error', 'Firebase ID token has incorrect "iss" (issuer) claim; token=PRIVATE', 'issuer_mismatch'],
    ['auth/argument-error', 'Failed to verify the signature of the Firebase ID token; key=PRIVATE', 'signature_error'],
    ['auth/argument-error', 'Firebase ID token has incorrect "aud" (audience) claim. Make sure the ID token comes from the same Firebase project as the service account used to authenticate this SDK.', 'audience_mismatch'],
    ['auth/argument-error', 'Firebase ID token has incorrect "iss" (issuer) claim. Make sure the ID token comes from the same Firebase project as the service account used to authenticate this SDK.', 'issuer_mismatch'],
    ['auth/argument-error', 'Firebase ID token has invalid signature. Make sure the ID token comes from the same Firebase project as the service account used to authenticate this SDK.', 'signature_error'],
    ['auth/internal-error', 'Make sure the ID token comes from the same Firebase project as the service account used to authenticate this SDK.', 'unknown_error'],
    ['auth/id-token-expired', 'Firebase ID token has incorrect "aud" (audience) claim.', 'token_expired'],
    ['auth/id-token-revoked', 'Firebase ID token has invalid signature.', 'revoked'],
  ] as const;
  for (const [code, message, reason] of cases) {
    const diagnostic = captureRequestDiagnostic('auth_token_verify_failed', Object.assign(new Error(message), { code }));
    assert.equal(diagnostic.reason, reason);
    assert.equal(diagnostic.stage, 'auth_token_verify');
    assert.doesNotMatch(JSON.stringify(diagnostic), /PRIVATE|configured project/);
  }

  const hostile = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(hostile, 'code', { get() { throw new Error('secret-code'); } });
  Object.defineProperty(hostile, 'name', { get() { throw new Error('secret-name'); } });
  Object.defineProperty(hostile, 'message', { get() { throw new Error('secret-message'); } });
  const unknown = captureRequestDiagnostic('auth_token_verify_failed', hostile);
  assert.deepEqual(unknown, {
    tag: 'auth_token_verify_failed',
    stage: 'auth_token_verify',
    code: 'unknown_error',
    name: 'Error',
    reason: 'unknown_error',
  });
  assert.doesNotMatch(JSON.stringify(unknown), /secret/);
});

test('token claim and auth_time request diagnostics emit only fixed safe tags', () => {
  assert.deepEqual(captureRequestDiagnostic('auth_token_claims_invalid', new Error('private aud and issuer details')), {
    tag: 'auth_token_claims_invalid',
  });
  assert.deepEqual(captureRequestDiagnostic('auth_token_auth_time_invalid', new Error('private auth_time detail')), {
    tag: 'auth_token_auth_time_invalid',
  });
});

test('WIF STS diagnostics map audience, provider condition, and expired subject token evidence', () => {
  const cases = [
    ['STS rejected audience https://private.invalid; token=SECRET', 'audience_mismatch', 'audience'],
    ['The attribute condition was rejected for private-subject; bearer=SECRET', 'provider_subject_condition_rejected', 'attribute-condition'],
    ['subject token has expired; raw-token=SECRET', 'subject_token_expired', 'expired-subject-token'],
  ] as const;
  for (const [message, reason, signal] of cases) {
    const diagnostic = captureWifDiagnostic(Object.assign(new Error(message), {
      response: { data: { error: message }, config: { url: 'https://sts.googleapis.com/v1/token?secret=URL_SECRET' } },
    }));
    assert.equal(diagnostic.stage, 'wif_token_exchange');
    assert.equal(diagnostic.endpoint, 'sts');
    assert.equal(diagnostic.reason, reason);
    assert.ok((diagnostic.signals as string[]).includes(signal));
    assert.doesNotMatch(JSON.stringify(diagnostic), /private\.invalid|private-subject|SECRET|URL_SECRET/);
  }
});

test('WIF IAM 403 diagnostics use fixed impersonation permission category', () => {
  const diagnostic = captureWifDiagnostic({
    code: 'PERMISSION_DENIED',
    response: {
      status: 403,
      data: { error: { status: 'PERMISSION_DENIED', message: 'private service account and UID SECRET' } },
      config: { url: 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/private@example.invalid:generateAccessToken' },
    },
  });
  assert.deepEqual(diagnostic, {
    stage: 'wif_token_exchange',
    endpoint: 'iam_credentials',
    code: 'permission-denied',
    name: 'Error',
    reason: 'impersonation_permission_denied',
    signals: ['iam-access-token-permission'],
  });
  assert.doesNotMatch(JSON.stringify(diagnostic), /private@example|SECRET|UID/);
});

test('WIF Vercel OIDC missing-token diagnostics stay static', () => {
  const diagnostic = captureWifDiagnostic(Object.assign(new Error("The 'x-vercel-oidc-token' header is missing from the request; secret=SECRET"), {
    code: 'invalid_credential',
  }));
  assert.equal(diagnostic.endpoint, 'vercel_oidc');
  assert.equal(diagnostic.code, 'invalid_credential');
  assert.equal(diagnostic.reason, 'oidc_token_unavailable');
  assert.ok((diagnostic.signals as string[]).includes('oidc'));
  assert.doesNotMatch(JSON.stringify(diagnostic), /x-vercel-oidc-token|header is missing|SECRET/);
});

test('WIF diagnostics tolerate hostile getters and never serialize provider secrets', () => {
  const hostile = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(hostile, 'code', { get() { throw new Error('secret-code'); } });
  Object.defineProperty(hostile, 'message', { get() { throw new Error('secret-message'); } });
  Object.defineProperty(hostile, 'response', { get() { throw new Error('response bearer SECRET'); } });
  const diagnostic = captureWifDiagnostic(hostile);
  assert.deepEqual(diagnostic, {
    stage: 'wif_token_exchange',
    endpoint: 'unknown',
    code: 'unknown_error',
    name: 'Error',
    reason: 'unknown_error',
    signals: [],
  });
  assert.doesNotMatch(JSON.stringify(diagnostic), /secret|SECRET/);
});
