import { GoogleGenAI } from '@google/genai';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { accountPinRequest, isAllowedAccountPinPreview, sendAccountPinJson } from '../account-pin/http.ts';
import { createStagingAccountPinRuntime } from '../../src/server/accountPinFirebaseAdmin.ts';
import { validateLeadFinderInput } from '../../src/leadFinderAi.ts';
import { AI_DAILY_LIMIT } from '../../src/server/leadFinderQuota.ts';
import { createGeminiLeadFinderGenerator, createLeadFinderService } from '../../src/server/leadFinderService.ts';

interface LeadFinderHttpRequest extends IncomingMessage {
  method?: string;
  body?: unknown;
}

export const config = {
  api: { bodyParser: { sizeLimit: '2kb' } },
};

let cachedRuntime: ReturnType<typeof createStagingAccountPinRuntime> | undefined;
let cachedClient: GoogleGenAI | undefined;

function sendJson(response: ServerResponse, statusCode: number, payload: Record<string, unknown>, headers: Record<string, string> = {}): void {
  sendAccountPinJson(response, statusCode, payload, headers);
}

export default async function handler(request: LeadFinderHttpRequest, response: ServerResponse): Promise<void> {
  if (!isAllowedAccountPinPreview() || process.env.AI_LEAD_FINDER_ENABLED !== 'true') {
    sendJson(response, 404, { code: 'not_found', error: 'Not found.' });
    return;
  }
  if (request.method !== 'POST') {
    sendJson(response, 405, { code: 'method_not_allowed', error: 'Method not allowed.' }, { allow: 'POST' });
    return;
  }
  const contentType = request.headers['content-type'];
  const contentLength = request.headers['content-length'];
  if (typeof contentType !== 'string'
    || contentType.split(';')[0]?.trim().toLowerCase() !== 'application/json'
    || (typeof contentLength === 'string' && Number(contentLength) > 2_048)) {
    sendJson(response, 415, { code: 'invalid_request', error: 'A small application/json body is required.' });
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    sendJson(response, 503, { code: 'ai_unavailable', error: 'Pencarian AI sementara tidak tersedia.' });
    return;
  }

  const validation = validateLeadFinderInput(request.body);
  if (!validation.ok) {
    sendJson(response, 400, { code: 'invalid_request', error: validation.error });
    return;
  }

  try {
    cachedRuntime ??= createStagingAccountPinRuntime();
    const status = await cachedRuntime.status({ ...accountPinRequest(request), method: 'GET' });
    if (status.statusCode !== 200 || status.body.sessionActive !== true) {
      sendJson(response, status.statusCode === 200 ? 403 : status.statusCode, {
        code: 'account_session_required',
        error: 'Sesi owner dan PIN akun yang aktif diperlukan.',
      }, status.headers);
      return;
    }

    const permitted = await cachedRuntime.reserveAiUsage(AI_DAILY_LIMIT);
    if (!permitted) {
      sendJson(response, 429, {
        code: 'daily_limit_reached',
        error: 'Batas pencarian AI harian sudah tercapai. Coba lagi besok.',
      }, { 'retry-after': '3600' });
      return;
    }

    cachedClient ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const generate = createGeminiLeadFinderGenerator(async (requestConfig) => {
      return cachedClient!.models.generateContent(requestConfig);
    });
    const service = createLeadFinderService({ generate });
    const result = await service(validation.value);
    if (!result.ok) {
      sendJson(response, result.status, { code: result.code, error: result.error });
      return;
    }
    sendJson(response, 200, { leads: result.response.leads, sources: result.response.sources });
  } catch {
    sendJson(response, 503, { code: 'service_unavailable', error: 'Pencarian AI sementara tidak tersedia.' });
  }
}
