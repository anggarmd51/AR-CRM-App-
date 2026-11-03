import assert from 'node:assert/strict';
import test from 'node:test';
import { LOCAL_PROSPECT_DIRECTORY_STORAGE_KEY, readExistingLocalProspectBackup } from './localProspectDirectory.ts';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  reads = 0;
  writes = 0;
  deletes = 0;
  getItem(key: string): string | null { this.reads += 1; return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.writes += 1; this.values.set(key, value); }
  removeItem(key: string): void { this.deletes += 1; this.values.delete(key); }
  seed(key: string, value: string): void { this.values.set(key, value); }
}

test('legacy prospect data is read verbatim without mutation or re-seeding', () => {
  const storage = new MemoryStorage();
  const oldValue = '[{"companyName":"Catatan lama"}]';
  storage.seed(LOCAL_PROSPECT_DIRECTORY_STORAGE_KEY, oldValue);
  const before = { reads: storage.reads, writes: storage.writes, deletes: storage.deletes };
  assert.equal(readExistingLocalProspectBackup(storage as unknown as Storage), oldValue);
  assert.equal(storage.writes, before.writes);
  assert.equal(storage.deletes, before.deletes);
  assert.equal(storage.reads, before.reads + 1);
});

test('missing, unavailable, and inaccessible storage return no backup without writing', () => {
  const storage = new MemoryStorage();
  assert.equal(readExistingLocalProspectBackup(storage as unknown as Storage), null);
  assert.equal(storage.writes, 0);
  assert.equal(readExistingLocalProspectBackup(null), null);
  const inaccessible = {
    getItem() { throw new Error('storage blocked'); },
    setItem() { throw new Error('must not write'); },
    removeItem() { throw new Error('must not delete'); },
  } as unknown as Storage;
  assert.equal(readExistingLocalProspectBackup(inaccessible), null);
});
