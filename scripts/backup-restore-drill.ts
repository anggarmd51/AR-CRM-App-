import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  buildLocalCrmExport,
  type LocalCrmExportBundle,
  type LocalCrmExportCoverage,
} from '../src/utils/exportJson.ts';
import { generateLeadsCsv } from '../src/utils/exportCsv.ts';
import type { Activity, Lead, WonDealArchiveRecord } from '../src/types/crm.ts';

type JsonObject = Record<string, unknown>;
type FixtureDocuments = {
  leads: Array<{ id: string; data: Record<string, unknown> }>;
  activities: Array<{ id: string; data: Record<string, unknown> }>;
  archives: Array<{ id: string; data: Record<string, unknown> }>;
};
type ExpectedScope = { workspaceId: string; ownerId: string };

const COLLECTIONS = ['leads', 'activities', 'wonDealArchives'] as const;
const COMPLETE_COVERAGE: LocalCrmExportCoverage = {
  leads_from_cache: false,
  activities_from_cache: false,
  archives_from_cache: false,
  pending_mutations: 0,
  failed_mutations: 0,
};
const FIXED_EXPORT_TIME = '2026-10-30T00:00:00.000Z';
const LEAD_CSV_HEADERS = [
  'Lead ID', 'Company Name', 'Contact Person', 'Email', 'Phone', 'Industry', 'City',
  'Pipeline Stage', 'Deal Value (IDR)', 'Next Follow-Up Date', 'Lead Score',
  'Sync Status', 'Created At',
];

function fail(message: string): never {
  throw new Error(message);
}

function asObject(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return fail(`${label} must be an object.`);
  }
  return value as JsonObject;
}

function exactKeys(value: JsonObject, required: string[], optional: string[], label: string): void {
  const allowed = new Set([...required, ...optional]);
  const actual = Object.keys(value);
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  const extra = actual.filter((key) => !allowed.has(key));
  if (missing.length || extra.length) {
    fail(`${label} has an invalid shape (missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}).`);
  }
}

function nonEmptyString(value: unknown, label: string, maxLength = 1000): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    fail(`${label} must be a non-empty string of at most ${maxLength} characters.`);
  }
}

function boundedString(value: unknown, label: string, maxLength: number, allowEmpty = true): asserts value is string {
  if (typeof value !== 'string' || value.length > maxLength || (!allowEmpty && value.length === 0)) {
    fail(`${label} must be a ${allowEmpty ? 'string' : 'non-empty string'} of at most ${maxLength} characters.`);
  }
}

function validDocumentId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,150}$/.test(value)) {
    fail(`${label} must be a safe Firestore document ID (1–150 letters, digits, _ or -).`);
  }
}

function validIsoTimestamp(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') fail(`${label} must be an ISO timestamp string.`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    fail(`${label} must be a canonical UTC ISO timestamp.`);
  }
}

function validCalendarDate(value: unknown, label: string, allowEmpty = false): asserts value is string {
  if (allowEmpty && value === '') return;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(`${label} must be a real YYYY-MM-DD calendar date${allowEmpty ? ' or empty' : ''}.`);
  }
  const year = Number(value.slice(0, 4));
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (year < 1 || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    fail(`${label} must be a real YYYY-MM-DD calendar date${allowEmpty ? ' or empty' : ''}.`);
  }
}

function finiteNonNegativeNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail(`${label} must be a finite non-negative number.`);
  }
}

function validateRecordScope(record: JsonObject, scope: ExpectedScope, label: string): void {
  if (record.ownerId !== scope.ownerId) fail(`${label}.ownerId does not match bundle owner_id.`);
  if (record.role !== 'owner') fail(`${label}.role must be owner.`);
  for (const key of ['workspaceId', 'workspace_id']) {
    if (Object.hasOwn(record, key) && record[key] !== scope.workspaceId) {
      fail(`${label}.${key} does not match bundle workspace_id.`);
    }
  }
  if (Object.hasOwn(record, '_syncStatus') && record._syncStatus !== 'synced') {
    fail(`${label} contains a non-synced client record.`);
  }
}

