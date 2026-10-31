import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * External Lead Finder was retired in favor of the browser-local sample directory.
 * Keep a closed route for stale clients; this handler never reads request data or
 * initializes auth, Firebase, quota, Gemini, or any network client.
 */
export default function handler(_request: IncomingMessage, response: ServerResponse): void {
  response.statusCode = 410;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify({
    code: 'lead_finder_retired',
    error: 'Pencarian eksternal telah dinonaktifkan. Gunakan Direktori Prospek Lokal.',
  }));
}
