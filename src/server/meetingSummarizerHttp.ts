import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PinVerificationRequest } from './accountPinVerification.ts';
import type { AccountPinRuntime } from './accountPinFirebaseAdmin.ts';
import { AI_DAILY_LIMIT } from './leadFinderQuota.ts';
import { validateMeetingSummaryInput, type MeetingSummaryResult } from './meetingSummarizer.ts';

export interface MeetingSummaryHttpRequest extends IncomingMessage {
  method?: string;
  body?: unknown;
}

type SummaryRuntime = Pick<AccountPinRuntime, 'status' | 'reserveAiUsage'>;

function sendJson(response: ServerResponse, statusCode: number, payload: Record<string, unknown>, extraHeaders: Record<string, string> = {}): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store, max-age=0');
  response.setHeader('pragma', 'no-cache');
  response.setHeader('x-content-type-options', 'nosniff');
  for (const [name, value] of Object.entries(extraHeaders)) response.setHeader(name, value);
  response.end(JSON.stringify(payload));
}

export function createMeetingSummarizerHttpHandler(dependencies: {
  enabled(): boolean;
  apiKeyAvailable(): boolean;
  createRuntime(): SummaryRuntime;
  summarize(input: unknown): Promise<MeetingSummaryResult>;
}) {
  return async function handler(request: MeetingSummaryHttpRequest, response: ServerResponse): Promise<void> {
    if (!dependencies.enabled()) {
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
      || (typeof contentLength === 'string' && Number(contentLength) > 32_768)) {
      sendJson(response, 415, { code: 'invalid_request', error: 'A bounded application/json body is required.' });
      return;
    }
    const validation = validateMeetingSummaryInput(request.body);
    if (!validation.ok) {
      sendJson(response, 400, { code: 'invalid_request', error: validation.error });
      return;
    }
    if (!dependencies.apiKeyAvailable()) {
      sendJson(response, 503, { code: 'ai_unavailable', error: 'Ringkasan AI sementara tidak tersedia.' });
      return;
    }

    try {
      const runtime = dependencies.createRuntime();
      const sessionRequest: PinVerificationRequest = {
        method: 'GET',
        authorization: request.headers.authorization,
        origin: request.headers.origin,
        host: request.headers.host,
        forwardedProto: request.headers['x-forwarded-proto'],
      };
      const status = await runtime.status(sessionRequest);
      if (status.statusCode !== 200 || status.body.sessionActive !== true) {
        sendJson(response, status.statusCode === 200 ? 403 : status.statusCode, {
          code: 'account_session_required',
          error: 'Sesi owner dan PIN akun yang aktif diperlukan.',
        }, status.headers);
        return;
      }

      // One five-request daily ceiling is shared by Lead Finder and meeting summaries to cap provider cost.
      const permitted = await runtime.reserveAiUsage(AI_DAILY_LIMIT);
      if (!permitted) {
        sendJson(response, 429, { code: 'daily_limit_reached', error: 'Batas penggunaan AI harian sudah tercapai. Coba lagi besok.' }, { 'retry-after': '3600' });
        return;
      }

      const result = await dependencies.summarize(validation.value);
      if (!result.ok) {
        sendJson(response, result.status, { code: result.code, error: result.error });
        return;
      }
      sendJson(response, 200, { summary: result.summary });
    } catch {
      sendJson(response, 503, { code: 'service_unavailable', error: 'Ringkasan AI sementara tidak tersedia.' });
    }
  };
}
