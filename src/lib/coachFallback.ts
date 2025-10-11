export type CoachFallbackContext = {
  board: string;
  moveHistory: string[];
  currentPlayer: 'white' | 'black';
  turnNumber: number;
  gameStatus: string;
  trigger: 'initial' | 'auto' | 'manual';
  reason?: string;
};

const pieceValues: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const parseBoard = (board: string) => {
  const ranks = board.split('/').map(rank => rank.trim());
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

export const buildCoachFallbackMessage = ({
  board,
  moveHistory,
  currentPlayer,
  turnNumber,
  gameStatus,
  trigger,
  reason,
}: CoachFallbackContext) => {
  const materialDelta = computeMaterialDelta(board);
  const centipawns = clamp(materialDelta, -2000, 2000);
  const perspective = currentPlayer === 'white' ? centipawns : -centipawns;
  const pawns = Math.round((centipawns / 100) * 10) / 10;
  const advantageLabel = pawns === 0 ? 'égalité' : `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
  const turnPhase = turnNumber <= 12 ? 'ouverture' : turnNumber <= 28 ? 'milieu de jeu' : 'finale';
  const lastMove = moveHistory[moveHistory.length - 1] ?? 'aucun coup joué pour le moment';
  const playerLabel = currentPlayer === 'white' ? 'les blancs' : 'les noirs';

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
  const phaseMessage =
    turnPhase === 'ouverture'
      ? 'Continuez à mobiliser vos pièces mineures et sécurisez votre roi.'
      : turnPhase === 'milieu de jeu'
        ? 'Cherchez le bon moment pour lancer une attaque ou consolider vos points d’appui.'
        : 'Activez votre roi et créez un pion passé si l’opportunité se présente.';

  const reasonLabel = reason ? `analyse distante indisponible (${reason})` : 'analyse distante indisponible';
  const statusLabel = gameStatus && gameStatus !== 'active' ? `Statut : ${gameStatus}.\n` : '';
  const triggerLabel = trigger === 'manual' ? 'Demande manuelle' : trigger === 'auto' ? 'Mise à jour automatique' : 'Analyse initiale';

  return (
    `Analyse heuristique locale (${reasonLabel}).\n` +
    `Dernier coup observé : ${lastMove}.\n` +
    `Évaluation matérielle : ${advantageLabel} pour ${playerLabel}.\n` +
    `Phase estimée : ${turnPhase}. ${phaseMessage}\n` +
    `${statusLabel}` +
    `Plans suggérés : ${selectedPlans.join(' | ')}\n` +
    `${triggerLabel} — je reste disponible pour approfondir un point précis !`
  );
};
