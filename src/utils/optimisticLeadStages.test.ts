import assert from 'node:assert/strict';
import test from 'node:test';
import type { Lead } from '../types/crm.ts';
import { OptimisticLeadStageOverlay } from './optimisticLeadStages.ts';

const baseLead: Lead = {
  id: 'synthetic-lead',
  company_name: 'Contoh Nusantara',
  contact_person: 'Kontak Uji',
  phone: '',
  industry: 'Konstruksi',
  city: 'Bandung',
  pipeline_stage: 'Prospect',
  deal_value: 0,
  next_followup_date: '',
  lead_score: 'Unrated',
  _syncStatus: 'synced',
};

test('stale snapshots cannot overwrite an optimistic stage before server acknowledgement', () => {
  const overlay = new OptimisticLeadStageOverlay();
  overlay.apply(baseLead.id, 'operation-a', 'Negotiation', '2026-11-02');
  const rendered = overlay.reconcile([baseLead])[0]!;
  assert.equal(rendered.pipeline_stage, 'Negotiation');
  assert.equal(rendered.next_followup_date, '2026-11-02');
  assert.equal(rendered._syncStatus, 'pending_update');

  overlay.acknowledge(baseLead.id, 'operation-a');
  const acknowledgedOverlay = overlay.reconcile([baseLead])[0]!;
  assert.equal(acknowledgedOverlay.pipeline_stage, 'Negotiation');
  assert.equal(acknowledgedOverlay._syncStatus, 'synced');
  const confirmed = { ...baseLead, pipeline_stage: 'Negotiation' as const, next_followup_date: '2026-11-02' };
  assert.equal(overlay.reconcile([confirmed])[0], confirmed);
});

test('latest of successive stage intents wins and is reverted to the latest server snapshot on failure', () => {
  const overlay = new OptimisticLeadStageOverlay();
  overlay.apply(baseLead.id, 'operation-a', 'Meeting');
  overlay.apply(baseLead.id, 'operation-b', 'Closing Won', '2026-11-05');
  assert.equal(overlay.reconcile([baseLead])[0]?.pipeline_stage, 'Closing Won');

  overlay.acknowledge(baseLead.id, 'operation-a');
  const serverMeeting = { ...baseLead, pipeline_stage: 'Meeting' as const };
  assert.equal(overlay.reconcile([serverMeeting])[0]?.pipeline_stage, 'Closing Won');

  overlay.rollback(baseLead.id, 'operation-b');
  const restored = overlay.reconcile([serverMeeting])[0]!;
  assert.equal(restored.pipeline_stage, 'Meeting');
  assert.equal(restored._syncStatus, 'synced');
});

test('cached or locally pending snapshots cannot clear an acknowledged overlay', () => {
  const overlay = new OptimisticLeadStageOverlay();
  overlay.apply(baseLead.id, 'operation-a', 'Negotiation');
  overlay.acknowledge(baseLead.id, 'operation-a');
  const matchingSnapshot = { ...baseLead, pipeline_stage: 'Negotiation' as const };

  const cachedOverlay = overlay.reconcile([matchingSnapshot], { fromCache: true, pendingWriteIds: new Set() })[0]!;
  const locallyPendingOverlay = overlay.reconcile([matchingSnapshot], { fromCache: false, pendingWriteIds: new Set([baseLead.id]) })[0]!;
  assert.equal(cachedOverlay.pipeline_stage, 'Negotiation');
  assert.equal(cachedOverlay._syncStatus, 'synced');
  assert.equal(locallyPendingOverlay.pipeline_stage, 'Negotiation');
  assert.equal(locallyPendingOverlay._syncStatus, 'synced');
  assert.equal(overlay.reconcile([matchingSnapshot], { fromCache: false, pendingWriteIds: new Set() })[0], matchingSnapshot);
});

test('a failed earlier detail correction does not remove a newer correction', () => {
  const overlay = new OptimisticLeadStageOverlay();
  overlay.applyDetails(baseLead.id, 'detail-a', { contact_person: 'First correction' });
  overlay.applyDetails(baseLead.id, 'detail-b', { phone: '+628120000001' });
  overlay.rollback(baseLead.id, 'detail-a');
  const rendered = overlay.reconcile([baseLead])[0]!;
  assert.equal(rendered.contact_person, baseLead.contact_person);
  assert.equal(rendered.phone, '+628120000001');
  assert.equal(rendered._syncStatus, 'pending_update');
});

test('stage and detail patches settle independently in enqueue order', () => {
  const overlay = new OptimisticLeadStageOverlay();
  overlay.apply(baseLead.id, 'stage-a', 'Negotiation');
  overlay.applyDetails(baseLead.id, 'detail-b', { deal_value: 1250000, lead_score: 'Hot' });
  overlay.acknowledge(baseLead.id, 'stage-a');
  const serverStage = { ...baseLead, pipeline_stage: 'Negotiation' as const };
  const pending = overlay.reconcile([serverStage])[0]!;
  assert.equal(pending.pipeline_stage, 'Negotiation');
  assert.equal(pending.deal_value, 1250000);
  assert.equal(pending.lead_score, 'Hot');
  assert.equal(pending._syncStatus, 'pending_update');
  overlay.acknowledge(baseLead.id, 'detail-b');
  const settled = overlay.reconcile([{ ...serverStage, deal_value: 1250000, lead_score: 'Hot' }])[0]!;
  assert.equal(settled._syncStatus, 'synced');
});

test('newer acknowledged values retire superseded older patches without resurrecting stale fields', () => {
  const overlay = new OptimisticLeadStageOverlay();
  overlay.applyDetails(baseLead.id, 'first', { phone: '+628111111111', deal_value: 100 });
  overlay.applyDetails(baseLead.id, 'second', { phone: '+628122222222' });
  overlay.acknowledge(baseLead.id, 'first');
  overlay.acknowledge(baseLead.id, 'second');
  const finalServer = { ...baseLead, phone: '+628122222222', deal_value: 100 };
  assert.equal(overlay.reconcile([finalServer])[0], finalServer);
  const laterExternalChange = { ...finalServer, phone: '+628133333333' };
  assert.equal(overlay.reconcile([laterExternalChange])[0], laterExternalChange);
});

test('pending overlays cannot hide an unresolved queue error', () => {
  const overlay = new OptimisticLeadStageOverlay();
  overlay.applyDetails(baseLead.id, 'later', { contact_person: 'New synthetic contact' });
  const rendered = overlay.reconcile([{ ...baseLead, _syncStatus: 'error' }])[0]!;
  assert.equal(rendered.contact_person, 'New synthetic contact');
  assert.equal(rendered._syncStatus, 'error');
});
