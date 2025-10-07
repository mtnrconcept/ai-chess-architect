import { ChessPiece, Position, ChessMove, GameState, PieceType, PieceColor, ChessRule } from '@/types/chess';

type MoveGenerationPurpose = 'movement' | 'attack';

interface MoveGenerationOptions {
  includeCastling?: boolean;
  purpose?: MoveGenerationPurpose;
}

export class ChessEngine {
  // Initialize empty board
  static createEmptyBoard(): (ChessPiece | null)[][] {
    return Array(8).fill(null).map(() => Array(8).fill(null));
  }

  // Initialize standard chess starting position
  static initializeBoard(): (ChessPiece | null)[][] {
    const board = this.createEmptyBoard();
    
    // White pieces
    const whiteBackRow: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
    whiteBackRow.forEach((type, col) => {
      board[7][col] = { type, color: 'white', position: { row: 7, col }, hasMoved: false };
    });
    for (let col = 0; col < 8; col++) {
      board[6][col] = { type: 'pawn', color: 'white', position: { row: 6, col }, hasMoved: false };
    }

    // Black pieces
    const blackBackRow: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
    blackBackRow.forEach((type, col) => {
      board[0][col] = { type, color: 'black', position: { row: 0, col }, hasMoved: false };
    });
    for (let col = 0; col < 8; col++) {
      board[1][col] = { type: 'pawn', color: 'black', position: { row: 1, col }, hasMoved: false };
    }

    return board;
  }

  static applySecretSetup(board: (ChessPiece | null)[][]): (ChessPiece | null)[][] {
    const clonedBoard = board.map(row => row.map(piece => (piece ? { ...piece } : null)));

    const shuffle = <T,>(values: T[]): T[] => {
      const items = [...values];
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
      return items;
    };

    const rearrange = (rowIndex: number, color: PieceColor) => {
      const rowPieces = clonedBoard[rowIndex];
      const king = rowPieces.find(piece => piece && piece.type === 'king' && piece.color === color);
      if (!king) return;

      const kingCol = king.position.col;
      const majorPieces = rowPieces
        .map(piece => (piece && piece.color === color && piece.type !== 'king' ? piece : null))
        .filter((piece): piece is ChessPiece => Boolean(piece));

      const candidateColumns = rowPieces
        .map((_, col) => col)
        .filter(col => col !== kingCol);

      const shuffledColumns = shuffle(candidateColumns).slice(0, majorPieces.length);

      for (let col = 0; col < 8; col++) {
        const occupant = clonedBoard[rowIndex][col];
        if (occupant && occupant.color === color) {
          clonedBoard[rowIndex][col] = null;
        }
      }

      clonedBoard[rowIndex][kingCol] = {
        ...king,
        position: { row: rowIndex, col: kingCol },
        hasMoved: false
      };

      majorPieces.forEach((piece, index) => {
        const targetCol = shuffledColumns[index] ?? piece.position.col;
        clonedBoard[rowIndex][targetCol] = {
          ...piece,
          position: { row: rowIndex, col: targetCol },
          hasMoved: false
        };
      });
    };

    rearrange(7, 'white');
    rearrange(0, 'black');

    return clonedBoard;
  }

  static getBoardSignature(board: (ChessPiece | null)[][]): string {
    const pieces: string[] = [];
    board.forEach((row, rowIndex) => {
      row.forEach((piece, colIndex) => {
        if (!piece) return;
        pieces.push(`${piece.color}-${piece.type}-${rowIndex}-${colIndex}`);
      });
    });
    return pieces.sort().join('|');
  }

  static getAttackSquares(board: (ChessPiece | null)[][], piece: ChessPiece): Position[] {
    const { row, col } = piece.position;
    const inBounds = (pos: Position) => this.isValidPosition(pos);
    const opponentsOnly = (positions: Position[]) =>
      positions.filter(pos => {
        const target = this.getPieceAt(board, pos);
        return Boolean(target && target.color !== piece.color);
      });

    switch (piece.type) {
      case 'pawn': {
        const direction = piece.color === 'white' ? -1 : 1;
        const diagonals = [
          { row: row + direction, col: col - 1 },
          { row: row + direction, col: col + 1 }
        ].filter(inBounds);
        return opponentsOnly(diagonals);
      }
      case 'knight': {
        const offsets = [
          [-2, -1], [-2, 1],
          [-1, -2], [-1, 2],
          [1, -2], [1, 2],
          [2, -1], [2, 1]
        ];
        const potential = offsets
          .map(([dRow, dCol]) => ({ row: row + dRow, col: col + dCol }))
          .filter(inBounds);
        return opponentsOnly(potential);
      }
      case 'bishop':
        return opponentsOnly(this.getDirectionalMoves(board, piece, [[-1, -1], [-1, 1], [1, -1], [1, 1]]));
      case 'rook':
        return opponentsOnly(this.getDirectionalMoves(board, piece, [[-1, 0], [1, 0], [0, -1], [0, 1]]));
      case 'queen':
        return opponentsOnly(this.getDirectionalMoves(board, piece, [
          [-1, -1], [-1, 0], [-1, 1],
          [0, -1], [0, 1],
          [1, -1], [1, 0], [1, 1]
        ]));
      case 'king': {
        const offsets = [
          [-1, -1], [-1, 0], [-1, 1],
          [0, -1], [0, 1],
          [1, -1], [1, 0], [1, 1]
        ];
        const potential = offsets
          .map(([dRow, dCol]) => ({ row: row + dRow, col: col + dCol }))
          .filter(inBounds);
        return opponentsOnly(potential);
      }
      default:
        return [];
    }
  }

