import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isStagingAccountPinRedirectEnabled,
  STAGING_ACCOUNT_PIN_REDIRECT_ORIGIN,
} from './accountPinReauthentication.ts';

test('staging account PIN redirect is enabled only at the exact approved HTTPS origin', () => {
  assert.equal(isStagingAccountPinRedirectEnabled('staging', STAGING_ACCOUNT_PIN_REDIRECT_ORIGIN), true);
  assert.equal(isStagingAccountPinRedirectEnabled('production', STAGING_ACCOUNT_PIN_REDIRECT_ORIGIN), false);
  assert.equal(isStagingAccountPinRedirectEnabled('local', STAGING_ACCOUNT_PIN_REDIRECT_ORIGIN), false);
  assert.equal(isStagingAccountPinRedirectEnabled('staging', 'https://arcrm-app.vercel.app'), false);
  assert.equal(isStagingAccountPinRedirectEnabled('staging', 'http://arcrm-app-git-cue-firebase-stabilization-anggaramadhan538-8607.vercel.app'), false);
  assert.equal(isStagingAccountPinRedirectEnabled('staging', `${STAGING_ACCOUNT_PIN_REDIRECT_ORIGIN}/`), false);
});
