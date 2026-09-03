import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { initializeApp as initAdminApp, type App as AdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import firebaseConfigJson from './firebase-applet-config.json';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

dotenv.config();

const app = express();
// Cloud Run (and most PaaS hosts) inject the port to bind via PORT.
const PORT = Number(process.env.PORT) || 3000;

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

      // Preflight the Application Default Credentials BEFORE issuing any RPC.
      // A failed accessSecretVersion() call surfaces a second, unhandled rejection
      // from the underlying gax client that terminates the process, so an
      // unauthenticated environment must never reach the RPC at all.
      await secretClient.auth.getClient();

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
 * Firebase Admin app used solely for ID token verification.
 * Signature verification relies on Google's PUBLIC signing certificates, so this
 * requires only a project ID - no service account key, no ADC. The project ID
 * additionally pins the accepted `aud` and `iss` claims.
 */
const ADMIN_PROJECT_ID = process.env.GCP_PROJECT_ID || firebaseConfigJson.projectId;
let adminApp: AdminApp | null = null;

function getAdminApp(): AdminApp {
  if (!adminApp) {
    adminApp = initAdminApp({ projectId: ADMIN_PROJECT_ID }, 'journal-auth');
  }
  return adminApp;
}

/**
 * Authentication verification middleware.
 *
 * Every request must present a Firebase ID token that is cryptographically
 * verified via the Admin SDK. A token is rejected unless its RS256 signature
 * matches a current Google signing certificate AND its aud/iss/exp claims are
 * valid for this project. The uid is taken ONLY from the verified payload, so a
 * caller cannot assert an identity it does not hold.
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

  try {
    const decoded = await getAdminAuth(getAdminApp()).verifyIdToken(idToken);
    if (!decoded?.uid) {
      res.status(401).json({ error: 'Unauthorized: Token contained no subject.' });
      return;
    }
    req.user = { uid: decoded.uid, email: decoded.email };
    next();
  } catch (err: any) {
    const code = err?.code || 'auth/invalid-token';
    console.warn(`[Auth] Rejected token: ${code}`);
    if (code === 'auth/id-token-expired') {
      res.status(401).json({ error: 'Unauthorized: Authentication token has expired.' });
      return;
    }
    res.status(401).json({ error: 'Unauthorized: Authentication token verification failed.' });
  }
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
