import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";

const historyEntrySchema = z.object({
  role: z.enum(['assistant', 'user']),
  content: z.string().trim().min(1).max(4000),
});

const requestSchema = z.object({
  board: z.string().trim().min(1).max(256),
  moveHistory: z
    .array(z.string().trim().min(1).max(16))
    .max(256)
    .optional()
    .default([]),
  currentPlayer: z.enum(['white', 'black']),
  turnNumber: z.coerce.number().int().min(0).max(1024),
  gameStatus: z.string().trim().min(1).max(64),
  activeRules: z
    .array(z.string().trim().min(1).max(64))
    .max(64)
    .optional()
    .default([]),
  trigger: z.enum(['initial', 'auto', 'manual']),
  userMessage: z.string().trim().max(1000).optional().default(''),
  history: z.array(historyEntrySchema).max(12).optional(),
});

type RequestPayload = z.infer<typeof requestSchema>;

const corsOptions = { methods: ["POST"] };

const json = (req: Request, body: unknown, init: ResponseInit = {}) =>
  jsonResponse(req, body, init, corsOptions);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const pieceValues: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

const parseBoard = (board: string) => {
  const ranks = board.split("/").map(rank => rank.trim());
  const whitePieces: string[] = [];
  const blackPieces: string[] = [];

  ranks.forEach(rank => {
    for (const symbol of rank) {
      if (symbol === '.' || symbol === ' ') continue;
      const lower = symbol.toLowerCase();
      if (symbol === symbol.toUpperCase()) {
        whitePieces.push(lower);
      } else {
        blackPieces.push(lower);
      }
    }
  });

  return { whitePieces, blackPieces };
};

const computeMaterialDelta = (board: string) => {
  const { whitePieces, blackPieces } = parseBoard(board);
  const whiteScore = whitePieces.reduce((acc, piece) => acc + (pieceValues[piece] ?? 0), 0);
  const blackScore = blackPieces.reduce((acc, piece) => acc + (pieceValues[piece] ?? 0), 0);
  return whiteScore - blackScore;
};

