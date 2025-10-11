import { handleOptions, jsonResponse } from "../_shared/cors.ts";

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

const corsOptions = { methods: ["POST"] } as const;

const json = (req: Request, body: unknown, init: ResponseInit = {}) =>
  jsonResponse(req, body, init, corsOptions);

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
    return handleOptions(req, corsOptions);
  }

  try {
    if (req.method !== "POST") {
      return json(req, { error: "Method not allowed" }, { status: 405 });
    }

    const payload = await req.json().catch(() => null) as RequestPayload | null;

    if (!payload || !payload.board) {
      return json(req, { error: "Game state is required" }, { status: 400 });
    }

    const history = Array.isArray(payload.history)
      ? payload.history
          .filter(entry => entry && typeof entry.content === 'string' && (entry.role === 'assistant' || entry.role === 'user'))
          .slice(-8)
      : [];

    const reason = history.length
      ? 'mode hors-ligne (contexte réduit disponible)'
      : 'mode hors-ligne';

    const assistantMessage = buildFallbackMessage(payload, reason);

    return json(req, { message: assistantMessage });
  } catch (error) {
    console.error("Error in chess-insights:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return json(req, { error: errorMessage }, { status: 500 });
  }
});
