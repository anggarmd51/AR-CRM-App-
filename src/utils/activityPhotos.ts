import {
  compressImageFile,
  MAX_IMAGE_INPUT_BYTES,
} from './imageCompression.ts';

export const MAX_ACTIVITY_PHOTO_INPUT_BYTES = MAX_IMAGE_INPUT_BYTES;
export const MAX_ACTIVITY_PHOTO_BYTES = 500_000;
export const ACTIVITY_PHOTO_ORPHAN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
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

export async function compressActivityPhoto(file: File): Promise<Blob> {
  const validationError = validateActivityPhotoMetadata(file);
  if (validationError) throw new Error(validationError);
  return compressImageFile(file, {
    maxDimension: MAX_ACTIVITY_PHOTO_DIMENSION,
    maxBytes: MAX_ACTIVITY_PHOTO_BYTES,
  });
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
  if (!activityId.trim() || activityId.length > 150 || photo.type !== 'image/jpeg'
    || photo.size <= 0 || photo.size > MAX_ACTIVITY_PHOTO_BYTES) {
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

export async function pruneOrphanedActivityPhotos(
  retainedActivityIds: ReadonlySet<string>,
  now = Date.now(),
): Promise<number> {
  if (!Number.isFinite(now)) throw new Error('Waktu pembersihan foto tidak valid.');
  const staleBefore = now - ACTIVITY_PHOTO_ORPHAN_RETENTION_MS;
  const database = await openPhotoDatabase();
  try {
    return await new Promise<number>((resolve, reject) => {
      let deletedCount = 0;
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const request = transaction.objectStore(STORE_NAME).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const record = cursor.value as Partial<StoredPhoto>;
        if (typeof record.activityId === 'string'
          && !retainedActivityIds.has(record.activityId)
          && typeof record.savedAt === 'number'
          && Number.isFinite(record.savedAt)
          && record.savedAt < staleBefore) {
          cursor.delete();
          deletedCount += 1;
        }
        cursor.continue();
      };
      request.onerror = () => reject(new Error('Daftar foto lokal tidak dapat diperiksa.'));
      transaction.oncomplete = () => resolve(deletedCount);
      transaction.onerror = () => reject(new Error('Foto orphan tidak dapat dibersihkan.'));
      transaction.onabort = () => reject(new Error('Pembersihan foto lokal dibatalkan.'));
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
