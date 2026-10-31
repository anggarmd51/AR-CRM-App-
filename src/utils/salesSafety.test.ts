import test from 'node:test';
import assert from 'node:assert/strict';
import { allowlistedMutation, type DurableMutation } from './offlineOutbox.ts';
import { assertSafeInitialLeadStage, canTransitionFromAuthoritativeStage, normalizeCreateLeadPayload } from './salesSafety.ts';
import { PIPELINE_STAGES, type Lead, type PipelineStage } from '../types/crm.ts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PipelineKanbanView } from '../components/PipelineKanbanView.tsx';

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

test('new initial Won rejects before enqueue and unsafe legacy replay fails closed', () => {
  assert.throws(
    () => assertSafeInitialLeadStage('Closing Won', 'failed-precondition'),
    (error: { code?: string }) => error.code === 'failed-precondition',
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
    assert.throws(() => normalizeCreateLeadPayload({ ...basePayload, [field]: value }), /at most/);
    assert.throws(() => allowlistedMutation(createMutation({ [field]: value })), /local validation/);
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

test('authoritative Closing Won rejects every other stage including Closing Lost', () => {
  for (const requested of PIPELINE_STAGES) {
    assert.equal(canTransitionFromAuthoritativeStage('Closing Won', requested), requested === 'Closing Won', requested);
  }
});

test('non-Won transitions retain their previous eligibility', () => {
  for (const current of PIPELINE_STAGES.filter((stage) => stage !== 'Closing Won')) {
    for (const requested of PIPELINE_STAGES) {
      assert.equal(canTransitionFromAuthoritativeStage(current, requested), true, `${current} -> ${requested}`);
    }
  }
});

test('Won card UI is final and offers neither backward nor forward movement', () => {
  const lead: Lead = { id: 'synthetic-won', ...basePayload, pipeline_stage: 'Closing Won' };
  const markup = renderToStaticMarkup(createElement(PipelineKanbanView, {
    leads: [lead],
    onUpdateLeadStage: () => undefined,
    onSelectLead: () => undefined,
    onOpenQuickLead: () => undefined,
    onOpenWhatsApp: () => undefined,
  }));
  const finalButton = Array.from(markup.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g))
    .map(([button]) => button).find((button) => button.includes('Won final'));
  assert.ok(finalButton);
  assert.match(finalButton, /\bdisabled=""/);
  assert.doesNotMatch(markup, /title="(?:Advance to|Move back to) /);
});
