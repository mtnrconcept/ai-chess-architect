type RequestPayload = {
  board: string;
  moveHistory: string[];
  currentPlayer: string;
  turnNumber: number;
  gameStatus: string;
  activeRules: string[];
  trigger: 'initial' | 'auto' | 'manual';
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers ?? {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(JSON.stringify(body), { ...init, headers });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    const payload = await req.json().catch(() => null) as RequestPayload | null;

    if (!payload || !payload.board) {
      return json({ error: "Game state is required" }, { status: 400 });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `Tu es Coach CyberIA, une IA Lovable spécialisée dans l'analyse d'une partie d'échecs personnalisée.

Ton objectif : fournir un tableau de bord complet dans un JSON parfaitement valide et strictement conforme au schéma suivant :
{
  "analysisSummary": "Résumé synthétique et énergique (une phrase)",
  "evaluation": {
    "score": "Évaluation numérique ou symbolique (ex: +0.8 ou "égalité")",
    "trend": "up|down|stable",
    "bestMoves": ["suggestion 1", "suggestion 2"],
    "threats": ["menace 1", "menace 2"],
    "recommendation": "Conseil prioritaire en 1 phrase"
  },
  "attentionLevels": [
    { "label": "Nom de la dimension", "status": "faible|modéré|élevé", "detail": "explication courte" }
  ],
  "tacticalReactions": [
    { "pattern": "Situation tactique", "advice": "Réaction recommandée" }
  ],
  "eloEvaluation": {
    "estimate": 1800,
    "range": "1700-1900",
    "comment": "analyse de niveau",
    "confidence": "faible|moyenne|élevée",
    "improvementTips": ["axe 1", "axe 2"]
  },
  "successRate": {
    "percentage": 75,
    "trend": "up|down|stable",
    "comment": "interprétation en phrase",
    "keyFactors": ["facteur 1", "facteur 2"]
  },
  "progression": {
    "percentage": 80,
    "summary": "phrase dynamique",
    "graphPoints": [20, 40, 65, 85],
    "nextActions": ["prochain focus", "ajustement"]
  },
  "opening": {
    "name": "Nom de l'ouverture",
    "variation": "Variation ou plan",
    "phase": "ouverture|milieu de jeu|finale",
    "plan": "Conseil stratégique",
    "confidence": "faible|moyenne|élevée"
  },
  "explainLikeImFive": "Explication simplifiée en français",
  "aiSettings": [
    { "label": "Paramètre", "current": "valeur actuelle", "suggestion": "recommandation" }
  ]
}

Contraintes importantes :
- Retourne UNIQUEMENT le JSON ci-dessus, sans texte additionnel, sans markdown.
- Utilise des valeurs numériques réalistes pour "estimate", "percentage" et "graphPoints" (0-100, progression croissante).
- "graphPoints" doit contenir 4 à 6 entiers croissants.
- Adapte le contenu au contexte fourni (plateau, historique, règles spéciales, tour actuel, type de déclencheur).
- Réponds en français.
`;

    const gameContext = `Etat du plateau (notation par rangées):\n${payload.board}\n\nHistorique des coups: ${payload.moveHistory.length ? payload.moveHistory.join(', ') : 'aucun coup joué'}\nTour actuel: ${payload.turnNumber}\nCamp au trait: ${payload.currentPlayer}\nStatut de la partie: ${payload.gameStatus}\nRègles actives: ${payload.activeRules.length ? payload.activeRules.join(' | ') : 'standard'}\nDéclencheur: ${payload.trigger}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: gameContext }
        ],
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      if (response.status === 429) {
        return json({ error: "Rate limit exceeded. Please try again later." }, { status: 429 });
      }
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    let content = data.choices[0].message.content.trim();
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    const insights = JSON.parse(content);

    if (
      insights?.progression?.graphPoints &&
      Array.isArray(insights.progression.graphPoints)
    ) {
      insights.progression.graphPoints = insights.progression.graphPoints
        .map((point: unknown) => Number(point))
        .filter((point: number) => Number.isFinite(point));
    }

    return json({ insights });
  } catch (error) {
    console.error("Error in chess-insights:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return json({ error: errorMessage }, { status: 500 });
  }
});
