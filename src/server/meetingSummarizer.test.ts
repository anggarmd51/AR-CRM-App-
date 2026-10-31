import assert from 'node:assert/strict';
import test from 'node:test';
import type { GenerateContentParameters } from '@google/genai';
import { GEMINI_MODEL } from './aiModel.ts';
import { formatMeetingSummary, summarizeMeetingNotesLocally } from '../meetingSummary.ts';
import type { PinVerificationRequest } from './accountPinVerification.ts';
import {
  createGeminiMeetingSummaryGenerator,
  createMeetingSummarizerService,
  validateMeetingSummaryInput,
} from './meetingSummarizer.ts';
import { createMeetingSummarizerHttpHandler, type MeetingSummaryHttpRequest } from './meetingSummarizerHttp.ts';

const syntheticNotes = 'Pelanggan menyetujui demo pada hari Jumat. Tim sales mengirim proposal harga pada 30 Oktober.';
const validSummary = { summary: 'Demo disetujui untuk hari Jumat.', decisions: ['Menjalankan demo hari Jumat.'], action_items: ['Tim sales mengirim proposal harga pada 30 Oktober.'] };

function createResponse() {
  const headers = new Map<string, string>();
  let body = '';
  const response = {
    statusCode: 200,
    setHeader(name: string, value: string) { headers.set(name.toLowerCase(), value); return this; },
    end(value = '') { body = value; return this; },
  };
  return { response, headers, body: () => body };
}

function makeRequest(body: unknown = { notes: syntheticNotes }, overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer synthetic-token',
      origin: 'https://preview.example.test',
      host: 'preview.example.test',
      'x-forwarded-proto': 'https',
      'content-length': '120',
      ...(overrides.headers as Record<string, string> | undefined),
    },
    body,
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'headers')),
  } as unknown as MeetingSummaryHttpRequest;
}

test('meeting summary accepts only bounded notes and rejects extra CRM fields', () => {
  assert.deepEqual(validateMeetingSummaryInput({ notes: syntheticNotes }), { ok: true, value: { notes: syntheticNotes } });
  assert.equal(validateMeetingSummaryInput({ notes: '  ' }).ok, false);
  assert.equal(validateMeetingSummaryInput({ notes: 'x'.repeat(8_001) }).ok, false);
  assert.equal(validateMeetingSummaryInput({ notes: syntheticNotes, lead_id: 'crm-id' }).ok, false);
  assert.equal(validateMeetingSummaryInput(null).ok, false);
});

test('local fallback extracts only existing fragments and never calls a model', () => {
  assert.equal(summarizeMeetingNotesLocally('First fact. Second fact. Third fact. Fourth fact.'), 'First fact. Second fact. Third fact.');
  assert.equal(summarizeMeetingNotesLocally('  '), '');
  assert.equal(summarizeMeetingNotesLocally(''), '');
});

test('Gemini summary generator uses the shared model, no search grounding, and bounded output', async () => {
  let captured: GenerateContentParameters | undefined;
  const generator = createGeminiMeetingSummaryGenerator(async (request) => {
    captured = request;
    return { text: JSON.stringify(validSummary) };
  });
  const generated = await generator(syntheticNotes);
  assert.deepEqual(generated, validSummary);
  assert.equal(captured?.model, 'gemini-3.8-flash');
  assert.equal(captured?.model, GEMINI_MODEL);
  assert.equal(String(captured?.contents).includes(syntheticNotes), true);
  const config = captured?.config as Record<string, unknown>;
  assert.equal(config.maxOutputTokens, 800);
  assert.equal(config.responseMimeType, 'application/json');
  assert.equal('tools' in config, false, 'meeting notes are never sent through web search grounding');
});

