export const MAX_IMAGE_INPUT_BYTES = 12 * 1024 * 1024;
export const MAX_COMPRESSED_IMAGE_BYTES = 900 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
]);

export interface CompressImageOptions {
  maxDimension?: number;
  maxBytes?: number;
  qualitySteps?: readonly number[];
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== 'image/jpeg') {
        reject(new Error('Browser tidak dapat memproses foto menjadi JPEG.'));
        return;
      }
      resolve(blob);
    }, 'image/jpeg', quality);
  });
}

/**
 * Compresses an image in the browser and returns only a bounded JPEG Blob.
 * It never returns a data URL or the original file as a fallback.
 */
export async function compressImageFile(
  file: Blob,
  options: CompressImageOptions = {},
): Promise<Blob> {
  const maxDimension = options.maxDimension ?? 1440;
  const maxBytes = options.maxBytes ?? MAX_COMPRESSED_IMAGE_BYTES;
  const qualitySteps = options.qualitySteps ?? [0.82, 0.72, 0.62, 0.52, 0.42];

  if (!SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase())) {
    throw new Error('Pilih file foto dengan format gambar yang didukung.');
  }
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_IMAGE_INPUT_BYTES) {
    throw new Error('Ukuran foto asli harus lebih dari 0 dan maksimal 12 MB.');
  }
  if (!Number.isInteger(maxDimension) || maxDimension < 1
    || !Number.isInteger(maxBytes) || maxBytes < 1
    || qualitySteps.length === 0
    || qualitySteps.some((quality) => !Number.isFinite(quality) || quality <= 0 || quality > 1)) {
    throw new Error('Opsi kompresi foto tidak valid.');
  }
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    throw new Error('Pemrosesan foto tidak tersedia di browser ini.');
  }

  const bitmap = await createImageBitmap(file);
  try {
    if (!Number.isFinite(bitmap.width) || !Number.isFinite(bitmap.height) || bitmap.width <= 0 || bitmap.height <= 0) {
      throw new Error('Dimensi foto tidak valid.');
    }
    let targetDimension = Math.min(maxDimension, Math.max(bitmap.width, bitmap.height));
    for (let resizePass = 0; resizePass < 12; resizePass += 1) {
      const scale = Math.min(1, targetDimension / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Browser tidak dapat membuka kanvas foto.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of qualitySteps) {
        const compressed = await canvasToJpeg(canvas, quality);
        if (compressed.size > 0 && compressed.size <= maxBytes) return compressed;
      }
      if (targetDimension <= 1) break;
      targetDimension = Math.max(1, Math.floor(targetDimension * 0.75));
    }
    throw new Error('Foto masih terlalu besar setelah diperkecil. Pilih foto yang lebih kecil.');
  } finally {
    bitmap.close();
  }
}
