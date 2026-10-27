import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { env } from 'node:process';
import handler from '../../api/cron/export-firestore-to-sheets.ts';

function mockResponse() {
  const response = {
    statusCode: 200,
    headers: new Map<string, string>(),
    body: '',
    setHeader(name: string, value: string) { this.headers.set(name.toLowerCase(), value); return this; },
    end(value?: string) { this.body = value ?? ''; return this; },
  };
  return response;
}

function request(method: string, authorization?: string) {
  return { method, headers: authorization ? { authorization } : {} } as IncomingMessage;
}

function overrideVercelEnvironment(value: string): () => void {
  const original = env.VERCEL_ENV;
  env.VERCEL_ENV = value;
  return () => {
    if (original === undefined) delete env.VERCEL_ENV;
    else env.VERCEL_ENV = original;
  };
}

test('Preview cannot run the production-bound export route, even with cron credentials', async () => {
  const restoreVercelEnvironment = overrideVercelEnvironment('preview');
  const originalSecret = env.CRON_SECRET;
  env.CRON_SECRET = 'z'.repeat(40);
  try {
    const response = mockResponse();
    await handler(request('GET', `Bearer ${env.CRON_SECRET}`) as any, response as unknown as ServerResponse);
    assert.equal(response.statusCode, 404);
    assert.equal(JSON.parse(response.body).error, 'Not found.');
  } finally {
    if (originalSecret === undefined) delete env.CRON_SECRET;
    else env.CRON_SECRET = originalSecret;
    restoreVercelEnvironment();
  }
});

test('route permits GET only and never reads request-selected export targets', async () => {
  const restoreVercelEnvironment = overrideVercelEnvironment('production');
  const originalSecret = env.CRON_SECRET;
  delete env.CRON_SECRET;
  try {
    const response = mockResponse();
    await handler(request('POST') as any, response as unknown as ServerResponse);
    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.get('allow'), 'GET');
  } finally {
    if (originalSecret === undefined) delete env.CRON_SECRET;
    else env.CRON_SECRET = originalSecret;
    restoreVercelEnvironment();
  }
});

test('route fails closed when CRON_SECRET is not configured', async () => {
  const restoreVercelEnvironment = overrideVercelEnvironment('production');
  const originalSecret = env.CRON_SECRET;
  delete env.CRON_SECRET;
  try {
    const response = mockResponse();
    await handler(request('GET') as any, response as unknown as ServerResponse);
    assert.equal(response.statusCode, 503);
    assert.equal(JSON.parse(response.body).error, 'Firestore export is not configured.');
  } finally {
    if (originalSecret === undefined) delete env.CRON_SECRET;
    else env.CRON_SECRET = originalSecret;
    restoreVercelEnvironment();
  }
});

test('route rejects requests without the matching bearer secret before loading provider config', async () => {
  const restoreVercelEnvironment = overrideVercelEnvironment('production');
  const originalSecret = env.CRON_SECRET;
  env.CRON_SECRET = 'z'.repeat(40);
  try {
    const response = mockResponse();
    await handler(request('GET', 'Bearer wrong') as any, response as unknown as ServerResponse);
    assert.equal(response.statusCode, 401);
  } finally {
    if (originalSecret === undefined) delete env.CRON_SECRET;
    else env.CRON_SECRET = originalSecret;
    restoreVercelEnvironment();
  }
});
