import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getSupabaseServiceRoleClient } from "../_shared/env.ts";

type PieceColor = "white" | "black";

type MoveClassification =
  | "brilliant"
  | "great"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder";

type Position = { row: number; col: number };

type SerializedPiece = {
  type: string;
  color: PieceColor;
  row: number;
  col: number;
  isHidden?: boolean;
};

type SerializedBoardState = {
  pieces: SerializedPiece[];
};

type CapturedPiece = { type: string; color: PieceColor } | null;

type AnalyzedMove = {
  index: number;
  moveNumber: number;
  color: PieceColor;
  notation: string;
  pieceType: string;
  from: Position;
  to: Position;
  materialBalance: number;
  delta: number;
  classification: MoveClassification;
  boardSnapshot: SerializedBoardState;
  timestamp: string | null;
  durationMs: number | null;
  capturedPiece: CapturedPiece;
};

type AnalysisOverviewPayload = {
  evaluationByMove: Array<{ move: string; score: number }>;
  moveTimeBuckets: Array<{ label: string; value: number }>;
  mistakeHistogram: { blunders: number; mistakes: number; inaccuracies: number; best: number };
  imbalanceByPhase: Array<{ phase: string; value: number }>;
  keyMoments: Array<{ id: string; label: string; description: string; value: number; moveNumber: number; notation: string }>;
  pieceStats: Array<{ label: string; white: number; black: number }>;
  recommendations: string[];
  summary: string;
};

type PostGameAnalysisResult = {
  accuracy: number;
  analyzedMoves: AnalyzedMove[];
  evaluationByMove: Array<{ move: string; score: number }>;
  moveTimeBuckets: Array<{ label: string; value: number }>;
  mistakeHistogram: { blunders: number; mistakes: number; inaccuracies: number; best: number };
  imbalanceByPhase: Array<{ phase: string; value: number }>;
  keyMoments: Array<{ id: string; label: string; description: string; value: number; moveNumber: number; notation: string }>;
  pieceStats: Array<{ label: string; white: number; black: number }>;
  recommendations: string[];
  summary: string;
  startingBoard: SerializedBoardState;
  totalMoves: number;
};

type SaveGamePayload = {
  userId: string | null;
  opponentName?: string | null;
  opponentType: "ai" | "player" | "local";
  result: "win" | "loss" | "draw";
  variantName?: string | null;
  timeControl?: string | null;
  playerColor: PieceColor;
  analysis: PostGameAnalysisResult;
  durationSeconds?: number | null;
  metadata?: Record<string, unknown> | null;
};

const corsOptions = { methods: ["POST"] };

const adminClient = getSupabaseServiceRoleClient();

const sanitizeMove = (move: AnalyzedMove): AnalyzedMove => ({
  ...move,
  timestamp: move.timestamp ?? null,
  durationMs: typeof move.durationMs === "number" ? move.durationMs : null,
  capturedPiece: move.capturedPiece ?? null,
});

type RecordGameResponse = { gameId: string };

type ErrorResponse = { error: string };

