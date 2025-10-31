// --- generate-chess-rule/index.ts ---
// Générateur de règles d'échecs via Lovable AI
// Point d'entrée : https://{project}.supabase.co/functions/v1/generate-chess-rule

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const LOVABLE_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const SYSTEM_PROMPT = `Tu es un compilateur de règles d'échecs en JSON.
Respecte strictement le schéma: meta, scope, ui, state, parameters, logic.
Réponds uniquement en JSON valide, sans texte additionnel.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!LOVABLE_API_KEY) {
    return new Response(
      JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const body = await req.json();
    const prompt = body.prompt ?? "";

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 5) {
      return new Response(JSON.stringify({ error: "invalid_prompt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch(LOVABLE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 1500,
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            error: "Rate limits exceeded, please try again later.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({
            error:
              "Payment required, please add funds to your Lovable AI workspace.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const errorText = await response.text();
      console.error("Lovable AI error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content ?? "";

    if (typeof content !== "string" || content.trim().length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "empty_model_response" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const extracted = extractJsonFromContent(content);
    if (!extracted) {
      return new Response(
        JSON.stringify({ ok: false, error: "json_not_found_in_response" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let rule: unknown;
    try {
      rule = JSON.parse(extracted);
    } catch (error) {
      console.error("generate-chess-rule JSON parse error", error, extracted);
      return new Response(
        JSON.stringify({ ok: false, error: "invalid_json_payload" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (
      !rule ||
      typeof rule !== "object" ||
      Array.isArray(rule) ||
      !("meta" in rule)
    ) {
      return new Response(
        JSON.stringify({ ok: false, error: "missing_rule_meta" }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const rawModelResponse = {
      model: MODEL,
      content,
      response: result,
    } as const;

    const normalizedPrompt = typeof prompt === "string" ? prompt : "";

    return new Response(
      JSON.stringify({
        ok: true,
        result: {
          status: "ready",
          rule: rule as Record<string, unknown>,
          validation: null,
          dryRun: null,
          prompt: normalizedPrompt,
          promptHash: null,
          correlationId: null,
          provider: MODEL,
          rawModelResponse,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("generate-chess-rule error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

function extractJsonFromContent(content: string): string | null {
  const trimmed = content.trim();

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch && fencedMatch[1]) {
    return sanitizeJsonString(fencedMatch[1]);
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  const candidate = trimmed.slice(firstBrace, lastBrace + 1);
  return sanitizeJsonString(candidate);
}

function sanitizeJsonString(value: string): string {
  return value
    .replace(/^\ufeff/, "")
    .replace(/```/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}
