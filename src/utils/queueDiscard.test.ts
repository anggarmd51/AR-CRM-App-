import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmAndDiscardFailedQueueOperation } from './queueDiscard.ts';

const failedOperation = { id: 'failed-1', label: 'Tambah prospek', state: 'failed' as const };

test('canceling discard returns cancelled and never calls deletion', async () => {
  let discardCalls = 0;
  let prompt = '';
  const result = await confirmAndDiscardFailedQueueOperation(
    failedOperation,
    (message) => { prompt = message; return false; },
    async () => { discardCalls += 1; return true; },
  );
  assert.equal(result, 'cancelled');
  assert.match(prompt, /Tambah prospek/);
  assert.equal(discardCalls, 0);
});

test('discard confirmation is restricted to failed operations and forwards only the selected ID', async () => {
  let confirmations = 0;
  const discardedIds: string[] = [];
  const pendingResult = await confirmAndDiscardFailedQueueOperation(
    { id: 'pending-1', label: 'Menunggu', state: 'pending' },
    () => { confirmations += 1; return true; },
    async (id) => { discardedIds.push(id); return true; },
  );
  const failedResult = await confirmAndDiscardFailedQueueOperation(
    failedOperation,
    () => { confirmations += 1; return true; },
    async (id) => { discardedIds.push(id); return true; },
  );
  assert.equal(pendingResult, 'ineligible');
  assert.equal(failedResult, 'discarded');
  assert.equal(confirmations, 1);
  assert.deepEqual(discardedIds, ['failed-1']);
});

test('a rejected durable delete is unchanged rather than cancelled or discarded', async () => {
  assert.equal(await confirmAndDiscardFailedQueueOperation(
    failedOperation, () => true, async () => false,
  ), 'unchanged');
});
