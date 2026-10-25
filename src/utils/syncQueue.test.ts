import test from 'node:test';
import assert from 'node:assert/strict';
import { CrmSyncEngine, CrmStorage } from './syncQueue.ts';

// Mock localStorage for Node environment testing
const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => storageMap.get(k) || null,
  setItem: (k: string, v: string) => storageMap.set(k, v),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

test('CrmStorage initializes in clean empty state when storage is fresh', () => {
  storageMap.clear();
  const leads = CrmStorage.getLeads();
  assert.equal(leads.length, 0, 'Clean state should have 0 leads initially');
  const activities = CrmStorage.getActivities();
  assert.equal(activities.length, 0, 'Clean state should have 0 activities initially');
  const globalLeads = CrmStorage.getGlobalLeads();
  assert.equal(globalLeads.length, 0, 'Clean state should have 0 global leads initially');
});

test('CrmStorage automatically purges legacy mock lead and activity records', () => {
  storageMap.clear();
  // Simulate legacy dirty localStorage containing old mock items
  storageMap.set(
    'personal_crm_leads_v2',
    JSON.stringify([
      { id: 'LEAD-101', company_name: 'PT Nusantara Logistics' },
      { id: 'LEAD-REAL-99', company_name: 'PT Mitra Sukses Asli' },
    ])
  );
  storageMap.set(
    'personal_crm_activities_v2',
    JSON.stringify([
      { id: 'ACT-201', lead_id: 'LEAD-101' },
      { id: 'ACT-REAL-99', lead_id: 'LEAD-REAL-99' },
    ])
  );

  const cleanedLeads = CrmStorage.getLeads();
  assert.equal(cleanedLeads.length, 1);
  assert.equal(cleanedLeads[0].id, 'LEAD-REAL-99');

  const cleanedActs = CrmStorage.getActivities();
  assert.equal(cleanedActs.length, 1);
  assert.equal(cleanedActs[0].id, 'ACT-REAL-99');
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

test('CrmSyncEngine auto-archives won deals to Archive_Logs when moved to Closing Won', () => {
  const engine = new CrmSyncEngine();
  CrmStorage.setSimulatedOffline(true);

  const leads = CrmStorage.getLeads();
  const target = leads[0];

  engine.enqueueUpdateLeadStage(target.id, 'Closing Won');

  // Verify stored archive record
  const archives = CrmStorage.getWonArchives();
  assert.ok(archives.length >= 1);
  assert.equal(archives[0].lead_id, target.id);
  assert.equal(archives[0].company_name, target.company_name);

  // Verify archive mutation is queued
  const queue = CrmStorage.getQueue();
  const archiveMutation = queue.find((m) => m.action === 'archiveClosingWon');
  assert.ok(archiveMutation);
  assert.equal(archiveMutation?.payload.company_name, target.company_name);
});
