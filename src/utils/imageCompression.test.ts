import test from 'node:test';
import assert from 'node:assert/strict';
import { compressImageFile, MAX_COMPRESSED_IMAGE_BYTES, MAX_IMAGE_INPUT_BYTES } from './imageCompression.ts';

test('compression bounds default output and source sizes', () => {
  assert.equal(MAX_COMPRESSED_IMAGE_BYTES, 900 * 1024);
  assert.equal(MAX_IMAGE_INPUT_BYTES, 12 * 1024 * 1024);
});

test('rejects unsupported input before attempting browser decoding', async () => {
  await assert.rejects(
    compressImageFile(new Blob(['file'], { type: 'application/pdf' })),
    /format gambar/,
  );
});

test('rejects empty or over-limit photo input', async () => {
  await assert.rejects(compressImageFile(new Blob([], { type: 'image/jpeg' })), /maksimal 12 MB/);
  await assert.rejects(
    compressImageFile(new Blob(['x'.repeat(1024)], { type: 'image/jpeg' }), { maxBytes: 0 }),
    /Opsi kompresi foto tidak valid/,
  );
});

test('fails closed when browser image APIs are unavailable instead of returning original data', async () => {
  await assert.rejects(
    compressImageFile(new Blob(['synthetic image'], { type: 'image/jpeg' })),
    /tidak tersedia di browser/,
  );
});