Deno.serve(async req => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, corsOptions);
  }

  if (req.method !== "POST") {
    return jsonResponse<RecordGameResponse | ErrorResponse>(
      req,
      { error: "Method not allowed" },
      { status: 405 },
      corsOptions,
    );
  }

  if (!adminClient) {
    return jsonResponse<RecordGameResponse | ErrorResponse>(
      req,
      { error: "Supabase client misconfigured" },
      { status: 500 },
      corsOptions,
    );
  }

  try {
    const payload = await req.json() as SaveGamePayload | null;

    if (!payload) {
      return jsonResponse<RecordGameResponse | ErrorResponse>(
        req,
        { error: "Payload manquant" },
        { status: 400 },
        corsOptions,
      );
    }

    const {
      userId: requestedUserId,
      opponentName = null,
      opponentType,
      result,
      variantName = null,
      timeControl = null,
      playerColor,
      analysis,
      durationSeconds = null,
      metadata = null,
    } = payload;

    const safeOpponentName = typeof opponentName === "string" ? opponentName : null;
    const safeVariantName = typeof variantName === "string" ? variantName : null;
    const safeTimeControl = typeof timeControl === "string" ? timeControl : null;
    const safeDuration = typeof durationSeconds === "number" ? durationSeconds : null;
    const safeMetadata = metadata && typeof metadata === "object" ? metadata : null;

    const allowedOpponentTypes = new Set(["ai", "player", "local"]);
    const allowedResults = new Set(["win", "loss", "draw"]);

    if (!allowedOpponentTypes.has(opponentType)) {
      return jsonResponse<RecordGameResponse | ErrorResponse>(
        req,
        { error: "Type d'adversaire invalide" },
        { status: 400 },
        corsOptions,
      );
    }

    if (!allowedResults.has(result)) {
      return jsonResponse<RecordGameResponse | ErrorResponse>(
        req,
        { error: "Résultat de partie invalide" },
        { status: 400 },
        corsOptions,
      );
    }

    if (playerColor !== "white" && playerColor !== "black") {
      return jsonResponse<RecordGameResponse | ErrorResponse>(
        req,
        { error: "Couleur du joueur invalide" },
        { status: 400 },
        corsOptions,
      );
    }

    if (
      !analysis
      || !Array.isArray(analysis.analyzedMoves)
      || typeof analysis.accuracy !== "number"
      || typeof analysis.totalMoves !== "number"
    ) {
      return jsonResponse<RecordGameResponse | ErrorResponse>(
        req,
        { error: "Analyse de partie invalide" },
        { status: 400 },
        corsOptions,
      );
    }

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    let authenticatedUserId: string | null = null;

    if (token) {
      const { data: authData, error: authError } = await adminClient.auth.getUser(token);
      if (authError) {
        return jsonResponse<RecordGameResponse | ErrorResponse>(
          req,
          { error: authError.message ?? "Impossible de vérifier l'utilisateur" },
          { status: 401 },
          corsOptions,
        );
      }
      authenticatedUserId = authData?.user?.id ?? null;
    }

    if (requestedUserId && authenticatedUserId && requestedUserId !== authenticatedUserId) {
      return jsonResponse<RecordGameResponse | ErrorResponse>(
        req,
        { error: "L'utilisateur authentifié ne correspond pas à la requête" },
        { status: 403 },
        corsOptions,
      );
    }

    if (requestedUserId && !authenticatedUserId) {
      return jsonResponse<RecordGameResponse | ErrorResponse>(
        req,
        { error: "Session utilisateur requise" },
        { status: 401 },
        corsOptions,
      );
    }

    const userId = authenticatedUserId ?? requestedUserId ?? null;

    const overview: AnalysisOverviewPayload = {
      evaluationByMove: analysis.evaluationByMove ?? [],
      moveTimeBuckets: analysis.moveTimeBuckets ?? [],
      mistakeHistogram: analysis.mistakeHistogram ?? { blunders: 0, mistakes: 0, inaccuracies: 0, best: 0 },
      imbalanceByPhase: analysis.imbalanceByPhase ?? [],
      keyMoments: analysis.keyMoments ?? [],
      pieceStats: analysis.pieceStats ?? [],
      recommendations: analysis.recommendations ?? [],
      summary: analysis.summary ?? "",
    };

    const sanitizedMoves = analysis.analyzedMoves.map(move => sanitizeMove({
      ...move,
      timestamp: move.timestamp ?? null,
      durationMs: move.durationMs ?? null,
      capturedPiece: move.capturedPiece ?? null,
    }));

    const clampedAccuracy = Number.isFinite(analysis.accuracy)
      ? Math.min(100, Math.max(0, analysis.accuracy))
      : 0;

    const safeTotalMoves = Number.isFinite(analysis.totalMoves) && analysis.totalMoves > 0
      ? Math.floor(analysis.totalMoves)
      : 0;

    const insertPayload = {
      user_id: userId,
      opponent_name: safeOpponentName,
      opponent_type: opponentType,
      result,
      variant_name: safeVariantName,
      time_control: safeTimeControl,
      player_color: playerColor,
      move_history: sanitizedMoves,
      analysis_overview: overview,
      starting_board: analysis.startingBoard,
      accuracy: clampedAccuracy,
      total_moves: safeTotalMoves,
      duration_seconds: safeDuration,
      metadata: safeMetadata,
    };

    const { data, error } = await adminClient
      .from("user_games")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error) {
      console.error("record-user-game insert error", error);
      return jsonResponse<RecordGameResponse | ErrorResponse>(
        req,
        { error: "Impossible d'enregistrer la partie" },
        { status: 500 },
        corsOptions,
      );
    }

    return jsonResponse<RecordGameResponse | ErrorResponse>(
      req,
      { gameId: data.id },
      { status: 201 },
      corsOptions,
    );
  } catch (error) {
    console.error("record-user-game unexpected error", error);
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return jsonResponse<RecordGameResponse | ErrorResponse>(
      req,
      { error: message },
      { status: 500 },
      corsOptions,
    );
  }
});
