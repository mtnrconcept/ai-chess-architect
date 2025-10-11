import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import type { PieceColor } from '@/types/chess';
import type {
  AnalyzedMove,
  KeyMoment,
  PieceStat,
  PostGameAnalysisResult,
} from '@/lib/postGameAnalysis';

export type StoredAnalyzedMove = AnalyzedMove;

export interface AnalysisOverviewPayload {
  evaluationByMove: PostGameAnalysisResult['evaluationByMove'];
  moveTimeBuckets: PostGameAnalysisResult['moveTimeBuckets'];
  mistakeHistogram: PostGameAnalysisResult['mistakeHistogram'];
  imbalanceByPhase: PostGameAnalysisResult['imbalanceByPhase'];
  keyMoments: KeyMoment[];
  pieceStats: PieceStat[];
  recommendations: string[];
  summary: string;
}

export interface SaveGamePayload {
  userId: string | null;
  opponentName?: string;
  opponentType: 'ai' | 'player' | 'local';
  result: 'win' | 'loss' | 'draw';
  variantName?: string;
  timeControl?: string;
  playerColor: PieceColor;
  analysis: PostGameAnalysisResult;
  durationSeconds?: number;
  metadata?: Record<string, unknown>;
}

export type UserGamesRow = Database['public']['Tables']['user_games']['Row'];

export type StoredGameRecord = Omit<UserGamesRow, 'analysis_overview' | 'move_history' | 'starting_board'> & {
  analysis_overview: AnalysisOverviewPayload;
  move_history: StoredAnalyzedMove[];
  starting_board: PostGameAnalysisResult['startingBoard'];
};

type RecordUserGameResponse = { gameId: string };

type LoadUserGamesResponse = { games: UserGamesRow[] };

export const saveCompletedGame = async ({
  userId,
  opponentName,
  opponentType,
  result,
  variantName,
  timeControl,
  playerColor,
  analysis,
  durationSeconds,
  metadata,
}: SaveGamePayload) => {
  const { error, data } = await supabase.functions.invoke<RecordUserGameResponse>('record-user-game', {
    body: {
      userId,
      opponentName: opponentName ?? null,
      opponentType,
      result,
      variantName: variantName ?? null,
      timeControl: timeControl ?? null,
      playerColor,
      analysis,
      durationSeconds: durationSeconds ?? null,
      metadata: metadata ?? null,
    },
  });

  if (error) {
    throw new Error(error.message ?? "Impossible d'enregistrer la partie");
  }

  if (!data?.gameId) {
    throw new Error("La réponse du backend ne contient pas d'identifiant de partie");
  }
};

export const fetchUserGames = async (_userId: string): Promise<StoredGameRecord[]> => {
  const { data, error } = await supabase.functions.invoke<LoadUserGamesResponse>('load-user-games', {
    body: { userId: _userId },
  });

  if (error) {
    throw new Error(error.message ?? "Impossible de récupérer les parties");
  }

  const records: UserGamesRow[] = Array.isArray(data?.games) ? (data.games as UserGamesRow[]) : [];

  return records.map(record => ({
    ...record,
    analysis_overview: record.analysis_overview as AnalysisOverviewPayload,
    move_history: record.move_history as StoredAnalyzedMove[],
    starting_board: record.starting_board as PostGameAnalysisResult['startingBoard'],
  }));
};
