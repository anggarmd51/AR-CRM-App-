import assert from 'node:assert/strict';
import test from 'node:test';
import {
  logAccountPinDiagnostic,
  logAccountPinRequestDiagnostic,
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
    code: 'auth/id-token-expired',
  });
  assert.deepEqual(captureRequestDiagnostic('auth_token_verify_failed', Object.assign(new Error('private token'), {
    code: 'auth/id-token-expired;token=secret',
  })), {
    tag: 'auth_token_verify_failed',
    code: 'unknown_error',
  });
  assert.deepEqual(captureRequestDiagnostic('forbidden_origin_mismatch'), {
    tag: 'forbidden_origin_mismatch',
  });
});

test('arbitrary non-authentication error messages remain redacted', () => {
  const diagnostic = captureDiagnostic(new Error('Unexpected private response with phone-5550100 and raw-key-ABC'));
  assert.equal(diagnostic.message, '[redacted:unrecognized_error_message]');
  assert.doesNotMatch(JSON.stringify(diagnostic), /Unexpected private response|phone-5550100|raw-key-ABC/);
});

test('token claim and auth_time request diagnostics emit only fixed safe tags', () => {
  assert.deepEqual(captureRequestDiagnostic('auth_token_claims_invalid', new Error('private aud and issuer details')), {
    tag: 'auth_token_claims_invalid',
  });
  assert.deepEqual(captureRequestDiagnostic('auth_token_auth_time_invalid', new Error('private auth_time detail')), {
    tag: 'auth_token_auth_time_invalid',
  });
});
