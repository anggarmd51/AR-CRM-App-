export const MAX_ACTIVITY_PHOTO_INPUT_BYTES = 12 * 1024 * 1024;
export const MAX_ACTIVITY_PHOTO_BYTES = 900 * 1024;
const MAX_ACTIVITY_PHOTO_DIMENSION = 1440;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif']);
const DATABASE_NAME = 'ar-crm-local-activity-photos';
const STORE_NAME = 'photos';

export function validateActivityPhotoMetadata(file: Pick<Blob, 'type' | 'size'>): string | undefined {
  if (!ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) return 'Pilih foto JPG, PNG, WebP, AVIF, atau HEIC.';
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_ACTIVITY_PHOTO_INPUT_BYTES) {
    return 'Ukuran foto asli harus di bawah 12 MB.';
  }
  return undefined;
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Browser tidak dapat memproses foto.')), 'image/jpeg', quality);
  });
}

export async function compressActivityPhoto(file: File): Promise<Blob> {
  const validationError = validateActivityPhotoMetadata(file);
  if (validationError) throw new Error(validationError);
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    throw new Error('Pemrosesan foto tidak tersedia di browser ini.');
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_ACTIVITY_PHOTO_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Browser tidak dapat membuka kanvas foto.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42]) {
      const compressed = await canvasBlob(canvas, quality);
      if (compressed.size <= MAX_ACTIVITY_PHOTO_BYTES) return compressed;
    }
    throw new Error('Foto masih terlalu besar setelah diperkecil. Pilih foto yang lebih kecil.');
  } finally {
    bitmap.close();
  }
}

interface StoredPhoto {
  activityId: string;
  photo: Blob;
  savedAt: number;
}

function openPhotoDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Penyimpanan lokal browser tidak tersedia.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'activityId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Penyimpanan foto lokal tidak dapat dibuka.'));
    request.onblocked = () => reject(new Error('Penyimpanan foto lokal sedang diblokir tab lain.'));
  });
}

export async function storeActivityPhoto(activityId: string, photo: Blob): Promise<void> {
  if (!activityId.trim() || activityId.length > 150 || photo.type !== 'image/jpeg' || photo.size > MAX_ACTIVITY_PHOTO_BYTES) {
    throw new Error('Foto aktivitas tidak lolos pemeriksaan penyimpanan lokal.');
  }
  const database = await openPhotoDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({ activityId, photo, savedAt: Date.now() } satisfies StoredPhoto);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('Foto tidak dapat disimpan pada perangkat ini.'));
      transaction.onabort = () => reject(new Error('Penyimpanan foto lokal dibatalkan.'));
    });
  } finally {
    database.close();
  }
}

export async function loadActivityPhoto(activityId: string): Promise<Blob | undefined> {
  const database = await openPhotoDatabase();
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(activityId);
      request.onsuccess = () => {
        const record = request.result as StoredPhoto | undefined;
        resolve(record?.photo);
      };
      request.onerror = () => reject(new Error('Foto lokal tidak dapat dibaca.'));
    });
  } finally {
    database.close();
  }
}
