import type { IncomingMessage, ServerResponse } from 'node:http';
import { validateProspectQuery } from '../utils/prospectResearch.ts';
import type { PinVerificationRequest, PinVerificationResponse } from './accountPinVerification.ts';
import {
  profileProspectWithFallback,
  ProspectingFailure,
  type ProspectingEngineOptions,
  type ProspectingLogger,
} from './prospecting.ts';

export interface ProspectingHttpRequest extends IncomingMessage {
  method?: string;
  body?: unknown;
}

export interface ProspectingOwnerRuntime {
  status(request: PinVerificationRequest): Promise<PinVerificationResponse>;
  reserveAiUsage(limit?: number): Promise<boolean>;
}

export interface ProspectingHttpDependencies {
  enabled(): boolean;
  getRuntime(): ProspectingOwnerRuntime | undefined;
  profile(query: unknown, options: ProspectingEngineOptions): Promise<unknown>;
  environment: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  log?: ProspectingLogger;
}

function sendJson(response: ServerResponse, status: number, payload: Record<string, unknown>): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store, max-age=0');
  response.setHeader('pragma', 'no-cache');
  response.setHeader('x-content-type-options', 'nosniff');
  response.end(JSON.stringify(payload));
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function sameOriginHttps(request: ProspectingHttpRequest): boolean {
  const origin = firstHeader(request.headers.origin);
  const host = request.headers.host?.trim().toLowerCase();
  const forwardedProto = firstHeader(request.headers['x-forwarded-proto'])?.split(',')[0]?.trim().toLowerCase();
  if (!origin || !host || forwardedProto !== 'https') return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'https:' && parsed.host.toLowerCase() === host;
  } catch {
    return false;
  }
}

function bearerToken(value: string | string[] | undefined): string | undefined {
  const header = firstHeader(value);
  if (!header || header.length > 8_200) return undefined;
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(header);
  return match?.[1];
}

function requestQuery(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const value = body as Record<string, unknown>;
  if (Object.keys(value).length !== 1 || !Object.hasOwn(value, 'query')) return undefined;
  try {
    return validateProspectQuery(value.query);
  } catch {
    return undefined;
  }
}

export function createProspectingHttpHandler(dependencies: ProspectingHttpDependencies) {
  return async (request: ProspectingHttpRequest, response: ServerResponse): Promise<void> => {
    if (request.method !== 'POST') {
      sendJson(response, 405, { code: 'method_not_allowed', error: 'Method not allowed.' });
      return;
    }
    if (!dependencies.enabled()) {
      sendJson(response, 503, { code: 'feature_disabled', error: 'Prospecting AI is not enabled.' });
      return;
    }
    if (!sameOriginHttps(request)) {
      sendJson(response, 403, { code: 'origin_not_allowed', error: 'Request origin is not allowed.' });
      return;
    }
    const contentType = firstHeader(request.headers['content-type'])?.split(';')[0]?.trim().toLowerCase();
    const contentLength = firstHeader(request.headers['content-length']);
    if (contentType !== 'application/json') {
      sendJson(response, 415, { code: 'content_type_required', error: 'JSON content type is required.' });
      return;
    }
    if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > 2_048)) {
      sendJson(response, 413, { code: 'request_too_large', error: 'Request is too large.' });
      return;
    }

    const token = bearerToken(request.headers.authorization);
    if (!token) {
      sendJson(response, 401, { code: 'unauthenticated', error: 'Owner authentication is required.' });
      return;
    }
    const query = requestQuery(request.body);
    if (!query) {
      sendJson(response, 400, { code: 'invalid_request', error: 'A valid search query is required.' });
      return;
    }

    const runtime = dependencies.getRuntime();
    if (!runtime) {
      sendJson(response, 503, { code: 'service_unavailable', error: 'Prospecting is temporarily unavailable.' });
      return;
    }
    try {
      const sessionStatus = await runtime.status({
        method: 'GET',
        authorization: request.headers.authorization,
        origin: request.headers.origin,
        host: request.headers.host,
        forwardedProto: request.headers['x-forwarded-proto'],
        fetchSite: request.headers['sec-fetch-site'],
      });
      if (sessionStatus.statusCode === 503) {
        sendJson(response, 503, { code: 'session_status_unavailable', error: 'Prospecting is temporarily unavailable.' });
        return;
      }
      if (sessionStatus.statusCode !== 200 || sessionStatus.body.sessionActive !== true) {
        sendJson(response, 401, { code: 'unauthenticated', error: 'Owner authentication is required.' });
        return;
      }
    } catch {
      sendJson(response, 503, { code: 'session_status_unavailable', error: 'Prospecting is temporarily unavailable.' });
      return;
    }

    let quotaReserved: boolean;
    try {
      quotaReserved = await runtime.reserveAiUsage(5);
    } catch {
      sendJson(response, 503, { code: 'quota_unavailable', error: 'Prospecting is temporarily unavailable.' });
      return;
    }
    if (!quotaReserved) {
      sendJson(response, 429, { code: 'daily_limit_reached', error: 'The daily AI limit has been reached.' });
      return;
    }

    try {
      const result = await dependencies.profile(query, {
        environment: dependencies.environment,
        ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
        ...(dependencies.log ? { log: dependencies.log } : {}),
      });
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        sendJson(response, 502, { code: 'invalid_provider_response', error: 'Prospecting returned an invalid response.' });
        return;
      }
      const output = result as Record<string, unknown>;
      if (Object.keys(output).length !== 3
        || typeof output.target_roles !== 'string'
        || typeof output.email_pattern !== 'string'
        || typeof output.google_dorks !== 'string') {
        sendJson(response, 502, { code: 'invalid_provider_response', error: 'Prospecting returned an invalid response.' });
        return;
      }
      sendJson(response, 200, {
        target_roles: output.target_roles,
        email_pattern: output.email_pattern,
        google_dorks: output.google_dorks,
      });
    } catch (error) {
      const failure = error instanceof ProspectingFailure ? error : undefined;
      const status = failure?.kind === 'provider_rejected' || failure?.kind === 'invalid_response' ? 502 : 503;
      const code = status === 502 ? 'provider_unavailable' : 'providers_temporarily_unavailable';
      sendJson(response, status, { code, error: 'Prospecting is temporarily unavailable. Try again later.' });
    }
  };
}

export const defaultProspectingProfile = profileProspectWithFallback;
