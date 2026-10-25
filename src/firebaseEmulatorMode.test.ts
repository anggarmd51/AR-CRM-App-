import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldUseFirebaseEmulators } from './firebaseEmulatorMode.ts';

test('Firebase emulators are the default for local development', () => {
  assert.equal(shouldUseFirebaseEmulators(true, undefined), true);
  assert.equal(shouldUseFirebaseEmulators(true, 'true'), true);
});

test('live Firebase development requires an explicit opt-out', () => {
  assert.equal(shouldUseFirebaseEmulators(true, 'false'), false);
});

test('production builds never connect to local Firebase emulators', () => {
  assert.equal(shouldUseFirebaseEmulators(false, undefined), false);
  assert.equal(shouldUseFirebaseEmulators(false, 'true'), false);
});
