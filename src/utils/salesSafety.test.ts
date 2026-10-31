import test from 'node:test';
import assert from 'node:assert/strict';
import { allowlistedMutation, type DurableMutation } from './offlineOutbox.ts';
import { canTransitionFromAuthoritativeStage, normalizeCreateLeadPayload } from './salesSafety.ts';
import type { PipelineStage } from '../types/crm.ts';

const basePayload = {
  company_name: '  Synthetic Company  ',
  contact_person: '  Synthetic Contact  ',
  phone: ' 000 ',
  industry: '  Test  ',
  city: '  Jakarta  ',
  pipeline_stage: 'Prospect' as PipelineStage,
  deal_value: 0,
  next_followup_date: '',
  lead_score: 'Unrated' as const,
};

function createMutation(overrides: Partial<typeof basePayload> = {}): DurableMutation {
  return { kind: 'create-lead', payload: { ...basePayload, ...overrides } };
}

test('initial Won rejects before a create-lead mutation can enter the queue', () => {
  assert.throws(
    () => allowlistedMutation(createMutation({ pipeline_stage: 'Closing Won' })),
    /tidak dapat dibuat langsung sebagai Closing Won/,
  );
  assert.throws(
    () => normalizeCreateLeadPayload({ ...basePayload, pipeline_stage: 'Closing Won' }),
    (error: { code?: string }) => error.code === 'invalid-argument',
  );
});

test('create-lead text boundaries accept 200/120 and reject 201/121', () => {
  const accepted = allowlistedMutation(createMutation({
    company_name: 'c'.repeat(200),
    contact_person: 'p'.repeat(200),
    industry: 'i'.repeat(120),
    city: 'k'.repeat(120),
  }));
  assert.equal(accepted.kind, 'create-lead');
  if (accepted.kind === 'create-lead') {
    assert.equal(accepted.payload.company_name.length, 200);
    assert.equal(accepted.payload.contact_person.length, 200);
    assert.equal(accepted.payload.industry.length, 120);
    assert.equal(accepted.payload.city.length, 120);
  }
  for (const [field, value] of [
    ['company_name', 'c'.repeat(201)],
    ['contact_person', 'p'.repeat(201)],
    ['industry', 'i'.repeat(121)],
    ['city', 'k'.repeat(121)],
  ] as const) {
    assert.throws(() => allowlistedMutation(createMutation({ [field]: value })), /at most/);
  }
});

test('create-lead normalization trims fields before durable validation', () => {
  const normalized = normalizeCreateLeadPayload(basePayload);
  assert.deepEqual(normalized, {
    ...basePayload,
    company_name: 'Synthetic Company',
    contact_person: 'Synthetic Contact',
    phone: '000',
    industry: 'Test',
    city: 'Jakarta',
  });
});

test('authoritative Closing Won blocks stale backward replay but preserves same-Won and next-stage behavior', () => {
  assert.equal(canTransitionFromAuthoritativeStage('Closing Won', 'Negotiation'), false);
  assert.equal(canTransitionFromAuthoritativeStage('Closing Won', 'Prospect'), false);
  assert.equal(canTransitionFromAuthoritativeStage('Closing Won', 'Closing Won'), true);
  assert.equal(canTransitionFromAuthoritativeStage('Closing Won', 'Closing Lost'), true);
  assert.equal(canTransitionFromAuthoritativeStage('Negotiation', 'Meeting'), true);
  assert.equal(canTransitionFromAuthoritativeStage('Meeting', 'Negotiation'), true);
});
