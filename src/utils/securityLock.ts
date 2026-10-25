const STORAGE_KEY_PIN = 'ar_crm_security_pin';
const STORAGE_KEY_ENABLED = 'ar_crm_security_enabled';
const STORAGE_KEY_BIOMETRIC = 'ar_crm_biometric_enabled';
const STORAGE_KEY_LAST_UNLOCK = 'ar_crm_last_unlock_time';
const STORAGE_KEY_TIMEOUT_MINS = 'ar_crm_security_timeout_mins';
const STORAGE_KEY_FAILED_ATTEMPTS = 'ar_crm_failed_pin_attempts';
const STORAGE_KEY_LOCKOUT_UNTIL = 'ar_crm_pin_lockout_until';

const SALT = 'ar-crm-vault-salt-2026-enterprise';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30_000; // 30 seconds rate-limit lockout

// Fast, salted SHA-256 hash using Web Crypto API
async function hashPin(pin: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(pin + SALT);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback below
    }
  }
  // Deterministic salt hashing fallback
  let hash = 0;
  const str = pin + SALT;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return `h_${Math.abs(hash)}`;
}

export const SecurityVault = {
  isSecurityEnabled(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY_ENABLED) === 'true';
  },

  setSecurityEnabled(enabled: boolean): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_ENABLED, enabled ? 'true' : 'false');
    if (!enabled) {
      localStorage.removeItem(STORAGE_KEY_LAST_UNLOCK);
      this.resetFailedAttempts();
    }
  },

  hasPin(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return Boolean(localStorage.getItem(STORAGE_KEY_PIN));
  },

  async setPin(pin: string): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    const hashed = await hashPin(pin);
    localStorage.setItem(STORAGE_KEY_PIN, hashed);
    localStorage.setItem(STORAGE_KEY_ENABLED, 'true');
    this.resetFailedAttempts();
    this.recordUnlock();
  },

  getRemainingLockoutSeconds(): number {
    if (typeof localStorage === 'undefined') return 0;
    const lockoutUntilStr = localStorage.getItem(STORAGE_KEY_LOCKOUT_UNTIL);
    if (!lockoutUntilStr) return 0;
    const lockoutUntil = parseInt(lockoutUntilStr, 10);
    const now = Date.now();
    if (lockoutUntil > now) {
      return Math.ceil((lockoutUntil - now) / 1000);
    }
    // Expired lockout
    localStorage.removeItem(STORAGE_KEY_LOCKOUT_UNTIL);
    return 0;
  },

  isRateLimited(): boolean {
    return this.getRemainingLockoutSeconds() > 0;
  },

  getFailedAttempts(): number {
    if (typeof localStorage === 'undefined') return 0;
    const attempts = localStorage.getItem(STORAGE_KEY_FAILED_ATTEMPTS);
    return attempts ? parseInt(attempts, 10) : 0;
  },

  recordFailedAttempt(): { remainingAttempts: number; lockoutSeconds: number } {
    if (typeof localStorage === 'undefined') return { remainingAttempts: MAX_FAILED_ATTEMPTS, lockoutSeconds: 0 };
    const current = this.getFailedAttempts() + 1;
    localStorage.setItem(STORAGE_KEY_FAILED_ATTEMPTS, String(current));

    if (current >= MAX_FAILED_ATTEMPTS) {
      const lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
      localStorage.setItem(STORAGE_KEY_LOCKOUT_UNTIL, String(lockoutUntil));
      return { remainingAttempts: 0, lockoutSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000) };
    }

    return { remainingAttempts: MAX_FAILED_ATTEMPTS - current, lockoutSeconds: 0 };
  },

  resetFailedAttempts(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY_FAILED_ATTEMPTS);
    localStorage.removeItem(STORAGE_KEY_LOCKOUT_UNTIL);
  },

  async verifyPin(inputPin: string): Promise<{ success: boolean; rateLimited?: boolean; lockoutSeconds?: number }> {
    if (typeof localStorage === 'undefined') return { success: true };

    // Rate-limiting check
    const remainingLockout = this.getRemainingLockoutSeconds();
    if (remainingLockout > 0) {
      return { success: false, rateLimited: true, lockoutSeconds: remainingLockout };
    }

    const storedHash = localStorage.getItem(STORAGE_KEY_PIN);
    if (!storedHash) return { success: true };

    const inputHash = await hashPin(inputPin);
    const isValid = inputHash === storedHash;

    if (isValid) {
      this.resetFailedAttempts();
      this.recordUnlock();
      return { success: true };
    } else {
      const { lockoutSeconds } = this.recordFailedAttempt();
      return {
        success: false,
        rateLimited: lockoutSeconds > 0,
        lockoutSeconds,
      };
    }
  },

  isBiometricSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return typeof window.PublicKeyCredential !== 'undefined' && Boolean(navigator.credentials);
  },

  isBiometricEnabled(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY_BIOMETRIC) === 'true';
  },

  setBiometricEnabled(enabled: boolean): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_BIOMETRIC, enabled ? 'true' : 'false');
  },

  /**
   * Real WebAuthn platform authentication using navigator.credentials.get.
   * Prompts the OS/browser fingerprint or face unlock dialog.
   */
  async authenticateWithBiometrics(): Promise<boolean> {
    if (!this.isBiometricSupported() || !this.isBiometricEnabled()) return false;
    if (this.isRateLimited()) return false;

    try {
      // Generate cryptographic challenge for WebAuthn assertion
      const challenge = new Uint8Array(32);
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(challenge);
      }

      const getOptions: CredentialRequestOptions = {
        publicKey: {
          challenge,
          timeout: 60000,
          userVerification: 'preferred',
          rpId: window.location.hostname || undefined,
        },
      };

      const assertion = await navigator.credentials.get(getOptions);
      if (assertion) {
        this.resetFailedAttempts();
        this.recordUnlock();
        return true;
      }
    } catch (e: any) {
      console.warn('WebAuthn biometric authentication not completed:', e?.name || e?.message || e);
    }
    return false;
  },

  getTimeoutMinutes(): number {
    if (typeof localStorage === 'undefined') return 5;
    const val = localStorage.getItem(STORAGE_KEY_TIMEOUT_MINS);
    return val ? parseInt(val, 10) : 5;
  },

  setTimeoutMinutes(minutes: number): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_TIMEOUT_MINS, String(minutes));
  },

  recordUnlock(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_LAST_UNLOCK, String(Date.now()));
  },

  isCurrentlyLocked(): boolean {
    if (!this.isSecurityEnabled() || !this.hasPin()) {
      return false;
    }
    if (typeof localStorage === 'undefined') return false;
    const lastUnlockStr = localStorage.getItem(STORAGE_KEY_LAST_UNLOCK);
    if (!lastUnlockStr) return true;

    const lastUnlock = parseInt(lastUnlockStr, 10);
    const timeoutMs = this.getTimeoutMinutes() * 60 * 1000;
    
    // If timeout is 0, always locked on reload / background resume
    if (timeoutMs === 0) return true;

    const elapsed = Date.now() - lastUnlock;
    return elapsed > timeoutMs;
  },

  lockNow(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY_LAST_UNLOCK);
  },

  resetAllSecurity(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY_PIN);
    localStorage.removeItem(STORAGE_KEY_ENABLED);
    localStorage.removeItem(STORAGE_KEY_BIOMETRIC);
    localStorage.removeItem(STORAGE_KEY_LAST_UNLOCK);
    this.resetFailedAttempts();
  },
};
