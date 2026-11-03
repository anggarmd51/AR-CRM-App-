import assert from 'node:assert/strict';
import test from 'node:test';
import { createGoogleIdentityReauthBroker } from './googleIdentityReauthBroker.ts';

function credential(nonce: string): string {
  const payload = Buffer.from(JSON.stringify({ nonce })).toString('base64url');
  return `header.${payload}.signature`;
}

test('GIS broker resolves only a credential carrying the active nonce', async () => {
  const broker = createGoogleIdentityReauthBroker(1000);
  const request = broker.begin();
  broker.handleResponse({ credential: credential('stale') });
  assert.equal(broker.isPending(), true);
  broker.handleResponse({ credential: credential(request.nonce) });
  assert.equal(await request.promise, credential(request.nonce));
  assert.equal(broker.isPending(), false);
});

test('GIS broker replacement rejects the old attempt and keeps the new attempt active', async () => {
  const broker = createGoogleIdentityReauthBroker(1000);
  const first = broker.begin();
  const second = broker.begin();
  await assert.rejects(first.promise, /replaced/);
  broker.handleResponse({ credential: credential(second.nonce) });
  assert.equal(await second.promise, credential(second.nonce));
});

test('GIS broker cancel rejects and clears the active attempt', async () => {
  const broker = createGoogleIdentityReauthBroker(1000);
  const request = broker.begin();
  broker.cancel();
  await assert.rejects(request.promise, /cancelled/);
  assert.equal(broker.getActiveNonce(), undefined);
});

test('GIS broker times out and ignores responses after cleanup', async () => {
  const broker = createGoogleIdentityReauthBroker(5);
  const request = broker.begin();
  await assert.rejects(request.promise, /timed out/);
  assert.equal(broker.isPending(), false);
  broker.handleResponse({ credential: credential(request.nonce) });
});

test('GIS broker notifies subscribers for begin and completion', async () => {
  const broker = createGoogleIdentityReauthBroker(1000);
  let notifications = 0;
  const unsubscribe = broker.subscribe(() => { notifications += 1; });
  const request = broker.begin();
  broker.handleResponse({ credential: credential(request.nonce) });
  await request.promise;
  unsubscribe();
  assert.equal(notifications, 2);
});

test('cancelled attempt cannot satisfy a new GIS credential request', async () => {
  const broker = createGoogleIdentityReauthBroker(1000);
  const first = broker.begin();
  broker.cancel();
  await assert.rejects(first.promise, /cancelled/);
  const second = broker.begin();
  assert.notEqual(first.nonce, second.nonce);
  broker.handleResponse({ credential: credential(first.nonce) });
  assert.equal(broker.getActiveNonce(), second.nonce);
  broker.handleResponse({ credential: credential(second.nonce) });
  assert.equal(await second.promise, credential(second.nonce));
});

test('GIS broker fails closed when secure randomness is unavailable', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    const broker = createGoogleIdentityReauthBroker();
    assert.throws(() => broker.begin(), /Secure randomness is unavailable/);
    assert.equal(broker.isPending(), false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
    else Reflect.deleteProperty(globalThis, 'crypto');
  }
});
