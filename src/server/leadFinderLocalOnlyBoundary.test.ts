import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const componentSource = readFileSync(new URL('../components/GlobalLeadsView.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const researchSource = readFileSync(new URL('../utils/prospectResearch.ts', import.meta.url), 'utf8');
const localDirectorySource = readFileSync(new URL('../utils/localProspectDirectory.ts', import.meta.url), 'utf8');
const retiredRouteUrl = new URL('../../api/ai/lead-finder.ts', import.meta.url);

test('prospect research is client-side, requires explicit consent, and has no operational CRM bridge', () => {
  assert.doesNotMatch(componentSource, /\bfetch\s*\(|\/api\/|getFirebaseAuth|firebaseRepository|createLead\s*\(|onImportGlobalLead/i);
  assert.match(componentSource, /researchProspectWithGemini/);
  assert.match(componentSource, /geminiConsent/);
  assert.match(componentSource, /Riset di LinkedIn/);
  assert.match(componentSource, /noopener noreferrer/);
  assert.match(appSource, /<GlobalLeadsView\s*\/>/);
  assert.match(componentSource, /Sampel fiktif/);
  assert.match(componentSource, /Perlu Verifikasi Manual/);
  assert.match(componentSource, /tidak disinkronkan ke Firebase atau CRM/);
  assert.match(researchSource, /new GoogleGenAI\(\{ apiKey \}\)/);
  assert.match(researchSource, /gemini-2\.5-flash/);
  assert.match(researchSource, /Jangan mengarang nama orang, alamat email nyata/);
  assert.doesNotMatch(localDirectorySource, /\bfetch\s*\(|\/api\/|GoogleGenAI|getFirebaseAuth|firebaseRepository|createLead\s*\(/i);
});

test('the retired Vercel prospect AI route is absent', () => {
  assert.equal(existsSync(retiredRouteUrl), false);
});