function validateLead(value: unknown, scope: ExpectedScope, index: number): JsonObject {
  const label = `records.leads[${index}]`;
  const record = asObject(value, label);
  exactKeys(record,
    ['id', 'company_name', 'contact_person', 'phone', 'industry', 'city', 'pipeline_stage', 'deal_value', 'next_followup_date', 'lead_score', 'created_at', 'updated_at', 'ownerId', 'role'],
    ['email', 'address', '_syncStatus', 'workspaceId', 'workspace_id'], label);
  validDocumentId(record.id, `${label}.id`);
  nonEmptyString(record.company_name, `${label}.company_name`, 200);
  nonEmptyString(record.contact_person, `${label}.contact_person`, 200);
  if (Object.hasOwn(record, 'email')) boundedString(record.email, `${label}.email`, 320);
  if (Object.hasOwn(record, 'address')) boundedString(record.address, `${label}.address`, 500);
  boundedString(record.phone, `${label}.phone`, 200);
  boundedString(record.industry, `${label}.industry`, 120);
  boundedString(record.city, `${label}.city`, 120);
  if (!['Prospect', 'Meeting', 'Negotiation', 'Closing Won', 'Closing Lost'].includes(String(record.pipeline_stage))) {
    fail(`${label}.pipeline_stage is invalid.`);
  }
  finiteNonNegativeNumber(record.deal_value, `${label}.deal_value`);
  validCalendarDate(record.next_followup_date, `${label}.next_followup_date`, true);
  if (!['Hot', 'Warm', 'Cold', 'Unrated'].includes(String(record.lead_score))) fail(`${label}.lead_score is invalid.`);
  validIsoTimestamp(record.created_at, `${label}.created_at`);
  validIsoTimestamp(record.updated_at, `${label}.updated_at`);
  validateRecordScope(record, scope, label);
  return record;
}

function validateActivity(value: unknown, scope: ExpectedScope, index: number): JsonObject {
  const label = `records.activities[${index}]`;
  const record = asObject(value, label);
  exactKeys(record,
    ['id', 'lead_id', 'activity_type', 'notes', 'created_at', 'ownerId', 'role'],
    ['ai_summary', 'ai_summary_source', 'location_gps', '_syncStatus', 'workspaceId', 'workspace_id'], label);
  validDocumentId(record.id, `${label}.id`);
  validDocumentId(record.lead_id, `${label}.lead_id`);
  nonEmptyString(record.activity_type, `${label}.activity_type`, 80);
  boundedString(record.notes, `${label}.notes`, 12000);
  validIsoTimestamp(record.created_at, `${label}.created_at`);
  const hasSummary = Object.hasOwn(record, 'ai_summary');
  const hasSummarySource = Object.hasOwn(record, 'ai_summary_source');
  if (hasSummary !== hasSummarySource) fail(`${label} must include both AI summary fields or neither.`);
  if (hasSummary) {
    nonEmptyString(record.ai_summary, `${label}.ai_summary`, 4000);
    if (!['gemini', 'local'].includes(String(record.ai_summary_source))) fail(`${label}.ai_summary_source is invalid.`);
  }
  if (Object.hasOwn(record, 'location_gps')) {
    const gps = asObject(record.location_gps, `${label}.location_gps`);
    exactKeys(gps, ['latitude', 'longitude', 'accuracy_m'], [], `${label}.location_gps`);
    for (const key of ['latitude', 'longitude', 'accuracy_m']) {
      if (typeof gps[key] !== 'number' || !Number.isFinite(gps[key])) fail(`${label}.location_gps.${key} must be finite.`);
    }
    if ((gps.latitude as number) < -90 || (gps.latitude as number) > 90
      || (gps.longitude as number) < -180 || (gps.longitude as number) > 180
      || (gps.accuracy_m as number) < 0 || (gps.accuracy_m as number) > 100000) {
      fail(`${label}.location_gps is outside valid coordinate ranges.`);
    }
  }
  validateRecordScope(record, scope, label);
  return record;
}

