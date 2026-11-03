import assert from 'node:assert/strict';
import test from 'node:test';
import { createProspectingHttpHandler } from './prospectingHttp.ts';
import type { ProspectingHttpRequest } from './prospectingHttp.ts';

const token = `Bearer ${'a'.repeat(80)}`;
function request(body: unknown, options: { method?: string; auth?: string; origin?: string; proto?: string | string[] | null; contentType?: string } = {}): ProspectingHttpRequest {
  return {
    method: options.method ?? 'POST',
    body,
    headers: {
      host: 'crm.example.test',
      origin: options.origin ?? 'https://crm.example.test',
      'x-forwarded-proto': options.proto === undefined ? 'https' : options.proto ?? undefined,
      'content-type': options.contentType ?? 'application/json',
      'content-length': '20',
      authorization: options.auth ?? token,
    },
  } as unknown as ProspectingHttpRequest;
}
function responseRecorder() {
  const headers = new Map<string, string>();
  const result: { statusCode?: number; body?: string; headers: Map<string, string>; setHeader(name: string, value: string): void; end(body?: string): void } = {
    headers,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    end(body = '') { result.body = body; },
  };
  return result;
}
function setup(overrides: Partial<Parameters<typeof createProspectingHttpHandler>[0]> = {}) {
  const calls = { auth: 0, quota: 0, profile: 0 };
  const handler = createProspectingHttpHandler({
    enabled: () => true,
    getRuntime: () => ({
      async status(value) {
        calls.auth += 1;
        return {
          statusCode: value.authorization === token ? 200 : 401,
          headers: {},
          body: { sessionActive: value.authorization === token },
        };
      },
      async reserveAiUsage() { calls.quota += 1; return true; },
    }),
    async profile(query) { calls.profile += 1; return { target_roles: `roles:${query}`, email_pattern: 'generic', google_dorks: 'dorks' }; },
    environment: { VERCEL: '1' },
    ...overrides,
  });
  return { handler, calls };
}

test('disabled feature flag returns stable 503 and never authenticates or calls providers', async () => {
  const { handler, calls } = setup({ enabled: () => false });
  const response = responseRecorder();
  await handler(request({ query: 'Company' }), response as never);
  assert.equal(response.statusCode, 503);
  assert.equal(calls.auth + calls.quota + calls.profile, 0);
  assert.match(response.body ?? '', /feature_disabled/);
});

test('valid owner request reserves quota and returns the exact JSON result schema', async () => {
  const { handler, calls } = setup();
  const response = responseRecorder();
  await handler(request({ query: 'PT Example' }), response as never);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body ?? ''), {
    target_roles: 'roles:PT Example', email_pattern: 'generic', google_dorks: 'dorks',
  });
  assert.deepEqual(calls, { auth: 1, quota: 1, profile: 1 });
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
});

test('same-origin HTTPS requires an exact singleton Vercel x-forwarded-proto value', async () => {
  for (const proto of [null, 'http', 'https,http', 'https, http', ['https', 'https']]) {
    const { handler, calls } = setup();
    const response = responseRecorder();
    await handler(request({ query: 'Company' }, { proto }), response as never);
    assert.equal(response.statusCode, 403, `proto ${JSON.stringify(proto)} must fail closed`);
    assert.equal(calls.auth + calls.quota + calls.profile, 0);
  }

  const customServer = setup({ environment: {} });
  const customResponse = responseRecorder();
  await customServer.handler(request({ query: 'Company' }, { proto: 'https' }), customResponse as never);
  assert.equal(customResponse.statusCode, 403, 'custom servers must not trust caller-supplied forwarded headers');
  assert.equal(customServer.calls.auth, 0);
});

test('missing active PIN session or invalid same-origin requests stop before quota/provider calls', async () => {
  const wrongOwner = setup({ getRuntime: () => ({
    async status() { return { statusCode: 200, headers: {}, body: { sessionActive: false } }; },
    async reserveAiUsage() { throw new Error('must not be called'); },
  }) });
  const authResponse = responseRecorder();
  await wrongOwner.handler(request({ query: 'Company' }), authResponse as never);
  assert.equal(authResponse.statusCode, 401);
  assert.equal(wrongOwner.calls.profile, 0);

  const badOrigin = setup();
  const originResponse = responseRecorder();
  await badOrigin.handler(request({ query: 'Company' }, { origin: 'https://evil.example.test' }), originResponse as never);
  assert.equal(originResponse.statusCode, 403);
  assert.equal(badOrigin.calls.auth, 0);
  assert.equal(badOrigin.calls.profile, 0);
});

test('quota exhaustion, malformed body, and wrong method fail before provider calls', async () => {
  const overQuota = setup({ getRuntime: () => ({
    async status() { return { statusCode: 200, headers: {}, body: { sessionActive: true } }; },
    async reserveAiUsage() { return false; },
  }) });
  const quotaResponse = responseRecorder();
  await overQuota.handler(request({ query: 'Company' }), quotaResponse as never);
  assert.equal(quotaResponse.statusCode, 429);
  assert.equal(overQuota.calls.profile, 0);

  const malformed = setup();
  const invalidResponse = responseRecorder();
  await malformed.handler(request({ query: 'Company', extra: 'blocked' }), invalidResponse as never);
  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(malformed.calls.profile, 0);

  const wrongMethod = setup();
  const methodResponse = responseRecorder();
  await wrongMethod.handler(request({ query: 'Company' }, { method: 'GET' }), methodResponse as never);
  assert.equal(methodResponse.statusCode, 405);
  assert.equal(wrongMethod.calls.auth, 0);
});
