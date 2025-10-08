type ChatHistoryEntry = {
  role: 'assistant' | 'user';
  content: string;
};

type RequestPayload = {
  board: string;
  moveHistory: string[];
  currentPlayer: string;
  turnNumber: number;
  gameStatus: string;
  activeRules: string[];
  trigger: 'initial' | 'auto' | 'manual';
  userMessage: string;
  history?: ChatHistoryEntry[];
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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const pieceValues: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

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

const buildFallbackMessage = (payload: RequestPayload, reason: string) => {
  const materialDelta = computeMaterialDelta(payload.board);
  const centipawns = clamp(materialDelta, -2000, 2000);
  const perspective = payload.currentPlayer === 'white' ? centipawns : -centipawns;
  const pawns = Math.round((centipawns / 100) * 10) / 10;
  const advantageLabel = pawns === 0 ? 'égalité' : `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
  const turnPhase = payload.turnNumber <= 12 ? 'ouverture' : payload.turnNumber <= 28 ? 'milieu de jeu' : 'finale';
  const lastMove = payload.moveHistory[payload.moveHistory.length - 1] ?? 'aucun coup joué pour le moment';
  const playerLabel = payload.currentPlayer === 'white' ? 'les blancs' : 'les noirs';

  const positivePlan = [
    'Activez vos pièces lourdes sur les colonnes ouvertes.',
    'Cherchez à fixer une faiblesse dans le camp adverse avant de lancer une attaque.',
    'Profitez de votre activité pour améliorer la sécurité du roi.',
  ];

  const defensivePlan = [
    'Neutralisez les menaces immédiates avant d’envisager une contre-attaque.',
    'Simplifiez la position pour réduire la pression sur votre roi.',
    'Travaillez à coordonner vos pièces mineures autour du centre.',
  ];

  const selectedPlans = perspective >= 0 ? positivePlan.slice(0, 2) : defensivePlan.slice(0, 2);
  const phaseMessage = turnPhase === 'ouverture'
    ? 'Continuez à mobiliser vos pièces mineures et sécurisez votre roi.'
    : turnPhase === 'milieu de jeu'
      ? 'Cherchez le bon moment pour lancer une attaque ou consolider vos points d’appui.'
      : 'Activez votre roi et créez un pion passé si l’opportunité se présente.';

  return `Analyse heuristique locale (${reason}).\n` +
    `Dernier coup observé : ${lastMove}.\n` +
    `Évaluation matérielle : ${advantageLabel} pour ${playerLabel}.\n` +
    `Phase estimée : ${turnPhase}. ${phaseMessage}\n` +
    `Plans suggérés : ${selectedPlans.join(' | ')}\n` +
    `N’hésitez pas à me demander un plan précis ou une clarification. Je reste à votre disposition !`;
};

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

    const history = Array.isArray(payload.history)
      ? payload.history
          .filter(entry => entry && typeof entry.content === 'string' && (entry.role === 'assistant' || entry.role === 'user'))
          .slice(-8)
      : [];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    let assistantMessage: string | null = null;
    let lastError: string | null = null;

    if (LOVABLE_API_KEY) {
      try {
        const systemPrompt = `Tu es Coach CyberIA, un assistant d'échecs conversationnel francophone alimenté par Lovable.\n` +
          `Tu discutes avec un joueur en direct. Pour chaque réponse :\n` +
          `- Analyse la position actuelle et décris en une phrase le dernier coup ou la séquence récente.\n` +
          `- Donne 2 à 3 idées de coups ou plans pertinents pour le camp au trait.\n` +
          `- Identifie le nom de l'ouverture ou de la structure si possible, sinon indique qu'elle est atypique.\n` +
          `- Réponds en français, avec un ton positif et motivant.\n` +
          `- Termine par une question ou une invitation à poursuivre la conversation.`;

        const contextMessage = [
          `Représentation du plateau (du 8e rang vers le 1er) : ${payload.board}`,
          `Coups joués : ${payload.moveHistory.length ? payload.moveHistory.join(', ') : 'aucun coup pour le moment'}`,
          `Dernier coup : ${payload.moveHistory[payload.moveHistory.length - 1] ?? '—'}`,
          `Camp au trait : ${payload.currentPlayer}`,
          `Tour numéro : ${payload.turnNumber}`,
          `Statut de la partie : ${payload.gameStatus}`,
          `Règles spéciales actives : ${payload.activeRules.length ? payload.activeRules.join(' | ') : 'aucune'}`,
          `Type de mise à jour : ${payload.trigger}`,
          `Message du joueur : ${payload.userMessage || 'analyse générale demandée'}`,
        ].join('\n');

        const messages = [
          { role: "system" as const, content: systemPrompt },
          ...history.map(entry => ({ role: entry.role, content: entry.content.slice(0, 4000) })),
          { role: "user" as const, content: contextMessage },
        ];

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages,
            temperature: 0.6,
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
        let content = (data?.choices?.[0]?.message?.content ?? '').trim();
        content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

        if (content.length > 0) {
          assistantMessage = content;
        } else {
          throw new Error("Empty response from AI");
        }
      } catch (error) {
        console.error("Error while fetching remote chat response:", error);
        lastError = error instanceof Error ? error.message : String(error);
      }
    } else {
      lastError = "LOVABLE_API_KEY missing";
    }

    if (!assistantMessage) {
      const reason = lastError ? `analyse distante indisponible (${lastError})` : 'analyse distante indisponible';
      assistantMessage = buildFallbackMessage(payload, reason);
    }

    return json({ message: assistantMessage });
  } catch (error) {
    console.error("Error in chess-insights:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return json({ error: errorMessage }, { status: 500 });
  }
});
