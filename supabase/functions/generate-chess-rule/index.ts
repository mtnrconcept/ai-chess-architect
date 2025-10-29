// --- generate-chess-rule/index.ts ---
// Version locale optimisée pour environnement de développement
// Compatible Deno + Supabase local CLI
// Point d’entrée : http://localhost:54321/functions/v1/generate-chess-rule

import { handleOptions, withCors } from "../_shared/cors.ts";

// ======================================================
// 🧩 Paramètres de modèle local
// ======================================================
const LOCAL_MODEL_URL =
  Deno.env.get("LOCAL_RULE_MODEL_URL") ??
  "http://127.0.0.1:1234/v1/chat/completions";
const LOCAL_MODEL_NAME =
  Deno.env.get("LOCAL_RULE_MODEL_NAME") ?? "openai/gpt-oss-20b";
const LOCAL_MODEL_KEY = Deno.env.get("LOCAL_RULE_MODEL_API_KEY") ?? "";

// ======================================================
// ⚙️ Fonctions utilitaires simples
// ======================================================
const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

function timeoutPromise(ms: number, msg = "timeout") {
  return new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms));
}

// ======================================================
// 🧠 Pipeline minimaliste : stub local
// ======================================================
async function callLocalModel(prompt: string) {
  try {
    const res = await fetch(LOCAL_MODEL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(LOCAL_MODEL_KEY
          ? { Authorization: `Bearer ${LOCAL_MODEL_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        model: LOCAL_MODEL_NAME,
        messages: [
          {
            role: "system",
            content:
              "Tu es un compilateur de règles d’échecs en JSON. Réponds uniquement en JSON valide.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 1500,
        stream: false,
      }),
    });

    const body = await res.json();
    return body;
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

// ======================================================
// 🚀 Serveur principal
// ======================================================
Deno.serve(async (req) => {
  // ✅ Gérer le préflight CORS
  if (req.method === "OPTIONS") {
    return handleOptions(req, {
      origins: ["http://localhost:5173", "http://127.0.0.1:5173"],
      methods: ["POST", "OPTIONS"],
      allowCredentials: false,
    });
  }

  // ✅ Accepter uniquement POST
  if (req.method !== "POST") {
    return withCors(req, json({ error: "method_not_allowed" }, 405));
  }

  try {
    const body = await req.json().catch(() => ({}));
    const prompt = body.prompt ?? "";
    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 5) {
      return withCors(req, json({ error: "invalid_prompt" }, 400));
    }

    // Appel du modèle local
    const result = await Promise.race([
      callLocalModel(prompt),
      timeoutPromise(15000, "model_timeout"),
    ]);

    return withCors(req, json({ ok: true, model: LOCAL_MODEL_NAME, result }));
  } catch (err) {
    return withCors(req, json({ ok: false, error: String(err) }, 500));
  }
});
