// deno-lint-ignore-file no-explicit-any
// Edge Runtime (Supabase) — Generate Chess Rule via GROQ only

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// ---------- Config ----------
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
const MODEL_FALLBACKS = [
  // ordre de préférence (tous Groq, tous chat-completions)
  "llama-3.1-70b-versatile",
  "llama-3.1-8b-instant",
];

const DEFAULT_TIMEOUT_MS = Number(
  Deno.env.get("AI_REQUEST_TIMEOUT") ?? "12000",
);

// ---------- CORS ----------
const ALLOW_ORIGIN = Deno.env
  .get("CORS_ORIGIN")
  ?.split(",")
  .map((s) => s.trim())
  .filter(Boolean) ?? ["*"];

function corsHeaders(origin: string | null): HeadersInit {
  const match =
    origin && (ALLOW_ORIGIN.includes("*") || ALLOW_ORIGIN.includes(origin))
      ? origin
      : "*";
  return {
    "Access-Control-Allow-Origin": match,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, apikey, Prefer, X-Client-Info",
  };
}

// ---------- Utils ----------
const ok = <T>(data: T, origin: string | null, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonObject = { [key: string]: JsonValue };

const err = (
  message: string,
  origin: string | null,
  status = 400,
  extra?: JsonObject,
) => ok({ ok: false, error: { message, ...(extra ?? {}) } }, origin, status);

function withTimeout<T>(p: Promise<T>, ms: number) {
  return Promise.race<T>([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

// Normalisation/validation très tolérante
async function readIdea(req: Request): Promise<{ idea: string } | null> {
  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) {
      const body = await req.json();
      // accepte plusieurs clés ou string pur dans "body"
      const idea =
        (typeof body === "string" && body) ||
        body?.idea ||
        body?.prompt ||
        body?.message ||
        body?.text ||
        null;

      if (!idea || typeof idea !== "string" || !idea.trim()) return null;
      return { idea: idea.trim() };
    }

    // si body text brut
    const txt = (await req.text()).trim();
    if (txt) return { idea: txt };
    return null;
  } catch {
    return null;
  }
}

// ---------- GROQ ----------
type GroqMsg = { role: "system" | "user" | "assistant"; content: string };

async function callGroq(messages: GroqMsg[], model: string) {
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages,
    }),
  });

  if (!resp.ok) {
    const snippet = await resp.text().catch(() => "");
    throw new Error(`GROQ ${resp.status}: ${snippet}`);
  }

  const json = await resp.json();
  const content: string = json?.choices?.[0]?.message?.content ?? "";

  if (!content) {
    throw new Error("GROQ: empty content");
  }

  return content;
}

async function groqWithFallback(messages: GroqMsg[]) {
  if (!GROQ_API_KEY) throw new Error("Missing GROQ_API_KEY");

  let lastErr: unknown;
  for (const model of MODEL_FALLBACKS) {
    try {
      return { model, content: await callGroq(messages, model) };
    } catch (e) {
      lastErr = e;
      // si modèle décommissionné -> on essaie le suivant
      continue;
    }
  }
  throw lastErr ?? new Error("All Groq models failed");
}

// ---------- Prompting ----------
const SYSTEM = `Tu es "Voltus Rule Architect". Tu dois transformer une idée de variante d'échecs en **dialogue incrémental**.

RÈGLES IMPORTANTES :
1) Pour CHAQUE nouvelle idée, tu DOIS d'abord poser une question avec EXACTEMENT 3 choix pour clarifier l'idée.
2) Les choix doivent être courts (max 5 mots), clairs et exclusifs.
3) Ne propose JAMAIS une règle finale dès le premier prompt - pose TOUJOURS une question d'abord.

Format pour poser une question (À UTILISER EN PREMIER) :
{
  "type": "followup",
  "question": "Question claire et précise ?",
  "choices": ["Choix A", "Choix B", "Choix C"]
}

Format pour la règle finale (SEULEMENT après au moins une question) :
{
  "type": "final",
  "title": "Nom de la variante",
  "summary": "Description courte",
  "rules": ["Règle 1", "Règle 2"],
  "constraints": ["Contrainte optionnelle"]
}

IMPORTANT : Ne renvoie QUE du JSON valide, sans texte avant ou après.`;

function buildMessages(idea: string): GroqMsg[] {
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `Idée de règle (fr) : ${idea}`,
    },
  ];
}

// ---------- HTTP ----------
serve(async (req) => {
  const origin = req.headers.get("origin");

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return err("Method not allowed", origin, 405, { allow: "POST" });
  }

  const parsed = await readIdea(req);
  if (!parsed) {
    return err(
      "Bad Request: body JSON attendu avec { idea | prompt | message | text } (string) ou string brut.",
      origin,
      400,
      { example: { idea: "les reines peuvent tirer" } },
    );
  }

  try {
    const { model, content } = await withTimeout(
      groqWithFallback(buildMessages(parsed.idea)),
      DEFAULT_TIMEOUT_MS,
    );

    // On sécurise: le modèle DOIT renvoyer un JSON.
    let payload: JsonObject = {
      type: "followup",
      question: "Quel aspect veux-tu définir en priorité pour cette règle ?",
      choices: ["Déclenchement", "Limites", "Effets secondaires"],
    };

    try {
      const candidate = JSON.parse(content) as JsonValue;
      if (
        candidate &&
        typeof candidate === "object" &&
        !Array.isArray(candidate)
      ) {
        payload = candidate as JsonObject;
      } else {
        throw new Error("non-object response");
      }
    } catch {
      // Si le modèle a parlé hors-JSON, on encapsule pour éviter le 400 côté front.
      payload = {
        type: "followup",
        question:
          "Précise le cadre de la règle : portée, fréquence ou contraintes ?",
        choices: ["Portée", "Fréquence", "Contraintes"],
        note: "Le LLM n'a pas renvoyé un JSON strict ; fallback appliqué.",
      };
    }

    // Normalisation sortie minimale (front robuste)
    // type: "followup" | "final"
    if (payload?.type !== "followup" && payload?.type !== "final") {
      payload = {
        type: "followup",
        question: "Quel aspect veux-tu définir en priorité pour cette règle ?",
        choices: ["Déclenchement", "Limites", "Effets secondaires"],
      };
    }

    return ok(
      {
        ok: true,
        model,
        data: payload,
      },
      origin,
      200,
    );
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    const isTimeout = /timeout/i.test(msg);

    // 400 si input / 502 si LLM
    const status = isTimeout ? 504 : /GROQ\s+400/i.test(msg) ? 400 : 502;

    return err(
      isTimeout
        ? "LLM timeout"
        : "Provider failure (GROQ). Consulte 'details' pour debug.",
      origin,
      status,
      { details: msg },
    );
  }
});