function validateArchive(value: unknown, scope: ExpectedScope, index: number): JsonObject {
  const label = `records.won_deal_archives[${index}]`;
  const record = asObject(value, label);
  exactKeys(record,
    ['id', 'lead_id', 'company_name', 'contact_person', 'phone', 'industry', 'city', 'deal_value', 'won_date', 'archived_at', 'ownerId', 'role'],
    ['_syncStatus', 'workspaceId', 'workspace_id'], label);
  validDocumentId(record.id, `${label}.id`);
  validDocumentId(record.lead_id, `${label}.lead_id`);
  nonEmptyString(record.company_name, `${label}.company_name`, 200);
  nonEmptyString(record.contact_person, `${label}.contact_person`, 200);
  boundedString(record.phone, `${label}.phone`, 200);
  boundedString(record.industry, `${label}.industry`, 120);
  boundedString(record.city, `${label}.city`, 120);
  finiteNonNegativeNumber(record.deal_value, `${label}.deal_value`);
  validCalendarDate(record.won_date, `${label}.won_date`);
  validIsoTimestamp(record.archived_at, `${label}.archived_at`);
  validateRecordScope(record, scope, label);
  return record;
}

function validateBundle(input: unknown, expected: ExpectedScope): asserts input is LocalCrmExportBundle {
  const root = asObject(input, 'bundle');
  exactKeys(root, ['schema_version', 'exported_at', 'scope', 'coverage', 'summary', 'records', 'restore_notice'], [], 'bundle');
  if (root.schema_version !== 1) fail('Only export schema_version 1 is supported.');
  validIsoTimestamp(root.exported_at, 'exported_at');
  const scope = asObject(root.scope, 'scope');
  exactKeys(scope, ['workspace_id', 'owner_id', 'source'], [], 'scope');
  if (scope.workspace_id !== expected.workspaceId) fail('Bundle workspace_id does not match the explicitly selected demo workspace.');
  if (scope.owner_id !== expected.ownerId) fail('Bundle owner_id does not match the explicitly selected synthetic owner.');
  if (scope.source !== 'firebase-client-snapshot') fail('Bundle source is not a supported Firebase client snapshot.');

  const coverage = asObject(root.coverage, 'coverage');
  exactKeys(coverage,
    ['leads_from_cache', 'activities_from_cache', 'archives_from_cache', 'pending_mutations', 'failed_mutations', 'current_server_snapshot', 'limitation'],
    [], 'coverage');
  if (coverage.leads_from_cache !== false || coverage.activities_from_cache !== false || coverage.archives_from_cache !== false
    || coverage.pending_mutations !== 0 || coverage.failed_mutations !== 0 || coverage.current_server_snapshot !== true) {
    fail('Restore requires a complete server snapshot with no cached, pending, or failed mutations.');
  }
  if (typeof coverage.limitation !== 'string') fail('coverage.limitation must be a string.');
  if (typeof root.restore_notice !== 'string') fail('restore_notice must be a string.');

  const records = asObject(root.records, 'records');
  exactKeys(records, ['leads', 'activities', 'won_deal_archives'], [], 'records');
  if (!Array.isArray(records.leads) || !Array.isArray(records.activities) || !Array.isArray(records.won_deal_archives)) {
    fail('records.leads, records.activities, and records.won_deal_archives must be arrays.');
  }
  const leads = records.leads.map((record, index) => validateLead(record, expected, index));
  const activities = records.activities.map((record, index) => validateActivity(record, expected, index));
  const archives = records.won_deal_archives.map((record, index) => validateArchive(record, expected, index));
  const uniqueIds = (items: JsonObject[], label: string) => {
    const ids = items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) fail(`${label} contains duplicate document IDs.`);
  };
  uniqueIds(leads, 'leads');
  uniqueIds(activities, 'activities');
  uniqueIds(archives, 'won_deal_archives');

  const leadsById = new Map(leads.map((lead) => [String(lead.id), lead]));
  const archivesByLead = new Map(archives.map((archive) => [String(archive.lead_id), archive]));
  if (archivesByLead.size !== archives.length) fail('won_deal_archives contains duplicate lead relationships.');
  for (const activity of activities) {
    if (!leadsById.has(String(activity.lead_id))) fail(`Activity ${String(activity.id)} references a missing lead.`);
  }
  for (const lead of leads) {
    const archive = archivesByLead.get(String(lead.id));
    if (lead.pipeline_stage === 'Closing Won' && !archive) fail(`Won lead ${String(lead.id)} has no archive.`);
    if (lead.pipeline_stage !== 'Closing Won' && archive) fail(`Archive ${String(archive.id)} points to a lead that is not Closing Won.`);
    if (archive) {
      if (archive.id !== lead.id || archive.lead_id !== lead.id) fail(`Archive for ${String(lead.id)} does not preserve the lead document ID.`);
      for (const field of ['company_name', 'contact_person', 'phone', 'industry', 'city', 'deal_value']) {
        if (archive[field] !== lead[field]) fail(`Archive ${String(archive.id)} does not match lead.${field}.`);
      }
    }
  }
  for (const archive of archives) {
    if (!leadsById.has(String(archive.lead_id))) fail(`Archive ${String(archive.id)} references a missing lead.`);
  }

  const summary = asObject(root.summary, 'summary');
  exactKeys(summary, ['lead_count', 'activity_count', 'won_deal_archive_count', 'pipeline', 'lead_score_counts', 'activity_type_counts', 'activities_by_lead', 'integrity'], [], 'summary');
  if (summary.lead_count !== leads.length || summary.activity_count !== activities.length || summary.won_deal_archive_count !== archives.length) {
    fail('Summary record totals do not match records arrays.');
  }
  const integrity = asObject(summary.integrity, 'summary.integrity');
  exactKeys(integrity, ['won_leads_without_archive', 'archives_without_lead', 'activities_without_lead'], [], 'summary.integrity');
  if (integrity.won_leads_without_archive !== 0 || integrity.archives_without_lead !== 0 || integrity.activities_without_lead !== 0) {
    fail('Bundle summary reports unresolved CRM relationship gaps.');
  }
}

