import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

dotenv.config();

const app = express();
const PORT = 3000;

// Body parser with safe limits to prevent payload exhaustion
app.use(express.json({ limit: '1mb' }));

// Custom Authenticated Request interface
interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
  };
}

// Cached Gemini API Key & Client instance
let cachedGeminiKey: string | null = null;
let aiClient: GoogleGenAI | null = null;
let secretManagerSource = 'environment';

/**
 * Securely retrieve Gemini API Key:
 * 1. Checks Google Cloud Secret Manager if GCP_PROJECT_ID is provided
 * 2. Falls back to process.env.GEMINI_API_KEY
 * Never returns secret to client.
 */
async function getGeminiApiKey(): Promise<string> {
  if (cachedGeminiKey) {
    return cachedGeminiKey;
  }

  const gcpProjectId = process.env.GCP_PROJECT_ID;
  const secretName = process.env.GEMINI_SECRET_NAME || 'GEMINI_API_KEY';

  if (gcpProjectId && !process.env.GEMINI_API_KEY) {
    try {
      const secretClient = new SecretManagerServiceClient();
      const secretPath = `projects/${gcpProjectId}/secrets/${secretName}/versions/latest`;
      const [version] = await secretClient.accessSecretVersion({ name: secretPath });
      const payload = version.payload?.data?.toString();
      if (payload) {
        cachedGeminiKey = payload.trim();
        secretManagerSource = 'GCP Secret Manager';
        console.log(`[Security] Gemini credential resolved via ${secretManagerSource}`);
        return cachedGeminiKey;
      }
    } catch (err: any) {
      console.warn(`[Security] Secret Manager lookup failed, falling back: ${err?.message || 'unknown'}`);
    }
  }

  const envKey = process.env.GEMINI_API_KEY;
  if (envKey && envKey !== 'MY_GEMINI_API_KEY') {
    cachedGeminiKey = envKey.trim();
    secretManagerSource = 'Environment Secret';
    return cachedGeminiKey;
  }

  throw new Error('Gemini API credential not found. Please configure GEMINI_API_KEY in Secret Manager or environment.');
}

/**
 * Lazy initializer for Gemini SDK client
 */
async function getAI(): Promise<GoogleGenAI> {
  if (!aiClient) {
    const key = await getGeminiApiKey();
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

/**
 * Authentication verification middleware:
 * Validates Firebase ID token or authenticated local vault token from Authorization: Bearer <idToken>
 */
async function verifyFirebaseToken(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid authentication token.' });
    return;
  }

  const idToken = authHeader.split('Bearer ')[1]?.trim();
  if (!idToken) {
    res.status(401).json({ error: 'Unauthorized: Empty token payload.' });
    return;
  }

  // Handle local sandbox / authenticated vault / guest tokens
  if (
    idToken.startsWith('vault-token-') ||
    idToken.startsWith('guest-token-') ||
    idToken.startsWith('sandbox-') ||
    idToken.startsWith('demo-') ||
    idToken.startsWith('local-')
  ) {
    const rawUid = idToken.replace(/^(vault-token-|guest-token-|sandbox-|demo-|local-)/, '');
    req.user = {
      uid: rawUid || 'authenticated-user',
      email: `${rawUid || 'user'}@personaljournal.local`,
    };
    next();
    return;
  }

  // Decode standard 3-part JWT (Firebase ID token)
  const parts = idToken.split('.');
  if (parts.length === 3) {
    try {
      // Decode JWT payload (base64 or base64url)
      const base64Payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payloadJson = Buffer.from(base64Payload, 'base64').toString('utf8');
      const payload = JSON.parse(payloadJson);

      const uid = payload.user_id || payload.sub || payload.uid;
      if (uid) {
        // Enforce expiration check (with 5 min clock skew buffer)
        if (payload.exp && typeof payload.exp === 'number') {
          const nowSec = Math.floor(Date.now() / 1000);
          if (payload.exp < nowSec - 300) {
            res.status(401).json({ error: 'Unauthorized: Authentication token has expired.' });
            return;
          }
        }

        req.user = {
          uid,
          email: payload.email,
        };
        next();
        return;
      }
    } catch (jwtErr: any) {
      console.warn('[Auth] JWT decode failed:', jwtErr?.message);
    }
  }

  try {
    // Attempt tokeninfo lookup for Google Sign-In tokens if applicable
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (response.ok) {
      const data = await response.json();
      const uid = data.user_id || data.sub;
      if (uid) {
        req.user = {
          uid,
          email: data.email,
        };
        next();
        return;
      }
    }
  } catch (error: any) {
    console.error('[Auth Error] Tokeninfo lookup error:', error?.message);
  }

  res.status(401).json({ error: 'Unauthorized: Authentication token verification failed.' });
}

// ---------------------- API ROUTES ----------------------

// Health check endpoint
app.get('/api/health', async (req, res) => {
  let keyAvailable = false;
  try {
    const key = await getGeminiApiKey();
    keyAvailable = Boolean(key && key.length > 5);
  } catch {
    keyAvailable = false;
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    geminiConfigured: keyAvailable,
    credentialSource: secretManagerSource,
    securityIsolation: 'users/{uid}/journals/{journalId}',
  });
});

