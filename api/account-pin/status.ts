import type { ServerResponse } from 'node:http';
import {
  accountPinRequest,
  getAccountPinRuntime,
  isAllowedAccountPinRoute,
  sendAccountPinJson,
  sendServiceResponse,
  type AccountPinHttpRequest,
} from './http.ts';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(request: AccountPinHttpRequest, response: ServerResponse): Promise<void> {
  if (!isAllowedAccountPinRoute()) {
    sendAccountPinJson(response, 404, { code: 'not_found', error: 'Not found.' });
    return;
  }
  if (request.method !== 'GET') {
    sendAccountPinJson(response, 405, { code: 'method_not_allowed', error: 'Method not allowed.' }, { allow: 'GET' });
    return;
  }

  try {
    const runtime = getAccountPinRuntime();
    if (!runtime) {
      sendAccountPinJson(response, 404, { code: 'not_found', error: 'Not found.' });
      return;
    }
    sendServiceResponse(response, await runtime.status(accountPinRequest(request)));
  } catch {
    sendAccountPinJson(response, 503, { code: 'service_unavailable', error: 'PIN status is temporarily unavailable.' });
  }
}
