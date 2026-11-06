import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScopedFormDraftKey,
  createScopedFormDraftWriter,
  isActivityFormDraft,
  isQuickLeadFormDraft,
  restoreActivityFormDraft,
  restoreQuickLeadFormDraft,
  saveWithDraftCleanup,
  type FormDraftStorage,
} from './formDrafts.ts';

class MemoryStorage implements FormDraftStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

test('draft keys are isolated by both workspace and authenticated owner', () => {
  const first = buildScopedFormDraftKey('quick_lead', 'workspace-a', 'owner-a');
  assert.equal(first, 'arcrm_draft_quick_lead:v1:workspace-a:owner-a');
  assert.notEqual(first, buildScopedFormDraftKey('quick_lead', 'workspace-a', 'owner-b'));
  assert.notEqual(first, buildScopedFormDraftKey('quick_lead', 'workspace-b', 'owner-a'));
  assert.notEqual(first, buildScopedFormDraftKey('activity', 'workspace-a', 'owner-a'));
  assert.equal(buildScopedFormDraftKey('activity', '', 'owner-a'), undefined);
  assert.equal(buildScopedFormDraftKey('activity', 'workspace-a', ''), undefined);
});

test('draft writes are debounced, can be flushed immediately on backgrounding, and restore only form fields', async () => {
  const storage = new MemoryStorage();
  const writer = createScopedFormDraftWriter<{ companyName: string; phone: string }>(
    'quick_lead', 'workspace-a', 'owner-a', storage, 25,
  );
  writer.schedule({ companyName: 'PT Contoh', phone: '+628123' });
  assert.equal(writer.read(), null);
  await wait(35);
  assert.deepEqual(writer.read(), { companyName: 'PT Contoh', phone: '+628123' });

  writer.schedule({ companyName: 'PT Contoh Baru', phone: '+628999' });
  writer.flush();
  assert.deepEqual(writer.read(), { companyName: 'PT Contoh Baru', phone: '+628999' });
  const stored = JSON.parse(storage.getItem(writer.key!)!);
  assert.deepEqual(Object.keys(stored).sort(), ['draft', 'version']);
  assert.equal(JSON.stringify(stored).includes('token'), false);
  writer.dispose();
});

test('draft content is isolated when two owners or workspaces use the same browser storage', () => {
  const storage = new MemoryStorage();
  const ownerA = createScopedFormDraftWriter<{ notes: string }>('activity', 'workspace-a', 'owner-a', storage, 1_000);
  const ownerB = createScopedFormDraftWriter<{ notes: string }>('activity', 'workspace-a', 'owner-b', storage, 1_000);
  const otherWorkspace = createScopedFormDraftWriter<{ notes: string }>('activity', 'workspace-b', 'owner-a', storage, 1_000);
  ownerA.schedule({ notes: 'catatan owner A' });
  ownerB.schedule({ notes: 'catatan owner B' });
  otherWorkspace.schedule({ notes: 'catatan workspace lain' });
  ownerA.flush();
  ownerB.flush();
  otherWorkspace.flush();
  assert.deepEqual(ownerA.read(), { notes: 'catatan owner A' });
  assert.deepEqual(ownerB.read(), { notes: 'catatan owner B' });
  assert.deepEqual(otherWorkspace.read(), { notes: 'catatan workspace lain' });
  ownerA.dispose();
  ownerB.dispose();
  otherWorkspace.dispose();
});

