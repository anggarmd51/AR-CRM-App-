import test from 'node:test';
import assert from 'node:assert/strict';
import type { Lead } from '../types/crm.ts';
import { OptimisticLeadProfileOverlay } from './optimisticLeadProfiles.ts';

const baseLead: Lead = {
  id: 'lead-overlay-1',
  company_name: 'Synthetic Company',
  contact_person: 'Original Contact',
  phone: '000',
  industry: 'Retail',
  city: 'Jakarta',
  pipeline_stage: 'Negotiation',
  deal_value: 1_000,
  next_followup_date: '2026-11-15',
  lead_score: 'Warm',
};

const changedProfile = {
  contact_person: 'Updated Contact',
  phone: '0812',
  deal_value: 2_500,
  lead_score: 'Hot' as const,
};

test('pending profile edit survives stale snapshots without changing stage or follow-up', () => {
  const overlay = new OptimisticLeadProfileOverlay();
  overlay.apply(baseLead.id, 'intent-1', changedProfile);
  const [visible] = overlay.reconcile([baseLead], { fromCache: false, pendingWriteIds: new Set() });

  assert.equal(visible?.contact_person, 'Updated Contact');
  assert.equal(visible?.deal_value, 2_500);
  assert.equal(visible?.lead_score, 'Hot');
  assert.equal(visible?.pipeline_stage, baseLead.pipeline_stage);
  assert.equal(visible?.next_followup_date, baseLead.next_followup_date);
  assert.equal(visible?._syncStatus, 'pending_update');
});

test('acknowledged profile intent clears only when a server snapshot confirms it', () => {
  const overlay = new OptimisticLeadProfileOverlay();
  overlay.apply(baseLead.id, 'intent-1', changedProfile);
  overlay.acknowledge(baseLead.id, 'intent-1');

  const [stillPending] = overlay.reconcile([baseLead], { fromCache: false, pendingWriteIds: new Set() });
  assert.equal(stillPending?.contact_person, 'Updated Contact');

  const serverLead = { ...baseLead, ...changedProfile, _syncStatus: 'synced' as const };
  const [confirmed] = overlay.reconcile([serverLead], { fromCache: false, pendingWriteIds: new Set() });
  assert.equal(confirmed, serverLead);
});

test('profile edit rollback removes only its own pending intent', () => {
  const overlay = new OptimisticLeadProfileOverlay();
  overlay.apply(baseLead.id, 'intent-1', changedProfile);
  overlay.rollback(baseLead.id, 'intent-1');
  const [restored] = overlay.reconcile([baseLead]);
  assert.equal(restored, baseLead);
});
