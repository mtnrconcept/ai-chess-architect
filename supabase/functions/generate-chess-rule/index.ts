// supabase/functions/generate-chess-rule/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "authorization,content-type",
  };
}
function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...cors(),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

type GenerateRuleReq = {
  prompt: string;
  board?: {
    tiles: unknown;
    pieces: unknown;
    occupancy: unknown;
  };
  options?: { locale?: string; dryRun?: boolean };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("", { headers: cors() });
  if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });

  // Content-Type strict
  const ctype = req.headers.get("content-type") || "";
  if (!ctype.includes("application/json")) {
    return json(422, {
      error: "invalid_content_type",
      message: "Use application/json",
    });
  }

  let body: GenerateRuleReq;
  try {
    body = await req.json();
  } catch {
    return json(422, {
      error: "invalid_json",
      message: "Body must be valid JSON",
    });
  }

  // Validation minimale (évite 422 silencieux)
  const issues: string[] = [];
  if (!body.prompt || typeof body.prompt !== "string" || !body.prompt.trim()) {
    issues.push("prompt: string non vide requis");
  }
  if (body.board) {
    if (!Array.isArray(body.board.tiles))
      issues.push("board.tiles: array requis");
    if (typeof body.board.occupancy !== "object")
      issues.push("board.occupancy: object requis");
    if (typeof body.board.pieces !== "object")
      issues.push("board.pieces: object requis");
  }
  if (issues.length) {
    console.warn("422 validation issues:", issues);
    return json(422, { error: "validation_failed", issues });
  }

  try {
    // === Pipeline NL → Intent → Rule JSON (mock minimal ici) ===
    const rule = compilePromptToRule(body.prompt, body.options);
    // Optionnel: dry-run
    const meta = { locale: body.options?.locale ?? "fr-CH" };
    return json(200, { ok: true, result: { rule, meta } });
  } catch (e) {
    console.error("generate-chess-rule fatal:", e);
    return json(500, { error: "internal", message: String(e?.message || e) });
  }
});

function compilePromptToRule(
  prompt: string,
  _options?: Record<string, unknown>,
) {
  // Ici tu branches ton LLM + mappers → providers génériques
  // Pour debug 422, on retourne un squelette valide:
  return {
    ruleName: "Règle générée",
    affectedPieces: ["queen"],
    uiActions: [
      {
        id: "special_action",
        label: "Action",
        icon: "✨",
        cooldown: { perPiece: 2 },
        targeting: {
          mode: "tile",
          validTilesProvider: "provider.raycastFirstHits",
          params: { directions: ["ortho", "diag"], maxRange: 7 },
        },
        consumesTurn: true,
      },
    ],
    effects: [
      {
        id: "fx",
        when: "ui.special_action",
        if: [["cooldown.ready", "$pieceId", "special_action"]],
        do: [
          {
            action: "vfx.play",
            params: { tile: "$targetTile", sprite: "spark" },
          },
          { action: "audio.play", params: { id: "whoosh" } },
          { action: "turn.end" },
        ],
      },
    ],
  };
}