test('Quick Lead restore preserves valid fields and rejects malformed values safely', () => {
  const validDraft = {
    companyName: 'PT Contoh', contactPerson: 'Maya', email: 'maya@example.id', phone: '+628123',
    address: 'Jl. Utama', industry: 'Retail', city: 'Jakarta', pipelineStage: 'Meeting',
    dealValue: 1_000_000, nextFollowupDate: '2026-12-31', leadScore: 'Hot', isVerified: true,
  };
  assert.equal(isQuickLeadFormDraft(validDraft), true);
  assert.equal(isQuickLeadFormDraft({}), false);
  assert.deepEqual(restoreQuickLeadFormDraft(validDraft), {
    companyName: 'PT Contoh', contactPerson: 'Maya', email: 'maya@example.id', phone: '+628123',
    address: 'Jl. Utama', industry: 'Retail', city: 'Jakarta', pipelineStage: 'Meeting',
    dealValue: 1_000_000, nextFollowupDate: '2026-12-31', leadScore: 'Hot', isVerified: true,
  });
  const malformed = restoreQuickLeadFormDraft({
    companyName: 'x'.repeat(2_001), phone: 'x'.repeat(51), pipelineStage: 'Unknown',
    dealValue: Number.NaN, nextFollowupDate: '2026-02-30', leadScore: 'Unknown', isVerified: 'yes',
  }, 'Nama dari pencarian');
  assert.equal(malformed.companyName, 'Nama dari pencarian');
  assert.equal(malformed.phone, '');
  assert.equal(malformed.pipelineStage, 'Prospect');
  assert.equal(malformed.dealValue, 0);
  assert.equal(malformed.nextFollowupDate, '');
  assert.equal(malformed.leadScore, 'Unrated');
  assert.equal(malformed.isVerified, false);
});

test('Activity restore preserves form text/summary while excluding GPS and photo data', () => {
  const validDraft = {
    selectedLeadId: 'lead-1', activityType: 'Site Visit', notes: 'Bertemu PIC, follow up besok.',
    aiSummary: '', summarySource: null,
  };
  assert.equal(isActivityFormDraft(validDraft), true);
  assert.equal(isActivityFormDraft({}), false);
  assert.equal(isActivityFormDraft({ selectedLeadId: 'lead-1', activityType: 'Site Visit', notes: 'Catatan' }), false);
  assert.deepEqual(restoreActivityFormDraft({
    ...validDraft, location_gps: { latitude: 1, longitude: 2 }, photo: 'not stored by this schema', ai_summary: 'not restored',
  }), {
    selectedLeadId: 'lead-1', activityType: 'Site Visit', notes: 'Bertemu PIC, follow up besok.',
    aiSummary: '', summarySource: null,
  });
  assert.deepEqual(restoreActivityFormDraft({
    ...validDraft, aiSummary: 'Hasil yang sudah diedit', summarySource: 'gemini',
  }), {
    selectedLeadId: 'lead-1', activityType: 'Site Visit', notes: 'Bertemu PIC, follow up besok.',
    aiSummary: 'Hasil yang sudah diedit', summarySource: 'gemini',
  });
  assert.deepEqual(restoreActivityFormDraft({ selectedLeadId: 'lead-2', activityType: 'unknown', notes: 42 }, 'lead-1'), {
    selectedLeadId: 'lead-2', activityType: 'Meeting Check-In', notes: '',
    aiSummary: '', summarySource: null,
  });
});

test('failed save retains draft; successful save clears it; explicit discard cancels pending writes', async () => {
  const storage = new MemoryStorage();
  const writer = createScopedFormDraftWriter<{ notes: string }>('activity', 'workspace-a', 'owner-a', storage, 1_000);
  writer.schedule({ notes: 'draft disimpan' });
  writer.flush();
  await assert.rejects(saveWithDraftCleanup(writer, async () => { throw new Error('Firestore gagal'); }), /Firestore gagal/);
  assert.deepEqual(writer.read(), { notes: 'draft disimpan' });

  assert.equal(await saveWithDraftCleanup(writer, async () => 'saved'), 'saved');
  assert.equal(writer.read(), null);
  writer.schedule({ notes: 'tidak boleh tersimpan selepas cleanup' });
  writer.flush();
  assert.equal(writer.read(), null);

  writer.resume();
  writer.schedule({ notes: 'buang eksplisit' });
  writer.clear();
  await wait(5);
  assert.equal(writer.read(), null);
  writer.dispose();
});
