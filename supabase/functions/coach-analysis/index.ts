// Analyse post-partie via Lovable AI
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const LOVABLE_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-pro";

const SYSTEM_PROMPT = `Tu es un coach d'échecs expert. Analyse les parties en détail et fournis des conseils constructifs.
Sois précis, pédagogique et encourage le joueur à progresser.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!LOVABLE_API_KEY) {
    return new Response(
      JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { moves, fen, duration, result } = body;

    if (!moves || !Array.isArray(moves)) {
      return new Response(
        JSON.stringify({ error: "moves array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const prompt = `Analyse cette partie d'échecs:
- Coups joués: ${moves.join(", ")}
- Position finale: ${fen || "non fournie"}
- Durée: ${duration || "non fournie"}
- Résultat: ${result || "non fourni"}

Fournis une analyse détaillée avec:
1. Points forts de la partie
2. Erreurs tactiques ou stratégiques
3. Moments clés
4. Conseils pour progresser`;

    const response = await fetch(LOVABLE_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        temperature: 0.6,
        max_tokens: 2000,
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const errorText = await response.text();
      console.error("Lovable AI error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result_data = await response.json();
    const analysis = result_data.choices?.[0]?.message?.content ?? "";

    return new Response(
      JSON.stringify({ 
        analysis,
        model: MODEL,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("coach-analysis error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
