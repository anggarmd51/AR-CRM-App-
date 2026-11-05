import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROSPECTING_FREE_MODELS,
  PROSPECTING_PROVIDER_ORDER,
  PROSPECTING_PROVIDER_TIMEOUT_MS,
  PROSPECTING_PROVIDERS,
  PROSPECTING_TOTAL_DEADLINE_MS,
  ProspectingFailure,
  profileProspectWithFallback,
} from './prospecting.ts';

const allKeys = {
  GROQ_API_KEY: 'test-groq',
  GEMINI_API_KEY: 'test-gemini',
  OPENROUTER_API_KEY: 'test-openrouter',
  // Legacy credentials may remain in an environment, but are not active providers.
  DEEPSEEK_API_KEY: 'legacy-not-used',
  COHERE_API_KEY: 'legacy-not-used',
};

function openAiResponse(targetRoles = 'Owner, CEO, Head of Procurement') {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      target_roles: targetRoles,
      email_pattern: 'person@example.com',
      google_dorks: 'site:linkedin.com/in "unsafe query" OR @gmail.com',
    }) } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function geminiResponse(targetRoles = 'Owner, CEO, Head of Procurement') {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify({
      target_roles: targetRoles,
      email_pattern: 'person@example.com',
      google_dorks: 'site:linkedin.com/in "unsafe query" OR @gmail.com',
    }) }] } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

test('waterfall uses Groq, Gemini, then OpenRouter with only pinned Free Tier model identifiers', async () => {
  assert.deepEqual(PROSPECTING_PROVIDER_ORDER, ['groq', 'gemini', 'openrouter']);
  assert.deepEqual(PROSPECTING_PROVIDERS.map((provider) => provider.id), ['groq', 'gemini', 'openrouter']);
  assert.deepEqual(PROSPECTING_PROVIDERS.map((provider) => provider.keyEnv), [
    'GROQ_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY',
  ]);

  const calls: string[] = [];
  const modelIds: string[] = [];
  const events: Array<{ provider: string; result: string; reason: string }> = [];
  const response = await profileProspectWithFallback(' PT Sukses Makmur ', {
    environment: {
      ...allKeys,
      GROQ_MODEL: PROSPECTING_FREE_MODELS.groq,
      GEMINI_MODEL: PROSPECTING_FREE_MODELS.gemini,
      OPENROUTER_MODEL: PROSPECTING_FREE_MODELS.openrouter,
    },
    fetchImpl: async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('api.groq.com')) {
        modelIds.push((JSON.parse(String(init?.body)) as { model: string }).model);
        return new Response('{}', { status: 429 });
      }
      if (url.includes('generativelanguage.googleapis.com')) {
        modelIds.push(decodeURIComponent(new URL(url).pathname.split('/models/')[1]!.split(':')[0]!));
        return new Response('{}', { status: 429 });
      }
      if (url.includes('openrouter.ai')) {
        modelIds.push((JSON.parse(String(init?.body)) as { model: string }).model);
        return openAiResponse();
      }
      throw new Error('unexpected provider call');
    },
    log: (event) => events.push(event),
  });

  assert.deepEqual(calls.map((url) => new URL(url).hostname), [
    'api.groq.com', 'generativelanguage.googleapis.com', 'openrouter.ai',
  ]);
  assert.deepEqual(modelIds, [
    'openai/gpt-oss-20b', 'gemini-3.8-flash', 'openrouter/free',
  ]);
  assert.deepEqual(response, {
    target_roles: 'Owner / Founder, CEO / Direktur Utama, Head of Procurement',
    email_pattern: 'Dugaan format umum: nama.depan@<domain-perusahaan> — belum diverifikasi, bukan alamat email aktual.',
    google_dorks: 'site:linkedin.com/in "PT Sukses Makmur" ("Owner" OR "Founder" OR "CEO" OR "Director" OR "Head of Sales" OR "Business Development Manager" OR "Head of Procurement" OR "IT Manager" OR "Finance Manager")',
  });
  assert.deepEqual(events.map((event) => [event.provider, event.result, event.reason]), [
    ['groq', 'fallback', 'rate_limit'],
    ['gemini', 'fallback', 'rate_limit'],
    ['openrouter', 'success', 'ok'],
  ]);
  assert.doesNotMatch(calls.join('\n'), /api\.deepseek\.com|api\.cohere\.ai/);
  assert.doesNotMatch(JSON.stringify(response), /example\.com|gmail\.com|unsafe query/);
});

