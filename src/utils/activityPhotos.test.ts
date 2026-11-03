import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {
  ACTIVITY_PHOTO_FAILED_OPERATION_GRACE_MS,
  ACTIVITY_PHOTO_ORPHAN_RETENTION_MS,
  cleanupOrphanedActivityPhotos,
  loadActivityPhoto,
  MAX_ACTIVITY_PHOTO_BYTES,
  pruneOrphanedActivityPhotos,
  storeActivityPhoto,
  validateActivityPhotoMetadata,
} from './activityPhotos.ts';

test('activity photo output and local storage enforce a strict 500 KB cap', async () => {
  assert.equal(MAX_ACTIVITY_PHOTO_BYTES, 500_000);
  await assert.rejects(
    storeActivityPhoto('activity-oversize', new Blob(['x'.repeat(500_001)], { type: 'image/jpeg' })),
    /tidak lolos pemeriksaan/,
  );
});

test('orphan cleanup preserves server Activities and pending outbox records', async () => {
  const savedAt = Date.now();
  await storeActivityPhoto('activity-live', new Blob(['live'], { type: 'image/jpeg' }));
  await storeActivityPhoto('activity-pending', new Blob(['pending'], { type: 'image/jpeg' }));
  await storeActivityPhoto('activity-orphan', new Blob(['orphan'], { type: 'image/jpeg' }));

  const deleted = await pruneOrphanedActivityPhotos(
    new Set(['activity-live', 'activity-pending']),
    savedAt + ACTIVITY_PHOTO_ORPHAN_RETENTION_MS + 24 * 60 * 60 * 1000,
  );

  assert.equal(deleted, 1);
  assert.ok(await loadActivityPhoto('activity-live'));
  assert.ok(await loadActivityPhoto('activity-pending'));
  assert.equal(await loadActivityPhoto('activity-orphan'), undefined);
});

test('aged permanent-failed activity outbox records release orphan photos after the grace period', async () => {
  const activityId = 'activity-permanent-failed-aged';
  await storeActivityPhoto(activityId, new Blob(['photo'], { type: 'image/jpeg' }));
  const now = Date.now() + ACTIVITY_PHOTO_ORPHAN_RETENTION_MS + 1;

  const deleted = await cleanupOrphanedActivityPhotos({
    serverActivityIds: new Set(),
    operations: [{
      id: `activity-create:${activityId}`,
      state: 'failed',
      permanentFailure: true,
      failedAt: now - ACTIVITY_PHOTO_FAILED_OPERATION_GRACE_MS - 1,
    }],
    isOnline: true,
    isOutboxRestoring: false,
    now,
  });

  assert.ok(deleted >= 1);
  assert.equal(await loadActivityPhoto(activityId), undefined);
});

test('permanent-failed activity records within the grace period keep their photos', async () => {
  const activityId = 'activity-permanent-failed-grace';
  await storeActivityPhoto(activityId, new Blob(['photo'], { type: 'image/jpeg' }));
  const now = Date.now() + ACTIVITY_PHOTO_ORPHAN_RETENTION_MS + 1;

  await cleanupOrphanedActivityPhotos({
    serverActivityIds: new Set(),
    operations: [{
      id: `activity-create:${activityId}`,
      state: 'failed',
      permanentFailure: true,
      failedAt: now - ACTIVITY_PHOTO_FAILED_OPERATION_GRACE_MS + 1,
    }],
    isOnline: true,
    isOutboxRestoring: false,
    now,
  });

  assert.ok(await loadActivityPhoto(activityId));
});

test('pending, syncing, and retryable activity operations keep their orphan photos', async () => {
  const operations = [
    { id: 'activity-create:activity-outbox-pending', state: 'pending' as const },
    { id: 'activity-create:activity-outbox-syncing', state: 'syncing' as const },
    { id: 'activity-create:activity-outbox-retryable', state: 'failed' as const, permanentFailure: false },
  ];
  for (const operation of operations) {
    await storeActivityPhoto(operation.id.slice('activity-create:'.length), new Blob(['photo'], { type: 'image/jpeg' }));
  }
  const now = Date.now() + ACTIVITY_PHOTO_ORPHAN_RETENTION_MS + 1;

  await cleanupOrphanedActivityPhotos({
    serverActivityIds: new Set(), operations, isOnline: true, isOutboxRestoring: false, now,
  });

  for (const operation of operations) {
    assert.ok(await loadActivityPhoto(operation.id.slice('activity-create:'.length)));
  }
});

test('server snapshot activity IDs protect photos independently of outbox status', async () => {
  const activityId = 'activity-server-snapshot-present';
  await storeActivityPhoto(activityId, new Blob(['photo'], { type: 'image/jpeg' }));
  const now = Date.now() + ACTIVITY_PHOTO_ORPHAN_RETENTION_MS + 1;

  await cleanupOrphanedActivityPhotos({
    serverActivityIds: new Set([activityId]),
    operations: [],
    isOnline: true,
    isOutboxRestoring: false,
    now,
  });

  assert.ok(await loadActivityPhoto(activityId));
});

test('photo cleanup is skipped while outbox restoration is running or the app is offline', async () => {
  const restoringId = 'activity-outbox-restoring';
  const offlineId = 'activity-offline-cleanup';
  await storeActivityPhoto(restoringId, new Blob(['photo'], { type: 'image/jpeg' }));
  await storeActivityPhoto(offlineId, new Blob(['photo'], { type: 'image/jpeg' }));
  const now = Date.now() + ACTIVITY_PHOTO_ORPHAN_RETENTION_MS + 1;
  const agedFailure = (activityId: string) => ({
    id: `activity-create:${activityId}`,
    state: 'failed' as const,
    permanentFailure: true,
    failedAt: now - ACTIVITY_PHOTO_FAILED_OPERATION_GRACE_MS - 1,
  });

  assert.equal(await cleanupOrphanedActivityPhotos({
    serverActivityIds: new Set(),
    operations: [agedFailure(restoringId)],
    isOnline: true,
    isOutboxRestoring: true,
    now,
  }), 0);
  assert.equal(await cleanupOrphanedActivityPhotos({
    serverActivityIds: new Set(),
    operations: [agedFailure(offlineId)],
    isOnline: false,
    isOutboxRestoring: false,
    now,
  }), 0);

  assert.ok(await loadActivityPhoto(restoringId));
  assert.ok(await loadActivityPhoto(offlineId));
});

test('activity photo validation accepts image blobs within the input cap only', () => {
  assert.match(validateActivityPhotoMetadata({ type: 'application/pdf', size: 100 }) ?? '', /foto/);
  assert.match(validateActivityPhotoMetadata({ type: 'image/svg+xml', size: 100 }) ?? '', /foto/);
  assert.match(validateActivityPhotoMetadata({ type: 'image/jpeg', size: 13 * 1024 * 1024 }) ?? '', /12 MB/);
  assert.match(validateActivityPhotoMetadata({ type: 'image/jpeg', size: 0 }) ?? '', /12 MB/);
  assert.equal(validateActivityPhotoMetadata({ type: 'image/jpeg', size: 500_000 }), undefined);
});
