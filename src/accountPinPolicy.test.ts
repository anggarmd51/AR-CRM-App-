import test from 'node:test';
import assert from 'node:assert/strict';
import { requiresServerIssuedPinSession } from './accountPinPolicy.ts';

test('only local emulator mode may run without a server-issued account PIN session', () => {
  assert.equal(requiresServerIssuedPinSession('local'), false);
  assert.equal(requiresServerIssuedPinSession('staging'), true);
  assert.equal(requiresServerIssuedPinSession('production'), true);
});
