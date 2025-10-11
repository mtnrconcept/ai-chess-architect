import { ChessEngine } from '@/lib/chessEngine';
import type {
  ChessMove,
  ChessPiece,
  PieceColor,
  PieceType,
  Position,
  SerializedBoardState,
} from '@/types/chess';

export type MoveClassification = 'brilliant' | 'great' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export interface AnalyzedMove {
  index: number;
  moveNumber: number;
  color: PieceColor;
  notation: string;
  pieceType: PieceType;
  from: Position;
  to: Position;
  materialBalance: number;
  delta: number;
  classification: MoveClassification;
  boardSnapshot: SerializedBoardState;
  timestamp?: string;
  durationMs?: number | null;
  capturedPiece?: { type: PieceType; color: PieceColor } | null;
}

export interface KeyMoment {
  id: string;
  label: string;
  description: string;
  value: number;
  moveNumber: number;
  notation: string;
}

export interface PieceStat {
  label: string;
  white: number;
  black: number;
}

export interface PostGameAnalysisResult {
  accuracy: number;
  analyzedMoves: AnalyzedMove[];
  evaluationByMove: Array<{ move: string; score: number }>;
  moveTimeBuckets: Array<{ label: string; value: number }>;
  mistakeHistogram: { blunders: number; mistakes: number; inaccuracies: number; best: number };
  imbalanceByPhase: Array<{ phase: string; value: number }>;
  keyMoments: KeyMoment[];
  pieceStats: PieceStat[];
  recommendations: string[];
  summary: string;
  startingBoard: SerializedBoardState;
  totalMoves: number;
}

export interface AnalyzeGameOptions {
  playerColor: PieceColor;
  result: 'win' | 'loss' | 'draw';
  initialBoard: (ChessPiece | null)[][];
}

const FILES = 'abcdefgh';

const PIECE_VALUES: Record<PieceType, number> = {
  king: 20000,
  queen: 900,
  rook: 500,
  bishop: 330,
  knight: 320,
  pawn: 100,
};

const DEFAULT_TIME_BUCKETS: Array<{ label: string; range: [number, number] }> = [
  { label: '≤5s', range: [0, 5] },
  { label: '5-15s', range: [5, 15] },
  { label: '15-30s', range: [15, 30] },
  { label: '30s+', range: [30, Number.POSITIVE_INFINITY] },
];

const positionToNotation = (position: Position): string => {
  const file = FILES[position.col] ?? '?';
  const rank = 8 - position.row;
  return `${file}${rank}`;
};

export const formatMoveNotation = (move: Pick<ChessMove, 'from' | 'to' | 'captured' | 'promotion' | 'isCastling' | 'isEnPassant'>): string => {
  if (move.isCastling) {
    const isKingSide = move.to.col === 6;
    return isKingSide ? 'O-O' : 'O-O-O';
  }

  const sep = move.captured ? 'x' : '-';
  const promo = move.promotion ? `=${String(move.promotion).toUpperCase()}` : '';
  const suffix = move.isEnPassant ? ' e.p.' : '';
  return `${positionToNotation(move.from)}${sep}${positionToNotation(move.to)}${promo}${suffix}`;
};

export const serializeBoardState = (board: (ChessPiece | null)[][]): SerializedBoardState => ({
  pieces: board.flatMap((row, rowIndex) =>
    row.flatMap((piece, colIndex) =>
      piece
        ? [{
            type: piece.type,
            color: piece.color,
            row: rowIndex,
            col: colIndex,
            isHidden: piece.isHidden ?? false,
          }]
        : []
    )
  ),
});

export const deserializeBoardState = (state: SerializedBoardState): (ChessPiece | null)[][] => {
  const board = ChessEngine.createEmptyBoard();
  state.pieces.forEach(piece => {
    board[piece.row][piece.col] = {
      type: piece.type,
      color: piece.color,
      position: { row: piece.row, col: piece.col },
      isHidden: piece.isHidden ?? false,
      hasMoved: true,
    } as ChessPiece;
  });
  return board;
};

export const boardStateToString = (state: SerializedBoardState): string => {
  const board = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => '.'));
  state.pieces.forEach(piece => {
    const symbolMap: Record<PieceColor, Record<PieceType, string>> = {
      white: { king: 'K', queen: 'Q', rook: 'R', bishop: 'B', knight: 'N', pawn: 'P' },
      black: { king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: 'p' },
    };
    board[piece.row][piece.col] = symbolMap[piece.color][piece.type];
  });
  return board.map(rank => rank.join('')).join(' / ');
};

