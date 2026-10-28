import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldUseLocalSecurityVault } from './localSecurityPolicy.ts';

test('device-only SecurityVault is enabled only for local Firebase target', () => {
  assert.equal(shouldUseLocalSecurityVault('local'), true);
  assert.equal(shouldUseLocalSecurityVault('staging'), false);
  assert.equal(shouldUseLocalSecurityVault('production'), false);
});
