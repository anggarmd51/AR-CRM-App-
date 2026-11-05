import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGoogleSearchUrl,
  buildGoogleDorksFromEntities,
  buildFallbackGoogleDorks,
  buildLinkedInPeopleSearchUrl,
  MAX_PROSPECT_QUERY_LENGTH,
  parseProspectResearchResponse,
  validateProspectQuery,
} from './prospectResearch.ts';

test('LinkedIn people search URL uses HTTPS and safely encodes a flexible query', () => {
  assert.equal(
    buildLinkedInPeopleSearchUrl(' PT Sukses & Makmur / IT Manager '),
    'https://www.linkedin.com/search/results/people/?keywords=PT%20Sukses%20%26%20Makmur%20%2F%20IT%20Manager',
  );
  assert.throws(() => buildLinkedInPeopleSearchUrl('  '), /kata pencarian/i);
});

test('Google Search URL encodes the full dork query and rejects an empty query', () => {
  assert.equal(
    buildGoogleSearchUrl('site:linkedin.com/in "PT Sukses & Makmur" (CEO OR Founder)'),
    'https://www.google.com/search?q=site%3Alinkedin.com%2Fin%20%22PT%20Sukses%20%26%20Makmur%22%20(CEO%20OR%20Founder)',
  );
  assert.throws(() => buildGoogleSearchUrl('  '), /dorks/i);
});

test('structured entities become modular role, company/industry, and city clauses', () => {
  assert.equal(buildGoogleDorksFromEntities({
    target_role: 'Sales Manager',
    alt_roles: ['Business Development Manager'],
    company_or_industry: 'PT Sukses Makmur',
    city: 'Jakarta',
  }), 'site:linkedin.com/in ("Sales Manager" OR "Business Development Manager") ("PT Sukses Makmur") "Jakarta"');
});

test('structured Dorks omit missing fields and sanitize quotes and Google operators', () => {
  assert.equal(buildGoogleDorksFromEntities({
    target_role: '', alt_roles: [], company_or_industry: 'B2B SaaS', city: '',
  }), 'site:linkedin.com/in ("B2B SaaS")');
  assert.equal(buildGoogleDorksFromEntities({
    target_role: 'CEO" OR site:evil.test',
    alt_roles: ['Founder) OR inurl:evil.test'],
    company_or_industry: 'Acme " OR site:evil.test',
    city: 'Jakarta',
  }), 'site:linkedin.com/in ("CEO" OR "Founder") ("Acme") "Jakarta"');
  assert.equal(buildGoogleDorksFromEntities({}), 'site:linkedin.com/in');
});

test('instant no-AI fallback splits whitespace and commas into separate quoted terms', () => {
  assert.equal(
    buildFallbackGoogleDorks('Sales Manager, Jakarta, PT Sukses'),
    'site:linkedin.com/in "Sales" "Manager" "Jakarta" "PT" "Sukses"',
  );
  assert.equal(buildFallbackGoogleDorks('CEO OR site:evil.test'), 'site:linkedin.com/in "CEO"');
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
