export interface LeadFinderInput {
  industry: string;
  city: string;
  customerProfile?: string;
}

export interface LeadFinderSuggestion {
  company_name: string;
  industry: string;
  city: string;
  reason: string;
  fit_score: number;
}

export interface LeadFinderSource {
  title: string;
  url: string;
}

export interface LeadFinderResponse {
  leads: LeadFinderSuggestion[];
  sources: LeadFinderSource[];
}

export type LeadFinderInputResult =
  | { ok: true; value: LeadFinderInput }
  | { ok: false; error: string };

const EMAIL_PATTERN = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/i;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{7,}\d)/;

function hasContactDetail(value: string): boolean {
  return EMAIL_PATTERN.test(value) || PHONE_PATTERN.test(value);
}

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!cleaned || cleaned.length > maxLength || hasContactDetail(cleaned)) return undefined;
  return cleaned;
}

export function validateLeadFinderInput(value: unknown): LeadFinderInputResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'Masukkan kategori usaha dan kota.' };
  }
  const input = value as Record<string, unknown>;
  const allowedKeys = ['industry', 'city', 'customerProfile'];
  if (Object.keys(input).some((key) => !allowedKeys.includes(key))) {
    return { ok: false, error: 'Format pencarian tidak valid.' };
  }
  const industry = cleanText(input.industry, 120);
  const city = cleanText(input.city, 120);
  const customerProfile = input.customerProfile === undefined
    ? undefined
    : cleanText(input.customerProfile, 240);
  if (!industry || !city || (input.customerProfile !== undefined && !customerProfile)) {
    return { ok: false, error: 'Isi kategori usaha dan kota. Jangan masukkan email atau nomor telepon.' };
  }
  return {
    ok: true,
    value: {
      industry,
      city,
      ...(customerProfile ? { customerProfile } : {}),
    },
  };
}

export function normalizeLeadFinderSources(value: unknown): LeadFinderSource[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, LeadFinderSource>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const source = item as Record<string, unknown>;
    if (typeof source.url !== 'string') continue;
    try {
      const parsed = new URL(source.url);
      const hostname = parsed.hostname.toLowerCase();
      if (parsed.protocol !== 'https:' || !hostname || parsed.username || parsed.password
        || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
        || hostname.startsWith('127.') || hostname === '::1' || hostname.startsWith('10.')
        || hostname.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) continue;
      parsed.hash = '';
      const title = typeof source.title === 'string' && source.title.trim()
        ? source.title.trim().slice(0, 160)
        : parsed.hostname;
      if (!unique.has(parsed.toString())) unique.set(parsed.toString(), { title, url: parsed.toString() });
    } catch {
      // Ignore malformed grounding citations.
    }
    if (unique.size >= 8) break;
  }
  return [...unique.values()];
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace < 0 || lastBrace <= firstBrace) return undefined;
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as unknown;
    } catch {
      return undefined;
    }
  }
}

function shortText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  return cleaned && cleaned.length <= maxLength && !hasContactDetail(cleaned) ? cleaned : undefined;
}

export function parseLeadFinderSuggestions(text: string): LeadFinderSuggestion[] {
  const parsed = extractJsonObject(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
  const rawLeads = (parsed as Record<string, unknown>).leads;
  if (!Array.isArray(rawLeads)) return [];
  const output: LeadFinderSuggestion[] = [];
  const seenCompanies = new Set<string>();
  for (const item of rawLeads) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const company_name = shortText(record.company_name, 180);
    const industry = shortText(record.industry, 120);
    const city = shortText(record.city, 120);
    const reason = shortText(record.reason, 360);
    const fitScore = typeof record.fit_score === 'number' && Number.isFinite(record.fit_score)
      ? Math.max(0, Math.min(100, Math.round(record.fit_score)))
      : undefined;
    if (!company_name || !industry || !city || !reason || fitScore === undefined) continue;
    const key = company_name.toLocaleLowerCase('id-ID');
    if (seenCompanies.has(key)) continue;
    seenCompanies.add(key);
    output.push({ company_name, industry, city, reason, fit_score: fitScore });
    if (output.length >= 5) break;
  }
  return output;
}
