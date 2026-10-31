import type { IncomingMessage, ServerResponse } from 'node:http';
import { createMakeLeadWebhookWriter } from '../../../src/server/makeLeadWebhookFirestore.ts';
import { handleMakeLeadWebhook } from '../../../src/server/makeLeadWebhook.ts';

export const config = {
  api: { bodyParser: { sizeLimit: '32kb' } },
};

interface MakeLeadWebhookHttpRequest extends IncomingMessage {
  method?: string;
  body?: unknown;
}

export default async function handler(
  request: MakeLeadWebhookHttpRequest,
  response: ServerResponse,
): Promise<void> {
  const result = await handleMakeLeadWebhook(request, process.env, (target) =>
    createMakeLeadWebhookWriter(target, process.env));
  response.statusCode = result.statusCode;
  for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
  response.end(JSON.stringify(result.body));
}