test('Gemini response is parsed after Groq rate-limits without calling OpenRouter', async () => {
  const calls: string[] = [];
  const response = await profileProspectWithFallback('IT Manager', {
    environment: allKeys,
    fetchImpl: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('api.groq.com')) return new Response('{}', { status: 429 });
      if (url.includes('generativelanguage.googleapis.com')) return geminiResponse('IT Manager');
      throw new Error('unexpected provider call');
    },
  });
  assert.deepEqual(calls.map((url) => new URL(url).hostname), [
    'api.groq.com', 'generativelanguage.googleapis.com',
  ]);
  assert.match(calls[1]!, /models\/gemini-3\.8-flash:generateContent$/);
  assert.equal(response.target_roles, 'CTO / IT Manager');
});

test('Google Dorks stay deterministic, target public professional profiles, and avoid generic roles when a role is explicit', async () => {
  const response = await profileProspectWithFallback('IT Manager', {
    environment: { GROQ_API_KEY: 'test-groq' },
    fetchImpl: async () => openAiResponse('IT Manager'),
  });
  assert.equal(response.google_dorks, 'site:linkedin.com/in "IT Manager"');

  const sanitized = await profileProspectWithFallback('Acme" OR site:evil.test', {
    environment: { GROQ_API_KEY: 'test-groq' },
    fetchImpl: async () => openAiResponse(),
  });
  assert.match(sanitized.google_dorks, /^site:linkedin\.com\/in "Acme OR site:evil\.test" \(/);
  assert.doesNotMatch(sanitized.google_dorks, /" OR site:evil\.test/);
});

test('server error and timeout fallback advance only through the allowed order', async () => {
  const calls: string[] = [];
  const response = await profileProspectWithFallback('IT Manager', {
    environment: allKeys,
    perProviderTimeoutMs: 10,
    deadlineMs: 1_000,
    fetchImpl: async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('api.groq.com')) return new Response('{}', { status: 503 });
      if (url.includes('generativelanguage.googleapis.com')) {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
      }
      if (url.includes('openrouter.ai')) return openAiResponse('CTO, IT Manager');
      throw new Error('unexpected provider call');
    },
  });
  assert.deepEqual(calls.map((url) => new URL(url).hostname), [
    'api.groq.com', 'generativelanguage.googleapis.com', 'openrouter.ai',
  ]);
  assert.equal(response.target_roles, 'CTO / IT Manager');
});

test('auth errors stop the waterfall instead of silently switching providers', async () => {
  let calls = 0;
  await assert.rejects(profileProspectWithFallback('Perusahaan', {
    environment: allKeys,
    fetchImpl: async () => {
      calls += 1;
      return new Response('{}', { status: 401 });
    },
  }), (error: unknown) => error instanceof ProspectingFailure && error.kind === 'provider_rejected');
  assert.equal(calls, 1);
});

test('malformed JSON schema fails closed and is not forwarded or retried', async () => {
  let calls = 0;
  await assert.rejects(profileProspectWithFallback('PT Example', {
    environment: allKeys,
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"target_roles": ["CEO"]}' } }] }), { status: 200 });
    },
  }), (error: unknown) => error instanceof ProspectingFailure && error.kind === 'invalid_response');
  assert.equal(calls, 1);
});

test('all free providers rate-limited returns a generic unavailable failure and makes no paid-provider call', async () => {
  const calls: string[] = [];
  const events: Array<{ provider: string; result: string; reason: string }> = [];
  await assert.rejects(profileProspectWithFallback('Company', {
    environment: allKeys,
    fetchImpl: async (input) => {
      calls.push(String(input));
      return new Response('{}', { status: 429 });
    },
    log: (event) => events.push(event),
  }), (error: unknown) => error instanceof ProspectingFailure
    && error.kind === 'unavailable'
    && error.message === 'Prospecting providers are temporarily unavailable.');
  assert.deepEqual(calls.map((url) => new URL(url).hostname), [
    'api.groq.com', 'generativelanguage.googleapis.com', 'openrouter.ai',
  ]);
  assert.deepEqual(events.map(({ provider, result, reason }) => [provider, result, reason]), [
    ['groq', 'fallback', 'rate_limit'],
    ['gemini', 'fallback', 'rate_limit'],
    ['openrouter', 'fallback', 'rate_limit'],
  ]);
  assert.doesNotMatch(calls.join('\n'), /api\.deepseek\.com|api\.cohere\.ai/);
});

