import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PinVerificationRequest, PinVerificationResponse } from '../../src/server/accountPinVerification.ts';
import {
  createProductionAccountPinRuntime,
  createStagingAccountPinRuntime,
  type AccountPinRuntime,
} from '../../src/server/accountPinFirebaseAdmin.ts';
import {
  createConfiguredAccountPinRuntime,
  getAccountPinRuntimeTarget,
  isAccountPinEnrollmentEnabled,
} from '../../src/server/accountPinRuntimeDispatch.ts';

export interface AccountPinHttpRequest extends IncomingMessage {
  method?: string;
  body?: unknown;
}

let cachedRuntime: AccountPinRuntime | undefined;

export function isAllowedAccountPinRoute(): boolean {
  return getAccountPinRuntimeTarget(process.env) !== undefined;
}

export function isAllowedAccountPinPreview(): boolean {
  return getAccountPinRuntimeTarget(process.env) === 'staging';
}

export function isAllowedAccountPinEnrollment(): boolean {
  return isAccountPinEnrollmentEnabled(process.env);
}

export function getAccountPinRuntime(): AccountPinRuntime | undefined {
  if (cachedRuntime) return cachedRuntime;
  const runtime = createConfiguredAccountPinRuntime(process.env, {
    production: () => createProductionAccountPinRuntime(process.env),
    staging: () => createStagingAccountPinRuntime(process.env),
  });
  if (runtime) cachedRuntime = runtime;
  return runtime;
}

export function accountPinRequest(request: AccountPinHttpRequest): PinVerificationRequest {
  return {
    method: request.method,
    authorization: request.headers.authorization,
    origin: request.headers.origin,
    host: request.headers.host,
    forwardedProto: request.headers['x-forwarded-proto'],
    fetchSite: request.headers['sec-fetch-site'],
    body: request.body,
  };
}

export function hasSmallJsonBody(request: AccountPinHttpRequest): boolean {
  const contentType = request.headers['content-type'];
  const contentLength = request.headers['content-length'];
  return typeof contentType === 'string'
    && contentType.split(';')[0]?.trim().toLowerCase() === 'application/json'
    && !(typeof contentLength === 'string' && Number(contentLength) > 2_048);
}

export function sendAccountPinJson(
  response: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store, max-age=0');
  response.setHeader('pragma', 'no-cache');
  response.setHeader('x-content-type-options', 'nosniff');
  for (const [name, value] of Object.entries(extraHeaders)) response.setHeader(name, value);
  response.end(JSON.stringify(payload));
}

export function sendServiceResponse(response: ServerResponse, result: PinVerificationResponse): void {
  sendAccountPinJson(response, result.statusCode, result.body, result.headers);
}
