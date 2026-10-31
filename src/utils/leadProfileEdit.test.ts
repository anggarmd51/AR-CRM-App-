import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LeadDetailModal } from '../components/LeadDetailModal.tsx';
import type { Lead, WonDealArchiveRecord } from '../types/crm.ts';
import { allowlistedMutation, type DurableMutation } from './offlineOutbox.ts';
import {
  assertLeadProfileEditAllowed,
  createLeadProfileEditorState,
  leadProfileEditorReducer,
  normalizeLeadProfileEdit,
  submitLeadProfileEdit,
  type LeadProfileEdit,
} from './leadProfileEdit.ts';

const originalProfile: LeadProfileEdit = {
  contact_person: 'Rina Putri',
  phone: '+62 812 0000 0000',
  deal_value: 25_000_000,
  lead_score: 'Warm',
};

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-001',
    company_name: 'PT Contoh Sejahtera',
    contact_person: originalProfile.contact_person,
    phone: originalProfile.phone,
    industry: 'Retail',
    city: 'Jakarta',
    pipeline_stage: 'Negotiation',
    deal_value: originalProfile.deal_value,
    next_followup_date: '2026-11-10',
    lead_score: originalProfile.lead_score,
    ...overrides,
  };
}

function matchingArchive(current: Lead): WonDealArchiveRecord {
  return {
    id: current.id,
    lead_id: current.id,
    company_name: current.company_name,
    contact_person: current.contact_person,
    phone: current.phone,
    industry: current.industry,
    city: current.city,
    deal_value: current.deal_value,
    won_date: '2026-10-31',
    archived_at: '2026-10-31T09:00:00.000Z',
  };
}

test('valid profile edits normalize text and preserve the numeric amount and score', () => {
  assert.deepEqual(normalizeLeadProfileEdit({
    contact_person: '  Budi Santoso  ',
    phone: ' 0812-3456-7890 ',
    deal_value: 0,
    lead_score: 'Hot',
  }), {
    contact_person: 'Budi Santoso',
    phone: '0812-3456-7890',
    deal_value: 0,
    lead_score: 'Hot',
  });
});

test('successful edit submits exactly the validated profile fields to a mock repository', async () => {
  const calls: Array<{ leadId: string; profile: LeadProfileEdit }> = [];
  const result = await submitLeadProfileEdit('lead-001', {
    contact_person: '  Budi Santoso ',
    phone: ' 0812-3456 ',
    deal_value: 18_000_000,
    lead_score: 'Hot',
    pipeline_stage: 'Closing Lost',
    next_followup_date: '2099-01-01',
  }, async (leadId, profile) => { calls.push({ leadId, profile }); });

  assert.deepEqual(result, {
    contact_person: 'Budi Santoso',
    phone: '0812-3456',
    deal_value: 18_000_000,
    lead_score: 'Hot',
  });
  assert.deepEqual(calls, [{ leadId: 'lead-001', profile: result }]);
});

test('invalid edit never reaches the mock repository', async () => {
  let called = false;
  await assert.rejects(
    submitLeadProfileEdit('lead-001', { ...originalProfile, deal_value: -10 }, async () => { called = true; }),
    (error: { code?: string }) => error.code === 'invalid-argument',
  );
  assert.equal(called, false);
});

test('invalid profile edits reject missing/overlong contact, non-text phone, negative/non-finite values, and unknown score', () => {
  for (const invalid of [
    { ...originalProfile, contact_person: '' },
    { ...originalProfile, contact_person: 123 as unknown as string },
    { ...originalProfile, contact_person: 'c'.repeat(201) },
    { ...originalProfile, phone: 812345678 as unknown as string },
    { ...originalProfile, phone: 'p'.repeat(201) },
    { ...originalProfile, deal_value: -1 },
    { ...originalProfile, deal_value: Number.NaN },
    { ...originalProfile, deal_value: Number.POSITIVE_INFINITY },
    { ...originalProfile, lead_score: 'Urgent' },
  ]) {
    assert.throws(() => normalizeLeadProfileEdit(invalid), (error: { code?: string }) => error.code === 'invalid-argument');
  }
});

