import type { GenerateContentParameters } from '@google/genai';
import { GEMINI_MODEL } from './aiModel.ts';
import {
  normalizeLeadFinderSources,
  parseLeadFinderSuggestions,
  validateLeadFinderInput,
  type LeadFinderInput,
  type LeadFinderResponse,
  type LeadFinderSource,
} from '../leadFinderAi.ts';

export interface LeadFinderGenerationResult {
  text: string;
  sources: unknown;
}

export interface LeadFinderServiceDependencies {
  generate(input: LeadFinderInput): Promise<LeadFinderGenerationResult>;
}

export type LeadFinderServiceResult =
  | { ok: true; response: LeadFinderResponse }
  | { ok: false; status: 400 | 502; code: string; error: string };

export function createLeadFinderService(dependencies: LeadFinderServiceDependencies) {
  return async function search(input: unknown): Promise<LeadFinderServiceResult> {
    const validation = validateLeadFinderInput(input);
    if (!validation.ok) {
      return { ok: false, status: 400, code: 'invalid_request', error: validation.error };
    }

    try {
      const generated = await dependencies.generate(validation.value);
      const leads = parseLeadFinderSuggestions(generated.text);
      const sources: LeadFinderSource[] = normalizeLeadFinderSources(generated.sources);
      if (leads.length === 0 || sources.length === 0) {
        return {
          ok: false,
          status: 502,
          code: 'grounded_results_unavailable',
          error: 'Gemini tidak mengembalikan saran dengan sumber web yang dapat diperiksa.',
        };
      }
      return { ok: true, response: { leads, sources } };
    } catch {
      return {
        ok: false,
        status: 502,
        code: 'ai_unavailable',
        error: 'Pencarian AI sementara tidak tersedia. Coba lagi nanti.',
      };
    }
  };
}

export function createGeminiLeadFinderGenerator(
  generateContent: (request: GenerateContentParameters) => Promise<unknown>,
) {
  return async (input: LeadFinderInput): Promise<LeadFinderGenerationResult> => {
    const profile = input.customerProfile ? `\nProfil pelanggan yang dicari: ${input.customerProfile}` : '';
    const prompt = [
      'Temukan maksimal lima perusahaan yang benar-benar ada dan relevan menggunakan Google Search.',
      'Gunakan hanya fakta yang didukung hasil pencarian. Jangan menebak nama perusahaan, industri, kota, atau alasan kecocokan.',
      'Jangan membuat atau mengembalikan nama orang, email, nomor telepon, alamat jalan, URL situs, atau data kontak.',
      'Jika bukti yang cukup tidak ditemukan, kembalikan daftar kosong. Jangan mengarang hasil.',
      'Balas hanya JSON valid dengan bentuk: {"leads":[{"company_name":"...","industry":"...","city":"...","reason":"...","fit_score":0}]}.',
      `Kategori usaha: ${input.industry}`,
      `Kota/area: ${input.city}${profile}`,
    ].join('\n');
    const response = await generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.1,
        maxOutputTokens: 900,
        tools: [{ googleSearch: {} }],
        httpOptions: { timeout: 8_000 },
      },
    });
    const record = response && typeof response === 'object' ? response as Record<string, unknown> : {};
    const candidates = Array.isArray(record.candidates) ? record.candidates : [];
    const candidate = candidates[0] && typeof candidates[0] === 'object'
      ? candidates[0] as Record<string, unknown>
      : {};
    const metadata = candidate.groundingMetadata && typeof candidate.groundingMetadata === 'object'
      ? candidate.groundingMetadata as Record<string, unknown>
      : {};
    const chunks = Array.isArray(metadata.groundingChunks) ? metadata.groundingChunks : [];
    const sources = chunks.flatMap((chunk) => {
      if (!chunk || typeof chunk !== 'object') return [];
      const web = (chunk as Record<string, unknown>).web;
      if (!web || typeof web !== 'object') return [];
      const source = web as Record<string, unknown>;
      return typeof source.uri === 'string'
        ? [{ url: source.uri, title: typeof source.title === 'string' ? source.title : source.uri }]
        : [];
    });
    const text = typeof record.text === 'string' ? record.text : '';
    return { text, sources };
  };
}
