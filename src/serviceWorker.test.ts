import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const serviceWorkerSource = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

function createServiceWorkerHarness() {
  const listeners = new Map<string, (event: any) => void>();
  const cacheWrites: string[] = [];
  const cache = {
    addAll: async () => undefined,
    match: async () => undefined,
    put: async (request: { url: string }) => { cacheWrites.push(request.url); },
  };
  const cacheStorage = {
    open: async () => cache,
    match: async () => undefined,
    keys: async () => [],
    delete: async () => true,
  };
  const self = {
    location: { origin: 'https://crm.example' },
    addEventListener: (type: string, listener: (event: any) => void) => listeners.set(type, listener),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };
  const response = {
    status: 200,
    type: 'basic',
    clone() { return this; },
  };
  runInNewContext(serviceWorkerSource, {
    self,
    URL,
    caches: cacheStorage,
    fetch: async () => response,
  });

  const fetchListener = listeners.get('fetch');
  assert.ok(fetchListener, 'service worker must register a fetch listener');
  return { cacheWrites, fetchListener, response };
}

test('service worker does not intercept API, dynamic, or cross-origin GET requests', () => {
  const { fetchListener } = createServiceWorkerHarness();
  const urls = [
    'https://crm.example/api/private/export',
    'https://crm.example/reports/private-export.csv',
    'https://crm.example/private/app.js',
    'https://cdn.example/assets/app.js',
  ];

  for (const url of urls) {
    let intercepted = false;
    fetchListener({
      request: { url, method: 'GET', mode: 'cors' },
      respondWith: () => { intercepted = true; },
    });
    assert.equal(intercepted, false, `${url} should not be intercepted`);
  }
});

test('service worker caches same-origin static assets under the assets path', async () => {
  const { cacheWrites, fetchListener } = createServiceWorkerHarness();
  let responsePromise: Promise<unknown> | undefined;
  const url = 'https://crm.example/assets/app-123.js';

  fetchListener({
    request: { url, method: 'GET', mode: 'cors' },
    respondWith: (promise: Promise<unknown>) => { responsePromise = Promise.resolve(promise); },
  });

  assert.ok(responsePromise, 'known static asset should use the service worker cache path');
  await responsePromise;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(cacheWrites, [url]);
});