test('summary service rejects malformed model output and hides provider details', async () => {
  const malformed = createMeetingSummarizerService({ generate: async () => ({ summary: '', decisions: [], action_items: [] }) });
  const rejected = await malformed({ notes: syntheticNotes });
  assert.equal(rejected.ok, false);
  const failing = createMeetingSummarizerService({ generate: async () => { throw new Error('vendor secret response'); } });
  const unavailable = await failing({ notes: syntheticNotes });
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) assert.equal(unavailable.error.includes('vendor secret'), false);
  const success = await createMeetingSummarizerService({ generate: async () => validSummary })({ notes: syntheticNotes });
  assert.equal(success.ok, true);
  if (success.ok) assert.equal(formatMeetingSummary(success.summary).includes('Tindak lanjut:'), true);
});

test('HTTP handler is default-off and does not initialize runtime or contact Gemini', async () => {
  let runtimeCalls = 0;
  let modelCalls = 0;
  const handler = createMeetingSummarizerHttpHandler({
    enabled: () => false,
    apiKeyAvailable: () => true,
    createRuntime: () => { runtimeCalls += 1; throw new Error('should not run'); },
    summarize: async () => { modelCalls += 1; return { ok: true, summary: validSummary }; },
  });
  const { response, body } = createResponse();
  await handler(makeRequest(), response as never);
  assert.equal(response.statusCode, 404);
  assert.equal(JSON.parse(body()).code, 'not_found');
  assert.equal(runtimeCalls, 0);
  assert.equal(modelCalls, 0);
});

test('HTTP handler validates method, content type, and input before creating a PIN runtime', async () => {
  let runtimeCalls = 0;
  const handler = createMeetingSummarizerHttpHandler({
    enabled: () => true,
    apiKeyAvailable: () => true,
    createRuntime: () => { runtimeCalls += 1; throw new Error('unexpected'); },
    summarize: async () => ({ ok: true, summary: validSummary }),
  });
  for (const request of [
    makeRequest(undefined, { method: 'GET' }),
    makeRequest(undefined, { headers: { 'content-type': 'text/plain' } }),
    makeRequest({ notes: 'x'.repeat(8_001) }),
  ]) {
    const { response } = createResponse();
    await handler(request, response as never);
    assert.notEqual(response.statusCode, 200);
  }
  assert.equal(runtimeCalls, 0);
});

test('HTTP handler requires an active owner PIN session before quota or Gemini', async () => {
  let quotaCalls = 0;
  let modelCalls = 0;
  const handler = createMeetingSummarizerHttpHandler({
    enabled: () => true,
    apiKeyAvailable: () => true,
    createRuntime: () => ({
      status: async (request: PinVerificationRequest) => {
        assert.equal(request.body, undefined);
        assert.equal(request.authorization, 'Bearer synthetic-token');
        return { statusCode: 403, body: { sessionActive: false }, headers: {} } as never;
      },
      reserveAiUsage: async () => { quotaCalls += 1; return true; },
    } as never),
    summarize: async () => { modelCalls += 1; return { ok: true, summary: validSummary }; },
  });
  const { response, body } = createResponse();
  await handler(makeRequest(), response as never);
  assert.equal(response.statusCode, 403);
  assert.equal(JSON.parse(body()).code, 'account_session_required');
  assert.equal(quotaCalls, 0);
  assert.equal(modelCalls, 0);
});

test('HTTP handler caps shared daily AI usage and returns no-store summaries on success', async () => {
  let quotaCalls = 0;
  let modelCalls = 0;
  const handler = createMeetingSummarizerHttpHandler({
    enabled: () => true,
    apiKeyAvailable: () => true,
    createRuntime: () => ({
      status: async () => ({ statusCode: 200, body: { sessionActive: true }, headers: {} }) as never,
      reserveAiUsage: async (limit: number) => { quotaCalls += 1; assert.equal(limit, 5); return true; },
    } as never),
    summarize: async (input) => { modelCalls += 1; assert.deepEqual(input, { notes: syntheticNotes }); return { ok: true, summary: validSummary }; },
  });
  const { response, headers, body } = createResponse();
  await handler(makeRequest(), response as never);
  assert.equal(response.statusCode, 200);
  assert.equal(headers.get('cache-control'), 'no-store, max-age=0');
  assert.deepEqual(JSON.parse(body()), { summary: validSummary });
  assert.equal(quotaCalls, 1);
  assert.equal(modelCalls, 1);
});
