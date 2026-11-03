import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const componentSource = readFileSync(new URL('../components/GlobalLeadsView.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const researchSource = readFileSync(new URL('../utils/prospectResearch.ts', import.meta.url), 'utf8');
const legacyDirectorySource = readFileSync(new URL('../utils/localProspectDirectory.ts', import.meta.url), 'utf8');
const engineSource = readFileSync(new URL('./prospecting.ts', import.meta.url), 'utf8');
const routeSource = readFileSync(new URL('../../api/ai/prospecting.ts', import.meta.url), 'utf8');
const retiredRouteUrl = new URL('../../api/ai/lead-finder.ts', import.meta.url);

test('prospecting UI uses backend AI without browser API keys and keeps LinkedIn client-side', () => {
  assert.match(componentSource, /fetch\('\/api\/ai\/prospecting'/);
  assert.doesNotMatch(componentSource, /geminiApiKey|prospect-gemini-api-key|Tempel kunci/i);
  assert.doesNotMatch(componentSource, /Sampel fiktif|Data demo|storageWarning/i);
  assert.match(componentSource, /Riset Profil via AI/);
  assert.match(componentSource, /Cari di LinkedIn/);
  assert.match(componentSource, /target="_blank"/);
  assert.match(componentSource, /rel="noopener noreferrer"/);
  assert.match(componentSource, /Simpan ke Pipeline/);
  assert.match(componentSource, /onSaveToPipeline/);
  assert.match(componentSource, /Unduh salinan lokal lama/);
  assert.match(researchSource, /encodeURIComponent\(query\)/);
  assert.doesNotMatch(researchSource, /GoogleGenAI|apiKey|GEMINI_API_KEY/i);
  assert.match(legacyDirectorySource, /readExistingLocalProspectBackup/);
  assert.doesNotMatch(legacyDirectorySource, /SAMPLE_PROSPECTS|setItem\(|removeItem\(/);
  assert.match(appSource, /onSaveToPipeline=\{openQuickLeadFromProspect\}/);
});

test('server-side waterfall uses required order and strict output schema behind fail-closed gates', () => {
  assert.match(engineSource, /\['groq', 'deepseek', 'gemini', 'openrouter', 'cohere'\]/);
  assert.match(engineSource, /PROSPECTING_PROVIDER_TIMEOUT_MS = 2_500/);
  assert.match(engineSource, /PROSPECTING_TOTAL_DEADLINE_MS = 7_500/);
  assert.match(engineSource, /AbortController/);
  assert.match(routeSource, /PROSPECTING_AI_ENABLED/);
  assert.match(routeSource, /PROSPECTING_AI_COST_AND_DATA_REVIEWED/);
  assert.match(routeSource, /PROSPECTING_AI_ENABLED === 'true'/);
  assert.equal(existsSync(retiredRouteUrl), false);
});
