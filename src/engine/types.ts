export type Side = "white" | "black";
export type Tile = string;

export type PieceID = string;

export type Phase = "main" | "pre" | "post";

export type SpriteId = string;
export type AudioId = string;

export interface Piece {
  id: PieceID;
  type: string;
  side: Side;
  tile: Tile;
  invisible?: boolean;
  statuses?: Record<string, any>;
}

export interface MatchInfo {
  ply: number;
  turnSide: Side;
}

export interface BoardAPI {
  tiles(): Tile[];
  isEmpty(tile: Tile): boolean;
  getPieceAt(tile: Tile): PieceID | null;
  getPiece(id: PieceID): Piece;
  setPieceTile(id: PieceID, tile: Tile): void;
  removePiece(id: PieceID): void;
  spawnPiece(type: string, side: Side, tile: Tile): PieceID;
  withinBoard(tile: Tile): boolean;
  neighbors(tile: Tile, radius?: number): Tile[];
  setDecal(tile: Tile, spriteId: SpriteId | null): void;
  clearDecal(tile: Tile): void;
}

export interface UIAPI {
  toast(msg: string): void;
  registerAction(actionSpec: UIActionSpec): void;
}

export interface VFXAPI {
  spawnDecal(spriteId: SpriteId, tile: Tile): void;
  clearDecal(tile: Tile): void;
  playAnimation(spriteId: SpriteId, tile: Tile): void;
  playAudio(audioId: AudioId): void;
}

export interface CooldownAPI {
  set(pieceId: PieceID, actionId: string, turns: number): void;
  isReady(pieceId: PieceID, actionId: string): boolean;
  tickAll(): void;
  serialize(): string;
  deserialize(payload: string): void;
}

export interface PersistenceAPI {
  getOrInit(namespace: string, initial: any): any;
  serialize(): string;
  deserialize(payload: string): void;
  pushUndo(): void;
  undo(): void;
}

export interface EngineContracts {
  board: BoardAPI;
  ui: UIAPI;
  vfx: VFXAPI;
  cooldown: CooldownAPI;
  state: PersistenceAPI;
  match: {
    get(): MatchInfo;
    setTurn(side: Side): void;
    endTurn(): void;
  };
  util: {
    uuid(): string;
  };
  capturePiece(pieceId: PieceID, reason?: string): void;
  eventBus: {
    emit(event: string, payload?: any): void;
    on(event: string, cb: (payload: any) => void): void;
  };
}

export type RuleJSON = {
  meta: {
    ruleId: string;
    ruleName: string;
    version?: string;
    description?: string;
    category?: string;
    priority?: number;
    isActive?: boolean;
    tags?: string[];
  };
  scope?: {
    affectedPieces?: string[];
    sides?: Side[];
  };
  ui?: {
    actions?: UIActionSpec[];
  };
  assets?: any;
  state?: {
    namespace: string;
    schema?: any;
    initial?: any;
    serialize?: boolean;
  };
  parameters?: Record<string, any>;
  events?: { id: string; emit: string; payload?: any }[];
  handlers?: Record<string, string>;
  logic?: {
    guards?: LogicStep[];
    effects?: LogicStep[];
  };
  integration?: any;
  validationRules?: any;
  createdAt?: string;
};

export type UIActionSpec = {
  id: string;
  label: string;
  icon?: string;
  hint?: string;
  availability?: {
    requiresSelection?: boolean;
    pieceTypes?: string[];
    phase?: Phase;
    cooldownOk?: boolean;
    hasMovesRemaining?: boolean;
  };
  targeting?: {
    mode: "tile" | "piece" | "none";
    validTilesProvider?: string;
  };
  consumesTurn?: boolean;
  cooldown?: { perPiece?: number };
  maxPerPiece?: number;
};

export type LogicStep = {
  id: string;
  when: string;
  if?: string | string[];
  do: ActionStep | ActionStep[];
  onFail?: "blockAction" | "skip";
  message?: string;
};

export type ActionStep = {
  action: string;
  params?: Record<string, any>;
};
