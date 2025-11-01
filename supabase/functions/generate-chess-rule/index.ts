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

const SYSTEM_PROMPT = `You are a JSON compiler for chess rules.

CRITICAL RULES:
1. You MUST respond ONLY with valid JSON
2. NO explanatory text before or after the JSON
3. NO markdown code blocks
4. NO questions or clarifications - if unclear, generate a simple default rule

Required JSON schema:
{
  "meta": {
    "name": "string (descriptive name)",
    "key": "string (lowercase-with-dashes)",
    "description": "string (clear explanation)",
    "version": "1.0.0"
  },
  "scope": "game" | "turn" | "move",
  "ui": {},
  "state": {},
  "parameters": {},
  "logic": {}
}

EXAMPLES:

Input: "Pawns can move 3 squares on first move"
Output: {"meta":{"name":"Extended Pawn Rush","key":"extended-pawn-rush","description":"Pawns can move up to 3 squares on their first move","version":"1.0.0"},"scope":"move","ui":{},"state":{},"parameters":{},"logic":{}}

Input: "Kings cannot be captured"
Output: {"meta":{"name":"Immortal Kings","key":"immortal-kings","description":"Kings cannot be captured or removed","version":"1.0.0"},"scope":"game","ui":{},"state":{},"parameters":{},"logic":{}}

Now generate a rule for the user's request. Respond ONLY with valid JSON, nothing else.`;

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
          { role: "user", content: `Generate a chess rule JSON for: "${prompt}"\n\nRemember: Respond ONLY with valid JSON, no other text.` },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
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
      console.error("Empty model response:", result);
      return new Response(
        JSON.stringify({ ok: false, error: "empty_model_response" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Detect if model is asking for clarification instead of generating JSON
    const lowerContent = content.toLowerCase();
    if (
      (content.includes("?") && content.length < 200) ||
      lowerContent.includes("quel type") ||
      lowerContent.includes("what kind") ||
      lowerContent.includes("could you") ||
      lowerContent.includes("pouvez-vous")
    ) {
      console.error("Model asking for clarification:", content.slice(0, 200));
      return new Response(
        JSON.stringify({
          ok: false,
          status: "need_info",
          error: "Model is asking for clarification instead of generating JSON",
          message: content.slice(0, 300),
        }),
        {
          status: 422,
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
    } catch (parseError) {
      console.error("JSON parse failed. Raw model response:", content.slice(0, 500));
      console.error("Extracted candidate:", extracted?.slice(0, 500));
      console.error("Parse error:", parseError);
      
      return new Response(
        JSON.stringify({
          ok: false,
          error: "unable_to_parse_model_response",
          details: parseError instanceof Error ? parseError.message : String(parseError),
          rawResponse: content.slice(0, 500),
        }),
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
          choices: [{ message: { content } }], // For compatibility with ossClient
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
