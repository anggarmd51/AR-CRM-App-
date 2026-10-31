import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import makeLeadWebhookHandler from './api/webhooks/make/leads.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// The webhook has its own small parser cap; keep existing body limits elsewhere.
app.all('/api/webhooks/make/leads', express.json({ limit: '32kb' }), (req, res) => {
  void makeLeadWebhookHandler(req, res);
});
app.use(express.json({ limit: '256kb' }));

// Server-side Gemini initialization
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Legacy GAS proxy was unauthenticated and could read/write CRM records. Keep an
// explicit 410 response for older clients; this route never forwards requests.
app.all('/api/gas-proxy', (_req, res) => {
  res.status(410).json({ error: 'Legacy GAS sync is disabled. Firebase is not connected.' });
});

// Notes summarization is intentionally disabled. Keep this guard before any body
// access so notes, contact names, and company names cannot reach an AI path.
app.post('/api/ai/summarize-notes', (_req, res) => {
  res.status(403).json({ error: 'Notes summarization is disabled.' });
});

// Serve public static assets (PWA manifest, favicons, logos)
app.use(express.static(path.join(__dirname, 'public')));

// Setup Vite development server or static serving
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
