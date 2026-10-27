import type { IncomingMessage, ServerResponse } from 'node:http';
import { env } from 'node:process';
import { createGoogleExportAdapters, isCronAuthorized } from '../../src/server/googleExportAdapters.ts';
import { loadFirestoreExportConfig, runFirestoreSheetsExport } from '../../src/server/firestoreSheetsExport.ts';

interface CronRequest extends IncomingMessage {
  method?: string;
}

function sendJson(response: ServerResponse, status: number, payload: Record<string, unknown>): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(payload));
}

export default async function handler(request: CronRequest, response: ServerResponse): Promise<void> {
  // This route has a fixed production Firestore target; never expose it to Preview or Development.
  if (env.VERCEL_ENV !== 'production') {
    sendJson(response, 404, { error: 'Not found.' });
    return;
  }

  if (request.method !== 'GET') {
    response.setHeader('allow', 'GET');
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }

  if (!env.CRON_SECRET) {
    sendJson(response, 503, { error: 'Firestore export is not configured.' });
    return;
  }
  if (!isCronAuthorized(request.headers.authorization, env.CRON_SECRET)) {
    sendJson(response, 401, { error: 'Unauthorized.' });
    return;
  }

  try {
    const config = loadFirestoreExportConfig(env);
    const adapters = createGoogleExportAdapters(config);
    const result = await runFirestoreSheetsExport(config, adapters);
    sendJson(response, 200, { status: 'ok', ...result });
  } catch {
    // Keep provider details, credentials, document data, and spreadsheet contents out of logs/responses.
    sendJson(response, 502, { error: 'Firestore export failed; retry after reviewing server configuration.' });
  }
}