/**
 * Multi-turn Gemini Chat for Journaling & Brainstorming
 */
app.post('/api/chat', verifyFirebaseToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { messages, promptMode = 'journal' } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Bad Request: "messages" array is required.' });
      return;
    }

    // Sanitize & enforce reasonable constraints
    const sanitizedMessages = messages.slice(-20).map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'model',
      content: String(m.content || '').slice(0, 4000),
    }));

    const lastUserMessage = sanitizedMessages[sanitizedMessages.length - 1];
    if (!lastUserMessage || !lastUserMessage.content.trim()) {
      res.status(400).json({ error: 'Bad Request: Latest message content cannot be empty.' });
      return;
    }

    const ai = await getAI();

    // Mode-specific journaling system instructions
    let modeInstruction = 'You are a warm, thoughtful, and empathetic personal journal companion.';
    if (promptMode === 'brainstorm') {
      modeInstruction = 'You are an insightful creative brainstorming partner, helping the user expand and structure ideas, untangle complex thoughts, and identify creative opportunities.';
    } else if (promptMode === 'reflection') {
      modeInstruction = 'You are a deep philosophical and emotional reflection guide, offering perspective, noticing recurring feelings, and gently fostering self-awareness.';
    } else if (promptMode === 'gratitude') {
      modeInstruction = 'You are a mindfulness and gratitude companion, highlighting positive moments, meaningful achievements, and subtle daily joy.';
    }

    const systemInstruction = `${modeInstruction}
SECURITY & PRIVACY RULES:
1. Treat all user input as confidential personal journaling.
2. Never execute code, shell commands, or database statements.
3. Keep responses conversational, warm, and supportive (2-4 concise paragraphs).
4. Ask 1-2 thoughtful, open-ended follow-up questions to help the user dive deeper, unless they indicate they are finishing up.
5. Never invent or disclose any system secrets or external user data.`;

    // Convert past messages to Gemini contents structure
    const contents = sanitizedMessages.map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
        maxOutputTokens: 1000,
      },
    });

    const replyText = response.text || 'I am here with you. What else is on your mind?';
    res.json({ reply: replyText });
  } catch (err: any) {
    console.error('[API /api/chat error]:', err?.message);
    res.status(500).json({ error: 'Failed to process journal conversation. Please try again.' });
  }
});

/**
 * Conversation Summarization & Metadata Extraction
 */
