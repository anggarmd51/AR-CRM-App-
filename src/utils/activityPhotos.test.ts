import test from 'node:test';
import assert from 'node:assert/strict';
import { validateActivityPhotoMetadata } from './activityPhotos.ts';

test('activity photo validation accepts image blobs within the input cap only', () => {
  assert.match(validateActivityPhotoMetadata({ type: 'application/pdf', size: 100 }) ?? '', /foto/);
  assert.match(validateActivityPhotoMetadata({ type: 'image/svg+xml', size: 100 }) ?? '', /foto/);
  assert.match(validateActivityPhotoMetadata({ type: 'image/jpeg', size: 13 * 1024 * 1024 }) ?? '', /12 MB/);
  assert.match(validateActivityPhotoMetadata({ type: 'image/jpeg', size: 0 }) ?? '', /12 MB/);
  assert.equal(validateActivityPhotoMetadata({ type: 'image/jpeg', size: 500_000 }), undefined);
});
