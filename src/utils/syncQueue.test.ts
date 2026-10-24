import test from 'node:test';
import assert from 'node:assert/strict';
import { CrmSyncEngine, CrmStorage, SEED_LEADS } from './syncQueue.ts';

// Mock localStorage for Node environment testing
const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => storageMap.get(k) || null,
  setItem: (k: string, v: string) => storageMap.set(k, v),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

test('CrmStorage returns seed leads when storage is fresh', () => {
  storageMap.clear();
  const leads = CrmStorage.getLeads();
  assert.ok(leads.length >= 3);
  assert.equal(leads[0].company_name, 'PT Nusantara Logistics');
});

test('CrmSyncEngine adds lead optimistically to local cache and queue', () => {
  storageMap.clear();
  const engine = new CrmSyncEngine();
  
  // Set simulated offline so it doesn't try fetch in test
  CrmStorage.setSimulatedOffline(true);
  assert.equal(engine.isOnline(), false);

  const created = engine.enqueueAddLead({
    company_name: 'Test Corp',
    contact_person: 'Tester',
    phone: '08123',
    industry: 'Fintech',
    city: 'Jakarta',
    pipeline_stage: 'Prospect',
    deal_value: 50000000,
    next_followup_date: '2026-10-30',
    lead_score: 'Hot',
  });

  assert.ok(created.id.startsWith('TEMP-LEAD-'));
  assert.equal(created._syncStatus, 'pending_insert');

  // Verify it appears at the front of stored leads
  const stored = CrmStorage.getLeads();
  assert.equal(stored[0].company_name, 'Test Corp');
  assert.equal(stored[0].id, created.id);

  // Verify mutation queue
  const queue = CrmStorage.getQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].action, 'addLead');
  assert.equal(queue[0].payload.company_name, 'Test Corp');
});

test('CrmSyncEngine enqueues stage updates correctly', () => {
  const engine = new CrmSyncEngine();
  CrmStorage.setSimulatedOffline(true);

  const leads = CrmStorage.getLeads();
  const targetId = leads[0].id;

  engine.enqueueUpdateLeadStage(targetId, 'Negotiation', '2026-11-01');

  const updatedLeads = CrmStorage.getLeads();
  const updated = updatedLeads.find((l) => l.id === targetId);
  assert.equal(updated?.pipeline_stage, 'Negotiation');
  assert.equal(updated?.next_followup_date, '2026-11-01');
  assert.equal(updated?._syncStatus, 'pending_update');
});
