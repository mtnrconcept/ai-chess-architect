// --- generate-rule-questions/index.ts ---
// Génère des questions contextuelles pour affiner une règle d'échecs

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const LOVABLE_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const SYSTEM_PROMPT = `Tu es un expert en design de règles d'échecs. Ton rôle est de poser des questions pertinentes pour clarifier une idée de règle.

RÈGLES CRITIQUES:
1. Tu DOIS répondre UNIQUEMENT avec du JSON valide
2. AUCUN texte explicatif, AUCUN bloc markdown
3. Pose UNE question à la fois avec EXACTEMENT 3 choix de réponse
4. Les questions doivent être CONTEXTUELLES à l'idée de règle fournie
5. Les choix doivent être clairs, distincts et couvrir les cas principaux
6. Chaque choix doit être une phrase courte et actionnable

Format de réponse OBLIGATOIRE:
{
  "question": "Question claire et précise en français ?",
  "choices": [
    "Premier choix détaillé",
    "Deuxième choix détaillé", 
    "Troisième choix détaillé"
  ],
  "aspect": "activation|targeting|effect|cooldown|condition|balance"
}

ASPECTS à explorer dans l'ordre:
1. activation: Comment la règle s'active/se déclenche
2. targeting: Quelle cible ou zone est affectée
3. effect: Quel est l'effet précis
4. cooldown: Fréquence d'utilisation / limitations
5. condition: Conditions ou restrictions additionnelles
6. balance: Équilibrage final

EXEMPLE:
Idée: "les pions peuvent déposer des mines"
Réponse: {"question":"Comment le pion dépose-t-il une mine ?","choices":["En cliquant sur un bouton d'action spéciale","Automatiquement après avoir capturé une pièce","Automatiquement en arrivant sur la dernière rangée"],"aspect":"activation"}`;

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
    const { initialPrompt, previousAnswers = [] } = body;

    if (!initialPrompt || typeof initialPrompt !== "string") {
      return new Response(JSON.stringify({ error: "invalid_initial_prompt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let userMessage = `Idée de règle: "${initialPrompt}"\n\n`;
    
    if (previousAnswers.length > 0) {
      userMessage += "Réponses précédentes:\n";
      previousAnswers.forEach((answer: { question: string; choice: string }, idx: number) => {
        userMessage += `${idx + 1}. ${answer.question} → ${answer.choice}\n`;
      });
      userMessage += "\n";
    }

    userMessage += "Génère la prochaine question pour clarifier cette règle. Réponds UNIQUEMENT avec du JSON.";

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
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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

    if (!content) {
      return new Response(
        JSON.stringify({ error: "empty_model_response" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let questionData;
    try {
      questionData = JSON.parse(content);
    } catch (parseError) {
      console.error("JSON parse failed:", content);
      return new Response(
        JSON.stringify({ error: "unable_to_parse_response" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!questionData.question || !Array.isArray(questionData.choices) || questionData.choices.length !== 3) {
      return new Response(
        JSON.stringify({ error: "invalid_question_format" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, question: questionData }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("generate-rule-questions error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