const computeMaterialBalance = (state: SerializedBoardState, perspective: PieceColor): number =>
  state.pieces.reduce((score, piece) => {
    const value = PIECE_VALUES[piece.type];
    return piece.color === perspective ? score + value : score - value;
  }, 0);

const classifyDelta = (delta: number): MoveClassification => {
  if (delta >= 150) return 'brilliant';
  if (delta >= 60) return 'great';
  if (delta >= -60) return 'good';
  if (delta >= -180) return 'inaccuracy';
  if (delta >= -360) return 'mistake';
  return 'blunder';
};

const average = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const roundScore = (value: number): number => Math.round(value * 10) / 10;

export const analyzeCompletedGame = (
  moves: ChessMove[],
  options: AnalyzeGameOptions,
): PostGameAnalysisResult => {
  const startingBoard = serializeBoardState(options.initialBoard);

  let previousBalance = computeMaterialBalance(startingBoard, options.playerColor);
  const evaluationByMove: Array<{ move: string; score: number }> = [
    { move: 'Initial', score: roundScore(previousBalance / 100) },
  ];

  const analyzedMoves: AnalyzedMove[] = [];
  const moveTimeBuckets = DEFAULT_TIME_BUCKETS.map(bucket => ({ label: bucket.label, value: 0 }));
  const mistakeHistogram = { blunders: 0, mistakes: 0, inaccuracies: 0, best: 0 };
  const materialTimeline: number[] = [previousBalance];

  const openingScores: number[] = [];
  const midgameScores: number[] = [];
  const endgameScores: number[] = [];

  moves.forEach((move, index) => {
    if (!move.boardSnapshot) {
      return;
    }

    const notation = move.notation ?? formatMoveNotation(move);
    const moveNumber = Math.floor(index / 2) + 1;
    const moveLabel = `${moveNumber}${move.piece.color === 'white' ? '.' : '…'}`;

    const currentBalance = computeMaterialBalance(move.boardSnapshot, options.playerColor);
    const delta = currentBalance - previousBalance;

    const classification = classifyDelta(move.piece.color === options.playerColor ? delta : -delta);

    if (move.piece.color === options.playerColor) {
      switch (classification) {
        case 'blunder':
          mistakeHistogram.blunders += 1;
          break;
        case 'mistake':
          mistakeHistogram.mistakes += 1;
          break;
        case 'inaccuracy':
          mistakeHistogram.inaccuracies += 1;
          break;
        default:
          mistakeHistogram.best += 1;
          break;
      }

      const durationSeconds = typeof move.durationMs === 'number' ? move.durationMs / 1000 : undefined;
      if (durationSeconds && durationSeconds > 0) {
        const bucketIndex = DEFAULT_TIME_BUCKETS.findIndex(({ range }) =>
          durationSeconds >= range[0] && durationSeconds < range[1]
        );
        const indexToIncrement = bucketIndex >= 0 ? bucketIndex : moveTimeBuckets.length - 1;
        moveTimeBuckets[indexToIncrement].value += 1;
      }
    }

    const analyzedMove: AnalyzedMove = {
      index,
      moveNumber,
      color: move.piece.color,
      notation,
      pieceType: move.piece.type,
      from: move.from,
      to: move.to,
      materialBalance: currentBalance,
      delta,
      classification,
      boardSnapshot: move.boardSnapshot,
      timestamp: move.timestamp,
      durationMs: move.durationMs,
      capturedPiece: move.captured
        ? { type: move.captured.type, color: move.captured.color }
        : null,
    };

    analyzedMoves.push(analyzedMove);
    evaluationByMove.push({ move: moveLabel, score: roundScore(currentBalance / 100) });
    materialTimeline.push(currentBalance);

    if (moveNumber <= 10) {
      openingScores.push(currentBalance);
    } else if (moveNumber <= 25) {
      midgameScores.push(currentBalance);
    } else {
      endgameScores.push(currentBalance);
    }

    previousBalance = currentBalance;
  });

  const playerMoveCount = analyzedMoves.filter(move => move.color === options.playerColor).length;

  const penalty =
    mistakeHistogram.blunders * 22 +
    mistakeHistogram.mistakes * 12 +
    mistakeHistogram.inaccuracies * 5;

  let accuracy = 100 - penalty / Math.max(1, playerMoveCount);
  if (options.result === 'win') accuracy += 3;
  if (options.result === 'loss') accuracy -= 2;
  accuracy = Math.min(99, Math.max(35, accuracy));
  accuracy = Math.round(accuracy * 10) / 10;

  const imbalanceByPhase = [
    { phase: 'Ouverture', value: roundScore(average(openingScores) / 100) },
    { phase: 'Milieu de jeu', value: roundScore(average(midgameScores) / 100) },
    { phase: 'Finale', value: roundScore(average(endgameScores) / 100) },
  ];

  const playerMoves = analyzedMoves.filter(move => move.color === options.playerColor);
  const opponentMoves = analyzedMoves.filter(move => move.color !== options.playerColor);

  const bestSwing = playerMoves.reduce<AnalyzedMove | null>((best, move) =>
    !best || move.delta > best.delta ? move : best,
  null);
  const worstSwing = playerMoves.reduce<AnalyzedMove | null>((worst, move) =>
    !worst || move.delta < worst.delta ? move : worst,
  null);
  const opponentHighlight = opponentMoves.reduce<AnalyzedMove | null>((highlight, move) =>
    !highlight || move.delta < highlight.delta ? move : highlight,
  null);

  const keyMoments: KeyMoment[] = [];

  if (bestSwing) {
    keyMoments.push({
      id: 'decisive-strike',
      label: 'Attaque décisive',
      description: `${bestSwing.notation} a amélioré votre position de ${roundScore(bestSwing.delta / 100)} pions`,
      value: roundScore(bestSwing.delta / 100),
      moveNumber: bestSwing.moveNumber,
      notation: bestSwing.notation,
    });
  }

  if (worstSwing) {
    keyMoments.push({
      id: 'critical-zone',
      label: 'Zone critique',
      description: `${worstSwing.notation} a coûté ${roundScore(Math.abs(worstSwing.delta) / 100)} pions`,
      value: roundScore(worstSwing.delta / 100),
      moveNumber: worstSwing.moveNumber,
      notation: worstSwing.notation,
    });
  }

  if (opponentHighlight) {
    keyMoments.push({
      id: 'opponent-response',
      label: 'Riposte adverse',
      description: `${opponentHighlight.notation} a inversé l'équilibre de ${roundScore(Math.abs(opponentHighlight.delta) / 100)} pions`,
      value: roundScore(opponentHighlight.delta / 100),
      moveNumber: opponentHighlight.moveNumber,
      notation: opponentHighlight.notation,
    });
  }

  const finalBoard = analyzedMoves[analyzedMoves.length - 1]?.boardSnapshot ?? startingBoard;
  const countPieces = (color: PieceColor, types: PieceType[]): number =>
    finalBoard.pieces.filter(piece => piece.color === color && types.includes(piece.type)).length;

  const pieceStats: PieceStat[] = [
    { label: 'Pions', white: countPieces('white', ['pawn']), black: countPieces('black', ['pawn']) },
    {
      label: 'Pièces légères',
      white: countPieces('white', ['bishop', 'knight']),
      black: countPieces('black', ['bishop', 'knight']),
    },
    {
      label: 'Pièces lourdes',
      white: countPieces('white', ['rook', 'queen']),
      black: countPieces('black', ['rook', 'queen']),
    },
    { label: 'Rois', white: countPieces('white', ['king']), black: countPieces('black', ['king']) },
  ];

  const recommendations: string[] = [];
  if (mistakeHistogram.blunders > 0) {
    recommendations.push('Travaillez la tactique à court terme pour éviter les pertes de pièces nettes.');
  }
  if (mistakeHistogram.inaccuracies > 2) {
    recommendations.push('Révisez vos plans d’ouverture pour consolider vos structures.');
  }
  if (mistakeHistogram.mistakes > 0) {
    recommendations.push('Analysez les finales similaires pour améliorer votre technique de conversion.');
  }
  if (recommendations.length === 0) {
    recommendations.push('Solide prestation ! Continuez à varier les plans pour enrichir votre arsenal stratégique.');
  }

  const summaryParts = [
    options.result === 'win'
      ? 'Victoire obtenue'
      : options.result === 'loss'
        ? 'Défaite à analyser'
        : 'Nulle équilibrée',
    `Précision estimée : ${accuracy.toFixed(1)} %`,
    `${playerMoves.length} coups joués côté ${options.playerColor === 'white' ? 'blanc' : 'noir'}`,
  ];

  return {
    accuracy,
    analyzedMoves,
    evaluationByMove,
    moveTimeBuckets,
    mistakeHistogram,
    imbalanceByPhase,
    keyMoments,
    pieceStats,
    recommendations,
    summary: summaryParts.join(' · '),
    startingBoard,
    totalMoves: moves.length,
  };
};
