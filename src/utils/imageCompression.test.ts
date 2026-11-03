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

test('repeatedly downscales JPEG output until a strict 500 KB target is met', async () => {
  const bitmapDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const outputWidths: number[] = [];
  let fakeCanvas!: HTMLCanvasElement;
  fakeCanvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => {} }),
    toBlob(callback: BlobCallback, type = 'image/jpeg') {
      outputWidths.push(fakeCanvas.width);
      const size = fakeCanvas.width > 256 ? 500_001 : 120_000;
      callback(new Blob([new Uint8Array(size)], { type }));
    },
  } as unknown as HTMLCanvasElement;
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: async () => ({ width: 1600, height: 1200, close: () => {} }),
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => fakeCanvas },
  });
  try {
    const result = await compressImageFile(new Blob([new Uint8Array([1])], { type: 'image/jpeg' }), {
      maxDimension: 1440,
      maxBytes: 500_000,
      qualitySteps: [0.5],
    });
    assert.equal(result.type, 'image/jpeg');
    assert.ok(result.size <= 500_000);
    assert.ok(outputWidths[0]! > 256);
    assert.ok(outputWidths.at(-1)! <= 256);
  } finally {
    if (bitmapDescriptor) Object.defineProperty(globalThis, 'createImageBitmap', bitmapDescriptor);
    else Reflect.deleteProperty(globalThis, 'createImageBitmap');
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('fails closed when browser image APIs are unavailable instead of returning original data', async () => {
  await assert.rejects(
    compressImageFile(new Blob(['synthetic image'], { type: 'image/jpeg' })),
    /tidak tersedia di browser/,
  );
});
