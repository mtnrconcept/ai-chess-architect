import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { preflightIfOptions } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { invokeChatCompletion, type ChatMessage } from "../_shared/ai-providers.ts";

const historyEntrySchema = z.object({
  role: z.enum(["assistant", "user"]),
  content: z.string().trim().min(1).max(4000),
});

const requestSchema = z.object({
  board: z.string().trim().min(1).max(256),
  moveHistory: z
    .array(z.string().trim().min(1).max(16))
    .max(256)
    .optional()
    .default([]),
  currentPlayer: z.enum(["white", "black"]),
  turnNumber: z.coerce.number().int().min(0).max(1024),
  gameStatus: z.string().trim().min(1).max(64),
  activeRules: z
    .array(z.string().trim().min(1).max(64))
    .max(64)
    .optional()
    .default([]),
  trigger: z.enum(["initial", "auto", "manual"]),
  userMessage: z.string().trim().max(1000).optional().default(""),
  history: z.array(historyEntrySchema).max(12).optional(),
});

type RequestPayload = z.infer<typeof requestSchema>;

const corsOptions = { methods: ["POST"] };

const json = (req: Request, body: unknown, init: ResponseInit = {}) =>
  jsonResponse(req, body, init, corsOptions);

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const pieceValues: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

const parseBoard = (board: string) => {
  const ranks = board.split("/").map((rank) => rank.trim());
  const whitePieces: string[] = [];
  const blackPieces: string[] = [];

  ranks.forEach((rank) => {
    for (const symbol of rank) {
      if (symbol === "." || symbol === " ") continue;
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
  const whiteScore = whitePieces.reduce(
    (acc, piece) => acc + (pieceValues[piece] ?? 0),
    0,
  );
  const blackScore = blackPieces.reduce(
    (acc, piece) => acc + (pieceValues[piece] ?? 0),
    0,
  );
  return whiteScore - blackScore;
};

const buildFallbackMessage = (payload: RequestPayload, reason: string) => {
  const materialDelta = computeMaterialDelta(payload.board);
  const centipawns = clamp(materialDelta, -2000, 2000);
  const perspective = payload.currentPlayer === "white"
    ? centipawns
    : -centipawns;
  const pawns = Math.round((centipawns / 100) * 10) / 10;
  const advantageLabel = pawns === 0
    ? "égalité"
    : `${pawns > 0 ? "+" : ""}${pawns.toFixed(1)}`;
  const turnPhase = payload.turnNumber <= 12
    ? "ouverture"
    : payload.turnNumber <= 28
    ? "milieu de jeu"
    : "finale";
  const lastMove = payload.moveHistory[payload.moveHistory.length - 1] ??
    "aucun coup joué pour le moment";
  const playerLabel = payload.currentPlayer === "white" ? "les blancs" : "les noirs";

  const positivePlan = [
    "Activez vos pièces lourdes sur les colonnes ouvertes.",
    "Cherchez à fixer une faiblesse dans le camp adverse avant de lancer une attaque.",
    "Profitez de votre activité pour améliorer la sécurité du roi.",
  ];

  const defensivePlan = [
    "Neutralisez les menaces immédiates avant d’envisager une contre-attaque.",
    "Simplifiez la position pour réduire la pression sur votre roi.",
    "Travaillez à coordonner vos pièces mineures autour du centre.",
  ];

  const selectedPlans = perspective >= 0
    ? positivePlan.slice(0, 2)
    : defensivePlan.slice(0, 2);
  const phaseMessage = turnPhase === "ouverture"
    ? "Continuez à mobiliser vos pièces mineures et sécurisez votre roi."
    : turnPhase === "milieu de jeu"
    ? "Cherchez le bon moment pour lancer une attaque ou consolider vos points d’appui."
    : "Activez votre roi et créez un pion passé si l’opportunité se présente.";

  return `Analyse heuristique locale (${reason}).\n` +
    `Dernier coup observé : ${lastMove}.\n` +
    `Évaluation matérielle : ${advantageLabel} pour ${playerLabel}.\n` +
    `Phase estimée : ${turnPhase}. ${phaseMessage}\n` +
    `Plans suggérés : ${selectedPlans.join(" | ")}\n` +
    `N’hésitez pas à me demander un plan précis ou une clarification. Je reste à votre disposition !`;
};

Deno.serve(async (req) => {
  const preflight = preflightIfOptions(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") {
      return json(req, { error: "Method not allowed" }, { status: 405 });
    }

    const authResult = await authenticateRequest(req);
    if (!authResult.success) {
      return json(req, { error: authResult.error }, { status: authResult.status });
    }

    const rawBody = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(rawBody);

    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        path: issue.path.join(".") || "root",
        message: issue.message,
      }));
      return json(req, { error: "Invalid request payload", details }, { status: 400 });
    }

    const payload = parsed.data;

    if (payload.board.split("/").length !== 8) {
      return json(req, { error: "Invalid board representation" }, { status: 400 });
    }

    const history = payload.history?.slice(-8) ?? [];

    let assistantMessage: string | null = null;
    let lastError: string | null = null;
    try {
      const systemPrompt = `Tu es Coach CyberIA, un assistant d'échecs conversationnel francophone.\n`
        + `Tu discutes avec un joueur en direct. Pour chaque réponse :\n`
        + `- Analyse la position actuelle et décris en une phrase le dernier coup ou la séquence récente.\n`
        + `- Donne 2 à 3 idées de coups ou plans pertinents pour le camp au trait.\n`
        + `- Identifie le nom de l'ouverture ou de la structure si possible, sinon indique qu'elle est atypique.\n`
        + `- Réponds en français, avec un ton positif et motivant.\n`
        + `- Termine par une question ou une invitation à poursuivre la conversation.`;

      const contextMessage = [
        `Représentation du plateau (du 8e rang vers le 1er) : ${payload.board}`,
        `Coups joués : ${payload.moveHistory.length ? payload.moveHistory.join(", ") : "aucun coup pour le moment"}`,
        `Dernier coup : ${payload.moveHistory[payload.moveHistory.length - 1] ?? "—"}`,
        `Camp au trait : ${payload.currentPlayer}`,
        `Tour numéro : ${payload.turnNumber}`,
        `Statut de la partie : ${payload.gameStatus}`,
        `Règles spéciales actives : ${payload.activeRules.length ? payload.activeRules.join(" | ") : "aucune"}`,
        `Type de mise à jour : ${payload.trigger}`,
        `Message du joueur : ${payload.userMessage || "analyse générale demandée"}`,
      ].join("\n");

      const historyMessages: ChatMessage[] = history.map((entry) => ({
        role: entry.role,
        content: entry.content.slice(0, 4000),
      }));

      const { content } = await invokeChatCompletion({
        messages: [
          { role: "system", content: systemPrompt },
          ...historyMessages,
          { role: "user", content: contextMessage },
        ],
        temperature: 0.6,
      });

      const cleaned = content
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      if (cleaned.length > 0) {
        assistantMessage = cleaned;
      } else {
        throw new Error("Empty response from AI");
      }
    } catch (error) {
      console.error("Error while fetching remote chat response:", error);
      lastError = error instanceof Error ? error.message : String(error);
    }

    if (!assistantMessage) {
      const reason = lastError
        ? `analyse distante indisponible (${lastError})`
        : "analyse distante indisponible";
      assistantMessage = buildFallbackMessage(payload, reason);
    }

    return json(req, { message: assistantMessage });
  } catch (error) {
    console.error("Error in chess-insights:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return json(req, { error: errorMessage }, { status: 500 });
  }
});