function parseProjectId(argv: string[]): string {
  const index = argv.indexOf('--project-id');
  const projectId = index >= 0 ? argv[index + 1] : undefined;
  if (!projectId || projectId.startsWith('--')) fail('Usage: tsx scripts/backup-restore-drill.ts --project-id demo-ar-crm-rules');
  if (!/^demo-[a-z0-9-]+$/.test(projectId)) fail('Refusing to run: --project-id must be explicitly demo-prefixed.');
  if (process.env.GCLOUD_PROJECT !== projectId) fail('Refusing to run: GCLOUD_PROJECT must exactly match the explicit --project-id.');
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) fail('Refusing to run: FIRESTORE_EMULATOR_HOST is required.');
  const match = /^(127\.0\.0\.1|localhost|\[::1\]):([0-9]{1,5})$/.exec(host);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 65535) {
    fail('Refusing to run: FIRESTORE_EMULATOR_HOST must be a loopback host and valid port.');
  }
  return projectId;
}

function parseCsvDocument(contents: string): string[][] {
  const text = contents.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      if (cell.length) fail('CSV contains a quote outside a quoted cell.');
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\r' || character === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (character === '\r' && text[index + 1] === '\n') index += 1;
    } else {
      cell += character;
    }
  }
  if (quoted) fail('CSV has an unterminated quoted cell.');
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function expectedCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function verifyLeadsCsvReadback(csvText: string, leads: Lead[]): { rows: number; columns: number; compared_cells: number } {
  const parsed = parseCsvDocument(csvText);
  assert.deepEqual(parsed[0], LEAD_CSV_HEADERS, 'CSV headers must match the supported Lead export schema');
  assert.equal(parsed.length, leads.length + 1, 'CSV must contain one row per exported Lead');
  const expectedRows = leads.map((lead) => [
    lead.id,
    lead.company_name,
    lead.contact_person,
    lead.email ?? '',
    lead.phone,
    lead.industry,
    lead.city,
    lead.pipeline_stage,
    lead.deal_value || 0,
    lead.next_followup_date || '-',
    lead.lead_score,
    lead._syncStatus || 'synced',
    lead.created_at || '',
  ].map(expectedCsvCell));
  assert.deepEqual(parsed.slice(1), expectedRows, "every CSV value must roundtrip with the exporter's documented fallback and formula-safety rules");
  return { rows: leads.length, columns: LEAD_CSV_HEADERS.length, compared_cells: leads.length * LEAD_CSV_HEADERS.length };
}

