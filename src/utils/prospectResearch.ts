export interface ProspectResearchResult {
  target_roles: string;
  email_pattern: string;
  google_dorks: string;
}

export interface ProspectResearchEntities {
  target_role: string;
  alt_roles: string[];
  company_or_industry: string;
  city: string;
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

function safeDorkTerm(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/["'`\\()[\]{}<>|]/g, ' ')
    .replace(/\b(?:site|inurl|intitle|allintitle|filetype|intext):\S*/gi, ' ')
    .replace(/\b(?:OR|AND|NOT)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim();
}

/** Builds only the search operators owned by the app; entity values remain quoted literals. */
export function buildGoogleDorksFromEntities(value: unknown): string {
  const entities = isRecord(value) ? value : {};
  const roleTerms = [
    safeDorkTerm(entities.target_role),
    ...(Array.isArray(entities.alt_roles) ? entities.alt_roles.map(safeDorkTerm) : []),
  ].filter((term, index, terms) => Boolean(term) && terms.indexOf(term) === index).slice(0, 8);
  const companyOrIndustry = safeDorkTerm(entities.company_or_industry);
  const city = safeDorkTerm(entities.city);
  const clauses = ['site:linkedin.com/in'];

  if (roleTerms.length === 1) clauses.push(`"${roleTerms[0]}"`);
  if (roleTerms.length > 1) clauses.push(`(${roleTerms.map((term) => `"${term}"`).join(' OR ')})`);
  if (companyOrIndustry) clauses.push(`("${companyOrIndustry}")`);
  if (city) clauses.push(`"${city}"`);

  return clauses.join(' ').slice(0, 1_000);
}

/** Local, no-AI fallback: whitespace and commas become separate quoted search terms. */
export function buildFallbackGoogleDorks(rawQuery: string): string {
  const terms = rawQuery.normalize('NFKC')
    .split(/[\s,]+/)
    .map(safeDorkTerm)
    .filter((term, index, all) => Boolean(term) && all.indexOf(term) === index)
    .slice(0, 16);
  return ['site:linkedin.com/in', ...terms.map((term) => `"${term}"`)].join(' ').slice(0, 1_000);
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
