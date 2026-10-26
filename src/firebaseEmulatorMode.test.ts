import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldUseFirebaseEmulators } from './firebaseEmulatorMode.ts';

const firebaseModule = readFileSync(new URL('./firebase.ts', import.meta.url), 'utf8');

test('Firebase emulators are mandatory for local development', () => {
  assert.equal(shouldUseFirebaseEmulators(true), true);
});

test('development Firebase setup has no environment opt-out to a live project', () => {
  assert.doesNotMatch(firebaseModule, /VITE_FIREBASE_USE_EMULATOR/);
  assert.equal(shouldUseFirebaseEmulators(true), true);
});

test('production builds do not connect to local Firebase emulators', () => {
  assert.equal(shouldUseFirebaseEmulators(false), false);
});
