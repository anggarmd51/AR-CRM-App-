import assert from 'node:assert/strict';
import test from 'node:test';
import { isProspectingProductionEnabled } from './prospecting.ts';

const readyButNotConfigured = {
  VERCEL_ENV: 'production',
  VERCEL_GIT_COMMIT_REF: 'main',
  VITE_FIREBASE_TARGET: 'production',
  PROSPECTING_AI_ENABLED: 'true',
  PROSPECTING_AI_COST_AND_DATA_REVIEWED: 'true',
  GROQ_API_KEY: 'provider-key-not-real',
  DEEPSEEK_API_KEY: 'provider-key-not-real',
  GEMINI_API_KEY: 'provider-key-not-real',
  OPENROUTER_API_KEY: 'provider-key-not-real',
  COHERE_API_KEY: 'provider-key-not-real',
};

test('prospecting route is disabled by default', () => {
  assert.equal(isProspectingProductionEnabled({}), false);
});

test('only explicitly reviewed Production with all five provider keys passes the configuration gate', () => {
  assert.equal(isProspectingProductionEnabled(readyButNotConfigured), true);
  for (const name of ['GROQ_API_KEY', 'DEEPSEEK_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'COHERE_API_KEY']) {
    const missing = { ...readyButNotConfigured, [name]: '' };
    assert.equal(isProspectingProductionEnabled(missing), false, `${name} must be present`);
  }
  assert.equal(isProspectingProductionEnabled({ ...readyButNotConfigured, PROSPECTING_AI_ENABLED: 'false' }), false);
  assert.equal(isProspectingProductionEnabled({ ...readyButNotConfigured, PROSPECTING_AI_COST_AND_DATA_REVIEWED: undefined }), false);
  assert.equal(isProspectingProductionEnabled({ ...readyButNotConfigured, VERCEL_ENV: 'preview' }), false);
  assert.equal(isProspectingProductionEnabled({ ...readyButNotConfigured, VITE_FIREBASE_TARGET: 'staging' }), false);
  assert.equal(isProspectingProductionEnabled({ ...readyButNotConfigured, VERCEL_GIT_COMMIT_REF: 'unapproved' }), false);
});
