import test from 'node:test';
import assert from 'node:assert';
import { searchAndEnrichProspects, ENRICHED_PROSPECT_DATABASE } from './aiLeadEnrichment.ts';

test('searchAndEnrichProspects returns curated leads when query is empty', () => {
  const results = searchAndEnrichProspects('');
  assert.ok(results.length > 0, 'Should return initial B2B prospects');
  assert.ok(results[0].company_name, 'Should have company name');
  assert.ok(results[0].decision_maker_title, 'Should have decision maker title');
});

test('searchAndEnrichProspects correctly filters "Medan" and "Manufaktur" queries', () => {
  const results = searchAndEnrichProspects('Manufaktur di Medan');
  assert.ok(results.length >= 3, 'Should find multiple Medan manufacturing prospects');
  const hasMedan = results.some((r) => r.city.toLowerCase().includes('medan'));
  assert.ok(hasMedan, 'Should include leads in Medan');
  
  const topResult = results[0];
  assert.ok(topResult.ai_match_score && topResult.ai_match_score >= 85, 'Should have high AI match score');
  assert.ok(topResult.email?.includes('@'), 'Should have verified direct corporate email');
  assert.ok(topResult.phone.startsWith('+628'), 'Should have verified Indonesian direct phone');
  assert.ok(topResult.company_initials, 'Should provide company monogram initials');
});

test('searchAndEnrichProspects dynamically synthesizes enriched leads for custom queries', () => {
  const results = searchAndEnrichProspects('Percetakan Kemasan di Bali');
  assert.ok(results.length > 0, 'Should return synthesized enriched leads');
  const topResult = results[0];
  assert.ok(topResult.city === 'Bali', 'Should detect Bali as city');
  assert.ok(topResult.decision_maker_title, 'Should synthesize decision maker title');
  assert.ok(topResult.estimated_value && topResult.estimated_value > 0, 'Should estimate deal value');
  assert.ok(topResult.is_ai_enriched, 'Should be flagged as AI enriched');
});
