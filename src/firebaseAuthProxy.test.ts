import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const vercelConfig = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const firebaseModule = readFileSync(new URL('./firebase.ts', import.meta.url), 'utf8');

test('Vercel transparently proxies only production-host Firebase Auth helpers to the production project', () => {
  assert.deepEqual(vercelConfig, {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    rewrites: [{
      source: '/__/auth/:path*',
      destination: 'https://ar-crm-73222.firebaseapp.com/__/auth/:path*',
      has: [{ type: 'host', value: { eq: 'arcrmapp.vercel.app' } }],
    }],
  });
  // No catch-all, API rewrite, redirect, or method restriction may replace this proxy.
});

test('Firebase authDomain remains environment-scoped rather than hardcoded across deployments', () => {
  assert.match(firebaseModule, /authDomain: import\.meta\.env\.VITE_FIREBASE_AUTH_DOMAIN/);
  assert.doesNotMatch(firebaseModule, /authDomain:\s*['"]arcrmapp\.vercel\.app['"]/);
});
