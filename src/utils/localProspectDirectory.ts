export const LOCAL_PROSPECT_DIRECTORY_STORAGE_KEY = 'ar-crm:lead-finder:local-directory:v1';

export type ProspectVerificationStatus = 'needs_manual_verification';
export type ProspectRecordOrigin = 'sample' | 'local';

export interface LocalProspectRecord {
  id: string;
  companyName: string;
  industry: string;
  city: string;
  notes: string;
  origin: ProspectRecordOrigin;
  verificationStatus: ProspectVerificationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LocalProspectInput {
  companyName: string;
  industry: string;
  city: string;
  notes: string;
}

export const SAMPLE_PROSPECTS: readonly LocalProspectRecord[] = [
  {
    id: 'sample-arunika',
    companyName: 'Perusahaan Fiktif — Arunika',
    industry: 'Simulasi konstruksi',
    city: 'Jakarta',
    notes: 'Contoh demonstrasi; bukan perusahaan nyata.',
    origin: 'sample',
    verificationStatus: 'needs_manual_verification',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'sample-cakrawala',
    companyName: 'Perusahaan Fiktif — Cakrawala',
    industry: 'Simulasi logistik',
    city: 'Bandung',
    notes: 'Contoh demonstrasi; bukan perusahaan nyata.',
    origin: 'sample',
    verificationStatus: 'needs_manual_verification',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'sample-lentera',
    companyName: 'Perusahaan Fiktif — Lentera',
    industry: 'Simulasi manufaktur',
    city: 'Surabaya',
    notes: 'Contoh demonstrasi; bukan perusahaan nyata.',
    origin: 'sample',
    verificationStatus: 'needs_manual_verification',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'sample-pelangi',
    companyName: 'Perusahaan Fiktif — Pelangi',
    industry: 'Simulasi layanan profesional',
    city: 'Yogyakarta',
    notes: 'Contoh demonstrasi; bukan perusahaan nyata.',
    origin: 'sample',
    verificationStatus: 'needs_manual_verification',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'sample-samudra',
    companyName: 'Perusahaan Fiktif — Samudra',
    industry: 'Simulasi teknologi',
    city: 'Medan',
    notes: 'Contoh demonstrasi; bukan perusahaan nyata.',
    origin: 'sample',
    verificationStatus: 'needs_manual_verification',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

function getBrowserStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function copySamples(): LocalProspectRecord[] {
  return SAMPLE_PROSPECTS.map((record) => ({ ...record }));
}

function isRecord(value: unknown): value is LocalProspectRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string'
    && typeof record.companyName === 'string'
    && typeof record.industry === 'string'
    && typeof record.city === 'string'
    && typeof record.notes === 'string'
    && (record.origin === 'sample' || record.origin === 'local')
    && record.verificationStatus === 'needs_manual_verification'
    && typeof record.createdAt === 'string'
    && typeof record.updatedAt === 'string';
}

export function readLocalProspects(storage: Storage | null | undefined = getBrowserStorage()): LocalProspectRecord[] {
  if (!storage) return copySamples();
  try {
    const stored = storage.getItem(LOCAL_PROSPECT_DIRECTORY_STORAGE_KEY);
    if (stored === null) {
      const samples = copySamples();
      storage.setItem(LOCAL_PROSPECT_DIRECTORY_STORAGE_KEY, JSON.stringify(samples));
      return samples;
    }
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed) || !parsed.every(isRecord)) return copySamples();
    return parsed.map((record) => ({ ...record }));
  } catch {
    return copySamples();
  }
}

export function writeLocalProspects(
  prospects: readonly LocalProspectRecord[],
  storage: Storage | null | undefined = getBrowserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(LOCAL_PROSPECT_DIRECTORY_STORAGE_KEY, JSON.stringify(prospects));
    return true;
  } catch {
    return false;
  }
}

export function searchLocalProspects(
  prospects: readonly LocalProspectRecord[],
  query: string,
): LocalProspectRecord[] {
  const normalizedQuery = query.trim().normalize('NFKC').toLocaleLowerCase('id-ID');
  if (!normalizedQuery) return [...prospects];
  return prospects.filter((record) => [record.companyName, record.industry, record.city, record.notes]
    .some((field) => field.normalize('NFKC').toLocaleLowerCase('id-ID').includes(normalizedQuery)));
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function saveLocalProspect(
  prospects: readonly LocalProspectRecord[],
  input: LocalProspectInput,
  options: { id?: string; now?: string } = {},
): LocalProspectRecord[] {
  const companyName = input.companyName.trim();
  const industry = input.industry.trim();
  const city = input.city.trim();
  const notes = input.notes.trim();
  if (!companyName || !industry || !city) {
    throw new Error('Nama contoh, kategori, dan kota wajib diisi.');
  }
  if (companyName.length > 120 || industry.length > 80 || city.length > 80 || notes.length > 300) {
    throw new Error('Ada isian yang melebihi batas karakter.');
  }

  const now = options.now ?? new Date().toISOString();
  if (options.id) {
    const existing = prospects.find((record) => record.id === options.id);
    if (!existing) throw new Error('Catatan lokal yang akan diedit tidak ditemukan.');
    const updated: LocalProspectRecord = {
      ...existing,
      companyName,
      industry,
      city,
      notes,
      updatedAt: now,
      verificationStatus: 'needs_manual_verification',
    };
    return prospects.map((record) => record.id === options.id ? updated : record);
  }

  const added: LocalProspectRecord = {
    id: createId(),
    companyName,
    industry,
    city,
    notes,
    origin: 'local',
    verificationStatus: 'needs_manual_verification',
    createdAt: now,
    updatedAt: now,
  };
  return [added, ...prospects];
}

export function deleteLocalProspect(
  prospects: readonly LocalProspectRecord[],
  id: string,
): LocalProspectRecord[] {
  return prospects.filter((record) => record.id !== id);
}
