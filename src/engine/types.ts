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
  hasMoved?: boolean;
  invisible?: boolean;
  statuses?: Record<string, unknown>;
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
  setPieceInvisible?(id: PieceID, value: boolean): void;
  setPieceStatus?(id: PieceID, key: string, value: unknown): void;
  clearPieceStatus?(id: PieceID, key: string): void;
  withinBoard(tile: Tile): boolean;
  neighbors(tile: Tile, radius?: number): Tile[];
  setDecal(tile: Tile, spriteId: SpriteId | null): void;
  clearDecal(tile: Tile): void;
  /** Optional transaction snapshot used by fail-closed Rule Architect rules. */
  serialize?(): string;
  deserialize?(payload: string): void;
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
  getOrInit(namespace: string, initial: unknown): unknown;
  serialize(): string;
  deserialize(payload: string): void;
  pushUndo(): void;
  undo(): void;
}

export interface EngineEventMap {
  "lifecycle.onEnterTile": { pieceId: PieceID; to: Tile };
  "lifecycle.onMoveCommitted": { pieceId: PieceID; from: Tile; to: Tile };
  "lifecycle.onUndo": Record<string, never>;
  "lifecycle.onPromote": {
    pieceId: PieceID;
    fromType: string;
    toType: string;
  };
  "lifecycle.onTurnStart": { side: Side };
  "ui.runAction": { actionId: string; pieceId?: PieceID; targetTile?: Tile };
  "status.expired": { pieceId: PieceID; statusKey: string; tile: Tile };
}

export type EngineEventName = keyof EngineEventMap;

export interface EngineEventBusAPI {
  emit<Event extends EngineEventName>(
    event: Event,
    payload: EngineEventMap[Event],
  ): void;
  on<Event extends EngineEventName>(
    event: Event,
    callback: (payload: EngineEventMap[Event]) => void,
  ): void;
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
    serialize?(): string;
    deserialize?(payload: string): void;
  };
  util: {
    uuid(): string;
  };
  capturePiece(pieceId: PieceID, reason?: string): void;
  eventBus: EngineEventBusAPI;
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
  assets?: unknown;
  state?: {
    namespace: string;
    schema?: unknown;
    initial?: unknown;
    serialize?: boolean;
  };
  parameters?: Record<string, unknown>;
  events?: { id: string; emit: string; payload?: unknown }[];
  handlers?: Record<string, string>;
  logic?: {
    guards?: LogicStep[];
    effects?: LogicStep[];
  };
  integration?: {
    ruleArchitect?: {
      source?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  validationRules?: unknown;
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
    mode: "tile" | "piece" | "none" | "area";
    validTilesProvider?: string;
  };
  consumesTurn?: boolean;
  cooldown?: { perPiece?: number };
  maxPerPiece?: number;
};

export type Condition = string | unknown[];

export type LogicStep = {
  id: string;
  when: string;
  if?: Condition | Condition[];
  do: ActionStep | ActionStep[];
  onFail?: "blockAction" | "skip";
  message?: string;
};

export type ActionStep = {
  action: string;
  params?: Record<string, unknown>;
};
