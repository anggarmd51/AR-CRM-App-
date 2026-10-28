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
  assert.equal(overlay.reconcile([baseLead])[0]?.pipeline_stage, 'Negotiation');
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

  assert.equal(overlay.reconcile([matchingSnapshot], { fromCache: true, pendingWriteIds: new Set() })[0]?._syncStatus, 'pending_update');
  assert.equal(overlay.reconcile([matchingSnapshot], { fromCache: false, pendingWriteIds: new Set([baseLead.id]) })[0]?._syncStatus, 'pending_update');
  assert.equal(overlay.reconcile([matchingSnapshot], { fromCache: false, pendingWriteIds: new Set() })[0], matchingSnapshot);
});
