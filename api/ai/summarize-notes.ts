import { GoogleGenAI } from '@google/genai';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isAllowedAccountPinPreview } from '../account-pin/http.ts';
import { createStagingAccountPinRuntime } from '../../src/server/accountPinFirebaseAdmin.ts';
import { createMeetingSummarizerHttpHandler } from '../../src/server/meetingSummarizerHttp.ts';
import { createGeminiMeetingSummaryGenerator, createMeetingSummarizerService } from '../../src/server/meetingSummarizer.ts';

interface Request extends IncomingMessage {
  method?: string;
  body?: unknown;
}

export const config = {
  api: { bodyParser: { sizeLimit: '32kb' } },
};

let cachedRuntime: ReturnType<typeof createStagingAccountPinRuntime> | undefined;
let cachedClient: GoogleGenAI | undefined;

const generate = createGeminiMeetingSummaryGenerator(async (request) => {
  cachedClient ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });
  return cachedClient.models.generateContent(request);
});
const summarize = createMeetingSummarizerService({ generate });

const handler = createMeetingSummarizerHttpHandler({
  enabled: () => isAllowedAccountPinPreview() && process.env.AI_MEETING_SUMMARIZER_ENABLED === 'true',
  apiKeyAvailable: () => Boolean(process.env.GEMINI_API_KEY),
  createRuntime: () => cachedRuntime ??= createStagingAccountPinRuntime(),
  summarize,
});

export default async function summarizeNotes(request: Request, response: ServerResponse): Promise<void> {
  await handler(request, response);
}
