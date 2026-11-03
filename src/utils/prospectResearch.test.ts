import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLinkedInPeopleSearchUrl,
  buildProspectResearchPrompt,
  parseProspectResearchResponse,
  PROSPECT_RESEARCH_MODEL,
  researchProspectWithGemini,
} from './prospectResearch.ts';

test('LinkedIn search URL encodes company and job title as an HTTPS people-search intent', () => {
  assert.equal(
    buildLinkedInPeopleSearchUrl('PT Mentari & Co', 'Chief Executive Officer'),
    'https://www.linkedin.com/search/results/people/?keywords=PT%20Mentari%20%26%20Co%20Chief%20Executive%20Officer',
  );
  assert.throws(() => buildLinkedInPeopleSearchUrl(' ', 'CEO'), /wajib diisi/);
});

test('Gemini prompt carries only the company and industry fields, not notes or CRM records', () => {
  const prompt = buildProspectResearchPrompt(' Perusahaan Fiktif Mentari ', ' Simulasi ritel ');
  assert.deepEqual(JSON.parse(prompt), {
    companyName: 'Perusahaan Fiktif Mentari',
    industry: 'Simulasi ritel',
    task: 'Buat perkiraan jabatan pengambil keputusan yang mungkin relevan untuk riset B2B dan urutkan pola alamat email generik yang mungkin layak diuji. Jangan menyebut individu tertentu. Jawab dalam bahasa Indonesia.',
  });
  assert.throws(() => buildProspectResearchPrompt('', 'ritel'), /wajib diisi/);
});

test('research output maps allowlisted role and pattern IDs to generic labels only', () => {
  const result = parseProspectResearchResponse(JSON.stringify({
    roles: [
      { id: 'ceo', rationale: 'Nama Palsu terverifikasi, nama@perusahaan.test https://linkedin.com/in/palsu', confidence: 'medium' },
      { id: 'not-allowed', rationale: 'Do not display arbitrary values.', confidence: 'high' },
      { id: '__proto__', rationale: 'Do not display prototype properties.', confidence: 'high' },
      { id: 'constructor', rationale: 'Do not display constructor properties.', confidence: 'high' },
    ],
    emailPatterns: [
      { id: 'first-last', rationale: 'alamat@perusahaan.test terverifikasi dari https://sumber.test', confidence: 'high' },
      { id: 'not-allowed', rationale: 'Do not display an address.', confidence: 'medium' },
    ],
  }));
  assert.deepEqual(result.roles, [{
    id: 'ceo',
    title: 'CEO / Direktur Utama',
    confidence: 'medium',
  }]);
  assert.deepEqual(result.emailPatterns, [{
    id: 'first-last',
    pattern: '{nama}.{marga}@<domain-perusahaan>',
    confidence: 'low',
  }]);
  assert.doesNotMatch(JSON.stringify(result), /Nama Palsu|alamat@perusahaan\.test|linkedin\.com|terverifikasi|sumber\.test/);
  assert.ok(!JSON.stringify(result).includes('@example.com'));
});

test('research calls the injected generator only after invocation and gives it the selected model payload', async () => {
  let seenPrompt = '';
  let seenKey = '';
  const result = await researchProspectWithGemini('  user-key  ', 'Perusahaan Fiktif', 'Simulasi teknologi', async (key, prompt) => {
    seenKey = key;
    seenPrompt = prompt;
    return JSON.stringify({
      roles: [{ id: 'cto', rationale: 'Mungkin relevan untuk perusahaan teknologi.', confidence: 'low' }],
      emailPatterns: [],
    });
  });
  assert.equal(seenKey, 'user-key');
  assert.equal(JSON.parse(seenPrompt).companyName, 'Perusahaan Fiktif');
  assert.equal(PROSPECT_RESEARCH_MODEL, 'gemini-2.5-flash');
  assert.equal(result.roles[0]?.title, 'CTO / Direktur Teknologi');
});

test('research failures are reported without echoing keys or provider response details', async () => {
  await assert.rejects(
    researchProspectWithGemini('my-secret-key', 'Perusahaan Fiktif', 'Simulasi ritel', async () => {
      throw new Error('provider echoed my-secret-key');
    }),
    (error: unknown) => error instanceof Error
      && /Periksa kunci, kuota/.test(error.message)
      && !error.message.includes('my-secret-key'),
  );
  await assert.rejects(researchProspectWithGemini('', 'Perusahaan', 'ritel'), /kunci Gemini API/);
});