const buildFallbackMessage = (payload: RequestPayload, reason: string) => {
  const materialDelta = computeMaterialDelta(payload.board);
  const centipawns = clamp(materialDelta, -2000, 2000);
  const perspective = payload.currentPlayer === 'white' ? centipawns : -centipawns;
  const pawns = Math.round((centipawns / 100) * 10) / 10;
  const advantageLabel = pawns === 0 ? 'égalité' : `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
  const turnPhase = payload.turnNumber <= 12 ? 'ouverture' : payload.turnNumber <= 28 ? 'milieu de jeu' : 'finale';
  const lastMove = payload.moveHistory[payload.moveHistory.length - 1] ?? 'aucun coup joué pour le moment';
  const playerLabel = payload.currentPlayer === 'white' ? 'les blancs' : 'les noirs';

  const positivePlan = [
    'Activez vos pièces lourdes sur les colonnes ouvertes.',
    'Cherchez à fixer une faiblesse dans le camp adverse avant de lancer une attaque.',
    'Profitez de votre activité pour améliorer la sécurité du roi.',
  ];

  const defensivePlan = [
    'Neutralisez les menaces immédiates avant d’envisager une contre-attaque.',
    'Simplifiez la position pour réduire la pression sur votre roi.',
    'Travaillez à coordonner vos pièces mineures autour du centre.',
  ];

  const selectedPlans = perspective >= 0 ? positivePlan.slice(0, 2) : defensivePlan.slice(0, 2);
  const phaseMessage = turnPhase === 'ouverture'
    ? 'Continuez à mobiliser vos pièces mineures et sécurisez votre roi.'
    : turnPhase === 'milieu de jeu'
      ? 'Cherchez le bon moment pour lancer une attaque ou consolider vos points d’appui.'
      : 'Activez votre roi et créez un pion passé si l’opportunité se présente.';

  return `Analyse heuristique locale (${reason}).\n` +
    `Dernier coup observé : ${lastMove}.\n` +
    `Évaluation matérielle : ${advantageLabel} pour ${playerLabel}.\n` +
    `Phase estimée : ${turnPhase}. ${phaseMessage}\n` +
    `Plans suggérés : ${selectedPlans.join(' | ')}\n` +
    `N'hésitez pas à me demander un plan précis ou une clarification. Je reste à votre disposition !`;
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const toOpenAIMessages = (messages: ChatMessage[]) =>
  messages.map(message => ({ role: message.role, content: message.content }));

const callLovable = async (apiKey: string, messages: ChatMessage[], temperature: number) => {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: toOpenAIMessages(messages),
      temperature,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Lovable AI error:", response.status, errorText);
    if (response.status === 429) {
      const error = new Error("Lovable rate limit exceeded");
      (error as { status?: number }).status = 429;
      throw error;
    }
    throw new Error(`Lovable AI error: ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("Empty response from Lovable AI");
  }
  return content.trim();
};

const callGemini = async (apiKey: string, messages: ChatMessage[], temperature: number) => {
  const systemMessage = messages.find(message => message.role === "system");
  const conversation = messages
    .filter(message => message.role !== "system")
    .map(message => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

  const body: Record<string, unknown> = {
    contents: conversation,
    generationConfig: { temperature },
  };

  if (systemMessage) {
    body.systemInstruction = {
      role: "system",
      parts: [{ text: systemMessage.content }],
    };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini error:", response.status, errorText);
    if (response.status === 429) {
      const error = new Error("Gemini rate limit exceeded");
      (error as { status?: number }).status = 429;
      throw error;
    }
    throw new Error(`Gemini error: ${response.status}`);
  }

  const data = await response.json();
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts;
    if (Array.isArray(parts)) {
      const text = parts
        .map((part: { text?: unknown }) => (typeof part?.text === "string" ? part.text : ""))
        .join("\n")
        .trim();
      if (text.length > 0) {
        return text;
      }
    }
  }
  throw new Error("Empty response from Gemini");
};

const callGroq = async (apiKey: string, messages: ChatMessage[], temperature: number) => {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.1-70b-versatile",
      messages: toOpenAIMessages(messages),
      temperature,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Groq error:", response.status, errorText);
    if (response.status === 429) {
      const error = new Error("Groq rate limit exceeded");
      (error as { status?: number }).status = 429;
      throw error;
    }
    throw new Error(`Groq error: ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("Empty response from Groq");
  }
  return content.trim();
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, corsOptions);
  }

  try {
    if (req.method !== "POST") {
      return json(req, { error: "Method not allowed" }, { status: 405 });
    }

    const authResult = await authenticateRequest(req);
    if (!authResult.success) {
      return json(req, { error: authResult.error }, { status: authResult.status });
    }

    const rawBody = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(rawBody);

    if (!parsed.success) {
      const details = parsed.error.issues.map(issue => ({
        path: issue.path.join('.') || 'root',
        message: issue.message,
      }));
      return json(req, { error: "Invalid request payload", details }, { status: 400 });
    }

    const payload = parsed.data;

    if (payload.board.split('/').length !== 8) {
      return json(req, { error: "Invalid board representation" }, { status: 400 });
    }

    const history = payload.history?.slice(-8) ?? [];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

    let assistantMessage: string | null = null;
    let lastError: string | null = null;

    const systemPrompt = `Tu es Coach CyberIA, un assistant d'échecs conversationnel francophone alimenté par Lovable.\n` +
      `Tu discutes avec un joueur en direct. Pour chaque réponse :\n` +
      `- Analyse la position actuelle et décris en une phrase le dernier coup ou la séquence récente.\n` +
      `- Donne 2 à 3 idées de coups ou plans pertinents pour le camp au trait.\n` +
      `- Identifie le nom de l'ouverture ou de la structure si possible, sinon indique qu'elle est atypique.\n` +
      `- Réponds en français, avec un ton positif et motivant.\n` +
      `- Termine par une question ou une invitation à poursuivre la conversation.`;

    const contextMessage = [
      `Représentation du plateau (du 8e rang vers le 1er) : ${payload.board}`,
      `Coups joués : ${payload.moveHistory.length ? payload.moveHistory.join(', ') : 'aucun coup pour le moment'}`,
      `Dernier coup : ${payload.moveHistory[payload.moveHistory.length - 1] ?? '—'}`,
      `Camp au trait : ${payload.currentPlayer}`,
      `Tour numéro : ${payload.turnNumber}`,
      `Statut de la partie : ${payload.gameStatus}`,
      `Règles spéciales actives : ${payload.activeRules.length ? payload.activeRules.join(' | ') : 'aucune'}`,
      `Type de mise à jour : ${payload.trigger}`,
      `Message du joueur : ${payload.userMessage || 'analyse générale demandée'}`,
    ].join('\n');

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...history.map(entry => ({
        role: entry.role === "assistant" ? "assistant" : "user",
        content: entry.content.slice(0, 4000),
      })),
      { role: "user", content: contextMessage },
    ];

    const providers: Array<{ name: string; exec: () => Promise<string> }> = [];

    if (LOVABLE_API_KEY) {
      providers.push({
        name: "Lovable",
        exec: () => callLovable(LOVABLE_API_KEY, messages, 0.6),
      });
    }

    if (GEMINI_API_KEY) {
      providers.push({
        name: "Gemini",
        exec: () => callGemini(GEMINI_API_KEY, messages, 0.6),
      });
    }

    if (GROQ_API_KEY) {
      providers.push({
        name: "Groq",
        exec: () => callGroq(GROQ_API_KEY, messages, 0.6),
      });
    }

    if (providers.length === 0) {
      lastError = "Aucune clé API AI disponible (Lovable/Gemini/Groq absentes)";
    } else {
      for (const provider of providers) {
        try {
          const content = await provider.exec();
          if (content.trim().length > 0) {
            assistantMessage = content.trim();
            lastError = null;
            break;
          }
          throw new Error("Empty response");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const status = (error as { status?: number }).status;
          console.error(`[chess-insights] ${provider.name} provider failed:`, message);
          lastError = `${provider.name}: ${message}`;
          if (status === 429) {
            return json(req, { error: "Rate limit exceeded. Please try again later." }, { status: 429 });
          }
        }
      }

      if (!assistantMessage && !lastError) {
        lastError = "Aucune réponse reçue des fournisseurs AI";
      }
    }

    if (!assistantMessage) {
      const reason = lastError ? `analyse distante indisponible (${lastError})` : 'analyse distante indisponible';
      assistantMessage = buildFallbackMessage(payload, reason);
    }

    return json(req, { message: assistantMessage });
  } catch (error) {
    console.error("Error in chess-insights:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return json(req, { error: errorMessage }, { status: 500 });
  }
});
