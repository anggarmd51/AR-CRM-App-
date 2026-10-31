import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emitAccountPinFirebaseDiagnostic,
  withAccountPinFirebaseDiagnostics,
  type AccountPinFirebaseDiagnostic,
} from './accountPinFirebaseDiagnostics.ts';

const STAGE = 'firebase_id_token_verification';
function capture(error: unknown, stage = STAGE): AccountPinFirebaseDiagnostic {
  let diagnostic: AccountPinFirebaseDiagnostic | undefined;
  emitAccountPinFirebaseDiagnostic(stage, error, (value) => { diagnostic = value; });
  assert.ok(diagnostic);
  return diagnostic;
}

test('diagnostics emit only fixed event/stage and allowlisted standard fields', () => {
  assert.deepEqual(capture({ code: 'auth/id-token-expired', status: 'UNAVAILABLE', statusCode: 503, message: 'JWT token and PIN secret' }), {
    event: 'account_pin_firebase_error', stage: STAGE, code: 'auth/id-token-expired', status: 'UNAVAILABLE', reason: 'unknown',
  });
  assert.deepEqual(capture({ code: 'PERMISSION_DENIED', status: 403, response: { status: 403, data: { code: 4 } }, message: 'secret=pepper PIN=123456' }), {
    event: 'account_pin_firebase_error', stage: STAGE, code: 'PERMISSION_DENIED', httpStatus: 403, grpcCode: 4, reason: 'permission_denied',
  });
});

test('nested response data error codes and safe status values are recognized', () => {
  assert.deepEqual(capture({
    message: 'authorization failed with invalid_grant; token JWT abc',
    response: { status: 401, data: { error: { code: 'invalid_grant', status: 'UNAUTHENTICATED', secret: 'do-not-log' } } },
  }), {
    event: 'account_pin_firebase_error', stage: STAGE, code: 'invalid_grant', status: 'UNAUTHENTICATED', httpStatus: 401, reason: 'invalid_grant',
  });
  assert.equal(capture({ response: { data: { error: 'invalid_target' } } }).code, 'invalid_target');
  assert.equal(capture({ response: { data: { error: 'invalid_grant', error_description: 'Invalid audience secret JWT' } } }).reason, 'audience');
});

test('recognized message categories are fixed values and unknown codes/messages remain unknown', () => {
  assert.equal(capture(new Error('audience does not match JWT')).reason, 'audience');
  assert.equal(capture(new Error('aud mismatch')).reason, 'audience');
  assert.equal(capture(new Error('attribute_condition failed for secret')).reason, 'attribute_condition');
  assert.equal(capture(new Error('service disabled')).reason, 'service_disabled');
  assert.equal(capture({ code: 'totally-unknown', message: 'arbitrary token PIN pepper secret' }).reason, 'unknown');
});

test('cyclic, hostile, and unknown-stage error values cannot leak secrets', () => {
  const cyclic: Record<string, unknown> = { code: 'not-allowlisted', message: 'JWT abc PIN 123456 secret pepper' };
  cyclic.response = cyclic;
  const value = capture(cyclic, 'JWT abc PIN 123456 secret pepper');
  const serialized = JSON.stringify(value);
  assert.equal(value.stage, 'unknown');
  for (const secret of ['JWT', '123456', 'secret', 'not-allowlisted', 'pepper']) assert.equal(serialized.includes(secret), false);
  const hostile = Object.defineProperty({}, 'message', { get() { throw new Error('secret'); } });
  assert.equal(capture(hostile).reason, 'unknown');
});

test('inherited Firebase error-code getters are safely recognized', () => {
  class SyntheticFirebaseError extends Error { get code() { return 'app/invalid-credential'; } }
  assert.equal(capture(new SyntheticFirebaseError('opaque JWT secret')).code, 'app/invalid-credential');
  class UnknownFirebaseError extends Error { get code() { return 'secret-pin-123456'; } }
  assert.equal(capture(new UnknownFirebaseError('opaque')).code, undefined);
});

test('diagnostic wrapper reports and rethrows the original error', async () => {
  const original = new Error('JWT token PIN 123456 secret');
  const events: AccountPinFirebaseDiagnostic[] = [];
  await assert.rejects(withAccountPinFirebaseDiagnostics(STAGE, async () => { throw original; }, (event) => events.push(event)), (error) => error === original);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.stage, STAGE);
  assert.equal(events[0]?.reason, 'unknown');
});

test('diagnostic logger failures cannot replace an authentication error or alter successful operations', async () => {
  const original = new Error('original');
  await assert.rejects(withAccountPinFirebaseDiagnostics(STAGE, async () => { throw original; }, () => { throw new Error('logger'); }), (error) => error === original);
  assert.equal(await withAccountPinFirebaseDiagnostics(STAGE, async () => 123), 123);
});