  // Check if position is valid
  static isValidPosition(pos: Position): boolean {
    return pos.row >= 0 && pos.row < 8 && pos.col >= 0 && pos.col < 8;
  }

  // Get piece at position
  static getPieceAt(board: (ChessPiece | null)[][], pos: Position): ChessPiece | null {
    if (!this.isValidPosition(pos)) return null;
    return board[pos.row][pos.col];
  }

  // Get valid moves for a piece (traditional rules with legality checks)
  static getValidMoves(
    board: (ChessPiece | null)[][],
    piece: ChessPiece,
    gameState: GameState
  ): Position[] {
    const pseudoLegalMoves = this.getPseudoLegalMoves(board, piece, gameState, {
      includeCastling: true,
      purpose: 'movement'
    });

    return pseudoLegalMoves.filter(move =>
      this.isMoveSafe(board, piece, move, gameState)
    );
  }

  private static getPseudoLegalMoves(
    board: (ChessPiece | null)[][],
    piece: ChessPiece,
    gameState: GameState,
    options: MoveGenerationOptions = {}
  ): Position[] {
    const baseMoves = this.getBaseMoves(board, piece, gameState, options);
    return this.applyRulesToMoves(baseMoves, piece, gameState, options);
  }

  private static getBaseMoves(
    board: (ChessPiece | null)[][],
    piece: ChessPiece,
    gameState: GameState,
    options: MoveGenerationOptions
  ): Position[] {
    switch (piece.type) {
      case 'pawn':
        return this.getPawnMoves(board, piece, gameState, options);
      case 'knight':
        return this.getKnightMoves(board, piece);
      case 'bishop':
        return this.getBishopMoves(board, piece);
      case 'rook':
        return this.getRookMoves(board, piece);
      case 'queen':
        return this.getQueenMoves(board, piece);
      case 'king':
        return this.getKingMoves(board, piece, gameState, options);
      default:
        return [];
    }
  }

  private static isMoveSafe(
    board: (ChessPiece | null)[][],
    piece: ChessPiece,
    destination: Position,
    gameState: GameState
  ): boolean {
    const move = this.createMove(board, piece, destination, gameState);
    const simulatedBoard = this.simulateMove(board, move);

    const simulatedState: GameState = {
      ...gameState,
      board: simulatedBoard,
      currentPlayer: piece.color,
      moveHistory: [...gameState.moveHistory, move],
      extraMoves: 0,
    };

    return !this.isInCheck(simulatedBoard, piece.color, simulatedState);
  }

  private static getPawnMoves(
    board: (ChessPiece | null)[][],
    piece: ChessPiece,
    gameState: GameState,
    options: MoveGenerationOptions = {}
  ): Position[] {
    const moves: Position[] = [];
    const { row, col } = piece.position;
    const direction = piece.color === 'white' ? -1 : 1;
    const purpose = options.purpose ?? 'movement';

    if (purpose !== 'attack') {
      const forward = { row: row + direction, col };
      if (this.isValidPosition(forward) && !this.getPieceAt(board, forward)) {
        moves.push(forward);

        if (!piece.hasMoved) {
          const doubleForward = { row: row + direction * 2, col };
          if (this.isValidPosition(doubleForward) && !this.getPieceAt(board, doubleForward)) {
            moves.push(doubleForward);
          }
        }
      }
    }

    const capturePositions = [
      { row: row + direction, col: col - 1 },
      { row: row + direction, col: col + 1 }
    ];

    const enPassantTarget = this.getEnPassantTarget(gameState, piece.color);

    capturePositions.forEach(pos => {
      if (!this.isValidPosition(pos)) return;

      const target = this.getPieceAt(board, pos);
      if (target && target.color !== piece.color) {
        moves.push(pos);
        return;
      }

      if (enPassantTarget && enPassantTarget.row === pos.row && enPassantTarget.col === pos.col) {
        moves.push(pos);
        return;
      }

      if (purpose === 'attack') {
        moves.push(pos);
      }
    });

    return this.ensureUniquePositions(moves);
  }