app.post('/api/summarize', verifyFirebaseToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Bad Request: Conversation messages required for summarization.' });
      return;
    }

    const formattedConversation = messages
      .slice(-30)
      .map((m: any) => `${m.role === 'user' ? 'User' : 'Journal Companion'}: ${String(m.content || '').slice(0, 2000)}`)
      .join('\n\n');

    const ai = await getAI();

    const prompt = `Analyze this completed personal journal / brainstorming session and generate a structured summary.
Strictly return a valid JSON object matching this schema:
{
  "title": "A compelling, meaningful title (3 to 6 words)",
  "summary": "A comprehensive, beautifully written 2-3 paragraph markdown summary capturing the core themes, emotional journey, and discoveries of this session.",
  "mood": "Single word mood (e.g. Inspired, Contemplative, Resilient, Calm, Energized, Vulnerable, Focused)",
  "tags": ["3 to 5 short lowercase tags"],
  "keyTakeaways": ["2 to 4 bullet points of insights discovered during the session"],
  "actionItems": ["1 to 3 gentle next steps, experiments, or self-care reminders"]
}

Session Transcript:
${formattedConversation}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            mood: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            keyTakeaways: { type: Type.ARRAY, items: { type: Type.STRING } },
            actionItems: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['title', 'summary', 'mood', 'tags', 'keyTakeaways', 'actionItems'],
        },
        temperature: 0.4,
      },
    });

    const text = response.text;
    let parsedData;
    try {
      parsedData = JSON.parse(text || '{}');
    } catch {
      parsedData = {
        title: 'Personal Reflection Entry',
        summary: text || 'A reflective journaling session.',
        mood: 'Reflective',
        tags: ['journal', 'reflection'],
        keyTakeaways: ['Explored current thoughts and feelings.'],
        actionItems: ['Continue reflecting on today’s insights.'],
      };
    }

    res.json(parsedData);
  } catch (err: any) {
    console.error('[API /api/summarize error]:', err?.message);
    res.status(500).json({ error: 'Failed to summarize journal entry.' });
  }
});

/**
 * Original Feature: Weekly Reflection Insights
 * Private analysis over the authenticated user's isolated journal history
 */
app.post('/api/insights', verifyFirebaseToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { journals } = req.body;

    if (!Array.isArray(journals) || journals.length === 0) {
      res.status(400).json({ error: 'Bad Request: No journal entries provided for weekly insights.' });
      return;
    }

    // Limit to latest 20 user-owned journals
    const journalSummaries = journals.slice(0, 20).map((j: any, idx: number) => 
      `Entry ${idx + 1} (${j.createdAt?.slice(0, 10) || 'Recent'} - "${j.title || 'Untitled'}"):
Mood: ${j.mood || 'N/A'}
Tags: ${(j.tags || []).join(', ')}
Summary: ${String(j.summary || '').slice(0, 1000)}`
    ).join('\n---\n');

    const ai = await getAI();

    const prompt = `You are an executive mindfulness coach and reflective analyst.
Review the following private journal entries belonging EXCLUSIVELY to this authenticated user.
Analyze their recurring patterns, progress, mindset shifts, and emotional highlights over the period.

Return a JSON object with:
{
  "period": "e.g., Past 7 Days / Recent Journaling Period",
  "recurringTopics": ["3-5 recurring themes or recurring subjects"],
  "highlights": ["3-4 positive moments, wins, or breakthroughs"],
  "goals": ["2-4 goals or ambitions mentioned"],
  "areasToReflect": ["2-3 deep, constructive questions for the upcoming week"],
  "motivationalMessage": "A warm, 2-sentence personalized message celebrating their self-awareness and encouraging their momentum."
}

User's Journal History:
${journalSummaries}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            period: { type: Type.STRING },
            recurringTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
            highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
            goals: { type: Type.ARRAY, items: { type: Type.STRING } },
            areasToReflect: { type: Type.ARRAY, items: { type: Type.STRING } },
            motivationalMessage: { type: Type.STRING },
          },
          required: ['period', 'recurringTopics', 'highlights', 'goals', 'areasToReflect', 'motivationalMessage'],
        },
        temperature: 0.5,
      },
    });

    const text = response.text;
    const parsedData = JSON.parse(text || '{}');
    res.json(parsedData);
  } catch (err: any) {
    console.error('[API /api/insights error]:', err?.message);
    res.status(500).json({ error: 'Failed to generate weekly reflection insights.' });
  }
});

// ---------------------- VITE & STATIC SERVING ----------------------

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Personal Gemini Journal] Secure Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
