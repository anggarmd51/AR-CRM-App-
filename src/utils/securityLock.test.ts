import test from 'node:test';
import assert from 'node:assert/strict';
import { SecurityVault } from './securityLock.ts';

// Mock localStorage for Node test environment
const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => storageMap.get(k) || null,
  setItem: (k: string, v: string) => storageMap.set(k, v),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

test('SecurityVault sets and verifies PIN correctly', async () => {
  storageMap.clear();

  assert.equal(SecurityVault.isSecurityEnabled(), false);
  assert.equal(SecurityVault.hasPin(), false);

  await SecurityVault.setPin('1234');

  assert.equal(SecurityVault.hasPin(), true);
  assert.equal(SecurityVault.isSecurityEnabled(), true);

  const validRes = await SecurityVault.verifyPin('1234');
  assert.equal(validRes.success, true);

  const invalidRes = await SecurityVault.verifyPin('9999');
  assert.equal(invalidRes.success, false);
});

test('SecurityVault rate-limits brute force attempts after 5 failures', async () => {
  storageMap.clear();
  await SecurityVault.setPin('5678');

  // 4 failed attempts
  for (let i = 0; i < 4; i++) {
    const res = await SecurityVault.verifyPin('0000');
    assert.equal(res.success, false);
    assert.equal(res.rateLimited, false);
  }

  // 5th failed attempt should trigger lockout
  const fifthAttempt = await SecurityVault.verifyPin('0000');
  assert.equal(fifthAttempt.success, false);
  assert.equal(fifthAttempt.rateLimited, true);
  assert.ok((fifthAttempt.lockoutSeconds || 0) > 0);

  // Subsequent attempt is blocked by rate-limit even with correct PIN
  const blockedAttempt = await SecurityVault.verifyPin('5678');
  assert.equal(blockedAttempt.success, false);
  assert.equal(blockedAttempt.rateLimited, true);

  // Reset clears lockout
  SecurityVault.resetFailedAttempts();
  const unlocked = await SecurityVault.verifyPin('5678');
  assert.equal(unlocked.success, true);
});

test('SecurityVault lock state and reset work as expected', () => {
  storageMap.clear();

  SecurityVault.setSecurityEnabled(true);
  SecurityVault.setTimeoutMinutes(5);

  // Without PIN, it should not lock
  assert.equal(SecurityVault.isCurrentlyLocked(), false);

  // Set mock PIN
  storageMap.set('ar_crm_security_pin', 'mock_hash');
  // Record unlock now
  SecurityVault.recordUnlock();
  assert.equal(SecurityVault.isCurrentlyLocked(), false);

  // Lock now
  SecurityVault.lockNow();
  assert.equal(SecurityVault.isCurrentlyLocked(), true);

  // Reset
  SecurityVault.resetAllSecurity();
  assert.equal(SecurityVault.isSecurityEnabled(), false);
  assert.equal(SecurityVault.hasPin(), false);
  assert.equal(SecurityVault.isCurrentlyLocked(), false);
});
