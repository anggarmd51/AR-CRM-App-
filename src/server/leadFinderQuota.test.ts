import assert from 'node:assert/strict';
import test from 'node:test';
import type { Firestore } from 'firebase-admin/firestore';
import { AI_DAILY_LIMIT, reserveAiUsage } from './leadFinderQuota.ts';

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

test('shared daily AI quota is transaction-safe and resets on the next UTC day', async () => {
  const { firestore, records } = makeFakeFirestore();
  const ownerUid = 'synthetic-owner-not-persisted';
  const dayOne = new Date('2026-10-28T08:00:00.000Z');
  const reservations = await Promise.all(Array.from({ length: 8 }, () =>
    reserveAiUsage(firestore, ownerUid, AI_DAILY_LIMIT, dayOne)));
  assert.equal(reservations.filter(Boolean).length, 5);
  const dayOneRecord = [...records.values()][0];
  assert.equal(dayOneRecord?.count, 5);
  assert.equal(dayOneRecord?.dayKey, '2026-10-28');
  assert.equal(JSON.stringify(dayOneRecord).includes(ownerUid), false);

  assert.equal(await reserveAiUsage(firestore, ownerUid, AI_DAILY_LIMIT, new Date('2026-10-29T00:01:00.000Z')), true);
  assert.equal(records.size, 2);
});

test('Lead Finder daily quota rejects invalid limits before any Firestore access', async () => {
  const { firestore, records } = makeFakeFirestore();
  await assert.rejects(reserveAiUsage(firestore, 'owner', 0), /limit configuration/);
  assert.equal(records.size, 0);
});

test('Lead Finder and meeting summaries consume the same five-request daily budget', async () => {
  const { firestore } = makeFakeFirestore();
  const ownerUid = 'synthetic-owner-shared-ai-budget';
  const now = new Date('2026-10-28T12:00:00.000Z');
  const requests = ['lead-finder', 'summarizer', 'lead-finder', 'summarizer', 'lead-finder'];

  for (const _feature of requests) assert.equal(await reserveAiUsage(firestore, ownerUid, AI_DAILY_LIMIT, now), true);
  assert.equal(await reserveAiUsage(firestore, ownerUid, AI_DAILY_LIMIT, now), false);
});
