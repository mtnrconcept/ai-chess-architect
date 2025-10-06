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

    // Apply each active rule
    gameState.activeRules.forEach(rule => {
      if (this.ruleApplies(rule, piece, gameState)) {
        modifiedMoves = this.applyRuleEffects(modifiedMoves, rule, piece, gameState);
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
    gameState: GameState
  ): Position[] {
    let modifiedMoves = [...moves];

    rule.effects.forEach(effect => {
      switch (effect.action) {
        case 'modifyMovement':
          // Extend move range if specified
          if (effect.parameters.bonusRange) {
            modifiedMoves = this.extendMoveRange(modifiedMoves, piece, effect.parameters.bonusRange);
          }
          break;
        
        case 'allowExtraMove':
          // This would be handled at game state level
          break;

        case 'restrictMovement':
          // Reduce available moves
          if (effect.parameters.maxMoves) {
            modifiedMoves = modifiedMoves.slice(0, effect.parameters.maxMoves);
          }
          break;
      }
    });

    return modifiedMoves;
  }

  private static extendMoveRange(moves: Position[], piece: ChessPiece, bonus: number): Position[] {
    // This is a simplified implementation
    // In a real implementation, you would calculate extended moves based on piece type
    return moves;
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
