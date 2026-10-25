import test from 'node:test';
import assert from 'node:assert/strict';
import { isOwnerBootstrapEnabled } from './ownerBootstrap.ts';

test('owner bootstrap is restricted to loopback development origins', () => {
  for (const hostname of ['localhost', '127.0.0.1', '::1', '[::1]']) {
    assert.equal(isOwnerBootstrapEnabled(true, hostname, 'http:'), true);
    assert.equal(isOwnerBootstrapEnabled(true, hostname, 'https:'), true);
  }
});

test('public, preview, malformed and non-web origins are denied', () => {
  for (const hostname of [
    'arcrmapp.vercel.app',
    'example.com',
    'localhost.example.com',
    'evil.localhost',
    '3000-iqgjrbaw6fx60br43qu42-cb54634d.us2.manus.computer',
    '',
  ]) {
    assert.equal(isOwnerBootstrapEnabled(true, hostname, 'https:'), false);
    assert.equal(isOwnerBootstrapEnabled(true, hostname, 'http:'), false);
  }
  assert.equal(isOwnerBootstrapEnabled(true, 'localhost', 'file:'), false);
});

test('production builds never expose owner bootstrap, including on loopback', () => {
  for (const hostname of ['localhost', '127.0.0.1', '::1', '[::1]']) {
    assert.equal(isOwnerBootstrapEnabled(false, hostname, 'http:'), false);
    assert.equal(isOwnerBootstrapEnabled(false, hostname, 'https:'), false);
  }
});