function fixtureData(ownerId: string, suffix: string): FixtureDocuments {
  const leadA = `lead-prospect-${suffix}`;
  const leadB = `lead-won-${suffix}`;
  const leadC = `lead-meeting-${suffix}`;
  const created = (iso: string) => Timestamp.fromDate(new Date(iso));
  const common = { ownerId, role: 'owner' };
  const leads = [
    {
      id: leadA,
      data: {
        company_name: 'PT Contoh, "Niaga"', contact_person: 'Rina Sintetis', email: 'rina@example.test',
        address: 'Jl. Fiktif No. 1', phone: '+620000000101',
        industry: 'Logistik', city: 'Jakarta', pipeline_stage: 'Prospect', deal_value: 12500000,
        next_followup_date: '2026-11-02', lead_score: 'Warm',
        created_at: created('2026-10-28T03:00:00.000Z'), updated_at: created('2026-10-28T03:00:00.000Z'), ...common,
      },
    },
    {
      id: leadB,
      data: {
        company_name: 'PT Demo Menang', contact_person: 'Dedi Fiktif', phone: '+620000000102',
        industry: 'Manufaktur', city: 'Bandung', pipeline_stage: 'Closing Won', deal_value: 45000000,
        next_followup_date: '', lead_score: 'Hot',
        created_at: created('2026-10-26T07:00:00.000Z'), updated_at: created('2026-10-29T07:00:00.000Z'), ...common,
      },
    },
    {
      id: leadC,
      data: {
        company_name: 'PT Contoh Meeting', contact_person: 'Ayu Sintetis', phone: '+620000000103',
        industry: 'Teknologi', city: 'Surabaya', pipeline_stage: 'Meeting', deal_value: 28000000,
        next_followup_date: '2026-11-05', lead_score: 'Unrated',
        created_at: created('2026-10-27T08:30:00.000Z'), updated_at: created('2026-10-27T08:30:00.000Z'), ...common,
      },
    },
  ];
  const activities = [{
    id: `activity-${suffix}`,
    data: {
      lead_id: leadC, activity_type: 'Meeting Check-In', notes: 'Fixture sintetis untuk uji roundtrip.',
      ai_summary: 'Ringkasan uji lokal.', ai_summary_source: 'local',
      location_gps: { latitude: 0.001, longitude: 0.002, accuracy_m: 25 },
      created_at: created('2026-10-29T09:15:00.000Z'), ...common,
    },
  }];
  const archives = [{
    id: leadB,
    data: {
      lead_id: leadB, company_name: 'PT Demo Menang', contact_person: 'Dedi Fiktif', phone: '+620000000102',
      industry: 'Manufaktur', city: 'Bandung', deal_value: 45000000,
      won_date: '2026-10-29', archived_at: created('2026-10-29T07:00:00.000Z'), ...common,
    },
  }];
  return { leads, activities, archives };
}

function isoFromTimestamp(value: unknown, label: string): string {
  if (!(value instanceof Timestamp)) fail(`${label} is not a Firestore Timestamp.`);
  return value.toDate().toISOString();
}

async function buildBundleFromFirestore(db: Firestore, scope: ExpectedScope): Promise<LocalCrmExportBundle> {
  const root = `workspaces/${scope.workspaceId}`;
  const [leadSnapshot, activitySnapshot, archiveSnapshot] = await Promise.all([
    db.collection(`${root}/leads`).get(),
    db.collection(`${root}/activities`).get(),
    db.collection(`${root}/wonDealArchives`).get(),
  ]);
  const leads = leadSnapshot.docs.map((snapshot) => {
    const data = snapshot.data();
    return {
      ...data,
      id: snapshot.id,
      created_at: isoFromTimestamp(data.created_at, `Lead ${snapshot.id}.created_at`),
      updated_at: isoFromTimestamp(data.updated_at, `Lead ${snapshot.id}.updated_at`),
      _syncStatus: 'synced',
    } as unknown as Lead;
  }).sort((left, right) => left.id.localeCompare(right.id));
  const activities = activitySnapshot.docs.map((snapshot) => {
    const data = snapshot.data();
    return {
      ...data,
      id: snapshot.id,
      created_at: isoFromTimestamp(data.created_at, `Activity ${snapshot.id}.created_at`),
      _syncStatus: 'synced',
    } as unknown as Activity;
  }).sort((left, right) => left.id.localeCompare(right.id));
  const wonDealArchives = archiveSnapshot.docs.map((snapshot) => {
    const data = snapshot.data();
    return {
      ...data,
      id: snapshot.id,
      archived_at: isoFromTimestamp(data.archived_at, `Archive ${snapshot.id}.archived_at`),
    } as unknown as WonDealArchiveRecord;
  }).sort((left, right) => left.id.localeCompare(right.id));
  return buildLocalCrmExport({
    ...scope,
    leads,
    activities,
    wonDealArchives,
    coverage: COMPLETE_COVERAGE,
    exportedAt: FIXED_EXPORT_TIME,
  });
}

