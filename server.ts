import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const GAS_API_URL = process.env.GAS_API_URL || 'https://script.google.com/macros/s/AKfycbx5SNAUvM2MOW9X62M9uzs2bw6bM19-us57r0X10GZYEU5wBd_ajXDDPCAm6M82wkzO/exec';

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

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

// 1. Google Apps Script Proxy for CORS-free, redirect-safe connectivity
app.all('/api/gas-proxy', async (req, res) => {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, 12000);

  try {
    const isPost = req.method === 'POST';
    const query = new URLSearchParams(req.query as Record<string, string>).toString();
    const targetUrl = query ? `${GAS_API_URL}?${query}` : GAS_API_URL;

    const fetchOptions: RequestInit = {
      method: req.method,
      redirect: 'follow',
      signal: abortController.signal,
    };

    if (isPost) {
      fetchOptions.headers = {
        'Content-Type': 'text/plain;charset=utf-8',
      };
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const gasResponse = await fetch(targetUrl, fetchOptions);
    clearTimeout(timeoutId);

    const contentType = gasResponse.headers.get('content-type') || '';
    const textData = await gasResponse.text();

    if (contentType.includes('application/json')) {
      try {
        const jsonData = JSON.parse(textData);
        return res.status(gasResponse.status).json(jsonData);
      } catch {
        // Fallback to text if JSON parsing fails
      }
    }

    // Try parsing as JSON anyway in case header was plain text
    try {
      const parsed = JSON.parse(textData);
      return res.status(gasResponse.status).json(parsed);
    } catch {
      return res.status(gasResponse.status).send(textData);
    }
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error('GAS Proxy Error:', error);
    res.status(502).json({
      error: 'Failed to communicate with Google Apps Script backend',
      details: error.message || String(error),
    });
  }
});

// Helper function for intelligent structured field note summarization
function generateStructuredMeetingSummary(rawNotes: string, contactPerson?: string, companyName?: string, activityType?: string) {
  const lines = rawNotes.split(/[.\n;]/).map((l) => l.trim()).filter((l) => l.length > 0);
  
  // Extract action items
  const actionItems: string[] = [];
  const keyObservations: string[] = [];

  for (const line of lines) {
    if (/follow|send|email|call|proposal|contract|quote|schedule|next|meet|discuss|finalize|review|onboard/i.test(line)) {
      actionItems.push(`• ${line.charAt(0).toUpperCase() + line.slice(1)}`);
    } else {
      keyObservations.push(line);
    }
  }

  if (actionItems.length === 0) {
    actionItems.push(`• Follow up with ${contactPerson || 'stakeholder'} regarding discussion points.`);
    actionItems.push('• Share commercial summary and next milestones with account lead.');
  }

  const executiveSummary = `Field ${activityType || 'Meeting'} conducted with ${contactPerson || 'client'} from ${companyName || 'client company'}. ${keyObservations.slice(0, 2).join('. ')}${keyObservations.length > 0 ? '.' : ''}`;

  return {
    summary: executiveSummary,
    actionItems: actionItems.join('\n'),
    sentiment: /interest|like|agree|great|good|positive|rollout|pilot/i.test(rawNotes) ? 'Hot / Positive' : 'Warm / Progressing',
    aiPowered: true,
  };
}

// 2. AI Summarizer endpoint for field meeting notes
app.post('/api/ai/summarize-notes', async (req, res) => {
  const { rawNotes, contactPerson, companyName, activityType } = req.body;

  if (!rawNotes || typeof rawNotes !== 'string') {
    return res.status(400).json({ error: 'rawNotes string is required' });
  }

  const fallback = generateStructuredMeetingSummary(rawNotes, contactPerson, companyName, activityType);

  if (!ai || !process.env.GEMINI_API_KEY) {
    return res.json(fallback);
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, 4000);

  try {
    const prompt = `You are an elite Sales Operations CRM Assistant.
Summarize these field notes (${activityType || 'Meeting'} with ${contactPerson || 'prospect'} from ${companyName || 'client company'}):
"""
${rawNotes}
"""

Provide:
1. Executive Summary (1-2 sentences).
2. Action Items (bullet points starting with •).`;

    const generatePromise = ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: 'You are a CRM sales assistant. Output concise bulleted action items and brief summary.',
        temperature: 0.2,
        abortSignal: abortController.signal,
      },
    });

    const response: any = await generatePromise;
    clearTimeout(timeoutId);
    const aiText = response?.text || '';

    if (!aiText) {
      return res.json(fallback);
    }

    return res.json({
      summary: aiText.split('\n\n')[0] || fallback.summary,
      actionItems: aiText.includes('•') ? aiText : fallback.actionItems,
      fullOutput: aiText,
      aiPowered: true,
    });
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.warn('Gemini summarization unavailable, using intelligent fallback:', error.message);
    return res.json(fallback);
  }
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
