// /supabase/functions/generate-chess-rule/index.ts
// Deno Deploy (Supabase Edge Functions)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { withCors, preflightIfOptions } from "../_shared/cors.ts";
import { json } from "../_shared/http.ts";

// —— Config runtime ——
const MODEL_TIMEOUT_MS = 45000; // < 60s pour rester sous limite CF/Supabase
const BODY_LIMIT_BYTES = 256 * 1024; // 256 KB, protège contre payloads énormes

// —— Schémas d’entrées/sorties ——
const RulePromptSchema = z.object({
  prompt: z.string().min(3).max(2000),
  locale: z.enum(["fr", "en"]).optional().default("fr"),
  temperature: z.number().min(0).max(2).optional().default(0.4),
  // context facultatif (état du jeu, presets, etc.)
  context: z.record(z.any()).optional(),
});

const EngineRuleSchema = z.object({
  ruleId: z.string().min(3),
  ruleName: z.string().min(1),
  description: z.string().min(5),
  // Contrat minimum attendu par ton moteur (adapte si besoin)
  visuals: z
    .object({
      icon: z.string().optional(),
      color: z.string().optional(),
      animations: z.array(z.string()).optional(),
    })
    .optional(),
  effects: z
    .array(
      z.object({
        type: z.string().min(1),
        triggers: z.array(z.string()).optional(),
        payload: z.record(z.any()).optional(),
      }),
    )
    .min(1),
  engineAdapters: z
    .object({
      // clés pour brancher le moteur : hooks & handlers
      onSelect: z.string().optional(),
      onSpecialAction: z.string().optional(),
      onTick: z.string().optional(),
      validate: z.string().optional(),
      resolveConflicts: z.string().optional(),
    })
    .partial(),
});

type EngineRule = z.infer<typeof EngineRuleSchema>;

// —— Accès modèle (OpenAI/Groq/…): stub interchangeable ——
const PROVIDER = Deno.env.get("PROVIDER") ?? "openai";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const MODEL = Deno.env.get("MODEL") ?? "gpt-4o-mini";

// Utilitaire: appel modèle qui renvoie TOUJOURS une string JSON (ou lance une erreur contrôlée)
async function callModelJSON(
  prompt: string,
  temperature: number,
  signal: AbortSignal,
): Promise<string> {
  if (PROVIDER === "openai") {
    if (!OPENAI_API_KEY) {
      throw new Error("Missing OPENAI_API_KEY");
    }
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Tu es un compilateur de règles de jeu d’échecs variantes. Réponds STRICTEMENT en JSON unique conforme au schéma demandé, sans texte avant/après.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ProviderError ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (typeof raw !== "string" || raw.trim().length === 0) {
      throw new Error("EmptyModelResponse");
    }
    return raw;
  }

  // Ajoute ici d’autres providers si besoin
  throw new Error(`Unsupported provider: ${PROVIDER}`);
}

// —— Utilitaires sécurité / robustesse ——
async function readBodyWithLimit(
  req: Request,
  limitBytes: number,
): Promise<Uint8Array> {
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  let received = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value?.length ?? 0;
    if (received > limitBytes) {
      throw new Error("PayloadTooLarge");
    }
    chunks.push(value);
  }
  return chunks.length ? concatenate(chunks) : new Uint8Array();
}

function concatenate(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

// —— Serve ——
serve(async (rawReq) => {
  // Preflight CORS
  const preflight = preflightIfOptions(rawReq);
  if (preflight) return preflight;

  try {
    // Sécurise taille payload
    const bodyBytes = await readBodyWithLimit(rawReq, BODY_LIMIT_BYTES);
    const bodyText = new TextDecoder().decode(bodyBytes) || "{}";

    // Validation input
    const parsedInput = RulePromptSchema.safeParse(JSON.parse(bodyText));
    if (!parsedInput.success) {
      return withCors(
        json(
          {
            ok: false,
            error: "InvalidInput",
            details: parsedInput.error.flatten(),
          },
          400,
        ),
      );
    }
    const { prompt, temperature, locale, context } = parsedInput.data;

    // Timeout contrôlé
    const aborter = new AbortController();
    const timer = setTimeout(
      () => aborter.abort("ModelTimeout"),
      MODEL_TIMEOUT_MS,
    );

    // Construit un prompt canonique pour forcer un JSON conforme
    const instruction = `
Génère une règle pour mon moteur de variantes d'échecs à partir du prompt utilisateur ci-dessous.
Renvoie UNIQUEMENT un JSON conforme au schéma "EngineRuleSchema" (pas de Markdown ni d'explications).
Contraintes:
- Fournir "ruleId" unique (ex: "rule_${Date.now()}").
- "effects" doit décrire l'action (ex: "placeMine", "explodeMine", "freezeMissile", "teleport", etc.) avec payload minimal utile.
- Si spécial (bouton d'action), renseigner "engineAdapters.onSpecialAction" avec le nom d'un handler (string).
- Ne crée pas de texte hors JSON.

Schema attendu (typescript):
${EngineRuleSchema.toString()}

Prompt utilisateur (locale=${locale}):
${prompt}

Contexte (optionnel):
${JSON.stringify(context ?? {}, null, 2)}
`.trim();

    let rawJSON = "";
    try {
      rawJSON = await callModelJSON(instruction, temperature, aborter.signal);
    } finally {
      clearTimeout(timer);
    }

    // Parfois les modèles renvoient des « fences » ```json … ```
    const sanitized = rawJSON
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    // Parse + validate
    let candidate: unknown;
    try {
      candidate = JSON.parse(sanitized);
    } catch (e) {
      // Dernier filet: tente d’extraire le premier objet JSON équilibré
      const match = sanitized.match(/\{[\s\S]*\}$/);
      if (!match) {
        throw new Error("ModelReturnedNonJSON");
      }
      candidate = JSON.parse(match[0]);
    }

    const checked = EngineRuleSchema.safeParse(candidate);
    if (!checked.success) {
      return withCors(
        json(
          {
            ok: false,
            error: "InvalidModelJSON",
            details: checked.error.flatten(),
            raw: sanitized.slice(0, 2000),
          },
          422,
        ),
      );
    }

    const rule: EngineRule = checked.data;

    // Succès
    return withCors(json({ ok: true, rule }, 200));
  } catch (err) {
    // Journalisation contrôlée (évite 502)
    const code =
      err?.message === "ModelTimeout"
        ? 504
        : err?.message === "PayloadTooLarge"
          ? 413
          : 500;

    const safe = {
      ok: false,
      error: "GenerateRuleFailed",
      reason: String(err?.message ?? err),
    };

    // Toujours répondre JSON (jamais laisser planter)
    return withCors(json(safe, code));
  }
});
