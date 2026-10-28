import assert from 'node:assert/strict';
import test from 'node:test';
import type { GenerateContentParameters } from '@google/genai';
import { GEMINI_MODEL } from './aiModel.ts';
import {
  normalizeLeadFinderSources,
  parseLeadFinderSuggestions,
  validateLeadFinderInput,
} from '../leadFinderAi.ts';
import { createLeadFinderService, createGeminiLeadFinderGenerator } from './leadFinderService.ts';

const validInput = { industry: 'kontraktor gedung', city: 'Bandung', customerProfile: 'perusahaan skala menengah' };
const validText = JSON.stringify({ leads: [
  { company_name: 'Contoh Konstruksi Nusantara', industry: 'Konstruksi', city: 'Bandung', reason: 'Sumber menyebut proyek bangunan komersial di Bandung.', fit_score: 87 },
] });
const validSources = [{ title: 'Contoh sumber', url: 'https://example.org/business' }];

test('Lead Finder accepts bounded business criteria but rejects contact details and unexpected fields', () => {
  assert.deepEqual(validateLeadFinderInput(validInput), { ok: true, value: validInput });
  assert.equal(validateLeadFinderInput({ industry: 'Retail', city: 'Jakarta', phone: '081234567890' }).ok, false);
  assert.equal(validateLeadFinderInput({ industry: 'Retail', city: 'Jakarta', customerProfile: 'contact me x@example.org' }).ok, false);
  assert.equal(validateLeadFinderInput({ industry: '  ', city: 'Jakarta' }).ok, false);
  assert.equal(validateLeadFinderInput({ industry: 'x'.repeat(121), city: 'Jakarta' }).ok, false);
});

test('AI result parsing accepts only safe bounded lead fields and caps results to five', () => {
  const leads = Array.from({ length: 7 }, (_, index) => ({
    company_name: `Company ${index}`,
    industry: 'Construction',
    city: 'Bandung',
    reason: 'Ada bukti relevan dalam hasil pencarian publik.',
    fit_score: index === 0 ? 140 : 70,
    phone: '081234567890',
  }));
  const parsed = parseLeadFinderSuggestions(JSON.stringify({ leads }));
  assert.equal(parsed.length, 5);
  assert.equal(parsed[0]?.fit_score, 100);
  assert.equal('phone' in parsed[0]!, false);
});

test('AI result parsing ignores malformed, duplicate, and unsafe suggestions', () => {
  const parsed = parseLeadFinderSuggestions(`\n\`\`\`json\n${JSON.stringify({ leads: [
    { company_name: 'Ada PT', industry: 'Retail', city: 'Bandung', reason: 'Bukti lokal tersedia.', fit_score: 80 },
    { company_name: 'ada pt', industry: 'Retail', city: 'Bandung', reason: 'Duplikat.', fit_score: 75 },
    { company_name: 'Unsafe', industry: 'Retail', city: 'Bandung', reason: 'Call 081234567890.', fit_score: 50 },
    { company_name: 'Missing score', industry: 'Retail', city: 'Bandung', reason: 'Ada bukti.' },
  ]})}\n\`\`\``);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.company_name, 'Ada PT');
  assert.deepEqual(parseLeadFinderSuggestions('not json'), []);
});

test('grounding sources allow only unique HTTPS citations', () => {
  assert.deepEqual(normalizeLeadFinderSources([
    { title: 'Source', url: 'https://example.org/path#section' },
    { title: 'Duplicate', url: 'https://example.org/path' },
    { title: 'Insecure', url: 'http://example.net' },
    { title: 'Credentials', url: 'https://user:pass@example.com' },
    { title: 'Local', url: 'https://localhost/internal' },
    { title: 'Private IP', url: 'https://192.168.1.1/internal' },
  ]), [{ title: 'Source', url: 'https://example.org/path' }]);
});

test('service rejects invalid input without calling Gemini', async () => {
  let calls = 0;
  const service = createLeadFinderService({ generate: async () => { calls += 1; return { text: validText, sources: validSources }; } });
  const result = await service({ industry: 'Retail', city: 'Bandung', email: 'x@example.org' });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 400);
  assert.equal(calls, 0);
});

test('service returns validated suggestions and requires real grounding source metadata', async () => {
  const service = createLeadFinderService({ generate: async () => ({ text: validText, sources: validSources }) });
  const result = await service(validInput);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.response.leads.length, 1);
    assert.equal(result.response.sources.length, 1);
  }
  const ungrounded = createLeadFinderService({ generate: async () => ({ text: validText, sources: [] }) });
  const noSources = await ungrounded(validInput);
  assert.equal(noSources.ok, false);
  if (!noSources.ok) assert.equal(noSources.code, 'grounded_results_unavailable');
});

test('service returns a generic failure and does not expose provider error details', async () => {
  const service = createLeadFinderService({ generate: async () => { throw new Error('secret or vendor response'); } });
  const result = await service(validInput);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'ai_unavailable');
    assert.equal(result.error.includes('secret'), false);
  }
});

test('Gemini generator sends only business criteria with bounded generation settings', async () => {
  let captured: GenerateContentParameters | undefined;
  const generator = createGeminiLeadFinderGenerator(async (request) => {
    captured = request;
    return { text: validText, candidates: [{ groundingMetadata: { groundingChunks: [{ web: { title: 'Source', uri: 'https://example.org' } }] } }] };
  });
  const generated = await generator(validInput);
  assert.equal(generated.text, validText);
  assert.deepEqual(generated.sources, [{ title: 'Source', url: 'https://example.org' }]);
  assert.equal(captured?.model, GEMINI_MODEL);
  assert.equal(captured?.model, 'gemini-3.8-flash');
  assert.equal(String(captured?.contents).includes('081'), false);
  const config = captured?.config as Record<string, unknown>;
  assert.equal(config.maxOutputTokens, 900);
  assert.ok(Array.isArray(config.tools));
});
