import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import type { PieceColor } from '@/types/chess';
import type {
  AnalyzedMove,
  KeyMoment,
  PieceStat,
  PostGameAnalysisResult,
} from '@/lib/postGameAnalysis';

export interface StoredAnalyzedMove extends AnalyzedMove {}

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
  const overview: AnalysisOverviewPayload = {
    evaluationByMove: analysis.evaluationByMove,
    moveTimeBuckets: analysis.moveTimeBuckets,
    mistakeHistogram: analysis.mistakeHistogram,
    imbalanceByPhase: analysis.imbalanceByPhase,
    keyMoments: analysis.keyMoments,
    pieceStats: analysis.pieceStats,
    recommendations: analysis.recommendations,
    summary: analysis.summary,
  };

  const sanitizedMoves: StoredAnalyzedMove[] = analysis.analyzedMoves.map(move => ({
    ...move,
    timestamp: move.timestamp ?? null,
    durationMs: typeof move.durationMs === 'number' ? move.durationMs : null,
    capturedPiece: move.capturedPiece ?? null,
  }));

  const { error } = await supabase.from('user_games').insert({
    user_id: userId,
    opponent_name: opponentName ?? null,
    opponent_type: opponentType,
    result,
    variant_name: variantName ?? null,
    time_control: timeControl ?? null,
    player_color: playerColor,
    move_history: sanitizedMoves,
    analysis_overview: overview,
    starting_board: analysis.startingBoard,
    accuracy: analysis.accuracy,
    total_moves: analysis.totalMoves,
    duration_seconds: durationSeconds ?? null,
    metadata: metadata ?? null,
  });

  if (error) {
    throw error;
  }
};

export const fetchUserGames = async (userId: string): Promise<StoredGameRecord[]> => {
  const { data, error } = await supabase
    .from('user_games')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  if (!data) {
    return [];
  }

  return data.map(record => ({
    ...record,
    analysis_overview: record.analysis_overview as AnalysisOverviewPayload,
    move_history: record.move_history as StoredAnalyzedMove[],
    starting_board: record.starting_board as PostGameAnalysisResult['startingBoard'],
  }));
};
