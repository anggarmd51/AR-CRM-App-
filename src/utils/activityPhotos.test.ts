import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {
  ACTIVITY_PHOTO_ORPHAN_RETENTION_MS,
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

test('activity photo validation accepts image blobs within the input cap only', () => {
  assert.match(validateActivityPhotoMetadata({ type: 'application/pdf', size: 100 }) ?? '', /foto/);
  assert.match(validateActivityPhotoMetadata({ type: 'image/svg+xml', size: 100 }) ?? '', /foto/);
  assert.match(validateActivityPhotoMetadata({ type: 'image/jpeg', size: 13 * 1024 * 1024 }) ?? '', /12 MB/);
  assert.match(validateActivityPhotoMetadata({ type: 'image/jpeg', size: 0 }) ?? '', /12 MB/);
  assert.equal(validateActivityPhotoMetadata({ type: 'image/jpeg', size: 500_000 }), undefined);
});
