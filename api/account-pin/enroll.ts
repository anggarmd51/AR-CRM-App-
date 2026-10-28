import type { ServerResponse } from 'node:http';
import {
  accountPinRequest,
  getAccountPinRuntime,
  hasSmallJsonBody,
  isAllowedAccountPinEnrollment,
  isAllowedAccountPinRoute,
  sendAccountPinJson,
  sendServiceResponse,
  type AccountPinHttpRequest,
} from './http.ts';

export const config = {
  api: { bodyParser: { sizeLimit: '2kb' } },
};

export default async function handler(request: AccountPinHttpRequest, response: ServerResponse): Promise<void> {
  if (!isAllowedAccountPinRoute() || !isAllowedAccountPinEnrollment()) {
    sendAccountPinJson(response, 404, { code: 'not_found', error: 'Not found.' });
    return;
  }
  if (request.method !== 'POST') {
    sendAccountPinJson(response, 405, { code: 'method_not_allowed', error: 'Method not allowed.' }, { allow: 'POST' });
    return;
  }
  if (!hasSmallJsonBody(request)) {
    sendAccountPinJson(response, 415, { code: 'invalid_request', error: 'A small application/json body is required.' });
    return;
  }

  try {
    const runtime = getAccountPinRuntime();
    if (!runtime || !runtime.enrollmentEnabled) {
      sendAccountPinJson(response, 404, { code: 'not_found', error: 'Not found.' });
      return;
    }
    sendServiceResponse(response, await runtime.enroll(accountPinRequest(request)));
  } catch {
    sendAccountPinJson(response, 503, { code: 'service_unavailable', error: 'PIN enrollment is temporarily unavailable.' });
  }
}
