import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import test from 'node:test';
import retiredLeadFinderHandler from '../../api/ai/lead-finder.ts';

const componentSource = readFileSync(new URL('../components/GlobalLeadsView.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const endpointSource = readFileSync(new URL('../../api/ai/lead-finder.ts', import.meta.url), 'utf8');
const localDirectorySource = readFileSync(new URL('../utils/localProspectDirectory.ts', import.meta.url), 'utf8');

test('active Lead Finder UI is local-only and has no Gemini, API, or operational CRM bridge', () => {
  assert.doesNotMatch(componentSource, /\bfetch\s*\(|\/api\/|GoogleGenAI|getFirebaseAuth|firebaseRepository|createLead\s*\(|onImportGlobalLead/i);
  assert.doesNotMatch(appSource, /aiSearchEnabled|onImportGlobalLead|pendingImportedCompanyNames|VITE_AI_LEAD_FINDER_ENABLED/);
  assert.match(appSource, /<GlobalLeadsView\s*\/>/);
  assert.match(componentSource, /Sampel fiktif/);
  assert.match(componentSource, /Perlu Verifikasi Manual/);
  assert.match(componentSource, /tidak disinkronkan ke Firebase atau CRM/);
  assert.doesNotMatch(localDirectorySource, /\bfetch\s*\(|\/api\/|GoogleGenAI|getFirebaseAuth|firebaseRepository|createLead\s*\(/i);
});

test('legacy external Lead Finder endpoint is inert and responds as retired', () => {
  assert.doesNotMatch(endpointSource, /GoogleGenAI|GEMINI_API_KEY|models\.generateContent|createGeminiLeadFinderGenerator|fetch\s*\(/i);
  const response = {
    statusCode: 0,
    headers: new Map<string, string>(),
    body: '',
    setHeader(name: string, value: string) { this.headers.set(name, value); return this; },
    end(body = '') { this.body = body; return this; },
  };
  retiredLeadFinderHandler({ method: 'POST' } as never, response as unknown as ServerResponse);
  assert.equal(response.statusCode, 410);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(JSON.parse(response.body), {
    code: 'lead_finder_retired',
    error: 'Pencarian eksternal telah dinonaktifkan. Gunakan Direktori Prospek Lokal.',
  });
});
