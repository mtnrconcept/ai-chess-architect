// --- generate-chess-rule/index.ts ---
// Version GROQ-only — sans Lovable / OpenAI / Gemini
// Compatible Supabase Edge Runtime (Deno v2+)

const DEFAULT_TIMEOUT = Number(Deno.env.get("AI_REQUEST_TIMEOUT") || "10000");

// Utilitaire simple pour timeout
function timeoutPromise(ms: number, msg = "timeout") {
  return new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms));
}

// Fonction helper pour tronquer les messages d’erreur
function snippet(s: string, n = 2000) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "..." : s;
}

// Serveur principal
Deno.serve(async (req) => {
  // --- CORS ---
  const CORS_ALLOW_HEADERS = "Content-Type, Authorization, apikey, x-client-info";
  const defaultCors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
  };

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...defaultCors,
        "Access-Control-Max-Age": "3600",
      },
    });
  }

  // --- Auth facultative ---
  const auth = req.headers.get("authorization");
  if (!auth) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "missing_authorization",
      }),
      {
        status: 401,
        headers: { ...defaultCors, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const userPrompt = body.prompt || body.message || "";

    // Construction du prompt
    const enrichedPrompt = `
Tu es un expert en création de variantes d’échecs.
Génère une règle complète et jouable à partir de cette idée : "${userPrompt}"

Réponds UNIQUEMENT en JSON suivant ce schéma :
{
  "id": "UUID",
  "created_at": "ISO date",
  "prompt": "texte original",
  "rules": [
    {
      "id": "string",
      "title": "string",
      "description": "string",
      "metadata": {
        "category": "string",
        "pieces_affected": ["array"],
        "difficulty": "string",
        "impact": "string"
      }
    }
  ]
}
    `.trim();

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY manquant dans les variables d’environnement");
    }

    // --- Appel Groq ---
    const url = "https://api.groq.com/openai/v1/chat/completions";
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    };

    const reqBody = {
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "Réponds uniquement en JSON." },
        { role: "user", content: enrichedPrompt },
      ],
      max_tokens: 1200,
      temperature: 0.7,
    };

    console.info("Calling GROQ...");
    const fetchPromise = fetch(url, { method: "POST", headers, body: JSON.stringify(reqBody) });
    const res = await Promise.race([fetchPromise, timeoutPromise(DEFAULT_TIMEOUT, "groq_timeout")]);

    const text = await res.text();
    if (!res.ok) {
      console.error("GROQ http error", { status: res.status, bodySnippet: snippet(text) });
      return new Response(
        JSON.stringify({
          ok: false,
          provider: "GROQ",
          error: snippet(text),
        }),
        {
          status: res.status,
          headers: { ...defaultCors, "Content-Type": "application/json" },
        },
      );
    }

    // Extraction du JSON retourné
    let parsed;
    try {
      const json = JSON.parse(text);
      parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    } catch (e) {
      console.error("JSON parsing failed", e);
      return new Response(
        JSON.stringify({
          ok: false,
          error: "invalid_json_response",
          raw: snippet(text),
        }),
        {
          status: 500,
          headers: { ...defaultCors, "Content-Type": "application/json" },
        },
      );
    }

    // Validation minimale
    if (!parsed?.rules?.length) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "empty_rules",
          raw: parsed,
        }),
        {
          status: 400,
          headers: { ...defaultCors, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        provider: "GROQ",
        data: parsed,
      }),
      {
        status: 200,
        headers: { ...defaultCors, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Unhandled error", String(err));
    return new Response(
      JSON.stringify({
        ok: false,
        error: "internal_error",
        detail: String(err),
      }),
      {
        status: 500,
        headers: { ...defaultCors, "Content-Type": "application/json" },
      },
    );
  }
});