  private static getEnPassantTarget(gameState: GameState, color: PieceColor): Position | null {
    if (gameState.moveHistory.length === 0) {
      return null;
    }

    const lastMove = gameState.moveHistory[gameState.moveHistory.length - 1];

    if (lastMove.piece.type !== 'pawn') return null;
    if (lastMove.piece.color === color) return null;

    const movedTwoSquares = Math.abs(lastMove.from.row - lastMove.to.row) === 2;
    if (!movedTwoSquares) return null;

    return {
      row: (lastMove.from.row + lastMove.to.row) / 2,
      col: lastMove.to.col
    };
  }

  private static getKnightMoves(board: (ChessPiece | null)[][], piece: ChessPiece): Position[] {
    const moves: Position[] = [];
    const { row, col } = piece.position;
    const offsets = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1]
    ];

    offsets.forEach(([dRow, dCol]) => {
      const pos = { row: row + dRow, col: col + dCol };
      if (this.isValidPosition(pos)) {
        const target = this.getPieceAt(board, pos);
        if (!target || target.color !== piece.color) {
          moves.push(pos);
        }
      }
    });

    return moves;
  }

  private static getBishopMoves(board: (ChessPiece | null)[][], piece: ChessPiece): Position[] {
    return this.getDirectionalMoves(board, piece, [
      [-1, -1], [-1, 1], [1, -1], [1, 1]
    ]);
  }

  private static getRookMoves(board: (ChessPiece | null)[][], piece: ChessPiece): Position[] {
    return this.getDirectionalMoves(board, piece, [
      [-1, 0], [1, 0], [0, -1], [0, 1]
    ]);
  }

  private static getQueenMoves(board: (ChessPiece | null)[][], piece: ChessPiece): Position[] {
    return this.getDirectionalMoves(board, piece, [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1], [0, 1],
      [1, -1], [1, 0], [1, 1]
    ]);
  }

  private static getKingMoves(
    board: (ChessPiece | null)[][],
    piece: ChessPiece,
    gameState: GameState,
    options: MoveGenerationOptions = {}
  ): Position[] {
    const moves: Position[] = [];
    const { row, col } = piece.position;
    const offsets = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1], [0, 1],
      [1, -1], [1, 0], [1, 1]
    ];

    offsets.forEach(([dRow, dCol]) => {
      const pos = { row: row + dRow, col: col + dCol };
      if (!this.isValidPosition(pos)) return;

      const target = this.getPieceAt(board, pos);
      if (!target || target.color !== piece.color) {
        moves.push(pos);
      }
    });

    const purpose = options.purpose ?? 'movement';
    const includeCastling = options.includeCastling !== false && purpose !== 'attack';

    if (includeCastling && !piece.hasMoved) {
      const opponentColor: PieceColor = piece.color === 'white' ? 'black' : 'white';
      const isSquareSafe = (position: Position) =>
        !this.isSquareAttacked(board, position, opponentColor, gameState, {
          includeCastling: false,
          purpose: 'attack'
        });

      const rookPositions: { side: 'king' | 'queen'; rookCol: number; path: number[] }[] = [
        { side: 'king', rookCol: 7, path: [col + 1, col + 2] },
        { side: 'queen', rookCol: 0, path: [col - 1, col - 2, col - 3] }
      ];

      if (isSquareSafe(piece.position)) {
        rookPositions.forEach(({ side, rookCol, path }) => {
          const rook = this.getPieceAt(board, { row, col: rookCol });
          if (!rook || rook.type !== 'rook' || rook.color !== piece.color || rook.hasMoved) {
            return;
          }

          const squaresEmpty = path.every(targetCol =>
            !this.getPieceAt(board, { row, col: targetCol })
          );

          if (!squaresEmpty) return;

          const kingPath = side === 'king' ? path : path.slice(0, 2);
          const squaresSafe = kingPath.every(targetCol =>
            isSquareSafe({ row, col: targetCol })
          );

          if (!squaresSafe) return;

          moves.push({ row, col: side === 'king' ? col + 2 : col - 2 });
        });
      }
    }

    return this.ensureUniquePositions(moves);
  }

  private static getDirectionalMoves(
    board: (ChessPiece | null)[][],
    piece: ChessPiece,
    directions: number[][]
  ): Position[] {
    const moves: Position[] = [];
    const { row, col } = piece.position;

    directions.forEach(([dRow, dCol]) => {
      let currentRow = row + dRow;
      let currentCol = col + dCol;

      while (this.isValidPosition({ row: currentRow, col: currentCol })) {
        const target = this.getPieceAt(board, { row: currentRow, col: currentCol });
        
        if (!target) {
          moves.push({ row: currentRow, col: currentCol });
        } else {
          if (target.color !== piece.color) {
            moves.push({ row: currentRow, col: currentCol });
          }
          break;
        }

        currentRow += dRow;
        currentCol += dCol;
      }
    });

    return moves;
  }

  // Apply custom rules to modify valid moves
  private static applyRulesToMoves(
    moves: Position[],
    piece: ChessPiece,
    gameState: GameState,
    options: MoveGenerationOptions = {}
  ): Position[] {
    let modifiedMoves = [...moves];
    const { board } = gameState;

    gameState.activeRules.forEach(rule => {
      if (this.ruleApplies(rule, piece, gameState)) {
        modifiedMoves = this.applyRuleEffects(modifiedMoves, rule, piece, gameState, board, options);
      }
    });

    return this.ensureUniquePositions(modifiedMoves);
  }

  // Check if a rule applies to current context
  private static ruleApplies(rule: ChessRule, piece: ChessPiece, gameState: GameState): boolean {
    if (!rule.isActive) return false;
    
    // Check if piece is affected
    if (rule.affectedPieces.length > 0 && 
        !rule.affectedPieces.includes(piece.type) && 
        !rule.affectedPieces.includes('all')) {
      return false;
    }

    // Check conditions
    return rule.conditions.every(condition => {
      const contextValue = this.getConditionValue(condition.type, piece, gameState);
      return this.evaluateCondition(contextValue, condition.operator, condition.value);
    });
  }

  static getExtraMovesForPiece(piece: ChessPiece, gameState: GameState): number {
    let extraMoves = 0;

    gameState.activeRules.forEach(rule => {
      if (!this.ruleApplies(rule, piece, gameState)) return;

      rule.effects.forEach(effect => {
        if (effect.action === 'allowExtraMove') {
          const count = typeof effect.parameters.count === 'number'
            ? effect.parameters.count
            : Number(effect.parameters.count ?? 1);

          extraMoves += Number.isFinite(count) ? count : 1;
        }
      });
    });

    return extraMoves;
  }

  private static getConditionValue(type: string, piece: ChessPiece, gameState: GameState): any {
    switch (type) {
      case 'pieceType': return piece.type;
      case 'pieceColor': return piece.color;
      case 'turnNumber': return gameState.turnNumber;
      case 'movesThisTurn': return gameState.movesThisTurn;
      case 'hasMoved': return Boolean(piece.hasMoved);
      case 'phase':
        return gameState.moveHistory.length === 0 ? 'setup' : 'play';
      case 'repetitionCount': {
        const signature = this.getBoardSignature(gameState.board);
        return gameState.positionHistory?.[signature] ?? 1;
      }
      case 'piecesOnBoard':
        return gameState.board.flat().filter(p => p && p.color === piece.color).length;
      default: return null;
    }
  }

  private static evaluateCondition(value: any, operator: string, target: any): boolean {
    switch (operator) {
      case 'equals': return value === target;
      case 'notEquals': return value !== target;
      case 'greaterThan': return value > target;
      case 'lessThan': return value < target;
      case 'greaterOrEqual': return value >= target;
      case 'lessOrEqual': return value <= target;
      case 'contains': return value?.includes(target);
      case 'in': return target?.includes(value);
      default: return false;
    }
  }

  private static applyRuleEffects(
    moves: Position[],
    rule: ChessRule,
    piece: ChessPiece,
    gameState: GameState,
    board: (ChessPiece | null)[][],
    options: MoveGenerationOptions
  ): Position[] {
    const frozen = gameState.freezeEffects?.some(effect =>
      effect.color === piece.color &&
      effect.position.row === piece.position.row &&
      effect.position.col === piece.position.col &&
      effect.remainingTurns > 0
    );

    if (frozen) {
      return [];
    }

    let modifiedMoves = [...moves];

    rule.effects.forEach(effect => {
      const params = effect.parameters;

      switch (effect.action) {
        case 'modifyMovement':
          // Range extension
          if (params.range) {
            modifiedMoves = this.extendMovesByRange(
              board,
              piece,
              params.range,
              params.direction,
              modifiedMoves
            );
          }
          // Bonus range to all moves
          if (params.bonusRange) {
            modifiedMoves = this.addBonusRange(board, piece, modifiedMoves, params.bonusRange);
          }
          // Double move for pawns
          if (params.doubleMove && piece.type === 'pawn') {
            modifiedMoves = this.addPawnDoubleMove(board, piece, modifiedMoves);
          }
          break;
        
        case 'addAbility':
          // Jump ability for rooks
          if (params.ability === 'jump') {
            modifiedMoves = this.addJumpMoves(board, piece, modifiedMoves);
          }
          // Teleport for queen
          if (params.ability === 'teleport' && params.frequency) {
            if (gameState.turnNumber % params.frequency === 0) {
              modifiedMoves = this.addTeleportMoves(board, piece, modifiedMoves);
            }
          }
          // Straight move for knight
          if (params.ability === 'straightMove') {
            modifiedMoves = [...modifiedMoves, ...this.getStraightMoves(board, piece, params.range || 3)];
          }
          // Diagonal move for rook
          if (params.ability === 'diagonalMove') {
            modifiedMoves = [...modifiedMoves, ...this.getDiagonalMoves(board, piece, params.range || 2)];
          }
          // Lateral move for pawn
          if (params.ability === 'lateralMove') {
            modifiedMoves = [...modifiedMoves, ...this.getLateralMoves(board, piece)];
          }
          // Forward capture for pawn
          if (params.ability === 'forwardCapture') {
            modifiedMoves = [...modifiedMoves, ...this.getForwardCaptures(board, piece)];
          }
          // Lateral capture for pawn
          if (params.ability === 'lateralCapture') {
            modifiedMoves = [...modifiedMoves, ...this.getLateralCaptures(board, piece)];
          }
          // Backward move for pawn
          if (params.ability === 'backward') {
            modifiedMoves = [...modifiedMoves, ...this.getBackwardMoves(board, piece)];
          }
          break;

        case 'allowExtraMove':
          // Handled at game state level
          break;

        case 'enableBurstAdvance':
          if (piece.type === 'pawn' && !piece.hasMoved) {
            const squares = typeof params.squares === 'number' ? params.squares : 3;
            const direction = piece.color === 'white' ? -1 : 1;
            const target: Position = {
              row: piece.position.row + direction * squares,
              col: piece.position.col
            };

            const pathClear = () => {
              for (let step = 1; step < squares; step++) {
                const intermediate = {
                  row: piece.position.row + direction * step,
                  col: piece.position.col
                };
                if (!this.isValidPosition(intermediate)) return false;
                if (this.getPieceAt(board, intermediate)) return false;
              }
              return this.isValidPosition(target) && !this.getPieceAt(board, target);
            };

            if (pathClear()) {
              modifiedMoves.push(target);
            }

            if (params.disableDiagonalCapture) {
              modifiedMoves = modifiedMoves.filter(pos => pos.col === piece.position.col);
            }
          }
          break;

        case 'grantSpecialMove':
          if (piece.type === 'king' && (!piece.hasMoved || params.usage === 1)) {
            if (params.pattern === 'knight') {
              const knightMoves = this.getKnightMoves(board, { ...piece, type: 'knight' });
              modifiedMoves.push(...knightMoves);
            }
          }
          break;

        case 'restrictMovement':
          if (params.maxMoves) {
            modifiedMoves = modifiedMoves.slice(0, params.maxMoves);
          }
          break;

        case 'allowCapture':
          // Extended capture range for pawns
          if (params.captureRange && piece.type === 'pawn') {
            modifiedMoves = [...modifiedMoves, ...this.getExtendedCaptures(board, piece, params.captureRange)];
          }
          break;

        case 'preventCapture':
          // Filter out capture moves based on immunity conditions
          if (params.immunity) {
            // Piece is immune to capture - handled elsewhere
          }
          break;
      }
    });

    return modifiedMoves;
  }

  private static extendMovesByRange(
    board: (ChessPiece | null)[][],
    piece: ChessPiece,
    range: number,
    direction: string | undefined,
    existingMoves: Position[]
  ): Position[] {
    const moves: Position[] = [...existingMoves];
    const vectors = this.resolveDirections(piece, direction);
    const { row, col } = piece.position;

    vectors.forEach(([dRow, dCol]) => {
      for (let step = 1; step <= range; step++) {
        const pos = { row: row + dRow * step, col: col + dCol * step };
        if (!this.isValidPosition(pos)) break;

        const target = this.getPieceAt(board, pos);
        if (!target) {
          moves.push(pos);
        } else {
          if (target.color !== piece.color) {
            moves.push(pos);
          }
          break;
        }
      }
    });

    return this.ensureUniquePositions(moves);
  }

  private static addBonusRange(
    board: (ChessPiece | null)[][],
    piece: ChessPiece,
    existingMoves: Position[],
    bonus: number
  ): Position[] {
    const moves = [...existingMoves];
    const { row, col } = piece.position;

    // Add one extra square in each direction
    const directions = this.getPieceDirections(piece);
    
    directions.forEach(([dRow, dCol]) => {
      const maxDist = existingMoves.reduce((max, move) => {
        const dist = Math.abs(move.row - row) + Math.abs(move.col - col);
        return Math.max(max, dist);
      }, 0);

      for (let i = maxDist + 1; i <= maxDist + bonus; i++) {
        const pos = { row: row + dRow * i, col: col + dCol * i };
        if (this.isValidPosition(pos)) {
          const target = this.getPieceAt(board, pos);
          if (!target || target.color !== piece.color) {
            moves.push(pos);
          }
          if (target) break;
        }
      }
    });

    return this.ensureUniquePositions(moves);
  }

  private static getPieceDirections(piece: ChessPiece): number[][] {
    switch (piece.type) {
      case 'rook':
        return [[-1, 0], [1, 0], [0, -1], [0, 1]];
      case 'bishop':
        return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
      case 'queen':
        return [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
      case 'king':
        return [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
      default:
        return [];
    }
  }

  private static resolveDirections(piece: ChessPiece, direction?: string): number[][] {
    if (direction) {
      switch (direction) {
        case 'diagonal':
          return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
        case 'straight':
        case 'orthogonal':
          return [[-1, 0], [1, 0], [0, -1], [0, 1]];
        case 'horizontal':
          return [[0, -1], [0, 1]];
        case 'vertical':
          return [[-1, 0], [1, 0]];
        case 'all':
          return [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1], [0, 1],
            [1, -1], [1, 0], [1, 1]
          ];
        default:
          break;
      }
    }

    const defaultDirections = this.getPieceDirections(piece);
    if (defaultDirections.length > 0) {
      return defaultDirections;
    }

    if (piece.type === 'pawn') {
      const forward = piece.color === 'white' ? -1 : 1;
      return [[forward, 0]];
    }

    return [];
  }

  private static ensureUniquePositions(positions: Position[]): Position[] {
    const seen = new Set<string>();
    const unique: Position[] = [];

    positions.forEach(pos => {
      const key = `${pos.row}-${pos.col}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(pos);
      }
    });

    return unique;
  }

  private static addPawnDoubleMove(
    board: (ChessPiece | null)[][],
    piece: ChessPiece,
    existingMoves: Position[]
  ): Position[] {
    const moves = [...existingMoves];
    const { row, col } = piece.position;
    const direction = piece.color === 'white' ? -1 : 1;

    // Allow double move even after first move
    const singleForward = { row: row + direction, col };
    const doubleForward = { row: row + direction * 2, col };
    
    if (this.isValidPosition(singleForward) && !this.getPieceAt(board, singleForward) &&
        this.isValidPosition(doubleForward) && !this.getPieceAt(board, doubleForward)) {
      if (!moves.some(m => m.row === doubleForward.row && m.col === doubleForward.col)) {
        moves.push(doubleForward);
      }
    }

    return moves;
  }

  private static addJumpMoves(
    board: (ChessPiece | null)[][],
    piece: ChessPiece,
    existingMoves: Position[]
  ): Position[] {
    // For rooks, allow jumping over one allied piece
    const moves = [...existingMoves];
    const { row, col } = piece.position;
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    directions.forEach(([dRow, dCol]) => {
      let jumped = false;
      for (let i = 1; i < 8; i++) {
        const pos = { row: row + dRow * i, col: col + dCol * i };
        if (!this.isValidPosition(pos)) break;

        const target = this.getPieceAt(board, pos);
        if (target) {
          if (target.color === piece.color && !jumped) {
            jumped = true;
            continue;
          }
          if (target.color !== piece.color && jumped) {
            moves.push(pos);
          }
          break;
        }
        if (jumped) {
          moves.push(pos);
        }
      }
    });

    return this.ensureUniquePositions(moves);
  }

  private static addTeleportMoves(
    board: (ChessPiece | null)[][],
    piece: ChessPiece,
    existingMoves: Position[]
  ): Position[] {
    // Queen can teleport anywhere on board except onto kings
    const moves: Position[] = [...existingMoves];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (row !== piece.position.row || col !== piece.position.col) {
          const target = this.getPieceAt(board, { row, col });
          if (target?.type === 'king') {
            continue;
          }
          if (!target || target.color !== piece.color) {
            moves.push({ row, col });
          }
        }
      }
    }
    return this.ensureUniquePositions(moves);
  }

  private static getStraightMoves(
    board: (ChessPiece | null)[][],
    piece: ChessPiece,
    range: number
  ): Position[] {
    const moves: Position[] = [];
    const { row, col } = piece.position;
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    directions.forEach(([dRow, dCol]) => {
      for (let i = 1; i <= range; i++) {
        const pos = { row: row + dRow * i, col: col + dCol * i };
        if (this.isValidPosition(pos)) {
          const target = this.getPieceAt(board, pos);
          if (!target || target.color !== piece.color) {
            moves.push(pos);
          }
          if (target) break;
        }
      }
    });

    return this.ensureUniquePositions(moves);
  }

  private static getDiagonalMoves(
    board: (ChessPiece | null)[][],
    piece: ChessPiece,
    range: number
  ): Position[] {
    const moves: Position[] = [];
    const { row, col } = piece.position;
    const directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

    directions.forEach(([dRow, dCol]) => {
      for (let i = 1; i <= range; i++) {
        const pos = { row: row + dRow * i, col: col + dCol * i };
        if (this.isValidPosition(pos)) {
          const target = this.getPieceAt(board, pos);
          if (!target || target.color !== piece.color) {
            moves.push(pos);
          }
          if (target) break;
        }
      }
    });

    return this.ensureUniquePositions(moves);
  }

  private static getLateralMoves(
    board: (ChessPiece | null)[][],
    piece: ChessPiece
  ): Position[] {
    const moves: Position[] = [];
    const { row, col } = piece.position;
    
    // Lateral (horizontal) moves for pawns
    const lateralPositions = [
      { row, col: col - 1 },
      { row, col: col + 1 }
    ];

    lateralPositions.forEach(pos => {
      if (this.isValidPosition(pos)) {
        const target = this.getPieceAt(board, pos);
        if (!target) {
          moves.push(pos);
        }
      }
    });

    return this.ensureUniquePositions(moves);
  }

  private static getBackwardMoves(
    board: (ChessPiece | null)[][],
    piece: ChessPiece
  ): Position[] {
    if (piece.type !== 'pawn') return [];

    const moves: Position[] = [];
    const { row, col } = piece.position;
    const direction = piece.color === 'white' ? 1 : -1;
    const backward = { row: row + direction, col };

    if (this.isValidPosition(backward) && !this.getPieceAt(board, backward)) {
      moves.push(backward);
    }

    return this.ensureUniquePositions(moves);
  }

  private static getExtendedCaptures(
    board: (ChessPiece | null)[][],
    piece: ChessPiece,
    range: number
  ): Position[] {
    const moves: Position[] = [];
    const { row, col } = piece.position;
    const direction = piece.color === 'white' ? -1 : 1;

    // Extended diagonal captures for pawns
    for (let i = 1; i <= range; i++) {
      const capturePositions = [
        { row: row + direction * i, col: col - i },
        { row: row + direction * i, col: col + i }
      ];

      capturePositions.forEach(pos => {
        if (this.isValidPosition(pos)) {
          const target = this.getPieceAt(board, pos);
          if (target && target.color !== piece.color) {
            moves.push(pos);
          }
        }
      });
    }

    return this.ensureUniquePositions(moves);
  }

  // Add forward capture ability for pawns
  private static getForwardCaptures(
    board: (ChessPiece | null)[][],
    piece: ChessPiece
  ): Position[] {
    const moves: Position[] = [];
    const { row, col } = piece.position;
    const direction = piece.color === 'white' ? -1 : 1;

    const forwardPos = { row: row + direction, col };
    if (this.isValidPosition(forwardPos)) {
      const target = this.getPieceAt(board, forwardPos);
      if (target && target.color !== piece.color) {
        moves.push(forwardPos);
      }
    }

    return this.ensureUniquePositions(moves);
  }

  // Add lateral capture ability for pawns
  private static getLateralCaptures(
    board: (ChessPiece | null)[][],
    piece: ChessPiece
  ): Position[] {
    const moves: Position[] = [];
    const { row, col } = piece.position;

    const lateralPositions = [
      { row, col: col - 1 },
      { row, col: col + 1 }
    ];

    lateralPositions.forEach(pos => {
      if (this.isValidPosition(pos)) {
        const target = this.getPieceAt(board, pos);
        if (target && target.color !== piece.color) {
          moves.push(pos);
        }
      }
    });

    return this.ensureUniquePositions(moves);
  }


  // Check if a move is legal
  static createMove(
    board: (ChessPiece | null)[][],
    piece: ChessPiece,
    destination: Position,
    gameState: GameState
  ): ChessMove {
    const movePiece: ChessPiece = { ...piece };
    const move: ChessMove = {
      from: piece.position,
      to: destination,
      piece: movePiece
    };

    const target = this.getPieceAt(board, destination);
    if (target && target.color !== piece.color) {
      move.captured = target;
    }

    if (piece.type === 'pawn') {
      const enPassantTarget = this.getEnPassantTarget(gameState, piece.color);
      const isDiagonalMove = destination.col !== piece.position.col;

      if (!target && isDiagonalMove && enPassantTarget &&
          enPassantTarget.row === destination.row && enPassantTarget.col === destination.col) {
        move.isEnPassant = true;
        const capturedPiece = this.getPieceAt(board, { row: piece.position.row, col: destination.col });
        if (capturedPiece) {
          move.captured = capturedPiece;
        }
      }

      if (destination.row === 0 || destination.row === 7) {
        move.promotion = 'queen';
      }
    }

    if (piece.type === 'king' && Math.abs(destination.col - piece.position.col) === 2) {
      move.isCastling = true;
      const rookCol = destination.col > piece.position.col ? 7 : 0;
      const rookTargetCol = destination.col > piece.position.col
        ? destination.col - 1
        : destination.col + 1;
      move.rookFrom = { row: piece.position.row, col: rookCol };
      move.rookTo = { row: piece.position.row, col: rookTargetCol };
    }

    return move;
  }

  private static simulateMove(
    board: (ChessPiece | null)[][],
    move: ChessMove
  ): (ChessPiece | null)[][] {
    const newBoard = board.map(row =>
      row.map(piece => (piece ? { ...piece } : null))
    );

    newBoard[move.from.row][move.from.col] = null;

    if (move.isEnPassant) {
      const capturedRow = move.piece.color === 'white'
        ? move.to.row + 1
        : move.to.row - 1;
      newBoard[capturedRow][move.to.col] = null;
    }

    if (move.isCastling && move.rookFrom && move.rookTo) {
      const rook = this.getPieceAt(board, move.rookFrom);
      if (rook) {
        newBoard[move.rookFrom.row][move.rookFrom.col] = null;
        newBoard[move.rookTo.row][move.rookTo.col] = {
          ...rook,
          position: move.rookTo,
          hasMoved: true
        };
      }
    }

    const movedPiece: ChessPiece = {
      ...move.piece,
      position: move.to,
      hasMoved: true,
      type: move.promotion ?? move.piece.type
    };

    newBoard[move.to.row][move.to.col] = movedPiece;

    return newBoard;
  }

  static isLegalMove(
    board: (ChessPiece | null)[][],
    move: ChessMove,
    gameState: GameState
  ): boolean {
    const validMoves = this.getValidMoves(board, move.piece, gameState);
    return validMoves.some(pos => pos.row === move.to.row && pos.col === move.to.col);
  }

  // Execute a move
  static executeMove(
    board: (ChessPiece | null)[][],
    move: ChessMove,
    gameState: GameState
  ): (ChessPiece | null)[][] {
    const preparedMove = this.createMove(board, move.piece, move.to, gameState);

    const finalMove: ChessMove = {
      ...preparedMove,
      ...move,
      piece: { ...preparedMove.piece }
    };

    if (move.piece) {
      finalMove.piece = { ...finalMove.piece, ...move.piece };
    }

    finalMove.captured = move.captured ?? preparedMove.captured;
    finalMove.isEnPassant = move.isEnPassant ?? preparedMove.isEnPassant;
    finalMove.isCastling = move.isCastling ?? preparedMove.isCastling;
    finalMove.rookFrom = move.rookFrom ?? preparedMove.rookFrom;
    finalMove.rookTo = move.rookTo ?? preparedMove.rookTo;
    finalMove.promotion = move.promotion ?? preparedMove.promotion;

    const newBoard = this.simulateMove(board, finalMove);

    finalMove.piece = {
      ...finalMove.piece,
      position: finalMove.to,
      hasMoved: true,
      type: finalMove.promotion ?? finalMove.piece.type
    };

    Object.assign(move, finalMove);

    return newBoard;
  }

  private static isSquareAttacked(
    board: (ChessPiece | null)[][],
    position: Position,
    byColor: PieceColor,
    gameState: GameState,
    options: MoveGenerationOptions = {}
  ): boolean {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col];
        if (!piece || piece.color !== byColor) continue;

        const attackState: GameState = {
          ...gameState,
          board,
          currentPlayer: byColor,
          movesThisTurn: 0,
          extraMoves: 0,
        };

        const moves = this.getPseudoLegalMoves(board, piece, attackState, {
          includeCastling: options.includeCastling ?? false,
          purpose: options.purpose ?? 'attack'
        });

        if (moves.some(move => move.row === position.row && move.col === position.col)) {
          return true;
        }
      }
    }

    return false;
  }

  // Check if king is in check
  static isInCheck(
    board: (ChessPiece | null)[][],
    color: PieceColor,
    gameState: GameState
  ): boolean {
    // Find king
    let kingPos: Position | null = null;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col];
        if (piece && piece.type === 'king' && piece.color === color) {
          kingPos = { row, col };
          break;
        }
      }
      if (kingPos) break;
    }

    if (!kingPos) return false;

    const opponentColor: PieceColor = color === 'white' ? 'black' : 'white';

    return this.isSquareAttacked(
      board,
      kingPos,
      opponentColor,
      gameState,
      { includeCastling: false, purpose: 'attack' }
    );
  }

  static hasAnyLegalMoves(
    board: (ChessPiece | null)[][],
    color: PieceColor,
    gameState: GameState
  ): boolean {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col];
        if (!piece || piece.color !== color) continue;

        const stateForPiece: GameState = {
          ...gameState,
          board,
          currentPlayer: color,
          selectedPiece: piece,
        };

        const moves = this.getValidMoves(board, piece, stateForPiece);
        if (moves.length > 0) {
          return true;
        }
      }
    }

    return false;
  }
}
