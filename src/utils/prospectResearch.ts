export interface ProspectResearchResult {
  target_roles: string;
  email_pattern: string;
  google_dorks: string;
}

export const MAX_PROSPECT_QUERY_LENGTH = 240;
const RESULT_KEYS = ['target_roles', 'email_pattern', 'google_dorks'] as const;

export function validateProspectQuery(rawQuery: unknown): string {
  if (typeof rawQuery !== 'string') throw new Error('Masukkan kata pencarian.');
  const query = rawQuery.trim();
  if (!query) throw new Error('Masukkan kata pencarian.');
  if (query.length > MAX_PROSPECT_QUERY_LENGTH) {
    throw new Error(`Kata pencarian maksimal ${MAX_PROSPECT_QUERY_LENGTH} karakter.`);
  }
  return query;
}

export function buildLinkedInPeopleSearchUrl(rawQuery: string): string {
  const query = validateProspectQuery(rawQuery);
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
}

export function buildGoogleSearchUrl(rawQuery: string): string {
  if (typeof rawQuery !== 'string' || !rawQuery.trim()) throw new Error('Google Dorks belum tersedia.');
  return `https://www.google.com/search?q=${encodeURIComponent(rawQuery.trim())}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Strictly validates the provider/API response before any result reaches the UI. */
export function parseProspectResearchResponse(value: unknown): ProspectResearchResult {
  let decoded: unknown = value;
  if (typeof value === 'string') {
    const text = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
      decoded = JSON.parse(text);
    } catch {
      throw new Error('Respons riset tidak valid.');
    }
  }
  if (!isRecord(decoded)) throw new Error('Respons riset tidak valid.');
  const keys = Object.keys(decoded).sort();
  if (keys.length !== RESULT_KEYS.length || RESULT_KEYS.some((key) => !Object.hasOwn(decoded, key))) {
    throw new Error('Respons riset tidak memenuhi skema.');
  }
  const targetRoles = decoded.target_roles;
  const emailPattern = decoded.email_pattern;
  const googleDorks = decoded.google_dorks;
  if (typeof targetRoles !== 'string' || targetRoles.length > 1_200
    || typeof emailPattern !== 'string' || emailPattern.length > 500
    || typeof googleDorks !== 'string' || googleDorks.length > 1_000) {
    throw new Error('Respons riset tidak memenuhi skema.');
  }
  return {
    target_roles: targetRoles,
    email_pattern: emailPattern,
    google_dorks: googleDorks,
  };
}
