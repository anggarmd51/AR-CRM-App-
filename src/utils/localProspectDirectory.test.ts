import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deleteLocalProspect,
  LOCAL_PROSPECT_DIRECTORY_STORAGE_KEY,
  readLocalProspects,
  SAMPLE_PROSPECTS,
  saveLocalProspect,
  searchLocalProspects,
  writeLocalProspects,
  type LocalProspectRecord,
} from './localProspectDirectory.ts';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
  clear(): void { this.values.clear(); }
  keys(): string[] { return [...this.values.keys()]; }
}

const storage = (): Storage => new MemoryStorage() as unknown as Storage;

const newInput = {
  companyName: 'Perusahaan Fiktif — Mentari',
  industry: 'Simulasi ritel',
  city: 'Semarang',
  notes: 'Contoh catatan lokal.',
};

test('directory seeds clearly fictional sample records, never marked verified', () => {
  const browserStorage = storage();
  const records = readLocalProspects(browserStorage);
  assert.ok(records.length >= 5);
  assert.deepEqual(records.map((record) => record.origin), records.map(() => 'sample'));
  assert.ok(records.every((record) => record.companyName.startsWith('Perusahaan Fiktif')));
  assert.ok(records.every((record) => record.notes.includes('bukan perusahaan nyata')));
  assert.ok(records.every((record) => record.verificationStatus === 'needs_manual_verification'));
  assert.equal(browserStorage.getItem(LOCAL_PROSPECT_DIRECTORY_STORAGE_KEY), JSON.stringify(records));
});

test('local search matches name, category, city, and notes without case sensitivity', () => {
  const records = SAMPLE_PROSPECTS.map((record) => ({ ...record }));
  assert.deepEqual(searchLocalProspects(records, '  cakrawala  ').map((record) => record.id), ['sample-cakrawala']);
  assert.deepEqual(searchLocalProspects(records, 'SIMULASI MANUFAKTUR').map((record) => record.id), ['sample-lentera']);
  assert.deepEqual(searchLocalProspects(records, 'yogyakarta').map((record) => record.id), ['sample-pelangi']);
  assert.deepEqual(searchLocalProspects(records, 'bukan perusahaan nyata').map((record) => record.id), records.map((record) => record.id));
  assert.deepEqual(searchLocalProspects(records, 'tidak-ada'), []);
  assert.equal(searchLocalProspects(records, '  ').length, records.length);
});

test('local add, edit, and delete operate only on directory records and retain manual-verification status', () => {
  const samples = SAMPLE_PROSPECTS.map((record) => ({ ...record }));
  const afterAdd = saveLocalProspect(samples, newInput, { now: '2026-10-30T00:00:00.000Z' });
  const added = afterAdd[0]!;
  assert.equal(added.origin, 'local');
  assert.equal(added.companyName, newInput.companyName);
  assert.equal(added.verificationStatus, 'needs_manual_verification');
  assert.equal(added.createdAt, '2026-10-30T00:00:00.000Z');
  assert.equal(searchLocalProspects(afterAdd, 'semarang')[0]?.id, added.id);

  const edited = saveLocalProspect(afterAdd, {
    ...newInput,
    companyName: 'Perusahaan Fiktif — Mentari Revisi',
    notes: 'Diperbarui sebagai simulasi.',
  }, { id: added.id, now: '2026-10-31T00:00:00.000Z' });
  assert.equal(edited[0]?.id, added.id);
  assert.equal(edited[0]?.companyName, 'Perusahaan Fiktif — Mentari Revisi');
  assert.equal(edited[0]?.origin, 'local');
  assert.equal(edited[0]?.verificationStatus, 'needs_manual_verification');
  assert.equal(edited[0]?.updatedAt, '2026-10-31T00:00:00.000Z');

  const editedSample = saveLocalProspect(edited, {
    companyName: 'Perusahaan Fiktif — Arunika Revisi',
    industry: 'Simulasi konstruksi',
    city: 'Jakarta',
    notes: 'Sampel demonstrasi tetap fiktif.',
  }, { id: 'sample-arunika', now: '2026-11-01T00:00:00.000Z' });
  const sample = editedSample.find((record) => record.id === 'sample-arunika');
  assert.equal(sample?.origin, 'sample');
  assert.equal(sample?.verificationStatus, 'needs_manual_verification');

  const afterDelete = deleteLocalProspect(editedSample, added.id);
  assert.equal(afterDelete.some((record) => record.id === added.id), false);
  assert.equal(afterDelete.length, samples.length);
});

test('local persistence round-trips CRUD changes through only the directory storage key', () => {
  const browserStorage = storage();
  const seeded = readLocalProspects(browserStorage);
  const changed = saveLocalProspect(seeded, newInput, { now: '2026-10-30T00:00:00.000Z' });
  assert.equal(writeLocalProspects(changed, browserStorage), true);
  const reloaded = readLocalProspects(browserStorage);
  assert.equal(reloaded.length, changed.length);
  assert.deepEqual(reloaded, changed);
  assert.deepEqual((browserStorage as unknown as MemoryStorage).keys(), [LOCAL_PROSPECT_DIRECTORY_STORAGE_KEY]);
});

test('invalid local storage data falls back to samples and missing storage is handled without crashing', () => {
  const browserStorage = storage();
  browserStorage.setItem(LOCAL_PROSPECT_DIRECTORY_STORAGE_KEY, '{broken json');
  const records = readLocalProspects(browserStorage);
  assert.deepEqual(records.map((record) => record.id), SAMPLE_PROSPECTS.map((record) => record.id));
  assert.equal(writeLocalProspects(records, null), false);
  assert.deepEqual(readLocalProspects(null).map((record) => record.id), SAMPLE_PROSPECTS.map((record) => record.id));
});

test('local save validates required fields and refuses editing a missing local record', () => {
  const records: LocalProspectRecord[] = SAMPLE_PROSPECTS.map((record) => ({ ...record }));
  assert.throws(() => saveLocalProspect(records, { ...newInput, city: '  ' }), /wajib diisi/);
  assert.throws(() => saveLocalProspect(records, { ...newInput, notes: 'x'.repeat(301) }), /batas karakter/);
  assert.throws(() => saveLocalProspect(records, newInput, { id: 'missing-id' }), /tidak ditemukan/);
});
