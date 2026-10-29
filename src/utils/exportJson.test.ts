import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLocalCrmExport } from './exportJson.ts';
import type { Activity, Lead, WonDealArchiveRecord } from '../types/crm.ts';

const lead: Lead = {
  id: 'lead-1',
  company_name: 'Synthetic Co',
  contact_person: 'Synthetic PIC',
  phone: '+628111222333',
  industry: 'Manufacturing',
  city: 'Jakarta',
  pipeline_stage: 'Closing Won',
  deal_value: 80000000,
  next_followup_date: '',
  lead_score: 'Hot',
  created_at: '2026-10-20T00:00:00.000Z',
  updated_at: '2026-10-28T00:00:00.000Z',
  _syncStatus: 'synced',
};

const activity: Activity = {
  id: 'activity-1',
  lead_id: lead.id,
  activity_type: 'Site Visit',
  notes: 'Synthetic private meeting note',
  ai_summary: 'Synthetic reviewed summary',
  ai_summary_source: 'local',
  location_gps: { latitude: -6.2, longitude: 106.8, accuracy_m: 10 },
  created_at: '2026-10-28T10:00:00.000Z',
  _syncStatus: 'synced',
};

const archive: WonDealArchiveRecord = {
  id: lead.id,
  lead_id: lead.id,
  company_name: lead.company_name,
  contact_person: lead.contact_person,
  phone: lead.phone,
  deal_value: lead.deal_value,
  industry: lead.industry,
  city: lead.city,
  won_date: '2026-10-28',
  archived_at: '2026-10-28T10:00:00.000Z',
};

const baseInput = {
  workspaceId: 'synthetic-workspace',
  ownerId: 'synthetic-owner',
  leads: [lead],
  activities: [activity],
  wonDealArchives: [archive],
  coverage: {
    leads_from_cache: false,
    activities_from_cache: false,
    archives_from_cache: false,
    pending_mutations: 0,
    failed_mutations: 0,
  },
  exportedAt: '2026-10-29T06:00:00.000Z',
};

test('local export includes all three CRM record sets and full related activity fields', () => {
  const bundle = buildLocalCrmExport(baseInput);
  const roundTrip = JSON.parse(JSON.stringify(bundle));

  assert.equal(bundle.schema_version, 1);
  assert.equal(bundle.exported_at, baseInput.exportedAt);
  assert.equal(bundle.scope.source, 'firebase-client-snapshot');
  assert.equal(roundTrip.records.leads[0].phone, lead.phone);
  assert.equal(roundTrip.records.activities[0].notes, activity.notes);
  assert.equal(roundTrip.records.activities[0].ai_summary, activity.ai_summary);
  assert.deepEqual(roundTrip.records.activities[0].location_gps, activity.location_gps);
  assert.equal(roundTrip.records.won_deal_archives[0].won_date, archive.won_date);
  assert.equal(bundle.summary.lead_count, 1);
  assert.equal(bundle.summary.activity_count, 1);
  assert.equal(bundle.summary.won_deal_archive_count, 1);
  assert.equal(bundle.summary.pipeline.wonValue, 80000000);
  assert.equal(bundle.summary.lead_score_counts.Hot, 1);
  assert.equal(bundle.summary.activity_type_counts['Site Visit'], 1);
  assert.equal(bundle.summary.activities_by_lead['lead-1'], 1);
  assert.deepEqual(bundle.summary.integrity, {
    won_leads_without_archive: 0,
    archives_without_lead: 0,
    activities_without_lead: 0,
  });
  assert.equal(bundle.coverage.current_server_snapshot, true);
  assert.match(bundle.coverage.limitation, /bukan backup\/restore Cloud Firestore/);
});

test('local export reports cache, pending writes and orphaned records instead of claiming completeness', () => {
  const orphanActivity: Activity = { ...activity, id: 'orphan-activity', lead_id: 'missing-lead' };
  const orphanArchive: WonDealArchiveRecord = { ...archive, id: 'orphan-archive', lead_id: 'missing-lead' };
  const bundle = buildLocalCrmExport({
    ...baseInput,
    leads: [lead, { ...lead, id: 'won-without-archive', company_name: 'Second Won Co' }],
    activities: [activity, orphanActivity],
    wonDealArchives: [archive, orphanArchive],
    coverage: { ...baseInput.coverage, activities_from_cache: true, pending_mutations: 2, failed_mutations: 1 },
  });

  assert.equal(bundle.coverage.current_server_snapshot, false);
  assert.equal(bundle.coverage.pending_mutations, 2);
  assert.equal(bundle.coverage.failed_mutations, 1);
  assert.deepEqual(bundle.summary.integrity, {
    won_leads_without_archive: 1,
    archives_without_lead: 1,
    activities_without_lead: 1,
  });
});

test('local export requires a known owner and workspace scope', () => {
  assert.throws(() => buildLocalCrmExport({ ...baseInput, ownerId: ' ' }), /owner harus tersedia/);
  assert.throws(() => buildLocalCrmExport({ ...baseInput, workspaceId: '' }), /Workspace dan owner harus tersedia/);
});
