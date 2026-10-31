import type { GenerateContentParameters } from '@google/genai';
import { GEMINI_MODEL } from './aiModel.ts';
import type { MeetingSummary } from '../meetingSummary.ts';

export type MeetingSummaryResult =
  | { ok: true; summary: MeetingSummary }
  | { ok: false; status: 400 | 502; code: string; error: string };

export type MeetingSummaryInputResult =
  | { ok: true; value: { notes: string } }
  | { ok: false; error: string };

function boundedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return cleaned && cleaned.length <= maxLength ? cleaned : undefined;
}

export function validateMeetingSummaryInput(value: unknown): MeetingSummaryInputResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'Masukkan catatan rapat untuk diringkas.' };
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== 'notes')) {
    return { ok: false, error: 'Format permintaan ringkasan tidak valid.' };
  }
  const notes = boundedText(input.notes, 8_000);
  if (!notes) return { ok: false, error: 'Catatan harus berisi teks dan maksimal 8.000 karakter.' };
  return { ok: true, value: { notes } };
}

function parseSummary(value: unknown): MeetingSummary | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const summary = boundedText(record.summary, 1_200);
  if (!summary || !Array.isArray(record.decisions) || !Array.isArray(record.action_items)) return undefined;
  const decisions = record.decisions.map((item) => boundedText(item, 300));
  const actionItems = record.action_items.map((item) => boundedText(item, 300));
  if (decisions.some((item) => !item) || actionItems.some((item) => !item)) return undefined;
  return {
    summary,
    decisions: decisions.slice(0, 5) as string[],
    action_items: actionItems.slice(0, 5) as string[],
  };
}

export function createMeetingSummarizerService(dependencies: {
  generate(notes: string): Promise<unknown>;
}) {
  return async function summarize(input: unknown): Promise<MeetingSummaryResult> {
    const validation = validateMeetingSummaryInput(input);
    if (!validation.ok) return { ok: false, status: 400, code: 'invalid_request', error: validation.error };
    try {
      const summary = parseSummary(await dependencies.generate(validation.value.notes));
      if (!summary) {
        return {
          ok: false,
          status: 502,
          code: 'summary_unavailable',
          error: 'Gemini tidak mengembalikan format ringkasan yang dapat diperiksa.',
        };
      }
      return { ok: true, summary };
    } catch {
      return {
        ok: false,
        status: 502,
        code: 'ai_unavailable',
        error: 'Ringkasan AI sementara tidak tersedia. Catatan tidak diubah.',
      };
    }
  };
}

export function createGeminiMeetingSummaryGenerator(
  generateContent: (request: GenerateContentParameters) => Promise<unknown>,
) {
  return async (notes: string): Promise<unknown> => {
    const prompt = [
      'Ringkas catatan rapat berikut dalam bahasa yang sama dengan catatan.',
      'Gunakan hanya informasi eksplisit dalam catatan; jangan menebak fakta, keputusan, pemilik tugas, atau tenggat.',
      'Kembalikan hanya JSON valid dengan kunci summary (string), decisions (array string), action_items (array string).',
      'Jika keputusan atau tindak lanjut tidak disebutkan, gunakan array kosong. Maksimal lima item per array.',
      'Jangan menambahkan nomor telepon, email, atau detail kontak yang tidak diperlukan.',
      'CATATAN RAPAT:',
      notes,
    ].join('\n');
    const response = await generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.1,
        maxOutputTokens: 800,
        responseMimeType: 'application/json',
        httpOptions: { timeout: 8_000 },
      },
    });
    if (!response || typeof response !== 'object') return undefined;
    const record = response as Record<string, unknown>;
    const text = typeof record.text === 'string' ? record.text : '';
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return undefined;
    }
  };
}
