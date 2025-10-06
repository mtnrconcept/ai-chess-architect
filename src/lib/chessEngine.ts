import { ChessPiece, Position, ChessMove, GameState, PieceType, PieceColor, ChessRule } from '@/types/chess';

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

  // Check if position is valid
  static isValidPosition(pos: Position): boolean {
    return pos.row >= 0 && pos.row < 8 && pos.col >= 0 && pos.col < 8;
  }

  // Get piece at position
  static getPieceAt(board: (ChessPiece | null)[][], pos: Position): ChessPiece | null {
    if (!this.isValidPosition(pos)) return null;
    return board[pos.row][pos.col];
  }

  // Get valid moves for a piece (traditional rules)
  static getValidMoves(
    board: (ChessPiece | null)[][],
    piece: ChessPiece,
    gameState: GameState
  ): Position[] {
    const moves: Position[] = [];
    const { row, col } = piece.position;

    switch (piece.type) {
      case 'pawn':
        moves.push(...this.getPawnMoves(board, piece));
        break;
      case 'knight':
        moves.push(...this.getKnightMoves(board, piece));
        break;
      case 'bishop':
        moves.push(...this.getBishopMoves(board, piece));
        break;
      case 'rook':
        moves.push(...this.getRookMoves(board, piece));
        break;
      case 'queen':
        moves.push(...this.getQueenMoves(board, piece));
        break;
      case 'king':
        moves.push(...this.getKingMoves(board, piece));
        break;
    }

    // Apply custom rules modifications
    const modifiedMoves = this.applyRulesToMoves(moves, piece, gameState);

    return modifiedMoves;
  }

  private static getPawnMoves(board: (ChessPiece | null)[][], piece: ChessPiece): Position[] {
    const moves: Position[] = [];
    const { row, col } = piece.position;
    const direction = piece.color === 'white' ? -1 : 1;

    // Forward move
    const forward = { row: row + direction, col };
    if (this.isValidPosition(forward) && !this.getPieceAt(board, forward)) {
      moves.push(forward);

      // Double move from starting position
      if (!piece.hasMoved) {
        const doubleForward = { row: row + direction * 2, col };
        if (!this.getPieceAt(board, doubleForward)) {
          moves.push(doubleForward);
        }
      }
    }

    // Diagonal captures
    const capturePositions = [
      { row: row + direction, col: col - 1 },
      { row: row + direction, col: col + 1 }
    ];

    capturePositions.forEach(pos => {
      if (this.isValidPosition(pos)) {
        const target = this.getPieceAt(board, pos);
        if (target && target.color !== piece.color) {
          moves.push(pos);
        }
      }
    });

    return moves;
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

  private static getKingMoves(board: (ChessPiece | null)[][], piece: ChessPiece): Position[] {
    const moves: Position[] = [];
    const { row, col } = piece.position;
    const offsets = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1], [0, 1],
      [1, -1], [1, 0], [1, 1]
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
    gameState: GameState
  ): Position[] {
    let modifiedMoves = [...moves];
    const { board } = gameState;

    // Apply each active rule
    gameState.activeRules.forEach(rule => {
      if (this.ruleApplies(rule, piece, gameState)) {
        modifiedMoves = this.applyRuleEffects(modifiedMoves, rule, piece, gameState, board);
      }
    });

    return modifiedMoves;
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

  private static getConditionValue(type: string, piece: ChessPiece, gameState: GameState): any {
    switch (type) {
      case 'pieceType': return piece.type;
      case 'pieceColor': return piece.color;
      case 'turnNumber': return gameState.turnNumber;
      case 'movesThisTurn': return gameState.movesThisTurn;
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
    board: (ChessPiece | null)[][]
  ): Position[] {
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
          break;

        case 'allowExtraMove':
          // Handled at game state level
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
    // Queen can teleport anywhere on board
    const moves: Position[] = [...existingMoves];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (row !== piece.position.row || col !== piece.position.col) {
          const target = this.getPieceAt(board, { row, col });
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
    const newBoard = board.map(row => [...row]);
    
    // Remove piece from old position
    newBoard[move.from.row][move.from.col] = null;
    
    // Place piece at new position
    const movedPiece = { ...move.piece, position: move.to, hasMoved: true };
    newBoard[move.to.row][move.to.col] = movedPiece;

    return newBoard;
  }

  // Check if king is in check
  static isInCheck(board: (ChessPiece | null)[][], color: PieceColor): boolean {
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

    // Check if any enemy piece can attack the king
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col];
        if (piece && piece.color !== color) {
          const gameState: GameState = {
            board,
            currentPlayer: color === 'white' ? 'black' : 'white',
            turnNumber: 1,
            movesThisTurn: 0,
            selectedPiece: null,
            validMoves: [],
            gameStatus: 'active',
            capturedPieces: [],
            moveHistory: [],
            activeRules: []
          };
          
          const moves = this.getValidMoves(board, piece, gameState);
          if (moves.some(pos => pos.row === kingPos!.row && pos.col === kingPos!.col)) {
            return true;
          }
        }
      }
    }

    return false;
  }
}
