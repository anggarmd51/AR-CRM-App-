import assert from 'node:assert/strict';
import test from 'node:test';
import type { Firestore } from 'firebase-admin/firestore';
import {
  LEAD_FINDER_DAILY_LIMIT,
  MEETING_SUMMARY_DAILY_LIMIT,
  reserveAiUsage,
  type AiUsageScope,
} from './leadFinderQuota.ts';

interface Snapshot {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

function makeFakeFirestore() {
  const records = new Map<string, Record<string, unknown>>();
  let chain = Promise.resolve();
  const firestore = {
    collection(name: string) {
      return { doc: (id: string) => ({ path: `${name}/${id}` }) };
    },
    runTransaction<T>(update: (transaction: {
      get(ref: { path: string }): Promise<Snapshot>;
      set(ref: { path: string }, value: Record<string, unknown>): void;
    }) => Promise<T>): Promise<T> {
      const execute = chain.then(() => update({
        async get(ref) {
          const value = records.get(ref.path);
          return { exists: Boolean(value), data: () => value };
        },
        set(ref, value) {
          records.set(ref.path, { ...value });
        },
      }));
      chain = execute.then(() => undefined, () => undefined);
      return execute;
    },
  };
  return { firestore: firestore as unknown as Firestore, records };
}

test('Lead Finder daily quota is transaction-safe, allows exactly 30, and resets on the next UTC day', async () => {
  const { firestore, records } = makeFakeFirestore();
  const ownerUid = 'synthetic-owner-not-persisted';
  const dayOne = new Date('2026-10-28T08:00:00.000Z');
  const reservations = await Promise.all(Array.from({ length: 35 }, () =>
    reserveAiUsage(firestore, ownerUid, LEAD_FINDER_DAILY_LIMIT, dayOne, 'lead-finder')));
  assert.equal(reservations.filter(Boolean).length, LEAD_FINDER_DAILY_LIMIT);
  const dayOneRecord = [...records.values()][0];
  assert.equal(dayOneRecord?.count, LEAD_FINDER_DAILY_LIMIT);
  assert.equal(dayOneRecord?.dayKey, '2026-10-28');
  assert.equal(JSON.stringify(dayOneRecord).includes(ownerUid), false);

  assert.equal(await reserveAiUsage(firestore, ownerUid, LEAD_FINDER_DAILY_LIMIT, new Date('2026-10-29T00:01:00.000Z'), 'lead-finder'), true);
  assert.equal(records.size, 2);
});

test('Lead Finder and Meeting Summarizer quotas are independent', async () => {
  const { firestore, records } = makeFakeFirestore();
  const ownerUid = 'synthetic-owner-independent-quota';
  const now = new Date('2026-10-28T12:00:00.000Z');

  for (let index = 0; index < LEAD_FINDER_DAILY_LIMIT; index += 1) {
    assert.equal(await reserveAiUsage(firestore, ownerUid, LEAD_FINDER_DAILY_LIMIT, now, 'lead-finder'), true);
  }
  assert.equal(await reserveAiUsage(firestore, ownerUid, LEAD_FINDER_DAILY_LIMIT, now, 'lead-finder'), false);

  for (let index = 0; index < MEETING_SUMMARY_DAILY_LIMIT; index += 1) {
    assert.equal(await reserveAiUsage(firestore, ownerUid, MEETING_SUMMARY_DAILY_LIMIT, now, 'meeting-summary'), true);
  }
  assert.equal(await reserveAiUsage(firestore, ownerUid, MEETING_SUMMARY_DAILY_LIMIT, now, 'meeting-summary'), false);
  assert.equal(records.size, 2);
  assert.deepEqual([...records.values()].map((record) => record.count).sort((a, b) => Number(a) - Number(b)), [5, 30]);
});

test('daily quota rejects invalid limits or scopes before any Firestore access', async () => {
  const { firestore, records } = makeFakeFirestore();
  await assert.rejects(reserveAiUsage(firestore, 'owner', 0), /limit configuration/);
  await assert.rejects(reserveAiUsage(firestore, 'owner', LEAD_FINDER_DAILY_LIMIT + 1), /limit configuration/);
  await assert.rejects(reserveAiUsage(firestore, 'owner', 5, new Date(), 'unknown' as AiUsageScope), /limit configuration/);
  await assert.rejects(reserveAiUsage(firestore, '  ', 5), /limit configuration/);
  assert.equal(records.size, 0);
});
