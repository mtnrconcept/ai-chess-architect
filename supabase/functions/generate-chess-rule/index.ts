import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { corsResponse, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";

const corsOptions = { methods: ["POST"] };

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, corsOptions);
  }

  try {
    if (req.method !== "POST") {
      return corsResponse(req, "Method not allowed", { status: 405 }, corsOptions);
    }

    const authResult = await authenticateRequest(req);
    if (!authResult.success) {
      return jsonResponse(req, { error: authResult.error }, { status: authResult.status }, corsOptions);
    }

    const rawBody = await req.json().catch(() => null);
    const schema = z.object({ prompt: z.string().trim().min(10).max(800) });
    const parsed = schema.safeParse(rawBody);

    if (!parsed.success) {
      const details = parsed.error.issues.map(issue => ({
        path: issue.path.join('.') || 'root',
        message: issue.message,
      }));
      return jsonResponse(
        req,
        { error: "Invalid request payload", details },
        { status: 400 },
        corsOptions,
      );
    }

    const prompt = parsed.data.prompt;

    const systemPrompt = `Tu es un expert en règles d'échecs et en génération de configurations JSON pour un moteur de jeu d'échecs personnalisable.

Tu dois générer un objet JSON PARFAITEMENT structuré et exécutable. Voici la structure EXACTE :

{
  "ruleId": "rule_[timestamp_unique]",
  "ruleName": "Nom Court et Descriptif",
  "description": "Description détaillée de ce que fait la règle",
  "category": "movement|capture|special|condition|victory|restriction|defense|behavior",
  "affectedPieces": ["king"|"queen"|"rook"|"bishop"|"knight"|"pawn"|"all"],
  "trigger": "always|onMove|onCapture|onCheck|onCheckmate|turnBased|conditional",
  "conditions": [
    {
      "type": "pieceType|pieceColor|turnNumber|position|movesThisTurn|piecesOnBoard",
      "value": "valeur",
      "operator": "equals|notEquals|greaterThan|lessThan|greaterOrEqual|lessOrEqual|contains|in"
    }
  ],
  "effects": [
    {
      "action": "allowExtraMove|modifyMovement|addAbility|restrictMovement|changeValue|triggerEvent|allowCapture|preventCapture",
      "target": "self|opponent|all|specific",
      "parameters": {
        "count": 1,
        "property": "nom",
        "value": "valeur",
        "duration": "permanent|temporary|turns",
        "range": 1
      }
    }
  ],
  "priority": 1,
  "isActive": true,
  "tags": ["mot-cle-1", "mot-cle-2"],
  "validationRules": {
    "allowedWith": [],
    "conflictsWith": [],
    "requiredState": {}
  }
}

RÈGLES IMPORTANTES :
- Réponds UNIQUEMENT avec le JSON, rien d'autre
- Pas de backticks, pas de markdown
- Le JSON doit être parfaitement valide
- Génère entre 2 et 4 tags courts en français pour décrire la règle
- Sois créatif mais logique`;

    const openAiMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `DESCRIPTION DE LA RÈGLE : "${prompt}"` },
    ];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

    const providers: Array<{ name: string; exec: () => Promise<string> }> = [];

    if (LOVABLE_API_KEY) {
      providers.push({
        name: "Lovable",
        exec: () => callLovable(LOVABLE_API_KEY, openAiMessages, 0.7),
      });
    }

    if (GEMINI_API_KEY) {
      providers.push({
        name: "Gemini",
        exec: () => callGemini(GEMINI_API_KEY, openAiMessages, 0.7),
      });
    }

    if (GROQ_API_KEY) {
      providers.push({
        name: "Groq",
        exec: () => callGroq(GROQ_API_KEY, openAiMessages, 0.7),
      });
    }

    if (providers.length === 0) {
      throw new Error("Aucune clé API disponible (Lovable, Gemini ou Groq)");
    }

    let rawContent: string | null = null;
    let providerError: string | null = null;

    for (const provider of providers) {
      try {
        rawContent = await provider.exec();
        if (rawContent.trim().length === 0) {
          throw new Error("Réponse vide du fournisseur AI");
        }
        providerError = null;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = (error as { status?: number }).status;
        console.error(`[generate-chess-rule] ${provider.name} provider failed:`, message);
        providerError = `${provider.name}: ${message}`;
        if (status === 429) {
          return jsonResponse(
            req,
            { error: "Rate limit exceeded. Please try again later." },
            { status: 429 },
            corsOptions,
          );
        }
      }
    }

    if (!rawContent) {
      throw new Error(providerError ?? "Aucun fournisseur AI n'a renvoyé de réponse");
    }

    let ruleJson = rawContent.trim();
    ruleJson = ruleJson.replace(/```json\s*/gi, "").replace(/```/g, "").trim();

    const firstBrace = ruleJson.indexOf("{");
    const lastBrace = ruleJson.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("Le modèle n'a pas renvoyé de JSON valide");
    }

    const cleanedJson = ruleJson.slice(firstBrace, lastBrace + 1);
    const parsedRule = JSON.parse(cleanedJson);

    parsedRule.ruleId = parsedRule.ruleId || `rule_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    parsedRule.createdAt = new Date().toISOString();
    parsedRule.tags = Array.isArray(parsedRule.tags)
      ? parsedRule.tags
          .map((tag: unknown) => (typeof tag === "string" ? tag.toLowerCase() : String(tag)))
          .filter((tag: string) => tag.length > 0)
      : [];
    parsedRule.conditions = Array.isArray(parsedRule.conditions) ? parsedRule.conditions : [];
    parsedRule.effects = Array.isArray(parsedRule.effects) ? parsedRule.effects : [];

    return jsonResponse(req, { rule: parsedRule }, { status: 200 }, corsOptions);
  } catch (error) {
    console.error("Error in generate-chess-rule:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(req, { error: errorMessage }, { status: 500 }, corsOptions);
  }
});
