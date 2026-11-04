import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLinkedInPeopleSearchDeepLink,
  buildLinkedInPeopleSearchUrl,
  MAX_PROSPECT_QUERY_LENGTH,
  parseProspectResearchResponse,
  validateProspectQuery,
} from './prospectResearch.ts';

test('LinkedIn people search URL safely encodes a flexible query', () => {
  assert.equal(
    buildLinkedInPeopleSearchUrl(' PT Sukses & Makmur / IT Manager '),
    'https://www.linkedin.com/search/results/people/?keywords=PT%20Sukses%20%26%20Makmur%20%2F%20IT%20Manager',
  );
  assert.throws(() => buildLinkedInPeopleSearchUrl('  '), /kata pencarian/i);
});

test('LinkedIn native deep link uses the linkedin scheme and safely encodes keywords', () => {
  assert.equal(
    buildLinkedInPeopleSearchDeepLink('PT Sukses & Makmur IT'),
    'linkedin://search/results/people/?keywords=PT%20Sukses%20%26%20Makmur%20IT',
  );
  assert.throws(() => buildLinkedInPeopleSearchDeepLink('  '), /kata pencarian/i);
});

test('flexible prospect query is trimmed and length-limited', () => {
  assert.equal(validateProspectQuery('  Manufaktur  '), 'Manufaktur');
  assert.throws(() => validateProspectQuery(''), /kata pencarian/i);
  assert.throws(() => validateProspectQuery('x'.repeat(MAX_PROSPECT_QUERY_LENGTH + 1)), /maksimal/i);
  assert.throws(() => validateProspectQuery({ query: 'x' }), /kata pencarian/i);
});

test('result validation accepts exactly the three required string fields', () => {
  const result = parseProspectResearchResponse(JSON.stringify({
    target_roles: 'Owner, CEO, Procurement Manager',
    email_pattern: 'nama.depan@<domain-perusahaan>',
    google_dorks: 'site:linkedin.com/in "PT Sukses Makmur"',
  }));
  assert.deepEqual(result, {
    target_roles: 'Owner, CEO, Procurement Manager',
    email_pattern: 'nama.depan@<domain-perusahaan>',
    google_dorks: 'site:linkedin.com/in "PT Sukses Makmur"',
  });
});

test('result validation rejects malformed JSON, missing fields, extra fields, and non-string fields', () => {
  assert.throws(() => parseProspectResearchResponse('{broken'), /tidak valid/i);
  assert.throws(() => parseProspectResearchResponse({ target_roles: 'CEO' }), /skema/i);
  assert.throws(() => parseProspectResearchResponse({
    target_roles: 'CEO', email_pattern: 'x', google_dorks: 'x', extra: true,
  }), /skema/i);
  assert.throws(() => parseProspectResearchResponse({
    target_roles: ['CEO'], email_pattern: 'x', google_dorks: 'x',
  }), /skema/i);
});
