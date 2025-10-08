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

    const pieceValues: Record<string, number> = {
      p: 100,
      n: 320,
      b: 330,
      r: 500,
      q: 900,
      k: 20000
    };

    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

    const parseBoard = (board: string) => {
      const ranks = board.split("/").map(rank => rank.trim());
      const whitePieces: string[] = [];
      const blackPieces: string[] = [];

      ranks.forEach(rank => {
        for (const symbol of rank) {
          if (symbol === '.' || symbol === ' ') continue;
          const lower = symbol.toLowerCase();
          if (symbol === symbol.toUpperCase()) {
            whitePieces.push(lower);
          } else {
            blackPieces.push(lower);
          }
        }
      });

      return { whitePieces, blackPieces };
    };

    const computeMaterialDelta = (board: string) => {
      const { whitePieces, blackPieces } = parseBoard(board);
      const whiteScore = whitePieces.reduce((acc, piece) => acc + (pieceValues[piece] ?? 0), 0);
      const blackScore = blackPieces.reduce((acc, piece) => acc + (pieceValues[piece] ?? 0), 0);
      return whiteScore - blackScore;
    };

    const buildFallbackInsights = (payload: RequestPayload, reason: string) => {
      const materialDelta = computeMaterialDelta(payload.board);
      const centipawns = clamp(materialDelta, -2000, 2000);
      const perspective = payload.currentPlayer === 'white' ? centipawns : -centipawns;
      const pawns = Math.round((centipawns / 100) * 10) / 10;
      const advantageLabel = pawns === 0 ? 'égalité' : `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
      const trend = perspective > 80 ? 'up' : perspective < -80 ? 'down' : 'stable';
      const successBase = clamp(50 + Math.round(centipawns / 1000 * 20), 5, 95);
      const turnPhase = payload.turnNumber <= 12 ? 'ouverture' : payload.turnNumber <= 28 ? 'milieu de jeu' : 'finale';
      const momentum = clamp(successBase + (payload.trigger === 'initial' ? 5 : 0), 5, 98);

      const generateGraphPoints = () => {
        const base = clamp(40 + payload.moveHistory.length * 3, 10, 80);
        const last = clamp(base + Math.round(perspective / 120), 15, 95);
        const basePoints = [base - 15, base - 5, base + 5, last];
        return basePoints.reduce<number[]>((acc, raw) => {
          const normalized = clamp(Math.round(raw), 0, 100);
          const value = acc.length > 0 ? Math.max(acc[acc.length - 1], normalized) : normalized;
          acc.push(value);
          return acc;
        }, []);
      };

      const openingSummary = (() => {
        if (turnPhase === 'ouverture') {
          return "Continuez à développer vos pièces mineures rapidement.";
        }
        if (turnPhase === 'milieu de jeu') {
          return "Coordonnez vos pièces pour viser les faiblesses adverses.";
        }
        return "Activez le roi et créez un pion passé dans le final.";
      })();

      const successComment = perspective > 0
        ? "L'avantage matériel actuel vous donne de bonnes perspectives."
        : perspective < 0
          ? "Restez vigilant : l'adversaire a une légère avance matérielle."
          : "La position est équilibrée, cherchez les meilleures cases pour vos pièces.";

      const tacticalAdvice = perspective >= 0
        ? "Profitez des colonnes ouvertes pour doubler vos tours."
        : "Éliminez les menaces directes avant de lancer une contre-attaque.";

      return {
        analysisSummary: reason
          ? `Analyse heuristique hors ligne activée (${reason}).`
          : "Analyse heuristique rapide basée sur le matériel.",
        evaluation: {
          score: advantageLabel,
          trend,
          bestMoves: perspective >= 0
            ? ["Développez la pression sur le centre", "Améliorez la coordination des tours"]
            : ["Sécurisez votre roi", "Neutralisez les pièces actives adverses"],
          threats: perspective <= 0
            ? ["Attention aux fourchettes et clouages", "Surveillez les poussées de pions adverses"]
            : ["Consolidez vos cases faibles", "Empêchez les sacrifices tactiques"],
          recommendation: perspective >= 0
            ? "Consolidez l'avantage matériel avant de lancer un assaut décisif."
            : "Simplifiez le centre et échangez les pièces actives adverses."
        },
        attentionLevels: [
          {
            label: "Structure de pions",
            status: perspective >= 0 ? 'modéré' : 'élevé',
            detail: "Identifiez les faiblesses fixes et fixez vos plans autour d'elles."
          },
          {
            label: "Sécurité du roi",
            status: turnPhase === 'ouverture' ? 'modéré' : 'faible',
            detail: "Vérifiez la coordination des pièces défensives avant chaque coup."
          }
        ],
        tacticalReactions: [
          {
            pattern: perspective >= 0 ? "Faiblesse sur colonnes ouvertes" : "Pression adverse sur le centre",
            advice: tacticalAdvice
          }
        ],
        eloEvaluation: {
          estimate: clamp(1500 + Math.round(centipawns / 50), 800, 2400),
          range: `${clamp(1400 + Math.round(centipawns / 80), 700, 2200)}-${clamp(1600 + Math.round(centipawns / 80), 900, 2600)}`,
          comment: perspective >= 0
            ? "Le niveau de jeu suggère une bonne compréhension stratégique."
            : "Le rythme peut s'améliorer avec une meilleure gestion des menaces tactiques.",
          confidence: payload.moveHistory.length >= 12 ? 'élevée' : 'moyenne',
          improvementTips: [
            "Analysez vos transitions ouverture-milieu de jeu",
            "Travaillez les finales basiques pour convertir l'avantage"
          ]
        },
        successRate: {
          percentage: momentum,
          trend,
          comment: successComment,
          keyFactors: [
            perspective >= 0 ? "Supériorité matérielle" : "Initiative adverse",
            turnPhase === 'ouverture' ? "Développement" : "Plan de milieu de jeu"
          ]
        },
        progression: {
          percentage: clamp(momentum + (trend === 'up' ? 4 : trend === 'down' ? -4 : 0), 5, 99),
          summary: openingSummary,
          graphPoints: generateGraphPoints(),
          nextActions: perspective >= 0
            ? ["Centralisez vos pièces majeures", "Préparez une percée sur l'aile cible"]
            : ["Réduisez les tensions", "Activez vos pièces passives"]
        },
        opening: {
          name: turnPhase === 'ouverture' ? "Ouverture standard" : "Transition stratégique",
          variation: turnPhase === 'ouverture' ? "Structure classique" : "Plan dynamique",
          phase: turnPhase,
          plan: openingSummary,
          confidence: payload.moveHistory.length >= 6 ? 'moyenne' : 'faible'
        },
        explainLikeImFive: perspective >= 0
          ? "Tu as un peu plus de pièces puissantes : garde-les protégées et avance doucement."
          : "L'autre joueur a plus d'attaques : protège ton roi et cherche des échanges simples.",
        aiSettings: [
          {
            label: "Style du bot",
            current: perspective >= 0 ? "équilibré" : "défensif",
            suggestion: perspective >= 0 ? "Augmente la prise de risque pour convertir" : "Stabilise avant de contre-attaquer"
          },
          {
            label: "Cadence d'analyse",
            current: payload.trigger,
            suggestion: payload.trigger === 'manual'
              ? "Active l'analyse automatique pour suivre chaque coup"
              : "Relance une analyse manuelle après un changement majeur"
          }
        ]
      };
    };

    let insights: unknown = null;
    let lastError: string | null = null;

    if (LOVABLE_API_KEY) {
      try {
        const systemPrompt = `Tu es Coach CyberIA, une IA Lovable spécialisée dans l'analyse d'une partie d'échecs personnalisée.

Ton objectif : fournir un tableau de bord complet dans un JSON parfaitement valide et strictement conforme au schéma suivant :
{
  "analysisSummary": "Résumé synthétique et énergique (une phrase)",
  "evaluation": {
    "score": "Évaluation numérique ou symbolique (ex: +0.8 ou \"égalité\")",
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

        insights = JSON.parse(content);

        if (
          (insights as any)?.progression?.graphPoints &&
          Array.isArray((insights as any).progression.graphPoints)
        ) {
          (insights as any).progression.graphPoints = (insights as any).progression.graphPoints
            .map((point: unknown) => Number(point))
            .filter((point: number) => Number.isFinite(point));
        }
      } catch (error) {
        console.error("Error while fetching remote insights:", error);
        lastError = error instanceof Error ? error.message : String(error);
      }
    } else {
      lastError = "LOVABLE_API_KEY missing";
    }

    if (!insights) {
      insights = buildFallbackInsights(payload, lastError ?? "indisponible");
    }

    return json({ insights });
  } catch (error) {
    console.error("Error in chess-insights:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return json({ error: errorMessage }, { status: 500 });
  }
});