test('cancel discards an unsaved draft and restores the current lead profile', () => {
  let state = createLeadProfileEditorState(originalProfile);
  state = leadProfileEditorReducer(state, { type: 'begin', profile: originalProfile });
  state = leadProfileEditorReducer(state, { type: 'change', field: 'contact_person', value: 'Unsaved contact' });
  state = leadProfileEditorReducer(state, { type: 'change', field: 'deal_value', value: 99_000_000 });
  const cancelled = leadProfileEditorReducer(state, { type: 'cancel', profile: originalProfile });

  assert.equal(cancelled.editing, false);
  assert.equal(cancelled.saving, false);
  assert.equal(cancelled.error, null);
  assert.deepEqual(cancelled.draft, originalProfile);
});

test('profile mutation payload is Rules-compatible and strips identity, stage, follow-up, and arbitrary fields', () => {
  const sanitized = allowlistedMutation({
    kind: 'update-lead-profile',
    payload: {
      lead_id: 'lead-001',
      contact_person: '  Budi  ',
      phone: ' 0812 ',
      deal_value: 12_500_000,
      lead_score: 'Cold',
      company_name: 'Injected company',
      industry: 'Injected industry',
      city: 'Injected city',
      pipeline_stage: 'Closing Lost',
      next_followup_date: '2099-01-01',
      ownerId: 'attacker',
      role: 'admin',
      created_at: 'client timestamp',
      updated_at: 'client timestamp',
      extra: true,
    },
  } as unknown as DurableMutation);

  assert.deepEqual(sanitized, {
    kind: 'update-lead-profile',
    payload: {
      lead_id: 'lead-001',
      contact_person: 'Budi',
      phone: '0812',
      deal_value: 12_500_000,
      lead_score: 'Cold',
    },
  });
  if (sanitized.kind !== 'update-lead-profile') assert.fail('Expected the profile edit mutation.');
  assert.deepEqual(Object.keys(sanitized.payload).sort(), ['contact_person', 'deal_value', 'lead_id', 'lead_score', 'phone']);
  assert.equal('pipeline_stage' in sanitized.payload, false);
  assert.equal('next_followup_date' in sanitized.payload, false);
});

test('Won score-only edit is allowed when its archive matches; snapshot-field edits are rejected', () => {
  const current = lead({ pipeline_stage: 'Closing Won' });
  const archive = matchingArchive(current);
  const scoreOnly = { ...originalProfile, lead_score: 'Hot' as const };

  assert.doesNotThrow(() => assertLeadProfileEditAllowed(current, archive, scoreOnly));
  for (const changed of [
    { ...scoreOnly, contact_person: 'Different contact' },
    { ...scoreOnly, phone: '+62 899 1111' },
    { ...scoreOnly, deal_value: 30_000_000 },
  ]) {
    assert.throws(
      () => assertLeadProfileEditAllowed(current, archive, changed),
      (error: { code?: string }) => error.code === 'failed-precondition',
    );
  }
});

test('Won/archive invariants fail closed for a missing or mismatched archive and for a non-Won lead with an archive', () => {
  const currentWon = lead({ pipeline_stage: 'Closing Won' });
  assert.throws(
    () => assertLeadProfileEditAllowed(currentWon, null, originalProfile),
    (error: { code?: string }) => error.code === 'failed-precondition',
  );
  assert.throws(
    () => assertLeadProfileEditAllowed(currentWon, { ...matchingArchive(currentWon), deal_value: 1 }, originalProfile),
    (error: { code?: string }) => error.code === 'failed-precondition',
  );
  assert.throws(
    () => assertLeadProfileEditAllowed(lead(), matchingArchive(lead()), originalProfile),
    (error: { code?: string }) => error.code === 'failed-precondition',
  );
});

test('lead detail exposes Edit/Save/Cancel workflow and makes Won pipeline controls immutable', () => {
  const commonProps = {
    isOpen: true,
    onClose: () => undefined,
    activities: [],
    onUpdateStage: () => undefined,
    onSaveProfile: async () => undefined,
    onOpenActivityLogger: () => undefined,
    onOpenWhatsApp: () => undefined,
  };
  const activeMarkup = renderToStaticMarkup(createElement(LeadDetailModal, { ...commonProps, lead: lead() }));
  assert.match(activeMarkup, />Edit<\/button>/);
  assert.match(activeMarkup, /aria-label="Sales profile"/);

  const wonMarkup = renderToStaticMarkup(createElement(LeadDetailModal, {
    ...commonProps,
    lead: lead({ pipeline_stage: 'Closing Won' }),
  }));
  assert.match(wonMarkup, /Won archives are immutable/);
  assert.match(wonMarkup, /disabled=""/);
});
