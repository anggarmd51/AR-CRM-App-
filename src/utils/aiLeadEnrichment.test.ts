import test from 'node:test';
import assert from 'node:assert/strict';
import { searchAndEnrichProspects, ENRICHED_PROSPECT_DATABASE } from './aiLeadEnrichment.ts';

test('prospect discovery returns no records until a verified source is configured', () => {
  assert.deepEqual(ENRICHED_PROSPECT_DATABASE, []);
  assert.deepEqual(searchAndEnrichProspects(''), []);
  assert.deepEqual(searchAndEnrichProspects('Manufaktur di Medan'), []);
  assert.deepEqual(searchAndEnrichProspects('Percetakan Kemasan di Bali'), []);
});