test('all provider network failures and 5xx responses produce a generic unavailable failure', async () => {
  const calls: string[] = [];
  const events: Array<{ provider: string; result: string; reason: string }> = [];
  await assert.rejects(profileProspectWithFallback('Company', {
    environment: allKeys,
    fetchImpl: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('api.groq.com')) throw new TypeError('secret upstream network detail');
      if (url.includes('generativelanguage.googleapis.com')) return new Response('{}', { status: 503 });
      if (url.includes('openrouter.ai')) throw new Error('secret router detail');
      throw new Error('unexpected provider call');
    },
    log: (event) => events.push(event),
  }), (error: unknown) => error instanceof ProspectingFailure
    && error.kind === 'unavailable'
    && error.message === 'Prospecting providers are temporarily unavailable.'
    && !error.message.includes('secret'));

  assert.deepEqual(calls.map((url) => new URL(url).hostname), [
    'api.groq.com', 'generativelanguage.googleapis.com', 'openrouter.ai',
  ]);
  assert.deepEqual(events.map(({ provider, result, reason }) => [provider, result, reason]), [
    ['groq', 'fallback', 'network_error'],
    ['gemini', 'fallback', 'server_error'],
    ['openrouter', 'fallback', 'network_error'],
  ]);
});

test('all configured free providers get a bounded timeout attempt before graceful failure', async () => {
  const calls: string[] = [];
  const events: Array<{ provider: string; result: string; reason: string }> = [];
  await assert.rejects(profileProspectWithFallback('Company', {
    environment: allKeys,
    deadlineMs: 300,
    perProviderTimeoutMs: 2_500,
    fetchImpl: async (input, init) => {
      calls.push(String(input));
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    },
    log: (event) => events.push(event),
  }), (error: unknown) => error instanceof ProspectingFailure && error.kind === 'unavailable');

  assert.deepEqual(calls.map((url) => new URL(url).hostname), [
    'api.groq.com', 'generativelanguage.googleapis.com', 'openrouter.ai',
  ]);
  assert.deepEqual(events.map(({ provider, result, reason }) => [provider, result, reason]), [
    ['groq', 'fallback', 'timeout'],
    ['gemini', 'fallback', 'timeout'],
    ['openrouter', 'fallback', 'timeout'],
  ]);
  assert.doesNotMatch(calls.join('\n'), /api\.deepseek\.com|api\.cohere\.ai/);
});

test('unsupported or paid model overrides fail closed before any provider request', async () => {
  const invalidOverrides = [
    ['GROQ_MODEL', 'meta-llama/llama-3.3-70b-versatile'],
    ['GEMINI_MODEL', 'gemini-4-argon'],
    ['OPENROUTER_MODEL', 'openai/gpt-4o'],
    ['OPENROUTER_MODEL', 'deepseek/deepseek-r1'],
  ] as const;

  for (const [modelEnv, model] of invalidOverrides) {
    let calls = 0;
    await assert.rejects(profileProspectWithFallback('Company', {
      environment: { ...allKeys, [modelEnv]: model },
      fetchImpl: async () => {
        calls += 1;
        return openAiResponse();
      },
    }), (error: unknown) => error instanceof ProspectingFailure
      && error.kind === 'provider_rejected'
      && !error.message.includes(model));
    assert.equal(calls, 0, `${modelEnv}=${model} must be rejected before any request`);
  }
});

test('legacy DeepSeek or Cohere keys alone never activate a provider; deadlines stay bounded', async () => {
  let calls = 0;
  await assert.rejects(profileProspectWithFallback('Manufaktur', {
    environment: { DEEPSEEK_API_KEY: 'legacy-not-used', COHERE_API_KEY: 'legacy-not-used' },
    fetchImpl: async () => { calls += 1; return openAiResponse(); },
  }), (error: unknown) => error instanceof ProspectingFailure && error.kind === 'unavailable');
  assert.equal(calls, 0);
  assert.equal(PROSPECTING_PROVIDER_TIMEOUT_MS, 2_500);
  assert.equal(PROSPECTING_TOTAL_DEADLINE_MS, 7_500);
});

test('non-retryable responses do not expose upstream details', async () => {
  await assert.rejects(profileProspectWithFallback('Company', {
    environment: allKeys,
    fetchImpl: async () => new Response('raw-secret-provider-response', { status: 400 }),
  }), (error: unknown) => error instanceof ProspectingFailure
    && error.kind === 'provider_rejected'
    && !error.message.includes('raw-secret-provider-response'));
});
