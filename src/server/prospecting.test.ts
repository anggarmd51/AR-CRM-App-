import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROSPECTING_PROVIDER_ORDER,
  PROSPECTING_PROVIDER_TIMEOUT_MS,
  PROSPECTING_TOTAL_DEADLINE_MS,
  ProspectingFailure,
  profileProspectWithFallback,
} from './prospecting.ts';

const allKeys = {
  GROQ_API_KEY: 'test-groq',
  DEEPSEEK_API_KEY: 'test-deepseek',
  GEMINI_API_KEY: 'test-gemini',
  OPENROUTER_API_KEY: 'test-openrouter',
  COHERE_API_KEY: 'test-cohere',
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

test('waterfall falls from Groq 429 to DeepSeek and immediately returns validated JSON', async () => {
  const calls: string[] = [];
  const events: Array<{ provider: string; result: string; reason: string }> = [];
  const response = await profileProspectWithFallback(' PT Sukses Makmur ', {
    environment: allKeys,
    fetchImpl: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('api.groq.com')) return new Response('{}', { status: 429 });
      if (url.includes('api.deepseek.com')) return openAiResponse();
      throw new Error('unexpected provider call');
    },
    log: (event) => events.push(event),
  });
  assert.deepEqual(calls, [
    'https://api.groq.com/openai/v1/chat/completions',
    'https://api.deepseek.com/chat/completions',
  ]);
  assert.deepEqual(response, {
    target_roles: 'Owner / Founder, CEO / Direktur Utama, Head of Procurement',
    email_pattern: 'Dugaan format umum: nama.depan@<domain-perusahaan> — belum diverifikasi, bukan alamat email aktual.',
    google_dorks: 'site:linkedin.com/in "PT Sukses Makmur"',
  });
  assert.deepEqual(events.map((event) => [event.provider, event.result, event.reason]), [
    ['groq', 'fallback', 'rate_limit'],
    ['deepseek', 'success', 'ok'],
  ]);
  assert.doesNotMatch(JSON.stringify(response), /example\.com|gmail\.com|unsafe query/);
});

test('server error and timeout advance in declared provider order without retrying a provider', async () => {
  const calls: string[] = [];
  const response = await profileProspectWithFallback('IT Manager', {
    environment: allKeys,
    perProviderTimeoutMs: 10,
    deadlineMs: 1_000,
    fetchImpl: async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('api.groq.com')) return new Response('{}', { status: 503 });
      if (url.includes('api.deepseek.com')) {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
      }
      if (url.includes('generativelanguage.googleapis.com')) {
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ target_roles: 'CTO, IT Manager', email_pattern: 'x', google_dorks: 'x' }) }] } }],
        }), { status: 200 });
      }
      throw new Error('unexpected provider call');
    },
  });
  assert.equal(calls.length, 3);
  assert.ok(calls[0]!.includes('api.groq.com'));
  assert.ok(calls[1]!.includes('api.deepseek.com'));
  assert.ok(calls[2]!.includes('generativelanguage.googleapis.com'));
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

test('missing keys never trigger external fetch', async () => {
  let calls = 0;
  await assert.rejects(profileProspectWithFallback('Manufaktur', {
    environment: {},
    fetchImpl: async () => { calls += 1; return openAiResponse(); },
  }), (error: unknown) => error instanceof ProspectingFailure && error.kind === 'unavailable');
  assert.equal(calls, 0);
  assert.deepEqual(PROSPECTING_PROVIDER_ORDER, ['groq', 'deepseek', 'gemini', 'openrouter', 'cohere']);
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
