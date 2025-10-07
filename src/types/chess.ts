export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
export type PieceColor = 'white' | 'black';

export interface Position {
  row: number;
  col: number;
}

export interface ChessPiece {
  type: PieceType;
  color: PieceColor;
  position: Position;
  hasMoved?: boolean;
}

export interface ChessMove {
  from: Position;
  to: Position;
  piece: ChessPiece;
  captured?: ChessPiece;
  isEnPassant?: boolean;
  isCastling?: boolean;
  rookFrom?: Position;
  rookTo?: Position;
  promotion?: PieceType;
}

export interface RuleCondition {
  type: string;
  value: any;
  operator: 'equals' | 'notEquals' | 'greaterThan' | 'lessThan' | 'greaterOrEqual' | 'lessOrEqual' | 'contains' | 'in';
}

export interface RuleEffect {
  action: string;
  target: 'self' | 'opponent' | 'all' | 'specific';
  parameters: {
    count?: number;
    property?: string;
    value?: any;
    duration?: 'permanent' | 'temporary' | 'turns';
    range?: number;
    [key: string]: any;
  };
}

export interface ChessRule {
  id?: string;
  ruleId: string;
  ruleName: string;
  description: string;
  category: 'movement' | 'capture' | 'special' | 'condition' | 'victory' | 'restriction' | 'defense' | 'behavior' | 'vip';
  affectedPieces: string[];
  trigger: 'always' | 'onMove' | 'onCapture' | 'onCheck' | 'onCheckmate' | 'turnBased' | 'conditional';
  conditions: RuleCondition[];
  effects: RuleEffect[];
  tags: string[];
  priority: number;
  isActive: boolean;
  validationRules: {
    allowedWith: string[];
    conflictsWith: string[];
    requiredState: any;
  };
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GameState {
  board: (ChessPiece | null)[][];
  currentPlayer: PieceColor;
  turnNumber: number;
  movesThisTurn: number;
  selectedPiece: ChessPiece | null;
  validMoves: Position[];
  gameStatus: 'active' | 'check' | 'checkmate' | 'stalemate' | 'draw';
  capturedPieces: ChessPiece[];
  moveHistory: ChessMove[];
  activeRules: ChessRule[];
  extraMoves: number;
  modifiedMovement?: any;
  abilities?: any[];
  restrictions?: any[];
  events?: string[];
}