async function assertNamespaceEmpty(db: Firestore, scope: ExpectedScope): Promise<void> {
  const workspace = db.doc(`workspaces/${scope.workspaceId}`);
  const [workspaceDoc, subcollections] = await Promise.all([workspace.get(), workspace.listCollections()]);
  if (workspaceDoc.exists) fail('Restore target workspace document already exists; refusing to touch it.');
  if (subcollections.length) fail(`Restore target namespace is not empty (subcollections: ${subcollections.map((item) => item.id).join(', ')}).`);
  const paths = COLLECTIONS.map((collection) => `workspaces/${scope.workspaceId}/${collection}`);
  const snapshots = await Promise.all(paths.map((path) => db.collection(path).limit(1).get()));
  if (snapshots.some((snapshot) => !snapshot.empty)) fail('Restore target namespace contains existing records; refusing to overwrite them.');
}

function toStoredDocument(record: JsonObject, timestampFields: string[]): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === 'id' || key === '_syncStatus' || key === 'workspaceId' || key === 'workspace_id') continue;
    output[key] = timestampFields.includes(key)
      ? Timestamp.fromDate(new Date(value as string))
      : value;
  }
  return output;
}

async function restoreBundle(db: Firestore, bundle: unknown, scope: ExpectedScope): Promise<void> {
  validateBundle(bundle, scope);
  await assertNamespaceEmpty(db, scope);
  const batch = db.batch();
  for (const lead of bundle.records.leads as unknown as JsonObject[]) {
    const id = String(lead.id);
    batch.create(db.doc(`workspaces/${scope.workspaceId}/leads/${id}`), toStoredDocument(lead, ['created_at', 'updated_at']));
  }
  for (const activity of bundle.records.activities as unknown as JsonObject[]) {
    const id = String(activity.id);
    batch.create(db.doc(`workspaces/${scope.workspaceId}/activities/${id}`), toStoredDocument(activity, ['created_at']));
  }
  for (const archive of bundle.records.won_deal_archives as unknown as JsonObject[]) {
    const id = String(archive.id);
    batch.create(db.doc(`workspaces/${scope.workspaceId}/wonDealArchives/${id}`), toStoredDocument(archive, ['archived_at']));
  }
  await batch.commit();
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

async function deleteOwnedDocuments(db: Firestore, scope: ExpectedScope, fixture: FixtureDocuments): Promise<void> {
  const expected = [
    ...fixture.leads.map((item) => ({ collection: 'leads', ...item })),
    ...fixture.activities.map((item) => ({ collection: 'activities', ...item })),
    ...fixture.archives.map((item) => ({ collection: 'wonDealArchives', ...item })),
  ];
  const batch = db.batch();
  let deletes = 0;
  for (const item of expected) {
    const ref = db.doc(`workspaces/${scope.workspaceId}/${item.collection}/${item.id}`);
    const snapshot = await ref.get();
    if (!snapshot.exists) continue;
    const actual = snapshot.data() ?? {};
    if (actual.ownerId !== scope.ownerId) {
      fail(`Cleanup refused to delete ${item.collection}/${item.id}: ownerId is not the synthetic owner.`);
    }
    try {
      assert.deepEqual(canonicalize(actual), canonicalize(item.data));
    } catch {
      fail(`Cleanup refused to delete ${item.collection}/${item.id}: the document is not the exact fixture record.`);
    }
    batch.delete(ref);
    deletes += 1;
  }
  if (deletes) await batch.commit();
  await assertNamespaceEmpty(db, scope);
}

function expectInvalid(label: string, candidate: unknown, scope: ExpectedScope, expectedMessage: RegExp): void {
  let caught: unknown;
  try {
    validateBundle(candidate, scope);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof Error, `${label}: expected validation to reject the bundle`);
  assert.match(caught.message, expectedMessage, `${label}: rejection reason`);
}

async function main(): Promise<void> {
  const projectId = parseProjectId(process.argv.slice(2));
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const scope = { workspaceId: `cue-drill-ws-${runId}`, ownerId: `cue-drill-owner-${runId}` };
  const fixture = fixtureData(scope.ownerId, runId);
  const app = initializeApp({ projectId }, `backup-restore-drill-${runId}`);
  const db = getFirestore(app);
  const tempDir = await mkdtemp(join(tmpdir(), 'cue-backup-restore-drill-'));
  const backupPath = join(tempDir, 'snapshot-v1.json');
  const csvPath = join(tempDir, 'leads.csv');
  let fixtureMayExist = false;
  let sentinelMayExist = false;
  let outcomeError: unknown;

  try {
    await assertNamespaceEmpty(db, scope);
    const sourceBatch = db.batch();
    for (const item of fixture.leads) sourceBatch.create(db.doc(`workspaces/${scope.workspaceId}/leads/${item.id}`), item.data);
    for (const item of fixture.activities) sourceBatch.create(db.doc(`workspaces/${scope.workspaceId}/activities/${item.id}`), item.data);
    for (const item of fixture.archives) sourceBatch.create(db.doc(`workspaces/${scope.workspaceId}/wonDealArchives/${item.id}`), item.data);
    await sourceBatch.commit();
    fixtureMayExist = true;

    const sourceBundle = await buildBundleFromFirestore(db, scope);
    validateBundle(sourceBundle, scope);
    const generatedCsv = `\uFEFF${generateLeadsCsv(sourceBundle.records.leads)}`;
    await writeFile(csvPath, generatedCsv, 'utf8');
    const csvRoundtrip = verifyLeadsCsvReadback(await readFile(csvPath, 'utf8'), sourceBundle.records.leads);
    await writeFile(backupPath, `${JSON.stringify(sourceBundle, null, 2)}\n`, 'utf8');
    const diskBundle = JSON.parse(await readFile(backupPath, 'utf8')) as unknown;
    validateBundle(diskBundle, scope);

    const badVersion = structuredClone(diskBundle) as unknown as JsonObject;
    badVersion.schema_version = 99;
    expectInvalid('schema version', badVersion, scope, /schema_version 1/);

    const badWorkspace = structuredClone(diskBundle) as unknown as JsonObject;
    (badWorkspace.scope as JsonObject).workspace_id = `${scope.workspaceId}-wrong`;
    expectInvalid('workspace mismatch', badWorkspace, scope, /workspace_id does not match/);

    const badOwner = structuredClone(diskBundle) as unknown as JsonObject;
    (((badOwner.records as JsonObject).leads as JsonObject[])[0]).ownerId = 'other-owner';
    expectInvalid('owner mismatch', badOwner, scope, /ownerId does not match/);

    const badRecordWorkspace = structuredClone(diskBundle) as unknown as JsonObject;
    (((badRecordWorkspace.records as JsonObject).leads as JsonObject[])[0]).workspaceId = 'other-workspace';
    expectInvalid('record workspace mismatch', badRecordWorkspace, scope, /workspaceId does not match/);

    const badRelationship = structuredClone(diskBundle) as unknown as JsonObject;
    (((badRelationship.records as JsonObject).activities as JsonObject[])[0]).lead_id = 'lead-missing';
    expectInvalid('orphan activity', badRelationship, scope, /references a missing lead/);

    await deleteOwnedDocuments(db, scope, fixture);
    fixtureMayExist = false;
    await assertNamespaceEmpty(db, scope);

    // Prove the create-only restore rejects existing data without modifying it.
    const sentinel = {
      id: `sentinel-${runId}`,
      data: {
        company_name: 'Fixture sentinel; must not be overwritten', contact_person: 'Synthetic', phone: '',
        industry: '', city: '', pipeline_stage: 'Prospect', deal_value: 0, next_followup_date: '', lead_score: 'Unrated',
        created_at: Timestamp.fromDate(new Date('2026-10-29T00:00:00.000Z')),
        updated_at: Timestamp.fromDate(new Date('2026-10-29T00:00:00.000Z')),
        ownerId: scope.ownerId, role: 'owner',
      },
    };
    const sentinelRef = db.doc(`workspaces/${scope.workspaceId}/leads/${sentinel.id}`);
    await db.batch().create(sentinelRef, sentinel.data).commit();
    sentinelMayExist = true;
    await assert.rejects(() => restoreBundle(db, diskBundle, scope), /namespace is not empty/);
    assert.deepEqual(canonicalize((await sentinelRef.get()).data()), canonicalize(sentinel.data), 'existing sentinel must remain unchanged');
    await deleteOwnedDocuments(db, scope, { leads: [sentinel], activities: [], archives: [] });
    sentinelMayExist = false;

    await restoreBundle(db, diskBundle, scope);
    fixtureMayExist = true;
    const restoredBundle = await buildBundleFromFirestore(db, scope);
    validateBundle(restoredBundle, scope);
    assert.deepEqual(restoredBundle.records, diskBundle && (diskBundle as LocalCrmExportBundle).records, 'all record IDs, data, timestamps, and relationships must roundtrip');
    assert.deepEqual(restoredBundle.summary.integrity, { won_leads_without_archive: 0, archives_without_lead: 0, activities_without_lead: 0 });
    assert.equal(restoredBundle.summary.lead_count, 3);
    assert.equal(restoredBundle.summary.activity_count, 1);
    assert.equal(restoredBundle.summary.won_deal_archive_count, 1);

    await deleteOwnedDocuments(db, scope, fixture);
    fixtureMayExist = false;
    console.log(JSON.stringify({
      status: 'passed',
      project_id: projectId,
      firestore_emulator_host: process.env.FIRESTORE_EMULATOR_HOST,
      export_schema_version: 1,
      source_counts: { leads: 3, activities: 1, won_deal_archives: 1 },
      restored_counts: { leads: restoredBundle.summary.lead_count, activities: restoredBundle.summary.activity_count, won_deal_archives: restoredBundle.summary.won_deal_archive_count },
      csv_export_readback: { ...csvRoundtrip, firestore_restore_supported: false },
      preserved_ids_and_relationships: true,
      integrity_gaps: restoredBundle.summary.integrity,
      rejected_invalid_cases: 5,
      rejected_existing_namespace_without_overwrite: true,
      cleanup: 'synthetic records and sentinel removed; workspace namespace verified empty',
    }, null, 2));
  } catch (error) {
    outcomeError = error;
  } finally {
    if (sentinelMayExist) {
      try {
        const sentinelId = `sentinel-${runId}`;
        const sentinelData = {
          company_name: 'Fixture sentinel; must not be overwritten', contact_person: 'Synthetic', phone: '',
          industry: '', city: '', pipeline_stage: 'Prospect', deal_value: 0, next_followup_date: '', lead_score: 'Unrated',
          created_at: Timestamp.fromDate(new Date('2026-10-29T00:00:00.000Z')),
          updated_at: Timestamp.fromDate(new Date('2026-10-29T00:00:00.000Z')),
          ownerId: scope.ownerId, role: 'owner',
        };
        await deleteOwnedDocuments(db, scope, { leads: [{ id: sentinelId, data: sentinelData }], activities: [], archives: [] });
      } catch (cleanupError) {
        outcomeError = new AggregateError([outcomeError, cleanupError], 'Drill failed and sentinel cleanup was not fully verified.');
      }
    }
    if (fixtureMayExist) {
      try {
        await deleteOwnedDocuments(db, scope, fixture);
      } catch (cleanupError) {
        outcomeError = new AggregateError([outcomeError, cleanupError], 'Drill failed and fixture cleanup was not fully verified.');
      }
    }
    await rm(tempDir, { recursive: true, force: true });
    await deleteApp(app);
  }
  if (outcomeError) throw outcomeError;
}

main().catch((error: unknown) => {
  console.error(`Backup/restore drill failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
