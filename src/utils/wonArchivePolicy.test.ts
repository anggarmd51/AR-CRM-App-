import test from 'node:test';
import assert from 'node:assert/strict';
import { wonArchiveMatchesLeadSnapshot } from './wonArchivePolicy.ts';

const lead = {
  company_name: 'Synthetic Opportunity', contact_person: 'Synthetic Contact',
  phone: '+628111222333', industry: 'Synthetic', city: 'Synthetic City', deal_value: 5000000,
};
const archive = { ...lead, lead_id: 'synthetic-lead', ownerId: 'synthetic-owner', role: 'owner' };

test('a re-win can reuse only the same immutable first-win snapshot', () => {
  assert.equal(wonArchiveMatchesLeadSnapshot(archive, lead, 'synthetic-lead', 'synthetic-owner'), true);
  // Follow-up and score are not archived facts and may legitimately change.
  assert.equal(wonArchiveMatchesLeadSnapshot(archive, { ...lead, next_followup_date: '2026-11-01', lead_score: 'Hot' }, 'synthetic-lead', 'synthetic-owner'), true);
});

test('every archived fact and ownership binding must match before a re-win', () => {
  for (const field of ['company_name', 'contact_person', 'phone', 'industry', 'city', 'deal_value']) {
    const changed = { ...lead, [field]: field === 'deal_value' ? 6000000 : 'Changed synthetic value' };
    assert.equal(wonArchiveMatchesLeadSnapshot(archive, changed, 'synthetic-lead', 'synthetic-owner'), false, field);
  }
  assert.equal(wonArchiveMatchesLeadSnapshot(archive, lead, 'other-lead', 'synthetic-owner'), false);
  assert.equal(wonArchiveMatchesLeadSnapshot(archive, lead, 'synthetic-lead', 'other-owner'), false);
  assert.equal(wonArchiveMatchesLeadSnapshot({ ...archive, role: 'admin' }, lead, 'synthetic-lead', 'synthetic-owner'), false);
});
